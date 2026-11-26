import { Button } from "../../ui/Button.js";
import { Skeleton } from "../../ui/Skeleton.js";
import { useBusy } from "../../ui/useBusy.js";
import { Presence } from "../../ui/Presence.js";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fromPounds, weightTrend, type WeightEntryRecord } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { loadPreferences } from "../../settings/preferences";
import { shortDate } from "../car/readingFormat";
import { Page } from "../Page";
import { formatWeight, parseWeight, UNIT_LABEL, weightToInput } from "./weightFormat";
import { FailureText } from "../../ui/FailureText";
import { keepOutOfTabOrder } from "../../ui/chartTabStops";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";

type Unit = ReturnType<typeof loadPreferences>["weightUnit"];

/** Daily values and the 7-day moving average, with a text alternative: a summary and a table (AC-HLT-01.2). */
function WeightChart({ entries, unit }: { entries: WeightEntryRecord[]; unit: Unit }) {
  const rows = useMemo(
    () =>
      weightTrend(entries.map((e) => ({ date: e.date, pounds: e.pounds }))).map((p) => ({
        date: p.date,
        label: shortDate(p.date),
        weight: fromPounds(p.pounds, unit),
        trend: fromPounds(p.trendPounds, unit),
      })),
    [entries, unit],
  );
  if (rows.length === 0) return null;
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const summary = `Line chart of ${rows.length} daily weights with a 7-day moving average. The latest weight is ${last.weight.toFixed(1)} ${UNIT_LABEL[unit]} on ${shortDate(last.date)}, and the trend is ${last.trend.toFixed(1)} ${UNIT_LABEL[unit]}, from ${first.trend.toFixed(1)} ${UNIT_LABEL[unit]} on ${shortDate(first.date)}. The same numbers are in the table below.`;
  return (
    <figure className="m-0">
      <div ref={keepOutOfTabOrder} role="img" aria-label={summary} className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          {/* No keyboard layer: recharts 3.11 makes the chart several empty Tab stops. The table below is the keyboard and screen reader view (AC-SET-02.2). */}
          <LineChart accessibilityLayer={false} data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} width={44} domain={["auto", "auto"]} />
            <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)} ${UNIT_LABEL[unit]}`, name === "trend" ? "7-day trend" : "Daily"]} />
            <Line dataKey="weight" stroke="var(--muted)" strokeWidth={1} dot={{ r: 3 }} isAnimationActive={false} />
            <Line dataKey="trend" stroke="var(--g700)" strokeWidth={3} dot={false} type="monotone" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-sm">
        <span className="mr-4"><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-muted align-middle" />Daily weight</span>
        <span><span aria-hidden className="mr-1 inline-block h-0.5 w-4 bg-g700 align-middle" />7-day moving average</span>
      </figcaption>
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-2">Show the numbers as a table</summary>
        <table className="w-full text-left">
          <caption className="sr-only">Daily weight and 7-day moving average, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Weight ({UNIT_LABEL[unit]})</th>
              <th scope="col">Trend ({UNIT_LABEL[unit]})</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((row) => (
              <tr key={row.date}>
                <th scope="row" className="font-normal">{shortDate(row.date)}</th>
                <td>{row.weight.toFixed(1)}</td>
                <td>{row.trend.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** One entry in the list: edit the value (the date stays) or delete it for good. */
function WeightRow({ entry, unit, onChanged }: { entry: WeightEntryRecord; unit: Unit; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [value, setValue] = useState(weightToInput(entry.pounds, unit));
  const [error, setError] = useState(false);
  const pounds = parseWeight(value, unit);
  const label = `${formatWeight(entry.pounds, unit)} on ${shortDate(entry.date)}`;

  const close = () => {
    setMode("view");
    setError(false);
  };

  async function run(action: () => Promise<unknown>) {
    setError(false);
    try {
      await action();
      close();
      await onChanged();
    } catch {
      setError(true);
    }
  }

  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-muted">{shortDate(entry.date)}</span>
        <b>{formatWeight(entry.pounds, unit)}</b>
        {mode === "view" && (
          <span className="flex gap-2">
            <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Edit ${label}`} onClick={() => { setValue(weightToInput(entry.pounds, unit)); setMode("edit"); }}>
              Edit
            </button>
            <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Delete ${label}`} onClick={() => setMode("delete")}>
              Delete
            </button>
          </span>
        )}
      </div>

      <Presence>{mode === "edit" ? (
        <form
          className="mt-3 space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (pounds !== undefined) void track(() => run(() => api.editWeight(entry.id, pounds)));
          }}
        >
          <label className="block font-bold text-ink" htmlFor={`edit-weight-${entry.id}`}>
            Weight ({UNIT_LABEL[unit]})
          </label>
          <input id={`edit-weight-${entry.id}`} className={inputClass} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
          <p className="text-sm text-muted">The date stays {shortDate(entry.date)}.</p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pounds === undefined} busy={busy}>
              Save change
            </Button>
            <Button variant="ghost" type="button" onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}</Presence>

      <Presence>{mode === "delete" ? (
        <div role="alert" className="mt-3 rounded-xl border border-line bg-sunk p-4 text-ink">
          <p>Delete this weight? It is removed for good.</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => void track(() => run(() => api.deleteWeight(entry.id)))} busy={busy}>
              Yes, delete
            </Button>
            <Button variant="ghost" type="button" onClick={close} disabled={busy}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}</Presence>
      <Presence>{error ? <p role="alert" className="mt-2 text-sm"><FailureText fallback="That did not work. Try again." /></p> : null}</Presence>
    </li>
  );
}

/** Health > Weight (HLT-01). There is no date field: an entry is dated when it is saved (AC-HLT-01.1). */
export function LogWeightPage() {
  const api = useApi();
  const [busy, track] = useBusy();
  const unit = loadPreferences().weightUnit;
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<WeightEntryRecord[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replace, setReplace] = useState<{ existing: WeightEntryRecord; pounds: number } | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEntries((await api.listWeights()).entries);
    } catch {
      setError(true);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pounds = parseWeight(text, unit);

  async function save(value: number, confirmed: boolean) {
    setError(false);
    setMessage(null);
    try {
      const result = await api.logWeight(value, confirmed);
      if (result.status === "needs_replace") return setReplace({ existing: result.existing, pounds: value });
      setReplace(null);
      setText("");
      setMessage(`Saved ${formatWeight(result.entry.pounds, unit)}.`);
      field.current?.focus();
    } catch {
      return setError(true);
    }
    await refresh();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pounds !== undefined) void track(() => save(pounds, false));
  }

  return (
    <Page title="Weight">
      <div className="grid gap-5 text-ink lg:grid-cols-2">
        <form onSubmit={submit} className="space-y-3" noValidate>
          <label className="block font-bold text-ink" htmlFor="new-weight">
            Weight ({UNIT_LABEL[unit]})
          </label>
          <input id="new-weight" ref={field} className={inputClass} inputMode="decimal" autoComplete="off" value={text} onChange={(e) => { setText(e.target.value); setMessage(null); setReplace(null); }} />
          {text.trim() !== "" && pounds === undefined && <p className="text-sm">Enter a weight in {unit === "kg" ? "kilograms" : "pounds"}, like {unit === "kg" ? "78.2" : "172.4"}.</p>}
          <p className="text-sm">Saved with today&rsquo;s date. Change {unit === "kg" ? "kilograms" : "pounds"} in Settings.</p>
          <Button type="submit" disabled={pounds === undefined} busy={busy}>
            Save weight
          </Button>
          <Presence>{message ? <p role="status" className="text-gtext">{message}</p> : null}</Presence>
          <Presence>{error ? <p role="alert"><FailureText fallback="That did not work. Try again." /></p> : null}</Presence>
          <Presence>{replace ? (
            <div role="alert" className="rounded-xl border border-line bg-sunk p-4">
              <p>
                You already saved {formatWeight(replace.existing.pounds, unit)} today. Replace it with {formatWeight(replace.pounds, unit)}?
              </p>
              <div className="mt-3 flex gap-2">
                <Button type="button" onClick={() => void track(() => save(replace.pounds, true))} busy={busy}>
                  Replace it
                </Button>
                <Button variant="ghost" type="button" onClick={() => setReplace(null)} disabled={busy}>
                  Keep the first one
                </Button>
              </div>
            </div>
          ) : null}</Presence>
        </form>

        <section aria-labelledby="weight-chart" className="rounded-2xl border border-line bg-card p-4 text-ink">
          <h2 id="weight-chart" className="font-bold">
            Weight trend
          </h2>
          {entries === null ? (
            <Skeleton lines={3} />
          ) : entries.length === 0 ? (
            <p className="mt-2 text-muted">No weights yet. Enter today&rsquo;s weight to start the chart.</p>
          ) : (
            <WeightChart entries={entries} unit={unit} />
          )}
        </section>

        <section aria-labelledby="weight-history" className="rounded-2xl border border-line bg-card p-4 text-ink lg:col-span-2">
          <h2 id="weight-history" className="font-bold">
            Entries
          </h2>
          {entries === null ? (
            <Skeleton lines={3} />
          ) : entries.length === 0 ? (
            <p className="mt-2 text-muted">No weights yet. Enter today&rsquo;s weight above, then save.</p>
          ) : (
            <ul className="mt-2">
              {entries.map((entry) => (
                <WeightRow key={entry.id} entry={entry} unit={unit} onChanged={refresh} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
