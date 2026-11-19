import { useState } from "react";
import { MAINTENANCE_TYPES, filterHistory, lastDoneByService, ownServices, totalCostCents, type MaintenanceRecord, type ServicePlace } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Button } from "../../ui/Button";
import { Presence } from "../../ui/Presence";
import { Skeleton } from "../../ui/Skeleton";
import { useBusy } from "../../ui/useBusy";
import { formatCents } from "../giving/giftFormat";
import { formatMiles, shortDate } from "./readingFormat";

const selectClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";
const linkButton = "inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline";

/** The shown history can be limited to one type and one place (MIL-06). Empty text means "all". */
export interface HistoryFilterState {
  service: string;
  placeId: string;
}
export const NO_FILTER: HistoryFilterState = { service: "", placeId: "" };

/** The records the filter lets through. A filter that no longer matches anything on offer (its service was deleted) is ignored. */
export function applyFilter(records: MaintenanceRecord[], places: ServicePlace[], filter: HistoryFilterState): MaintenanceRecord[] {
  const services = serviceOptions(records);
  const service = services.some((s) => s.toLowerCase() === filter.service.toLowerCase()) ? filter.service : "";
  const place = places.find((p) => String(p.id) === filter.placeId);
  return filterHistory(records, { ...(service ? { service } : {}), ...(place ? { placeId: place.id } : {}) });
}

const serviceOptions = (records: MaintenanceRecord[]) => [...MAINTENANCE_TYPES, ...ownServices(records, MAINTENANCE_TYPES)];

interface LoadProps {
  /** null while loading. */
  records: MaintenanceRecord[] | null;
  loadFailed: boolean;
  onRetry: () => void;
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mt-2 space-y-2">
      <p>We could not load your services.</p>
      <Button type="button" variant="ghost" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** "Last done": each type of service with its latest date and mileage, and the miles driven since (MIL-06). */
export function LastDoneSection({ records, loadFailed, onRetry, latestOdometer }: LoadProps & { latestOdometer: number | undefined }) {
  const rows = records === null ? [] : lastDoneByService(records, MAINTENANCE_TYPES, latestOdometer);
  return (
    <section aria-labelledby="last-done" className="rounded-2xl border border-line bg-card p-4 text-ink">
      <h2 id="last-done" className="font-bold">
        Last done
      </h2>
      {loadFailed && records === null ? (
        <LoadFailed onRetry={onRetry} />
      ) : records === null ? (
        <Skeleton lines={4} />
      ) : (
        <>
          {records.length === 0 && <p className="mt-2 text-muted">Nothing is recorded yet. Save a service and it shows up here.</p>}
          <ul className="mt-2">
            {rows.map((row) => (
              <li key={row.service} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-2 last:border-b-0">
                <span className="font-bold">{row.service}</span>
                {row.date === null ? (
                  <span className="text-muted">Not recorded yet</span>
                ) : (
                  <span className="text-right text-sm text-muted">
                    {shortDate(row.date)}
                    {row.odometerMiles !== null && <> &middot; {formatMiles(row.odometerMiles)} mi</>}
                    {row.milesSince !== null && <> &middot; {formatMiles(row.milesSince)} mi since</>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Choose one type and/or one place; the total below is for what is shown. */
export function HistoryFilters({ records, places, filter, onChange, shown }: { records: MaintenanceRecord[]; places: ServicePlace[]; filter: HistoryFilterState; onChange: (next: HistoryFilterState) => void; shown: MaintenanceRecord[] }) {
  const total = totalCostCents(shown);
  return (
    <div className="mt-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-bold" htmlFor="filter-service">
            Show service
          </label>
          <select id="filter-service" className={selectClass} value={filter.service} onChange={(e) => onChange({ ...filter, service: e.target.value })}>
            <option value="">All services</option>
            {serviceOptions(records).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold" htmlFor="filter-place">
            Show place
          </label>
          <select id="filter-place" className={selectClass} value={filter.placeId} onChange={(e) => onChange({ ...filter, placeId: e.target.value })}>
            <option value="">All places</option>
            {places.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p aria-live="polite" className="text-sm text-muted">
        {shown.length} {shown.length === 1 ? "service" : "services"} &middot; <b className="text-ink tabular-nums">{formatCents(total)}</b> total
      </p>
    </div>
  );
}

function PlaceRow({ place, uses, onChanged }: { place: ServicePlace; uses: number; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(place.name);
  const [problem, setProblem] = useState<string | null>(null);
  const trimmed = name.trim();

  const close = () => {
    setMode("view");
    setProblem(null);
  };

  async function rename() {
    setProblem(null);
    try {
      const result = await api.renameServicePlace(place.id, trimmed);
      if (result.status === "name_taken") return setProblem("Another place already has that name.");
      close();
      await onChanged();
    } catch {
      setProblem("That did not work. Try again.");
    }
  }

  async function remove() {
    setProblem(null);
    try {
      if ((await api.deleteServicePlace(place.id)) === "in_use") return setProblem("A service still uses this place, so it was not deleted.");
      close();
      await onChanged();
    } catch {
      setProblem("That did not work. Try again.");
    }
  }

  return (
    <li className="border-b border-line py-2 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <div className="min-w-0">
          <p className="font-bold break-words">{place.name}</p>
          <p className="text-sm text-muted">{uses === 0 ? "Not used yet" : `Used by ${uses} ${uses === 1 ? "service" : "services"}`}</p>
        </div>
        {mode === "view" && (
          <span className="flex gap-1">
            <button type="button" className={linkButton} aria-label={`Rename place: ${place.name}`} onClick={() => { setName(place.name); setMode("rename"); }}>
              Rename
            </button>
            {uses === 0 && (
              <button type="button" className={linkButton} aria-label={`Delete place: ${place.name}`} onClick={() => setMode("delete")}>
                Delete
              </button>
            )}
          </span>
        )}
      </div>

      <Presence>
        {mode === "rename" ? (
          <form
            className="mt-2 space-y-2"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (trimmed !== "") void track(rename);
            }}
          >
            <label className="block font-bold" htmlFor={`rename-${place.id}`}>
              New name
            </label>
            <input id={`rename-${place.id}`} className={selectClass} maxLength={80} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" disabled={trimmed === ""} busy={busy}>
                Save name
              </Button>
              <Button variant="ghost" type="button" onClick={close} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </Presence>

      <Presence>
        {mode === "delete" ? (
          <div role="alert" className="mt-2 rounded-xl border border-line bg-sunk p-4 text-ink">
            <p>Delete this place? Nothing uses it.</p>
            <div className="mt-3 flex gap-2">
              <Button type="button" onClick={() => void track(remove)} busy={busy}>
                Yes, delete
              </Button>
              <Button variant="ghost" type="button" onClick={close} disabled={busy}>
                Keep it
              </Button>
            </div>
          </div>
        ) : null}
      </Presence>
      <Presence>{problem ? <p role="alert" className="mt-2 text-sm">{problem}</p> : null}</Presence>
    </li>
  );
}

/** The shops used before, with rename, and delete when nothing uses them (MIL-06). */
export function PlacesSection({ places, records, onChanged }: { places: ServicePlace[]; records: MaintenanceRecord[]; onChanged: () => Promise<void> }) {
  if (places.length === 0) return null;
  return (
    <section aria-labelledby="service-places" className="rounded-2xl border border-line bg-card p-4 text-ink">
      <h2 id="service-places" className="font-bold">
        Places
      </h2>
      <ul className="mt-2">
        {places.map((place) => (
          <PlaceRow key={place.id} place={place} uses={records.filter((r) => r.place?.id === place.id).length} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}
