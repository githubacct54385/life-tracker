import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  APP_NAME,
  givingYearToDate,
  isReadingDue,
  weeklyMiles,
  weightSummary,
  workoutsThisWeek,
  groceryCounts,
  type GiftRecord,
  type GroceryItem,
  type OdometerReadingRecord,
  type SpecialContributionRecord,
  type WeightEntryRecord,
  type WorkoutRecord,
} from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { loadPreferences } from "../../settings/preferences";
import { formatMiles, shortDate } from "../car/readingFormat";
import { formatCents, todayLocal } from "../giving/giftFormat";
import { formatMinutes } from "../health/workoutFormat";
import { formatWeight } from "../health/weightFormat";
import { Icon } from "../../ui/Icon.js";
import { Skeleton } from "../../ui/Skeleton.js";
import { Page } from "../Page";
import { useLoad, type Load } from "./load";
import { WeeklySummaryCard } from "./WeeklySummaryCard";

// The whole card is the link (the title's link is stretched over it), so a tap anywhere on a tile opens its screen.
const card = "relative rounded-2xl border border-line bg-card p-4 text-ink transition-shadow hover:border-g300 hover:shadow-sm focus-within:border-g500";
const action = "flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-center font-bold text-ink hover:border-g300 hover:shadow-sm";

function Tile<T>({ id, title, load, to, empty, children }: { id: string; title: string; load: Load<T>; to: string; empty?: (value: T) => ReactNode | undefined; children: (value: T) => ReactNode }) {
  return (
    <section aria-labelledby={id} className={card}>
      <h2 id={id} className="text-sm font-bold text-muted">
        <Link to={to} className="-my-3 flex items-center justify-between gap-2 rounded-md py-3 after:absolute after:inset-0 after:rounded-2xl">
          {title}
          <Icon name="chevron" className="size-4" />
        </Link>
      </h2>
      {load.state === "loading" && <Skeleton lines={2} className="mt-3" />}
      {load.state === "error" && <p className="mt-2">Could not load this. Try again later.</p>}
      {load.state === "ok" && (empty?.(load.value) ?? children(load.value))}
    </section>
  );
}

/**
 * Home (DSH-01, DSH-02): everything at a glance, with a "This week" card on top. The latest weight and its trend, last week's miles, workouts this week and
 * year-to-date giving, an "odometer due" banner when this week's reading is missing, and quick actions.
 * `today` is a prop only so tests can fix the date.
 */
