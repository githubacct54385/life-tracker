import { Button } from "../../ui/Button.js";
import { useBusy } from "../../ui/useBusy.js";
import { Presence } from "../../ui/Presence.js";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { missingWeeks, type OdometerReadingRecord, type ReadingWarning, type SaveReadingResult } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { todayLocal } from "../giving/giftFormat";
import { Page } from "../Page";
import { describeWarning, formatMiles, parseMiles, shortDate } from "./readingFormat";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";

/** Warnings that must be confirmed before a reading is saved (AC-MIL-01.2, AC-MIL-01.3). */
function WarningBanner({ warnings, busy, onConfirm, onCancel }: { warnings: ReadingWarning[]; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-line bg-sunk p-4 text-ink">
      {warnings.map((warning) => {
        const { title, detail } = describeWarning(warning);
        return (
          <p key={warning.kind}>
            <b>{title}.</b> {detail}
          </p>
        );
      })}
      <p className="mt-1">Save anyway?</p>
      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={onConfirm} busy={busy}>
          Yes, save
        </Button>
        <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>
          Change it
        </Button>
      </div>
    </div>
  );
}

/** One reading in the list, with edit (value only, the date stays) and delete (for good). */
function ReadingRow({ reading, onChanged }: { reading: OdometerReadingRecord; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [text, setText] = useState(String(reading.miles));
  const [warnings, setWarnings] = useState<ReadingWarning[] | null>(null);
  const [error, setError] = useState(false);

  const miles = parseMiles(text);
  const close = () => {
    setMode("view");
    setWarnings(null);
    setError(false);
  };

  async function saveEdit(confirmed: boolean) {
    if (miles === undefined) return;
    setError(false);
    try {
      const result = await api.editReading(reading.id, miles, confirmed);
      if (result.status === "needs_confirmation") return setWarnings(result.warnings);
      close();
      await onChanged();
    } catch {
      setError(true);
    }
  }

  async function remove() {
    setError(false);
    try {
      await api.deleteReading(reading.id);
      await onChanged();
    } catch {
      setError(true);
    }
  }

  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">{shortDate(reading.date)}</span>
        <b>{formatMiles(reading.miles)} mi</b>
        {mode === "view" && (
          <span className="flex gap-2">
            <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Edit reading from ${shortDate(reading.date)}`} onClick={() => { setText(String(reading.miles)); setMode("edit"); }}>
              Edit
            </button>
            <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Delete reading from ${shortDate(reading.date)}`} onClick={() => setMode("delete")}>
              Delete
            </button>
          </span>
        )}
      </div>

      <Presence>{mode === "edit" ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void track(() => saveEdit(false));
          }}
        >
          <label className="block text-sm text-muted">
            New odometer reading
            <input className={inputClass} inputMode="numeric" value={text} onChange={(e) => { setText(e.target.value); setWarnings(null); }} />
          </label>
          <p className="text-sm text-muted">The date stays {shortDate(reading.date)}.</p>
          <Presence>{warnings ? <WarningBanner warnings={warnings} busy={busy} onConfirm={() => void track(() => saveEdit(true))} onCancel={() => setWarnings(null)} /> : null}</Presence>
          {!warnings && (
            <div className="flex gap-2">
              <Button type="submit" disabled={miles === undefined} busy={busy}>
                Save change
              </Button>
              <Button variant="ghost" type="button" onClick={close} disabled={busy}>
                Cancel
              </Button>
            </div>
          )}
        </form>
      ) : null}</Presence>

      <Presence>{mode === "delete" ? (
        <div role="alert" className="mt-3 rounded-xl border border-line bg-sunk p-4 text-ink">
          <p>Delete this reading? It is removed for good.</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => void track(remove)} busy={busy}>
              Yes, delete
            </Button>
            <Button variant="ghost" type="button" onClick={close} disabled={busy}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}</Presence>
      <Presence>{error ? <p role="alert" className="mt-2 text-sm">That did not work. Try again.</p> : null}</Presence>
    </li>
  );
}

const MS_PER_DAY = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;

