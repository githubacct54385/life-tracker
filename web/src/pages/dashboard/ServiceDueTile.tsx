import { Link } from "react-router";
import { averageMilesPerDay, mostUrgent, nextDue, type MaintenanceRecord, type OdometerReadingRecord, type ServiceInterval } from "@life-tracker/shared";
import { Icon } from "../../ui/Icon.js";
import { dueText, STATE_WORDS } from "../car/ServiceDue";
import type { Load } from "./load";

export interface ServiceDueData {
  records: MaintenanceRecord[];
  intervals: ServiceInterval[];
}

/**
 * The most urgent services on Home, up to three (AC-MIL-09.5). It says nothing while loading, after a failure, when no
 * interval is set and when nothing is overdue or due soon: it appears only when it has something to say, so there is never an empty box.
 */
export function ServiceDueTile({ today, data, readings }: { today: string; data: Load<ServiceDueData>; readings: Load<OdometerReadingRecord[]> }) {
  if (data.state !== "ok" || readings.state !== "ok") return null;
  const latest = [...readings.value].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))[0]?.miles;
  const urgent = mostUrgent(nextDue(data.value.records, data.value.intervals, latest, averageMilesPerDay(readings.value, today), today));
  if (urgent.length === 0) return null;
  return (
    <section aria-labelledby="tile-service-due" className="relative rounded-2xl border border-line bg-card p-4 text-ink transition-shadow hover:border-g300 hover:shadow-sm focus-within:border-g500 sm:col-span-2">
      <h2 id="tile-service-due" className="text-sm font-bold text-muted">
        <Link to="/car/maintenance" className="-my-3 flex items-center justify-between gap-2 rounded-md py-3 after:absolute after:inset-0 after:rounded-2xl">
          Service due
          <Icon name="chevron" className="size-4" />
        </Link>
      </h2>
      <ul className="mt-2">
        {urgent.map((row) => (
          <li key={row.service} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-2 last:border-b-0">
            <span className="font-bold">{row.service}</span>
            <span className="font-bold">{STATE_WORDS[row.state]}</span>
            <span className="basis-full text-sm text-muted">{dueText(row)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
