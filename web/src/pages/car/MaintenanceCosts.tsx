import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  costPerMile,
  costsByPlace,
  costsByService,
  costsPerMonth,
  costsPerYear,
  inRange,
  noCostCount,
  periodChoices,
  periodRange,
  type CostBar,
  type MaintenanceRecord,
  type OdometerReadingRecord,
} from "@life-tracker/shared";
import { keepOutOfTabOrder } from "../../ui/chartTabStops";
import { formatCents } from "../giving/giftFormat";

type Over = "month" | "year";

const dollars = (cents: number) => formatCents(cents);
const short = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** One bar chart with its text table. Vertical (labels down the side) for the splits, so a long name is never squeezed under a bar. */
function CostChart({ id, title, bars, vertical = false, empty }: { id: string; title: string; bars: CostBar[]; vertical?: boolean; empty: string }) {
  const total = bars.reduce((sum, bar) => sum + bar.cents, 0);
  const summary = `Bar chart: ${title.toLowerCase()}, ${bars.length} ${bars.length === 1 ? "bar" : "bars"}, ${dollars(total)} in all. The same numbers are in the table below.`;
  const hasSpend = total > 0;
  return (
    <section aria-labelledby={id} className="mt-5">
      <h3 id={id} className="font-bold">
        {title}
      </h3>
      {!hasSpend ? (
        <p className="mt-1 text-muted">{empty}</p>
      ) : (
        <div
          ref={keepOutOfTabOrder}
          role="img"
          aria-label={summary}
          className={`mt-2 w-full ${vertical ? "" : "h-64 sm:h-72"}`}
          style={vertical ? { height: Math.max(160, bars.length * 36 + 40) } : undefined}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart accessibilityLayer={false} data={bars} layout={vertical ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={vertical} horizontal={!vertical} />
              {vertical ? (
                <>
                  <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={short} />
                  <YAxis type="category" dataKey="label" width={112} tick={{ fill: "var(--ink)", fontSize: 12 }} interval={0} />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={14} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} width={52} tickFormatter={short} allowDecimals={false} />
                </>
              )}
              <Tooltip formatter={(value) => [dollars(Number(value)), "Spent"]} />
              <Bar dataKey="cents" fill="var(--g700)" radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2">Show the numbers as a table</summary>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-2">
                {vertical ? "Name" : "When"}
              </th>
              <th scope="col" className="py-1 pr-2 text-right">
                Spent
              </th>
              <th scope="col" className="py-1 text-right">
                Services
              </th>
            </tr>
          </thead>
          <tbody>
            {(vertical ? bars : [...bars].reverse()).map((bar) => (
              <tr key={bar.key} className="border-t border-line">
                <th scope="row" className="py-1 pr-2 font-normal">
                  {bar.label}
                </th>
                <td className="py-1 pr-2 text-right tabular-nums">{dollars(bar.cents)}</td>
                <td className="py-1 text-right tabular-nums">{bar.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/**
 * What the car costs (MIL-10): spend per month (or per year), split by place and by kind of service, and the cost per mile, for a
 * period the owner picks. A service with no cost is left out of every total and counted. The tables are the keyboard and screen reader view.
 * `today` is a prop so tests can fix the date.
 */
export function MaintenanceCosts({ records, readings, today }: { records: MaintenanceRecord[]; readings: OdometerReadingRecord[]; today: string }) {
  const choices = useMemo(() => periodChoices(records), [records]);
  const [value, setValue] = useState("last12");
  const [over, setOver] = useState<Over>("month");
  const choice = choices.find((c) => c.value === value) ?? choices[0]!;
  const range = useMemo(() => periodRange(choice.period, records, today), [choice, records, today]);
  const inPeriod = useMemo(() => inRange(records, range), [records, range]);

  const monthBars = useMemo(() => costsPerMonth(records, range), [records, range]);
  const yearBars = useMemo(() => costsPerYear(records), [records]);
  const perMile = useMemo(
    () =>
      costPerMile(
        records,
        readings.map((r) => ({ date: r.date, miles: r.miles })),
        range,
      ),
    [records, readings, range],
  );
  const missing = noCostCount(inPeriod);

  return (
    <section aria-labelledby="costs-heading" className="rounded-2xl border border-line bg-card p-4 text-ink">
      <h2 id="costs-heading" className="font-bold">
        Costs
      </h2>

      {records.length === 0 ? (
        <p className="mt-2 text-muted">No services logged yet. Log a service with its cost and the charts show here.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Period
              <select className="min-h-11 rounded-xl border border-line bg-card px-3 py-2 text-ink" value={choice.value} onChange={(event) => setValue(event.target.value)}>
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-3">
            Spent in this period: <strong>{dollars(inPeriod.reduce((sum, r) => sum + (r.costCents ?? 0), 0))}</strong>
          </p>
          <p>
            Cost per mile: {perMile.status === "ok" ? <strong>{dollars(perMile.centsPerMile)}</strong> : <strong>not enough data</strong>}
            {perMile.status === "ok" ? (
              <span className="text-sm text-muted">
                {" "}
                ({dollars(perMile.cents)} over {plural(perMile.miles, "mile", "miles")} driven)
              </span>
            ) : (
              <span className="text-sm text-muted"> (needs at least two odometer readings in this period)</span>
            )}
          </p>
          {missing > 0 && (
            <p className="text-sm text-muted">
              {plural(missing, "service has", "services have")} no cost and {missing === 1 ? "is" : "are"} left out of these totals.
            </p>
          )}

          <fieldset className="mt-4 flex flex-wrap items-center gap-2">
            <legend className="sr-only">Show spend</legend>
            {(["month", "year"] as const).map((option) => (
              <label key={option} className={`flex min-h-11 cursor-pointer items-center rounded-xl border px-4 ${over === option ? "border-g700 bg-g100 font-bold text-gtext" : "border-line"}`}>
                <input type="radio" name="cost-over" value={option} checked={over === option} onChange={() => setOver(option)} className="sr-only" />
                {option === "month" ? "Per month" : "Per year"}
              </label>
            ))}
            {over === "year" && <span className="text-sm text-muted">Every year, not just this period.</span>}
          </fieldset>

          <CostChart id="costs-over-time" title={over === "month" ? "Spend per month" : "Spend per year"} bars={over === "month" ? monthBars : yearBars} empty="No costs logged in this period." />
          <CostChart id="costs-by-place" title="Spend by place" bars={costsByPlace(inPeriod)} vertical empty="No costs logged in this period." />
          <CostChart id="costs-by-service" title="Spend by kind of service" bars={costsByService(inPeriod)} vertical empty="No costs logged in this period." />
        </>
      )}
    </section>
  );
}
