import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GivingChart as GivingChartData } from "@life-tracker/shared";
import { formatCents, monthLabel } from "./giftFormat";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** One letter on the chart axis, so twelve months fit a phone. The tooltip and the table use full names. */
const initial = (month: string) => SHORT[Number(month.slice(5, 7)) - 1]?.charAt(0) ?? month;
/** Axis ticks in whole dollars. The exact amounts are in the tooltip and the table. */
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/**
 * Giving by month for one year (GIV-04): regular and special giving stacked in each bar, and the running total for the year
 * as a line. Special giving is told apart by a striped fill and by the legend, not by colour alone (AC-GIV-04.5). The table
 * below is the keyboard and screen reader view, and the chart itself has no keyboard layer (AC-SET-02.2).
 */
export function GivingChart({ chart, year }: { chart: GivingChartData; year: number }) {
  const average = `${formatCents(chart.averageCents)} a month`;
  const summary = `Bar chart of giving in each month of ${year}, regular giving and special contributions stacked, with a line for the running total. Year total ${formatCents(chart.yearCents)}, ${average} so far. The same numbers are in the table below.`;
  const data = chart.rows.map((row) => ({ ...row, label: initial(row.month) }));
  return (
    <figure className="m-0">
      <p className="text-ink">
        <span className="font-bold tabular-nums">{formatCents(chart.yearCents)}</span> in {year}, about <span className="font-bold tabular-nums">{formatCents(chart.averageCents)}</span> a month so far
      </p>
      <div role="img" aria-label={summary} className="mt-2 h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <pattern id="giving-special" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" style={{ fill: "var(--card)" }} />
                <rect width="3" height="6" style={{ fill: "var(--ink)" }} />
              </pattern>
            </defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} interval={0} />
            <YAxis yAxisId="month" tick={{ fill: "var(--muted)", fontSize: 12 }} width={48} tickFormatter={dollars} />
            <YAxis yAxisId="year" orientation="right" tick={{ fill: "var(--muted)", fontSize: 12 }} width={52} tickFormatter={dollars} />
            <Tooltip
              formatter={(value, name) => [formatCents(Number(value)), name === "regularCents" ? "Regular" : name === "specialCents" ? "Special" : "Running total"]}
              labelFormatter={(_, payload) => (payload?.[0]?.payload?.month ? monthLabel(payload[0].payload.month) : "")}
            />
            <Bar yAxisId="month" dataKey="regularCents" stackId="gifts" fill="var(--g700)" isAnimationActive={false} />
            <Bar yAxisId="month" dataKey="specialCents" stackId="gifts" fill="url(#giving-special)" stroke="var(--ink)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="year" dataKey="runningCents" type="monotone" stroke="var(--ink)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span><span aria-hidden className="mr-1 inline-block h-3 w-3 rounded-sm bg-g700 align-middle" />Regular (left scale)</span>
        <span><span aria-hidden className="mr-1 inline-block h-3 w-3 rounded-sm border border-ink align-middle" style={{ background: "repeating-linear-gradient(45deg, var(--ink) 0 2px, var(--card) 2px 4px)" }} />Special (left scale)</span>
        <span><span aria-hidden className="mr-1 inline-block h-0.5 w-4 bg-ink align-middle" />Running total (right scale)</span>
      </figcaption>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-ink">Show the numbers as a table</summary>
        <div className="mt-2">
          <table className="w-full text-left text-sm text-ink">
            <caption className="sr-only">Giving by month in {year}</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-2">Month</th>
                <th scope="col" className="py-1 pr-2 text-right">Regular</th>
                <th scope="col" className="py-1 pr-2 text-right">Special</th>
                <th scope="col" className="py-1 text-right">Running total</th>
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((row) => (
                <tr key={row.month} className="border-t border-line">
                  <th scope="row" className="py-1 pr-2 font-normal">{monthLabel(row.month)}</th>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatCents(row.regularCents)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatCents(row.specialCents)}</td>
                  <td className="py-1 text-right tabular-nums">{row.runningCents === undefined ? "–" : formatCents(row.runningCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