export function DashboardPage({ today = todayLocal() }: { today?: string }) {
  const api = useApi();
  const unit = loadPreferences().weightUnit;
  const year = Number(today.slice(0, 4));

  const weights = useLoad<WeightEntryRecord[]>(async () => (await api.listWeights()).entries);
  const readings = useLoad<OdometerReadingRecord[]>(async () => (await api.listAllReadings()).readings);
  const workouts = useLoad<WorkoutRecord[]>(async () => (await api.listWorkouts()).workouts);
  const giving = useLoad<{ gifts: GiftRecord[]; special: SpecialContributionRecord[] }>(async () => {
    const [g, s] = await Promise.all([api.listGifts(), api.listSpecialContributions()]);
    return { gifts: g.gifts, special: s.contributions };
  });

  // Hidden while loading, on a failure and when the list is empty: it is shown only when it has something to say (AC-GRO-01.9).
  const groceries = useLoad<GroceryItem[]>(async () => (await api.listGroceries()).items);
  const groceryCount = groceries.state === "ok" && groceries.value.length > 0 ? groceryCounts(groceries.value) : undefined;

  // The banner needs the readings to have loaded: while loading or failed it says nothing rather than something wrong.
  const due = readings.state === "ok" && isReadingDue(readings.value, today);

  return (
    <Page title={APP_NAME}>
      <div className="space-y-4 text-ink">
        {due && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-sunk p-4">
            <p className="font-bold">Your odometer reading for this week is due.</p>
            <Link to="/car/log" className="min-h-11 rounded-xl bg-g700 px-4 py-3 font-bold text-white">
              Log odometer
            </Link>
          </div>
        )}

        <WeeklySummaryCard today={today} weights={weights} readings={readings} workouts={workouts} giving={giving} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Tile
            id="tile-weight"
            title="Weight"
            load={weights}
            to="/health/weight"
            empty={(entries) => (entries.length === 0 ? <p className="mt-2 text-muted">No weights yet. Add today&rsquo;s weight.</p> : undefined)}
          >
            {(entries) => {
              const s = weightSummary(entries.map((e) => ({ date: e.date, pounds: e.pounds })))!;
              const change = s.changePounds;
              const moved = change === undefined ? null : Math.abs(change) < 0.05 ? "Steady over the last week" : `${change < 0 ? "Down" : "Up"} ${formatWeight(Math.abs(change), unit)} over the last week`;
              return (
                <>
                  <p className="mt-1 text-2xl font-bold">{formatWeight(s.latest.pounds, unit)}</p>
                  <p className="text-sm text-muted">
                    7-day trend {formatWeight(s.trendPounds, unit)}
                    {moved ? `. ${moved}.` : ""}
                  </p>
                </>
              );
            }}
          </Tile>

          <Tile
            id="tile-miles"
            title="Last week's miles"
            load={readings}
            to="/car/stats"
            empty={(list) => (weeklyMiles(list).length === 0 ? <p className="mt-2 text-muted">Needs two weekly readings. Log your odometer each week.</p> : undefined)}
          >
            {(list) => {
              const periods = weeklyMiles(list);
              const last = periods[periods.length - 1]!;
              return (
                <>
                  <p className="mt-1 text-2xl font-bold">{formatMiles(last.miles)} miles</p>
                  <p className="text-sm text-muted">
                    Week ending {shortDate(last.to)}
                    {last.days === 7 ? "" : ` (${last.days} days)`}
                  </p>
                </>
              );
            }}
          </Tile>

          <Tile id="tile-workouts" title="Workouts this week" load={workouts} to="/health">
            {(list) => {
              const week = workoutsThisWeek(list.map((w) => ({ date: w.date, minutes: w.minutes, reps: w.reps })), today);
              return week.count === 0 ? (
                <p className="mt-2 text-muted">No workouts yet this week.</p>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold">
                    {week.count} {week.count === 1 ? "workout" : "workouts"}
                  </p>
                  <p className="text-sm text-muted">
                    {[week.minutes > 0 || week.reps === 0 ? `${formatMinutes(week.minutes)} in total` : null, week.reps > 0 ? `${week.reps.toLocaleString("en-US")} pushups` : null].filter(Boolean).join(", ")}
                  </p>
                </>
              );
            }}
          </Tile>

          {groceryCount && (
            <section aria-labelledby="tile-groceries" className={card}>
              <h2 id="tile-groceries" className="text-sm font-bold text-muted">
                <Link to="/groceries" className="-my-3 flex items-center justify-between gap-2 rounded-md py-3 after:absolute after:inset-0 after:rounded-2xl">
                  Groceries
                  <Icon name="chevron" className="size-4" />
                </Link>
              </h2>
              <p className="mt-1 text-2xl font-bold">{groceryCount.left === 0 ? "All found" : `${groceryCount.left} left`}</p>
              <p className="text-sm text-muted">
                Found {groceryCount.found} of {groceryCount.total}
              </p>
            </section>
          )}

          <Tile id="tile-giving" title="Giving this year" load={giving} to="/giving">
            {({ gifts, special }) => {
              const totals = givingYearToDate(gifts, special, { year });
              return (
                <>
                  <p className="mt-1 text-2xl font-bold">{formatCents(totals.combinedCents)}</p>
                  <p className="text-sm text-muted">
                    Year to date: {formatCents(totals.regularCents)} regular, {formatCents(totals.specialCents)} special
                  </p>
                </>
              );
            }}
          </Tile>
        </div>

        <section aria-labelledby="quick-actions">
          <h2 id="quick-actions" className="mb-2 text-sm font-bold text-muted">
            Quick actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link to="/health/weight" className={action}>
              <Icon name="scale" className="size-5 text-gtext" />
              Add weight
            </Link>
            <Link to="/health/workouts" className={action}>
              <Icon name="dumbbell" className="size-5 text-gtext" />
              Add workout
            </Link>
            <Link to="/car/log" className={action}>
              <Icon name="gauge" className="size-5 text-gtext" />
              Log odometer
            </Link>
            <Link to="/giving/log" className={action}>
              <Icon name="gift" className="size-5 text-gtext" />
              Add giving
            </Link>
            <Link to="/groceries" className={action}>
              <Icon name="cart" className="size-5 text-gtext" />
              Grocery list
            </Link>
          </div>
        </section>
      </div>
    </Page>
  );
}
