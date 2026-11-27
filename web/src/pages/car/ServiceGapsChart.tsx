import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { gapServices, intervalLine, serviceGaps, type GapUnit, type MaintenanceRecord, type ServiceInterval } from "@life-tracker/shared";
import { keepOutOfTabOrder } from "../../ui/chartTabStops";
import { formatMiles, shortDate } from "./readingFormat";
import { fullDate } from "./ServiceDue";

const UNIT_WORDS: Record<GapUnit, { noun: (n: number) => string; label: string }> = {
  miles: { noun: (n) => (n === 1 ? "mile" : "miles"), label: "Miles" },
  days: { noun: (n) => (n === 1 ? "day" : "days"), label: "Days" },
};

const select = "min-h-11 w-full rounded-xl border border-line bg-card px-3 py-2 text-ink sm:w-auto";

/**
 * How long the owner really goes between the same kind of service (MIL-11): for one chosen type, a bar for the gap between each
 * visit and the one before it, in miles or in days, with a dashed line at the interval set in MIL-09 and the average above the chart.
 * A gap with no usable odometer is left out of the miles view, and the note says how many. The table is the keyboard and screen reader view.
 */
export function ServiceGapsChart({ records, intervals }: { records: MaintenanceRecord[]; intervals: ServiceInterval[] }) {
  const services = useMemo(() => gapServices(records), [records]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [unit, setUnit] = useState<GapUnit>("miles");
  const service = chosen !== null && services.some((s) => s.toLowerCase() === chosen.toLowerCase()) ? chosen : services[0];

  const result = useMemo(() => (service === undefined ? undefined : serviceGaps(records, service, unit)), [records, service, unit]);
  const line = service === undefined ? null : intervalLine(intervals, service, unit);
  const words = UNIT_WORDS[unit];
  const data = result?.gaps.map((gap) => ({ label: shortDate(gap.to), from: gap.from, to: gap.to, value: unit === "miles" ? gap.miles! : gap.days })) ?? [];

  return (
    <section aria-labelledby="service-gaps-heading" className="rounded-2xl border border-line bg-card p-4 text-ink">
      <h2 id="service-gaps-heading" className="font-bold">
        Gaps between visits
      </h2>

      {services.length === 0 || result === undefined || service === undefined ? (
        <p className="mt-2 text-muted">Log the same service twice and the gap between the visits shows here.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Service
              <select className={select} value={service} onChange={(event) => setChosen(event.target.value)}>
                {services.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="flex gap-2">
              <legend className="sr-only">Show the gaps in</legend>
              {(["miles", "days"] as const).map((option) => (
                <label key={option} className={`flex min-h-11 cursor-pointer items-center rounded-xl border px-4 ${unit === option ? "border-g700 bg-g100 font-bold text-gtext" : "border-line"}`}>
                  <input type="radio" name="gap-unit" value={option} checked={unit === option} onChange={() => setUnit(option)} className="sr-only" />
                  {UNIT_WORDS[option].label}
                </label>
              ))}
            </fieldset>
          </div>

          {result.visits < 2 ? (
            <p className="mt-3 text-muted">Needs two visits to show a gap. {result.service} has {result.visits === 1 ? "one visit" : "no visits"} so far.</p>
          ) : (
            <>
              <p className="mt-3">
                {result.average === null ? (
                  <>No gap can be shown in {words.noun(2)} yet.</>
                ) : (
                  <>
                    Average gap: <strong>{formatMiles(result.average)} {words.noun(result.average)}</strong> between {result.gaps.length === 1 ? "two visits" : `${result.gaps.length + 1} visits`}.
                  </>
                )}
              </p>
              {line !== null && (
                <p className="text-sm text-muted">
                  Your interval for {result.service}: {formatMiles(line)} {words.noun(line)} (the dashed line).
                </p>
              )}
              {result.leftOut > 0 && (
                <p className="text-sm text-muted">
                  {result.leftOut === 1 ? "1 gap is" : `${result.leftOut} gaps are`} left out because a visit has no mileage, or the later one is lower. Switch to Days to see {result.leftOut === 1 ? "it" : "them"}.
                </p>
              )}

              {data.length > 0 && (
                <>
                  <div
                    ref={keepOutOfTabOrder}
                    role="img"
                    aria-label={`Bar chart of the ${words.noun(2)} between each visit for ${result.service} and the one before it${line === null ? "" : `, with a line at your interval of ${formatMiles(line)} ${words.noun(line)}`}. The same numbers are in the table below.`}
                    className="mt-3 h-64 w-full sm:h-72"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                        <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} width={48} allowDecimals={false} tickFormatter={(v: number) => formatMiles(v)} />
                        <Tooltip labelFormatter={(_, payload) => (payload?.[0]?.payload ? `${shortDate(payload[0].payload.from)} to ${shortDate(payload[0].payload.to)}` : "")} formatter={(value) => [`${formatMiles(Number(value))} ${words.noun(Number(value))}`, "Gap"]} />
                        <Bar dataKey="value" fill="var(--g700)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        {line !== null && <ReferenceLine y={line} ifOverflow="extendDomain" stroke="var(--ink)" strokeWidth={2} strokeDasharray="6 4" />}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-sm">
                    <span className="mr-4"><span aria-hidden className="mr-1 inline-block h-3 w-3 rounded-sm bg-g700 align-middle" />Gap since the visit before</span>
                    {line !== null && (
                      <span>
                        <span aria-hidden className="mr-1 inline-block w-4 border-t-2 border-dashed border-ink align-middle" />
                        Your interval
                      </span>
                    )}
                  </p>
                </>
              )}

              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2">Show the numbers as a table</summary>
                <table className="mt-2 w-full text-left text-sm">
                  <caption className="sr-only">The gaps in {words.noun(2)} between visits for {result.service}, newest first.</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="py-1 pr-2">Visit</th>
                      <th scope="col" className="py-1 pr-2">Since the visit before</th>
                      <th scope="col" className="py-1 text-right">{words.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data].reverse().map((row) => (
                      <tr key={`${row.from}-${row.to}-${row.value}`} className="border-t border-line">
                        <th scope="row" className="py-1 pr-2 font-normal">{fullDate(row.to)}</th>
                        <td className="py-1 pr-2">{fullDate(row.from)}</td>
                        <td className="py-1 text-right tabular-nums">{formatMiles(row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
