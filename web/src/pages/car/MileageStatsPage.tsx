import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  busiestAndQuietest,
  monthlyTotals,
  rollingAverages,
  weeklyMiles,
  yearlyTotals,
  type MilesPeriod,
  type OdometerReadingRecord,
} from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Page } from "../Page";
import { formatMiles, shortDate } from "./readingFormat";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const round = (n: number) => Math.round(n);

/** "Nov 6 (8 days)" style description of one period for the text alternative and the totals. */
const periodLabel = (p: MilesPeriod) => `${shortDate(p.to)}${p.days === 7 ? "" : ` (${p.days} days)`}`;

interface Row {
  label: string;
  miles: number;
  days: number;
  average?: number;
}

function WeeklyChart({ rows }: { rows: Row[] }) {
  const summary = `Bar chart of miles driven in each of the last ${rows.length} periods between weekly readings, with the rolling 8-week average as a line. The same numbers are in the table below.`;
  return (
    <figure className="m-0">
      <div role="img" aria-label={summary} className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} width={44} />
            <Tooltip formatter={(value, name) => [`${formatMiles(Number(value))} miles`, name === "average" ? "8-week average" : "Miles"]} />
            <Bar dataKey="miles" fill="var(--g700)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line dataKey="average" type="monotone" stroke="var(--ink)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-sm">
        <span className="mr-4"><span aria-hidden className="mr-1 inline-block h-3 w-3 rounded-sm bg-g700 align-middle" />Miles per period</span>
        <span><span aria-hidden className="mr-1 inline-block h-0.5 w-4 bg-ink align-middle" />Rolling 8-week average</span>
      </figcaption>
      <details className="mt-3">
        <summary className="cursor-pointer text-ink">Show the numbers as a table</summary>
        <div className="mt-2 max-h-72 overflow-y-auto">
          <table className="w-full text-left text-sm text-ink">
            <caption className="sr-only">Miles per period between weekly readings</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-2">Reading date</th>
                <th scope="col" className="py-1 pr-2">Miles</th>
                <th scope="col" className="py-1">8-week average</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th scope="row" className="py-1 pr-2 font-normal">{row.label}</th>
                  <td className="py-1 pr-2">{formatMiles(row.miles)}</td>
                  <td className="py-1">{row.average === undefined ? "–" : formatMiles(round(row.average))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

const card = "rounded-xl border border-line bg-card p-4 text-ink";

export function MileageStatsPage() {
  const api = useApi();
  const [readings, setReadings] = useState<OdometerReadingRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .listAllReadings()
      .then((result) => live && setReadings(result.readings))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [api]);

  const stats = useMemo(() => {
    const periods = weeklyMiles(readings ?? []);
    const averages = rollingAverages(periods);
    return {
      periods,
      rows: periods.map((p, i): Row => ({ label: periodLabel(p), miles: p.miles, days: p.days, average: averages[i] })),
      latestAverage: averages.at(-1),
      months: monthlyTotals(periods).reverse(),
      years: yearlyTotals(periods).reverse(),
      extremes: busiestAndQuietest(periods),
    };
  }, [readings]);

  return (
    <Page title="Mileage stats">
      <p>
        <Link to="/car" className="text-ink underline">Back to Car</Link>
      </p>
      {failed ? (
        <p role="alert" className={`${card} mt-4`}>The readings could not be loaded. Try again in a moment.</p>
      ) : readings === null ? (
        <p className="mt-4">Loading…</p>
      ) : stats.periods.length === 0 ? (
        <p className={`${card} mt-4`}>Stats appear once you have two weekly readings. <Link to="/car/log" className="underline">Log a reading</Link>.</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section aria-labelledby="weekly-heading" className={`${card} lg:col-span-2`}>
            <h2 id="weekly-heading" className="mb-2 text-lg font-bold">Miles per week</h2>
            <WeeklyChart rows={stats.rows} />
          </section>

          <section aria-labelledby="average-heading" className={card}>
            <h2 id="average-heading" className="text-lg font-bold">Rolling 8-week average</h2>
            <p className="mt-1 text-3xl font-bold">
              {stats.latestAverage === undefined ? "–" : `${formatMiles(round(stats.latestAverage))} miles a week`}
            </p>
            {stats.latestAverage === undefined && <p className="mt-1 text-muted">Needs 8 weekly periods.</p>}
          </section>

          <section aria-labelledby="extremes-heading" className={card}>
            <h2 id="extremes-heading" className="text-lg font-bold">Busiest and quietest weeks</h2>
            {stats.extremes ? (
              <dl className="mt-1">
                <div className="flex justify-between gap-2"><dt>Busiest</dt><dd>{formatMiles(stats.extremes.busiest.miles)} miles, week ending {shortDate(stats.extremes.busiest.to)}</dd></div>
                <div className="flex justify-between gap-2"><dt>Quietest</dt><dd>{formatMiles(stats.extremes.quietest.miles)} miles, week ending {shortDate(stats.extremes.quietest.to)}</dd></div>
              </dl>
            ) : (
              <p className="mt-1 text-muted">No single-week periods yet.</p>
            )}
          </section>

          <section aria-labelledby="monthly-heading" className={card}>
            <h2 id="monthly-heading" className="text-lg font-bold">Monthly totals</h2>
            <ul className="m-0 mt-1 list-none p-0">
              {stats.months.map((m) => (
                <li key={m.month} className="flex justify-between border-t border-line py-1 first:border-t-0"><span>{monthLabel(m.month)}</span><span>{formatMiles(m.miles)} miles</span></li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="yearly-heading" className={card}>
            <h2 id="yearly-heading" className="text-lg font-bold">Yearly totals</h2>
            <ul className="m-0 mt-1 list-none p-0">
              {stats.years.map((y) => (
                <li key={y.year} className="flex justify-between border-t border-line py-1 first:border-t-0"><span>{y.year}</span><span>{formatMiles(y.miles)} miles</span></li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Page>
  );
}
