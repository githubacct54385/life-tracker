import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_WEEKLY_WORKOUT_TARGET, paceStreakDays, workoutTotals, type WorkoutRecord } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { monthLabel, todayLocal } from "../giving/giftFormat";
import { shortDate } from "../car/readingFormat";
import { HubLink } from "../../ui/HubLink";
import { Skeleton } from "../../ui/Skeleton";
import { Page } from "../Page";
import { describeAmount, formatMinutes, SOURCE_LABELS } from "./workoutFormat";

// The chart and goal load only when Health opens, so Recharts and this code stay out of the first screen's JavaScript (OPS-10).
const WeeklyWorkoutChart = lazy(() => import("./WeeklyWorkoutChart").then((m) => ({ default: m.WeeklyWorkoutChart })));

const card = "rounded-2xl border border-line bg-card p-4 text-ink";

/** How many periods and workouts the screen lists. The full history stays on the Workouts screen. */
const WEEKS_SHOWN = 8;
const MONTHS_SHOWN = 6;
const HISTORY_SHOWN = 30;

function TotalsTable({ caption, firstHeading, rows }: { caption: string; firstHeading: string; rows: { key: string; label: string; count: number; minutes: number; reps: number }[] }) {
  const showReps = rows.some((row) => row.reps > 0);
  return (
    <table className="mt-2 w-full text-left text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{firstHeading}</th>
          <th scope="col" className="text-right">Workouts</th>
          <th scope="col" className="text-right">Time</th>
          {showReps && <th scope="col" className="text-right">Pushups</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-line">
            <th scope="row" className="py-2 font-normal">{row.label}</th>
            <td className="py-2 text-right tabular-nums">{row.count}</td>
            <td className="py-2 text-right tabular-nums">{row.minutes === 0 ? <span aria-label="No timed workouts">&ndash;</span> : formatMinutes(row.minutes)}</td>
            {showReps && <td className="py-2 text-right tabular-nums">{row.reps.toLocaleString("en-US")}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Health home (HLT-04): the owner's consistency at a glance. A streak, weekly and monthly totals of workouts and time
 * (weeks start on Monday), and the workout history, newest first. `today` is a prop only so tests can fix the date.
 */
export function HealthPage({ today = todayLocal() }: { today?: string }) {
  const api = useApi();
  const [workouts, setWorkouts] = useState<WorkoutRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  /** The weekly goal: undefined while it loads, null when none is set. */
  const [goal, setGoal] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    api
      .listWorkouts()
      .then((r) => current && setWorkouts(r.workouts))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [api]);

  useEffect(() => {
    let current = true;
    api
      .getWorkoutGoal()
      .then((r) => current && setGoal(r.perWeek))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [api]);

  const saveGoal = useCallback(async (perWeek: number) => setGoal((await api.saveWorkoutGoal(perWeek)).perWeek), [api]);

  const summary = useMemo(() => {
    if (!workouts) return null;
    const days = workouts.map((w) => ({ date: w.date, minutes: w.minutes, reps: w.reps }));
    return {
      streak: paceStreakDays(days, { today }),
      weeks: workoutTotals(days, "week").slice(0, WEEKS_SHOWN),
      months: workoutTotals(days, "month").slice(0, MONTHS_SHOWN),
      history: [...workouts].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1)).slice(0, HISTORY_SHOWN),
    };
  }, [workouts, today]);

  return (
    <Page title="Health">
      <div className="space-y-4 text-ink">
        <div className="grid gap-3 sm:grid-cols-2">
          <HubLink to="/health/weight" icon="scale" title="Weight" description="Log and chart your weight" />
          <HubLink to="/health/workouts" icon="dumbbell" title="Workouts" description="Log a workout, or count pushups" />
        </div>

        {failed && <p role="alert">That did not work. Try again.</p>}
        {!failed && !summary && <Skeleton lines={3} />}
        {summary && goal !== undefined && (
          <Suspense fallback={<Skeleton lines={3} />}>
            <WeeklyWorkoutChart workouts={workouts!} today={today} goal={goal} onSaveGoal={saveGoal} />
          </Suspense>
        )}
        {summary && workouts!.length === 0 && <p className="text-muted">No workouts yet. Log a workout to see your streak, weekly and monthly totals, and your history here.</p>}

        {summary && workouts!.length > 0 && (
          <>
            <section aria-labelledby="streak-heading" className={card}>
              <h2 id="streak-heading" className="font-bold">
                Streak
              </h2>
              <p className="mt-1 text-2xl font-bold">{summary.streak === 0 ? "No streak yet" : `${summary.streak} ${summary.streak === 1 ? "day" : "days"}`}</p>
              <p className="text-sm text-muted">
                {summary.streak === 0
                  ? `${DEFAULT_WEEKLY_WORKOUT_TARGET} workouts in any 7 days starts a streak.`
                  : `Days in a row with at least ${DEFAULT_WEEKLY_WORKOUT_TARGET} workouts in the last 7 days.`}
              </p>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <section aria-labelledby="weeks-heading" className={card}>
                <h2 id="weeks-heading" className="font-bold">
                  By week
                </h2>
                <TotalsTable
                  caption="Workouts and time per week, newest first. Weeks start on Monday."
                  firstHeading="Week of"
                  rows={summary.weeks.map((w) => ({ key: w.period, label: shortDate(w.period), count: w.count, minutes: w.minutes, reps: w.reps }))}
                />
              </section>
              <section aria-labelledby="months-heading" className={card}>
                <h2 id="months-heading" className="font-bold">
                  By month
                </h2>
                <TotalsTable
                  caption="Workouts and time per month, newest first."
                  firstHeading="Month"
                  rows={summary.months.map((m) => ({ key: m.period, label: monthLabel(m.period), count: m.count, minutes: m.minutes, reps: m.reps }))}
                />
              </section>
            </div>

            <section aria-labelledby="history-heading" className={card}>
              <h2 id="history-heading" className="font-bold">
                History
              </h2>
              <ul className="mt-2">
                {summary.history.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-2 last:border-b-0">
                    <span className="text-muted">{shortDate(w.date)}</span>
                    <b>
                      {w.type}, {describeAmount(w)}
                    </b>
                    <span className="rounded-full border border-line px-2 py-0.5 text-sm">{SOURCE_LABELS[w.source]}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </Page>
  );
}
