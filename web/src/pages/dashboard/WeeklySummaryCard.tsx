import type { ReactNode } from "react";
import { Link } from "react-router";
import { weeklySummary, type Figure, type GiftRecord, type OdometerReadingRecord, type SpecialContributionRecord, type WeightEntryRecord, type WorkoutRecord } from "@life-tracker/shared";
import { loadPreferences } from "../../settings/preferences";
import { formatMiles, shortDate } from "../car/readingFormat";
import { formatCents } from "../giving/giftFormat";
import { formatWeight } from "../health/weightFormat";
import { Skeleton } from "../../ui/Skeleton.js";
import type { Load } from "./load";

interface Props {
  today: string;
  weights: Load<WeightEntryRecord[]>;
  readings: Load<OdometerReadingRecord[]>;
  workouts: Load<WorkoutRecord[]>;
  giving: Load<{ gifts: GiftRecord[]; special: SpecialContributionRecord[] }>;
}

const NO_DATA_BEFORE = "No data for the week before";

/** "5 more miles than the week before", in words, with an arrow that is only decoration. */
function compare(figure: Figure<number>, noun: (n: number) => string, show: (n: number) => string): { arrow: string; text: string } {
  if (figure.previous === undefined) return { arrow: "", text: NO_DATA_BEFORE };
  const diff = (figure.current ?? 0) - figure.previous;
  if (diff === 0) return { arrow: "→", text: "Same as the week before" };
  const amount = Math.abs(diff);
  // "5 more miles", "1 fewer workout", "$25.00 more": the noun is left out for money.
  const text = noun(amount) === "" ? `${show(amount)} ${diff > 0 ? "more" : "less"}` : `${show(amount)} ${diff > 0 ? "more" : "fewer"} ${noun(amount)}`;
  return { arrow: diff > 0 ? "↑" : "↓", text: `${text} than the week before` };
}

interface FigureProps {
  id: string;
  label: string;
  to: string;
  load: Load<unknown>;
  /** What to show once loaded. `undefined` means there is no data for the week. */
  value: () => { main: ReactNode; detail?: ReactNode; comparison?: { arrow: string; text: string } } | undefined;
}

function FigureItem({ id, label, to, load, value }: FigureProps) {
  const shown = load.state === "ok" ? value() : undefined;
  return (
    <li className="relative rounded-xl border border-line bg-sunk p-3 focus-within:border-g500">
      <h3 id={id} className="text-sm font-bold text-muted">
        <Link to={to} className="-my-3 block rounded-md py-3 after:absolute after:inset-0 after:rounded-xl">
          {label}
        </Link>
      </h3>
      {load.state === "loading" && <Skeleton lines={1} className="mt-2" />}
      {load.state === "error" && <p className="mt-1">Could not load this.</p>}
      {load.state === "ok" &&
        (shown ? (
          <>
            <p className="mt-1 text-xl font-bold">{shown.main}</p>
            {shown.detail && <p className="text-sm text-muted">{shown.detail}</p>}
            {shown.comparison && (
              <p className="text-sm">
                {shown.comparison.arrow && <span aria-hidden className="mr-1">{shown.comparison.arrow}</span>}
                {shown.comparison.text}
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-xl font-bold text-muted">No data</p>
        ))}
    </li>
  );
}

/**
 * "This week" (DSH-02): miles, workouts, weight change and giving, each compared with the week before, from the lists Home
 * already loaded, so it makes no request of its own (AC-DSH-02.5). A figure with no data says so and never shows a zero.
 */
export function WeeklySummaryCard({ today, weights, readings, workouts, giving }: Props) {
  const unit = loadPreferences().weightUnit;
  const summary = weeklySummary(
    {
      readings: readings.state === "ok" ? readings.value : [],
      workouts: workouts.state === "ok" ? workouts.value : [],
      weights: weights.state === "ok" ? weights.value : [],
      gifts: giving.state === "ok" ? giving.value.gifts : [],
      special: giving.state === "ok" ? giving.value.special : [],
    },
    today,
  );
  const plural = (word: string) => (n: number) => (n === 1 ? word : `${word}s`);

  return (
    <section aria-labelledby="tile-week" className="rounded-2xl border border-line bg-card p-4 text-ink">
      <h2 id="tile-week" className="text-sm font-bold text-muted">
        This week
      </h2>
      <p className="text-sm text-muted">
        {shortDate(summary.weekStart)} to {shortDate(summary.weekEnd)} (Friday to Thursday)
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FigureItem
          id="week-miles"
          label="Miles"
          to="/car/stats"
          load={readings}
          value={() =>
            summary.miles.current === undefined
              ? undefined
              : {
                  main: `${formatMiles(summary.miles.current)} miles`,
                  detail: `Week ending ${shortDate(summary.miles.periodEnd!)}${summary.miles.days === 7 ? "" : ` (${summary.miles.days} days)`}`,
                  comparison: compare(summary.miles, plural("mile"), formatMiles),
                }
          }
        />
        <FigureItem
          id="week-workouts"
          label="Workouts"
          to="/health"
          load={workouts}
          value={() =>
            summary.workouts.current === undefined
              ? undefined
              : { main: `${summary.workouts.current} ${summary.workouts.current === 1 ? "workout" : "workouts"}`, comparison: compare(summary.workouts, plural("workout"), String) }
          }
        />
        <FigureItem
          id="week-weight"
          label="Weight"
          to="/health/weight"
          load={weights}
          value={() => {
            const { current, previous } = summary.weightChange;
            if (current === undefined) return undefined;
            const words = (change: number) => (Math.abs(change) < 0.05 ? "steady" : `${change < 0 ? "down" : "up"} ${formatWeight(Math.abs(change), unit)}`);
            return {
              main: `${words(current).charAt(0).toUpperCase()}${words(current).slice(1)} since last week`,
              comparison: previous === undefined ? { arrow: "", text: NO_DATA_BEFORE } : { arrow: "", text: `The week before: ${words(previous)}` },
            };
          }}
        />
        <FigureItem
          id="week-giving"
          label="Money given"
          to="/giving"
          load={giving}
          value={() =>
            summary.givingCents.current === undefined
              ? undefined
              : { main: formatCents(summary.givingCents.current), comparison: compare(summary.givingCents, () => "", formatCents) }
          }
        />
      </ul>
    </section>
  );
}
