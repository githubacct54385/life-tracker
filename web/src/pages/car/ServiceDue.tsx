import { useMemo, useState } from "react";
import {
  MAINTENANCE_TYPES,
  MAX_INTERVAL_MILES,
  MAX_INTERVAL_MONTHS,
  MAX_SERVICE_NAME_LENGTH,
  calendarDate,
  dueCalendarFile,
  nextDue,
  ownServices,
  type DueState,
  type MaintenanceRecord,
  type NextDue,
  type ServiceInterval,
} from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { useBusy } from "../../ui/useBusy";
import { formatMiles } from "./readingFormat";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2027-02-15" -> "Feb 15, 2027". The year is shown because a due date can be months away. Pure text, so no time zone can shift the day. */
export function fullDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${MONTH_NAMES[(month ?? 1) - 1]} ${day}, ${year}`;
}

/** The state in words. Colour is only a hint on top of these (AC-MIL-09.4). */
export const STATE_WORDS: Record<DueState, string> = {
  ok: "OK",
  "due-soon": "Due soon",
  overdue: "Overdue",
  "never-logged": "Never logged",
  "needs-mileage": "Needs a mileage",
};

const STATE_STYLE: Record<DueState, string> = {
  ok: "border-line text-ink",
  "due-soon": "border-line bg-sunk text-ink font-bold",
  overdue: "border-ink bg-sunk text-ink font-bold",
  "never-logged": "border-line text-muted",
  "needs-mileage": "border-line text-muted",
};

const plural = (n: number, one: string, many: string) => `${formatMiles(n)} ${n === 1 ? one : many}`;

/** One sentence about when a service is due: the mileage, the estimated date for it, and the date, whichever applies. */
export function dueText(row: NextDue): string {
  if (row.state === "never-logged") return "Never logged. Log this service to start the clock.";
  if (row.state === "needs-mileage") return "The last service has no mileage kept with it, or there is no odometer reading yet, so the miles interval cannot be used. Log the mileage with the next service.";
  const parts: string[] = [];
  if (row.dueMiles !== null) {
    const left = row.milesLeft === null ? "" : row.milesLeft >= 0 ? `, ${plural(row.milesLeft, "mile", "miles")} to go` : `, ${plural(-row.milesLeft, "mile", "miles")} past`;
    const estimate = row.estimatedDate !== null ? `, about ${fullDate(row.estimatedDate)}` : "";
    parts.push(`at ${formatMiles(row.dueMiles)} mi${left}${estimate}`);
  }
  if (row.dueDate !== null) {
    const left = row.daysLeft === null ? "" : row.daysLeft >= 0 ? `, ${plural(row.daysLeft, "day", "days")} to go` : `, ${plural(-row.daysLeft, "day", "days")} past`;
    parts.push(`on ${fullDate(row.dueDate)}${left}`);
  }
  return `Due ${parts.join(", or ")}${parts.length > 1 ? " (whichever comes first)" : ""}.`;
}

/** Gives the browser the calendar file as a download. It holds only the service name and the date (AC-MIL-09.6). */
export function downloadCalendarFile(service: string, date: string): void {
  const url = URL.createObjectURL(new Blob([dueCalendarFile(service, date)], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${service.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service"}-due.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const input = "min-h-11 w-full rounded-xl border border-line bg-card px-3 py-2 text-ink";

function parseWhole(text: string): number | null | "bad" {
  const cleaned = text.replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  return /^\d{1,7}$/.test(cleaned) ? Number(cleaned) : "bad";
}

/**
 * "Service due" on Car > Maintenance (MIL-09): when each type of service with an interval is next due, in words, with a
 * calendar file for each, and a small form to set or change an interval. A type with no interval is never shown as due.
 */
export function ServiceDueSection({
  records,
  intervals,
  odometer,
  milesPerDay,
  today,
  loadFailed,
  onChanged,
  onRetry,
}: {
  records: MaintenanceRecord[] | null;
  intervals: ServiceInterval[] | null;
  odometer: number | undefined;
  milesPerDay: number | undefined;
  today: string;
  loadFailed: boolean;
  onChanged: () => Promise<void> | void;
  onRetry: () => void;
}) {
  const api = useApi();
  const [service, setService] = useState("");
  const [miles, setMiles] = useState("");
  const [months, setMonths] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, track] = useBusy();

  const rows = useMemo(() => (records && intervals ? nextDue(records, intervals, odometer, milesPerDay, today) : []), [records, intervals, odometer, milesPerDay, today]);
  const suggestions = useMemo(() => [...MAINTENANCE_TYPES, ...ownServices(records ?? [], MAINTENANCE_TYPES)], [records]);

  async function save() {
    const name = service.trim();
    const m = parseWhole(miles);
    const mo = parseWhole(months);
    if (name === "" || name.length > MAX_SERVICE_NAME_LENGTH) return setProblem(`Type a service name of up to ${MAX_SERVICE_NAME_LENGTH} letters.`);
    if (m === "bad" || (m !== null && (m < 1 || m > MAX_INTERVAL_MILES))) return setProblem(`Miles must be a whole number from 1 to ${formatMiles(MAX_INTERVAL_MILES)}.`);
    if (mo === "bad" || (mo !== null && (mo < 1 || mo > MAX_INTERVAL_MONTHS))) return setProblem(`Months must be a whole number from 1 to ${MAX_INTERVAL_MONTHS}.`);
    if (m === null && mo === null) return setProblem("Give the miles, the months, or both.");
    setProblem(null);
    await track(async () => {
      try {
        await api.saveServiceInterval({ service: name, ...(m !== null ? { miles: m } : {}), ...(mo !== null ? { months: mo } : {}) });
        setMessage(`Saved the interval for ${name}.`);
        setService("");
        setMiles("");
        setMonths("");
        await onChanged();
      } catch {
        setProblem("That did not work. Try again.");
      }
    });
  }

  async function remove(name: string) {
    await track(async () => {
      try {
        const found = intervals?.find((i) => i.service.toLowerCase() === name.toLowerCase());
        if (found) await api.deleteServiceInterval(found.id);
        setMessage(`Stopped tracking ${name}.`);
        await onChanged();
      } catch {
        setProblem("That did not work. Try again.");
      }
    });
  }

  function edit(row: NextDue) {
    setService(row.service);
    setMiles(row.intervalMiles === null ? "" : String(row.intervalMiles));
    setMonths(row.intervalMonths === null ? "" : String(row.intervalMonths));
    setProblem(null);
    setMessage(null);
  }

  const loading = records === null || intervals === null;
  return (
    <section aria-labelledby="service-due" className="rounded-2xl border border-line bg-card p-4 text-ink">
      <h2 id="service-due" className="font-bold">
        Service due
      </h2>
      {loadFailed && loading ? (
        <p className="mt-2">
          Could not load this.{" "}
          <button type="button" className="min-h-11 underline" onClick={onRetry}>
            Try again
          </button>
        </p>
      ) : loading ? (
        <Skeleton lines={3} />
      ) : rows.length === 0 ? (
        <p className="mt-2 text-muted">Nothing is tracked yet. Set how often a service is due below, and this shows when it is next due.</p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => {
            const date = calendarDate(row);
            return (
              <li key={row.service} className="border-b border-line py-3 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{row.service}</span>
                  <span className={`rounded-lg border px-2 py-0.5 text-sm ${STATE_STYLE[row.state]}`}>{STATE_WORDS[row.state]}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{dueText(row)}</p>
                <div className="mt-1 flex flex-wrap gap-x-4">
                  {date !== null && row.state !== "never-logged" && (
                    <button type="button" className="min-h-11 py-2 underline" onClick={() => downloadCalendarFile(row.service, date)}>
                      Add to calendar<span className="sr-only"> for {row.service}</span>
                    </button>
                  )}
                  <button type="button" className="min-h-11 py-2 underline" onClick={() => edit(row)}>
                    Change<span className="sr-only"> the {row.service} interval</span>
                  </button>
                  <button type="button" className="min-h-11 py-2 underline" onClick={() => void remove(row.service)}>
                    Stop tracking<span className="sr-only"> {row.service}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="grid gap-1 text-sm">
          Service
          <input className={input} list="interval-services" value={service} maxLength={MAX_SERVICE_NAME_LENGTH} onChange={(event) => setService(event.target.value)} autoComplete="off" />
          <datalist id="interval-services">
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1 text-sm">
          Every (miles)
          <input className={input} inputMode="numeric" value={miles} onChange={(event) => setMiles(event.target.value)} placeholder="5,000" />
        </label>
        <label className="grid gap-1 text-sm">
          Every (months)
          <input className={input} inputMode="numeric" value={months} onChange={(event) => setMonths(event.target.value)} placeholder="6" />
        </label>
        <Button type="submit" busy={busy}>
          Save interval
        </Button>
      </form>
      <p className="mt-2 text-sm text-muted">Give the miles, the months, or both. A service with no interval is never shown as due.</p>
      {problem && (
        <p role="alert" className="mt-2 text-sm">
          {problem}
        </p>
      )}
      {message && !problem && (
        <p role="status" className="mt-2 text-sm text-gtext">
          {message}
        </p>
      )}
    </section>
  );
}