/**
 * The Fridays that start a past week with no reading, within the span of `readings`. A gap is shown, never filled in or
 * guessed (AC-MIL-02.6), and the current week is not a gap yet: it is the one the owner is about to enter.
 */
export function pastGapWeeks(readings: readonly OdometerReadingRecord[], today: string): string[] {
  return missingWeeks(readings, today).filter((friday) => dayNumber(friday) + 6 < dayNumber(today));
}

/**
 * Car > Log reading (MIL-01). There is no date field: a reading is dated when it is saved (AC-MIL-01.1). Weeks with no reading
 * are listed as gaps (MIL-02). `today` is a prop only so tests can fix the date.
 */
export function LogOdometerPage({ today = todayLocal() }: { today?: string } = {}) {
  const api = useApi();
  const [busy, track] = useBusy();
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [warnings, setWarnings] = useState<ReadingWarning[] | null>(null);
  const [readings, setReadings] = useState<OdometerReadingRecord[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setReadings((await api.listReadings()).readings);
    } catch {
      setError(true);
    }
  }, [api]);

  useEffect(() => {
    field.current?.focus();
    void refresh();
  }, [refresh]);

  const miles = parseMiles(text);

  async function save(confirmed: boolean) {
    if (miles === undefined) return;
    setError(false);
    setMessage(null);
    let result: SaveReadingResult;
    try {
      result = await api.logReading(miles, confirmed);
    } catch {
      return setError(true);
    }
    if (result.status === "needs_confirmation") return setWarnings(result.warnings);
    setWarnings(null);
    setText("");
    setMessage(`Saved ${formatMiles(result.reading.miles)} mi.`);
    field.current?.focus();
    await refresh();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void track(() => save(false));
  }

  return (
    <Page title="Log odometer">
      <div className="grid gap-5 text-ink lg:grid-cols-2">
        <form onSubmit={submit} className="space-y-3" noValidate>
          <label className="block font-bold text-ink" htmlFor="odometer-reading">
            Odometer reading
          </label>
          <div className="flex items-center gap-2">
            <input
              id="odometer-reading"
              ref={field}
              className={inputClass}
              inputMode="numeric"
              autoComplete="off"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setWarnings(null);
                setMessage(null);
              }}
            />
            <span aria-hidden="true">mi</span>
          </div>
          <p className="text-sm">Saved as of now</p>
          {text.trim() !== "" && miles === undefined && <p className="text-sm">Enter whole miles, up to 9,999,999.</p>}
          <Presence>{warnings ? <WarningBanner warnings={warnings} busy={busy} onConfirm={() => void track(() => save(true))} onCancel={() => { setWarnings(null); field.current?.focus(); }} /> : null}</Presence>
          {!warnings && (
            <Button type="submit" disabled={miles === undefined} busy={busy}>
              Save reading
            </Button>
          )}
          <Presence>{message ? <p role="status" className="text-gtext">{message}</p> : null}</Presence>
          <Presence>{error ? <p role="alert">That did not work. Try again.</p> : null}</Presence>
        </form>

        <section aria-labelledby="recent-readings" className="rounded-2xl border border-line bg-card p-4 text-ink">
          <h2 id="recent-readings" className="font-bold">
            Recent readings
          </h2>
          {readings === null ? (
            <p className="mt-2 text-muted">Loading…</p>
          ) : readings.length === 0 ? (
            <p className="mt-2 text-muted">No readings yet. Enter this week&rsquo;s odometer reading above, then save.</p>
          ) : (
            <ul className="mt-2">
              {[
                ...readings.map((reading) => ({ kind: "reading" as const, date: reading.date, reading })),
                ...pastGapWeeks(readings, today).map((friday) => ({ kind: "gap" as const, date: friday })),
              ]
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((item) =>
                  item.kind === "reading" ? (
                    <ReadingRow key={item.reading.id} reading={item.reading} onChanged={refresh} />
                  ) : (
                    <li key={`gap-${item.date}`} aria-label={`No reading for the week of ${shortDate(item.date)}`} className="border-b border-line py-3 text-muted last:border-b-0">
                      Week of {shortDate(item.date)}: <b>no reading</b>
                    </li>
                  ),
                )}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
