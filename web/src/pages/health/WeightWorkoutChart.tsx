import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DEFAULT_WEIGHT_WORKOUT_RANGE, MIN_WEIGHT_WEEKS, WEIGHT_WORKOUT_RANGES, fromPounds, weightWorkoutChart, type WeightEntryRecord, type WeightWorkoutRange, type WorkoutRecord } from "@life-tracker/shared";
import { loadPreferences } from "../../settings/preferences";
import { shortDate } from "../car/readingFormat";
import { UNIT_LABEL } from "./weightFormat";

const RANGE_LABELS: Record<WeightWorkoutRange, string> = { 3: "3 months", 6: "6 months", 12: "1 year" };
const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Weight and workouts together (HLT-06): the weight moving average as a line and the weekly workout minutes as bars, on one
 * time axis (Friday to Thursday weeks), over 3 months, 6 months or 1 year. Each has its own labelled scale. A week with no
 * weight reading leaves a gap in the line, and a week with no workouts has no bar. Nothing is drawn between the two series: the
 * chart never claims they are linked. The table is the keyboard and screen reader view, and the chart itself has no keyboard layer.
 * `today` is a prop so tests can fix the date.
 */
export function WeightWorkoutChart({ weights, workouts, today }: { weights: WeightEntryRecord[]; workouts: WorkoutRecord[]; today: string }) {
  const unit = loadPreferences().weightUnit;
  const [months, setMonths] = useState<WeightWorkoutRange>(DEFAULT_WEIGHT_WORKOUT_RANGE);
  const chart = useMemo(
    () => weightWorkoutChart(weights.map((w) => ({ date: w.date, pounds: w.pounds })), workouts.map((w) => ({ date: w.date, type: w.type, minutes: w.minutes })), today, months),
    [weights, workouts, today, months],
  );
  const data = useMemo(
    () => chart.weeks.map((week) => ({ label: shortDate(week.start), start: week.start, weight: week.weightPounds === null ? null : round(fromPounds(week.weightPounds, unit)), minutes: week.minutes === 0 ? null : week.minutes })),
    [chart, unit],
  );
  const weightLabel = `Weight, 7-day average (${UNIT_LABEL[unit]})`;
  const summary = `Chart of weight and workout minutes over the last ${RANGE_LABELS[months]}, one point per week. The line is your weight (7-day average, in ${UNIT_LABEL[unit]}) and the bars are minutes worked out. The two scales are separate. The same numbers are in the table below.`;

  return (
    <section aria-labelledby="weight-workout-heading" className="rounded-2xl border border-line bg-card p-4 text-ink">
      <h2 id="weight-workout-heading" className="font-bold">
        Weight and workouts
      </h2>

      <fieldset className="mt-3 flex flex-wrap gap-2">
        <legend className="sr-only">Show the last</legend>
        {WEIGHT_WORKOUT_RANGES.map((option) => (
          <label key={option} className={`flex min-h-11 cursor-pointer items-center rounded-xl border px-4 ${months === option ? "border-g700 bg-g100 font-bold text-gtext" : "border-line"}`}>
            <input type="radio" name="weight-workout-range" value={option} checked={months === option} onChange={() => setMonths(option)} className="sr-only" />
            {RANGE_LABELS[option]}
          </label>
        ))}
      </fieldset>

      {!chart.enoughWeight ? (
        <p className="mt-3 text-muted">
          Not enough weight data yet. This chart needs weights logged in at least {MIN_WEIGHT_WEEKS} different weeks, and you have {chart.weeksWithWeight} in the last {RANGE_LABELS[months]}. Log your weight to fill it in.
        </p>
      ) : (
        <>
          <div role="img" aria-label={summary} className="mt-3 h-72 w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis yAxisId="weight" orientation="left" width={48} domain={["dataMin - 2", "dataMax + 2"]} tickFormatter={(v: number) => String(Math.round(v))} tick={{ fill: "var(--muted)", fontSize: 12 }} label={{ value: UNIT_LABEL[unit], position: "insideTopLeft", offset: 4, fill: "var(--muted)", fontSize: 12 }} />
                <YAxis yAxisId="minutes" orientation="right" width={48} allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 12 }} label={{ value: "min", position: "insideTopRight", offset: 4, fill: "var(--muted)", fontSize: 12 }} />
                <Tooltip labelFormatter={(_, payload) => (payload?.[0]?.payload ? `Week of ${shortDate(payload[0].payload.start)}` : "")} />
                <Legend verticalAlign="bottom" height={28} iconType="plainline" />
                <Bar yAxisId="minutes" dataKey="minutes" name="Minutes worked out (right scale)" fill="var(--g300)" stroke="var(--g700)" isAnimationActive={false} />
                <Line yAxisId="weight" dataKey="weight" name={`${weightLabel} (left scale)`} type="monotone" stroke="var(--ink)" strokeWidth={2} dot={{ r: 3, fill: "var(--ink)" }} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-sm text-muted">The line and the bars have separate scales. A gap in the line is a week with no weight logged. No line joins the two: the chart does not say that one causes the other.</p>
        </>
      )}

      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2">Show the numbers as a table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Weekly weight and workout minutes over the last {RANGE_LABELS[months]}, newest first. Weeks run Friday to Thursday.</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-2">Week of</th>
              <th scope="col" className="py-1 pr-2 text-right">Weight, 7-day average ({UNIT_LABEL[unit]})</th>
              <th scope="col" className="py-1 text-right">Minutes</th>
            </tr>
          </thead>
          <tbody>
            {[...chart.weeks].reverse().map((week) => (
              <tr key={week.start} className="border-t border-line">
                <th scope="row" className="py-1 pr-2 font-normal">
                  {shortDate(week.start)}
                  {week.current ? " (this week)" : ""}
                </th>
                <td className="py-1 pr-2 text-right tabular-nums">{week.weightPounds === null ? <span aria-label="No weight logged">&ndash;</span> : round(fromPounds(week.weightPounds, unit)).toFixed(1)}</td>
                <td className="py-1 text-right tabular-nums">{week.minutes === 0 ? <span aria-label="No workout minutes">&ndash;</span> : week.minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
