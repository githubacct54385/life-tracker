import { useId, useState } from "react";
import { groupByMonth, groupByPlace, groupByService, totalCostCents, type HistoryGroup, type MaintenanceDocument, type MaintenanceRecord, type ServicePlace } from "@life-tracker/shared";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { formatCents } from "../giving/giftFormat";
import { applyFilter, HistoryFilters, type HistoryFilterState } from "./MaintenanceHistory";
import { shortDate } from "./readingFormat";
import { ServiceRow } from "./ServiceRow";

type View = "date" | "place" | "service";
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "date", label: "By date" },
  { id: "place", label: "By place" },
  { id: "service", label: "By service" },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 services · $128.00", and for a place also the last visit. A group with no costs shows no total. */
function groupSummary(view: View, group: HistoryGroup): string {
  const count = view === "service" ? plural(group.records.length, "time", "times") : plural(group.records.length, "service", "services");
  const parts = [count];
  if (view !== "service" && group.totalCents > 0) parts.push(formatCents(group.totalCents));
  if (view !== "date") parts.push(`last ${shortDate(group.lastDate)}`);
  return parts.join(" · ");
}

interface ListProps {
  /** null while loading. */
  records: MaintenanceRecord[] | null;
  places: ServicePlace[];
  documents: MaintenanceDocument[];
  today: string;
  loadFailed: boolean;
  filter: HistoryFilterState;
  onFilter: (next: HistoryFilterState) => void;
  onChanged: () => Promise<void>;
  onRetry: () => void;
}

/** The history (MIL-06): the same services by date, by place or by service, with search and filters. */
export function MaintenanceList({ records, places, documents, today, loadFailed, filter, onFilter, onChanged, onRetry }: ListProps) {
  const [view, setView] = useState<View>("date");
  const [showFilters, setShowFilters] = useState(false);
  // Groups the owner opened or closed by hand. Any other group is open when it is the newest one.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const filtersId = useId();
  const shown = records === null ? [] : applyFilter(records, places, filter);
  const active = [filter.service, filter.placeId].filter((v) => v !== "").length;
  const groups = view === "date" ? groupByMonth(shown) : view === "place" ? groupByPlace(shown) : groupByService(shown);

  return (
    <section aria-labelledby="service-history" className="space-y-3 text-ink">
      <h2 id="service-history" className="text-xl font-bold">
        Services
      </h2>
      {records === null ? (
        loadFailed ? (
          <div role="alert" className="space-y-2">
            <p>We could not load your services.</p>
            <Button type="button" variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <Skeleton lines={3} />
        )
      ) : records.length === 0 ? (
        <p className="text-muted">No services yet. Press Log a service, choose what was done, then save.</p>
      ) : (
        <>
          <div>
            <label className="block text-sm font-bold" htmlFor="history-search">
              Search
            </label>
            <input id="history-search" type="search" className="w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink" autoComplete="off" placeholder="A service, a place or a note" value={filter.text} onChange={(e) => onFilter({ ...filter, text: e.target.value })} />
          </div>

          <div role="group" aria-label="Group services" className="grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-card text-center">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} className={`min-h-11 px-2 py-2 font-bold ${view === v.id ? "bg-g700 text-white" : "text-ink"}`}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <p aria-live="polite" className="text-sm text-muted">
              {plural(shown.length, "service", "services")} &middot; <b className="text-ink tabular-nums">{formatCents(totalCostCents(shown))}</b> total
            </p>
            <button type="button" className="inline-flex min-h-11 items-center px-2 text-gtext underline" aria-expanded={showFilters} aria-controls={filtersId} onClick={() => setShowFilters((s) => !s)}>
              Filters{active > 0 ? ` (${active})` : ""}
            </button>
          </div>
          <div id={filtersId} hidden={!showFilters}>
            <HistoryFilters records={records} places={places} filter={filter} onChange={onFilter} />
          </div>

          {shown.length === 0 ? (
            <p className="text-muted">No services match. Clear the search, or choose All services and All places, to see the rest.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group, index) => {
                const id = `${view}:${group.key}`; // what is remembered as opened or closed
                const listId = `group-${view}-${index}`; // a plain id for aria-controls
                const open = view === "date" || (toggled[id] ?? index === 0);
                return (
                  <div key={id}>
                    {view === "date" ? (
                      <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 border-b-2 border-g700 pb-1 text-sm font-extrabold tracking-wide text-gtext uppercase">
                        <span>{group.title}</span>
                        <span className="font-bold normal-case tabular-nums">{groupSummary(view, group)}</span>
                      </h3>
                    ) : (
                      <h3>
                        <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setToggled((t) => ({ ...t, [id]: !open }))} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2 text-left">
                          <span className="min-w-0">
                            <span className="block font-bold break-words">{group.title}</span>
                            <span className="block text-sm font-normal text-muted tabular-nums">{groupSummary(view, group)}</span>
                          </span>
                          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                        </button>
                      </h3>
                    )}
                    {open && (
                      <ul id={listId} className="mt-2 space-y-3">
                        {group.records.map((record) => (
                          <ServiceRow key={record.id} record={record} places={places} documents={documents.filter((d) => d.recordId === record.id)} today={today} onChanged={onChanged} />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
