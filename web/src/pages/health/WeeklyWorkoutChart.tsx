import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MAX_WORKOUT_GOAL, MIN_WORKOUT_GOAL, weeklyWorkoutChart, type WorkoutRecord } from "@life-tracker/shared";
import { Button } from "../../ui/Button";
import { useBusy } from "../../ui/useBusy";
import { shortDate } from "../car/readingFormat";
import { formatMinutes } from "./workoutFormat";

type View = "count" | "minutes";

/** Fills for the workout types, most frequent first. The legend, the tooltip and the table name each type, so colour is never the only clue (AC-SET-02.4). */
const FILLS = ["var(--g700)", "var(--g500)", "var(--g300)", "var(--ink)", "var(--muted)", "var(--line)"];
const fillFor = (index: number) => FILLS[index % FILLS.length]!;

const input = "min-h-11 w-24 rounded-lg border border-line bg-bg p-2.5 text-ink";

/** Weeks as the table and the chart label them: the Friday the week starts on. */
const weekLabel = (start: string) => shortDate(start);

/**
 * Workouts per week for the last 12 weeks (HLT-05): bars split by type, a line for the weekly goal, the streak of weeks
 * that met it, and a goal box. Weeks run Friday to Thursday. The table below is the keyboard and screen reader view, and the
 * chart itself has no keyboard layer (AC-SET-02.2). `goal` is null until one is set. `today` is a prop so tests can fix the date.
 */
export function WeeklyWorkoutChart({ workouts, today, goal, onSaveGoal }: { workouts: WorkoutRecord[]; today: string; goal: number | null; onSaveGoal: (perWeek: number) => Promise<void> }) {
  const [view, setView] = useState<View>("count");
  const [draft, setDraft] = useState(goal === null ? "" : String(goal));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, track] = useBusy();

  const chart = useMemo(() => weeklyWorkoutChart(workouts, today, goal), [workouts, today, goal]);
  const data = useMemo(
    () =>
      chart.weeks.map((week) => ({
        label: weekLabel(week.start),
        start: week.start,
        end: week.end,
        ...Object.fromEntries(chart.types.map((type) => [type, week.byType.find((t) => t.type === type)?.[view] ?? 0])),
      })),
    [chart, view],
  );

  async function save() {
    const text = draft.trim();
    const value = /^\d{1,2}$/.test(text) ? Number(text) : NaN;
    if (!(value >= MIN_WORKOUT_GOAL && value <= MAX_WORKOUT_GOAL)) {
      setProblem(`Enter a whole number from ${MIN_WORKOUT_GOAL} to ${MAX_WORKOUT_GOAL}.`);
      return;
    }
    setProblem(null);
    await track(async () => {
      try {
        await onSaveGoal(value);
      } catch {
        setProblem("That did not work. Try again.");
      }
    });
  }

  const unit = view === "count" ? "workouts" : "minutes";
  const current = chart.weeks.at(-1)!;
  const summary = `Bar chart of ${unit} in each of the last 12 weeks, split by workout type${chart.goal === null ? "" : ` with a line at the goal of ${chart.goal} a week`}. This week has ${current.count} ${current.count === 1 ? "workout" : "workouts"}. The same numbers are in the table below.`;
  const goalLine = chart.goal === null
    ? "No weekly goal yet. Set one below to see a line on the chart."
    : chart.left === 0
      ? `Goal: ${chart.goal} a week. You have met it this week.`
      : `Goal: ${chart.goal} a week. This week: ${current.count} of ${chart.goal}, ${chart.left} to go.`;
  const streakLine = chart.goal === null ? null : chart.streakWeeks === 0 ? "No streak yet." : `Streak: ${chart.streakWeeks} ${chart.streakWeeks === 1 ? "week" : "weeks"} in a row at your goal.`;

  return (
    <section aria-labelledby="weekly-chart-heading" className="rounded-2xl border border-line bg-card p-4 text-ink">
      <h2 id="weekly-chart-heading" className="font-bold">Weekly workouts</h2>
      <p className="mt-1">{goalLine}</p>
      {streakLine && <p className="text-sm text-muted">{streakLine}</p>}

      <fieldset className="mt-3 flex gap-2">
        <legend className="sr-only">Show the chart as</legend>
        {(["count", "minutes"] as const).map((option) => (
          <label key={option} className={`flex min-h-11 cursor-pointer items-center rounded-xl border px-4 ${view === option ? "border-g700 bg-g100 font-bold text-gtext" : "border-line"}`}>
            <input type="radio" name="weekly-view" value={option} checked={view === option} onChange={() => setView(option)} className="sr-only" />
            {option === "count" ? "Workouts" : "Minutes"}
          </label>
        ))}
      </fieldset>

      {!chart.hasWorkouts ? (
        <p className="mt-3 text-muted">No workouts in the last 12 weeks. Log a workout to fill the chart.</p>
      ) : (
        <>
          <div role="img" aria-label={summary} className="mt-3 h-64 w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} width={36} allowDecimals={false} />
                <Tooltip labelFormatter={(_, payload) => (payload?.[0]?.payload ? `Week of ${shortDate(payload[0].payload.start)}` : "")} formatter={(value, name) => [view === "count" ? String(value) : formatMinutes(Number(value)), String(name)]} />
                {chart.types.map((type, i) => (
                  <Bar key={type} dataKey={type} stackId="weeks" fill={fillFor(i)} isAnimationActive={false} />
                ))}
                {view === "count" && chart.goal !== null && <ReferenceLine y={chart.goal} stroke="var(--ink)" strokeWidth={2} strokeDasharray="6 4" />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {chart.types.map((type, i) => (
              <li key={type}>
                <span aria-hidden className="mr-1 inline-block h-3 w-3 rounded-sm border border-line align-middle" style={{ background: fillFor(i) }} />
                {type}
              </li>
            ))}
            {view === "count" && chart.goal !== null && (
              <li>
                <span aria-hidden className="mr-1 inline-block w-4 border-t-2 border-dashed border-ink align-middle" />
                Goal
              </li>
            )}
          </ul>
        </>
      )}

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="grid gap-1 text-sm">
          Workouts per week
          <input inputMode="numeric" className={input} value={draft} onChange={(event) => setDraft(event.target.value)} aria-describedby={problem ? "goal-problem" : undefined} aria-invalid={problem ? true : undefined} />
        </label>
        <Button type="submit" busy={busy}>
          {chart.goal === null ? "Set goal" : "Save goal"}
        </Button>
      </form>
      {problem && (
        <p id="goal-problem" role="alert" className="mt-2 text-sm">
          {problem}
        </p>
      )}

      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2">Show the numbers as a table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">The last 12 weeks, newest first. Weeks run Friday to Thursday.</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-2">Week of</th>
              <th scope="col" className="py-1 pr-2 text-right">Workouts</th>
              <th scope="col" className="py-1 pr-2 text-right">Minutes</th>
              <th scope="col" className="py-1">By type</th>
            </tr>
          </thead>
          <tbody>
            {[...chart.weeks].reverse().map((week) => (
              <tr key={week.start} className="border-t border-line">
                <th scope="row" className="py-1 pr-2 font-normal">{weekLabel(week.start)}{week.current ? " (this week)" : ""}</th>
                <td className="py-1 pr-2 text-right tabular-nums">{week.count}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{week.minutes === 0 ? <span aria-label="No timed workouts">&ndash;</span> : week.minutes}</td>
                <td className="py-1">{week.byType.length === 0 ? <span aria-label="No workouts">&ndash;</span> : week.byType.map((t) => `${t.type} ${t.count}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
