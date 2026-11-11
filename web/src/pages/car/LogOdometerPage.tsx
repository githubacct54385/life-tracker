import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { OdometerReadingRecord, ReadingWarning, SaveReadingResult } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Page } from "../Page";
import { describeWarning, formatMiles, parseMiles, shortDate } from "./readingFormat";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";
const primaryButton = "rounded-xl bg-g700 px-4 py-3 font-bold text-white disabled:opacity-40";
const ghostButton = "rounded-xl border border-line px-4 py-3 text-ink";

/** Warnings that must be confirmed before a reading is saved (AC-MIL-01.2, AC-MIL-01.3). */
function WarningBanner({ warnings, onConfirm, onCancel }: { warnings: ReadingWarning[]; onConfirm: () => void; onCancel: () => void }) {
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
        <button type="button" className={primaryButton} onClick={onConfirm}>
          Yes, save
        </button>
        <button type="button" className={ghostButton} onClick={onCancel}>
          Change it
        </button>
      </div>
    </div>
  );
}

/** One reading in the list, with edit (value only, the date stays) and delete (for good). */
function ReadingRow({ reading, onChanged }: { reading: OdometerReadingRecord; onChanged: () => Promise<void> }) {
  const api = useApi();
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
            <button type="button" className="text-g700 underline" aria-label={`Edit reading from ${shortDate(reading.date)}`} onClick={() => { setText(String(reading.miles)); setMode("edit"); }}>
              Edit
            </button>
            <button type="button" className="text-g700 underline" aria-label={`Delete reading from ${shortDate(reading.date)}`} onClick={() => setMode("delete")}>
              Delete
            </button>
          </span>
        )}
      </div>

      {mode === "edit" && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdit(false);
          }}
        >
          <label className="block text-sm text-muted">
            New odometer reading
            <input className={inputClass} inputMode="numeric" value={text} onChange={(e) => { setText(e.target.value); setWarnings(null); }} />
          </label>
          <p className="text-sm text-muted">The date stays {shortDate(reading.date)}.</p>
          {warnings ? (
            <WarningBanner warnings={warnings} onConfirm={() => void saveEdit(true)} onCancel={() => setWarnings(null)} />
          ) : (
            <div className="flex gap-2">
              <button type="submit" className={primaryButton} disabled={miles === undefined}>
                Save change
              </button>
              <button type="button" className={ghostButton} onClick={close}>
                Cancel
              </button>
            </div>
          )}
        </form>
      )}

      {mode === "delete" && (
        <div role="alert" className="mt-3 rounded-xl border border-line bg-sunk p-4 text-ink">
          <p>Delete this reading? It is removed for good.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={primaryButton} onClick={() => void remove()}>
              Yes, delete
            </button>
            <button type="button" className={ghostButton} onClick={close}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm">That did not work. Try again.</p>}
    </li>
  );
}

/** Car > Log reading (MIL-01). There is no date field: a reading is dated when it is saved (AC-MIL-01.1). */
export function LogOdometerPage() {
  const api = useApi();
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
    void save(false);
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
          {warnings ? (
            <WarningBanner warnings={warnings} onConfirm={() => void save(true)} onCancel={() => { setWarnings(null); field.current?.focus(); }} />
          ) : (
            <button type="submit" className={primaryButton} disabled={miles === undefined}>
              Save reading
            </button>
          )}
          {message && <p role="status" className="text-g700">{message}</p>}
          {error && <p role="alert">That did not work. Try again.</p>}
        </form>

        <section aria-labelledby="recent-readings" className="rounded-2xl border border-line bg-card p-4 text-ink">
          <h2 id="recent-readings" className="font-bold">
            Recent readings
          </h2>
          {readings === null ? (
            <p className="mt-2 text-muted">Loading…</p>
          ) : readings.length === 0 ? (
            <p className="mt-2 text-muted">No readings yet.</p>
          ) : (
            <ul className="mt-2">
              {readings.map((reading) => (
                <ReadingRow key={reading.id} reading={reading} onChanged={refresh} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
