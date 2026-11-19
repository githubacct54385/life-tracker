import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MAINTENANCE_TYPES, MAX_MAINTENANCE_NOTE_LENGTH, MAX_SERVICE_NAME_LENGTH, type MaintenanceDocument, type MaintenanceRecord, type ServicePlace } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Button } from "../../ui/Button";
import { Presence } from "../../ui/Presence";
import { Skeleton } from "../../ui/Skeleton";
import { useBusy } from "../../ui/useBusy";
import { formatCents, todayLocal } from "../giving/giftFormat";
import { Page } from "../Page";
import { addableService, allServices, formFromRecord, NEW_PLACE, toRequest, type ServiceForm } from "./maintenanceFormat";
import { applyFilter, HistoryFilters, LastDoneSection, NO_FILTER, PlacesSection, type HistoryFilterState } from "./MaintenanceHistory";
import { formatMiles, shortDate } from "./readingFormat";
import { RecentDocuments } from "./RecentDocuments";
import { ServiceDocuments } from "./ServiceDocuments";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";
const labelClass = "block font-bold text-ink";

const blankForm = (today: string, odometer = ""): ServiceForm => ({ ticked: [], custom: [], doneBy: "shop", placeChoice: "", newPlace: "", cost: "", date: today, odometer, note: "" });

interface FieldsProps {
  idPrefix: string;
  form: ServiceForm;
  places: ServicePlace[];
  today: string;
  onChange: (next: Partial<ServiceForm>) => void;
}

/** What was done, who did it, where, when, the mileage, the cost and a note. The same fields are used to add and to edit. */
function ServiceFields({ idPrefix, form, places, today, onChange }: FieldsProps) {
  const [customText, setCustomText] = useState("");
  const all = allServices(form, MAINTENANCE_TYPES);
  const addable = addableService(customText, all);
  const showNewPlace = form.placeChoice === NEW_PLACE || places.length === 0;

  function addCustom() {
    if (addable === undefined) return;
    onChange({ custom: [...form.custom, addable] });
    setCustomText("");
  }

  return (
    <>
      <fieldset className="space-y-2">
        <legend className={labelClass}>What was done</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {MAINTENANCE_TYPES.map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-g700"
                checked={form.ticked.includes(type)}
                onChange={(e) => onChange({ ticked: e.target.checked ? [...form.ticked, type] : form.ticked.filter((t) => t !== type) })}
              />
              {type}
            </label>
          ))}
        </div>
        {form.custom.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Your own services">
            {form.custom.map((name) => (
              <li key={name} className="flex items-center gap-1 rounded-full border border-line bg-sunk py-1 pl-3 pr-1 text-sm">
                {name}
                <button type="button" className="inline-flex size-8 items-center justify-center rounded-full" aria-label={`Remove ${name}`} onClick={() => onChange({ custom: form.custom.filter((c) => c !== name) })}>
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            aria-label="Add your own service"
            className={inputClass}
            placeholder="Another service…"
            maxLength={MAX_SERVICE_NAME_LENGTH}
            autoComplete="off"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button type="button" variant="ghost" disabled={addable === undefined} onClick={addCustom}>
            Add
          </Button>
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className={labelClass}>Done by</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input type="radio" name={`${idPrefix}-doneby`} className="size-5 accent-g700" checked={form.doneBy === "shop"} onChange={() => onChange({ doneBy: "shop" })} />A shop or dealership
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="radio" name={`${idPrefix}-doneby`} className="size-5 accent-g700" checked={form.doneBy === "home"} onChange={() => onChange({ doneBy: "home", placeChoice: "", newPlace: "" })} />I did it myself
        </label>
      </fieldset>

      {form.doneBy === "shop" && (
        <div className="space-y-2">
          {places.length > 0 && (
            <>
              <label className={labelClass} htmlFor={`${idPrefix}-place`}>
                Place
              </label>
              <select id={`${idPrefix}-place`} className={inputClass} value={form.placeChoice} onChange={(e) => onChange({ placeChoice: e.target.value })}>
                <option value="">No place named</option>
                {places.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
                <option value={NEW_PLACE}>Add a new place…</option>
              </select>
            </>
          )}
          {showNewPlace && (
            <>
              <label className={labelClass} htmlFor={`${idPrefix}-newplace`}>
                {places.length === 0 ? "Place (optional)" : "New place"}
              </label>
              <input
                id={`${idPrefix}-newplace`}
                className={inputClass}
                autoComplete="off"
                value={form.newPlace}
                onChange={(e) => onChange({ newPlace: e.target.value, placeChoice: NEW_PLACE })}
              />
            </>
          )}
        </div>
      )}

      <label className={labelClass} htmlFor={`${idPrefix}-date`}>
        Date
      </label>
      <input id={`${idPrefix}-date`} type="date" className={inputClass} max={today} value={form.date} onChange={(e) => onChange({ date: e.target.value })} />

      <label className={labelClass} htmlFor={`${idPrefix}-odometer`}>
        Odometer (optional)
      </label>
      <input id={`${idPrefix}-odometer`} className={inputClass} inputMode="numeric" autoComplete="off" value={form.odometer} onChange={(e) => onChange({ odometer: e.target.value })} />

      <label className={labelClass} htmlFor={`${idPrefix}-cost`}>
        {form.doneBy === "home" ? "Parts cost (optional)" : "Cost (optional)"}
      </label>
      <div className="flex items-center gap-2">
        <span aria-hidden="true">$</span>
        <input id={`${idPrefix}-cost`} className={inputClass} inputMode="decimal" autoComplete="off" value={form.cost} onChange={(e) => onChange({ cost: e.target.value })} />
      </div>

      <label className={labelClass} htmlFor={`${idPrefix}-note`}>
        Note (optional)
      </label>
      <input id={`${idPrefix}-note`} className={inputClass} maxLength={MAX_MAINTENANCE_NOTE_LENGTH} autoComplete="off" value={form.note} onChange={(e) => onChange({ note: e.target.value })} />
    </>
  );
}

/** One saved service in the list, with edit and delete. */
function ServiceRow({ record, places, documents, today, onChanged }: { record: MaintenanceRecord; places: ServicePlace[]; documents: MaintenanceDocument[]; today: string; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [form, setForm] = useState<ServiceForm>(() => formFromRecord(record, MAINTENANCE_TYPES));
  const [error, setError] = useState(false);
  const checked = toRequest(form, MAINTENANCE_TYPES, today);
  const label = `${record.services.join(", ")} on ${shortDate(record.date)}`;

  const close = () => {
    setMode("view");
    setError(false);
  };

  async function run(action: () => Promise<unknown>) {
    setError(false);
    try {
      await action();
      close();
      await onChanged();
    } catch {
      setError(true);
    }
  }

  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="font-bold break-words">{record.services.join(", ")}</p>
          <p className="text-sm text-muted">
            {shortDate(record.date)} &middot; {record.doneBy === "home" ? "At home" : (record.place?.name ?? "A shop")}
            {record.odometerMiles !== null && <> &middot; {formatMiles(record.odometerMiles)} mi</>}
          </p>
          {record.note && <p className="mt-1 text-sm text-muted break-words">{record.note}</p>}
        </div>
        {record.costCents !== null && <b className="tabular-nums">{formatCents(record.costCents)}</b>}
      </div>
      {mode === "view" && (
        <span className="flex justify-end gap-3">
          <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Edit service: ${label}`} onClick={() => { setForm(formFromRecord(record, MAINTENANCE_TYPES)); setMode("edit"); }}>
            Edit
          </button>
          <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Delete service: ${label}`} onClick={() => setMode("delete")}>
            Delete
          </button>
        </span>
      )}

      <Presence>
        {mode === "edit" ? (
          <form
            className="mt-3 space-y-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (checked.request) void track(() => run(() => api.editMaintenance(record.id, checked.request!)));
            }}
          >
            <ServiceFields idPrefix={`edit-${record.id}`} form={form} places={places} today={today} onChange={(next) => setForm((f) => ({ ...f, ...next }))} />
            {checked.problem && <p className="text-sm">{checked.problem}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={checked.request === undefined} busy={busy}>
                Save change
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
          <div role="alert" className="mt-3 rounded-xl border border-line bg-sunk p-4 text-ink">
            <p>Delete this service? It is removed for good.</p>
            <div className="mt-3 flex gap-2">
              <Button type="button" onClick={() => void track(() => run(() => api.deleteMaintenance(record.id)))} busy={busy}>
                Yes, delete
              </Button>
              <Button variant="ghost" type="button" onClick={close} disabled={busy}>
                Keep it
              </Button>
            </div>
          </div>
        ) : null}
      </Presence>
      <Presence>{error ? <p role="alert" className="mt-2 text-sm">That did not work. Try again.</p> : null}</Presence>
      <ServiceDocuments recordId={record.id} label={label} documents={documents} onChanged={onChanged} />
    </li>
  );
}

/** Car > Maintenance (MIL-05). The date can be set but starts as today; the odometer starts as the latest reading. */
export function MaintenancePage({ today = todayLocal() }: { today?: string } = {}) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [form, setForm] = useState<ServiceForm>(() => blankForm(today));
  const [odometerEdited, setOdometerEdited] = useState(false);
  const [records, setRecords] = useState<MaintenanceRecord[] | null>(null);
  const [places, setPlaces] = useState<ServicePlace[]>([]);
  const [documents, setDocuments] = useState<MaintenanceDocument[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<HistoryFilterState>(NO_FILTER);
  const [latestOdometer, setLatestOdometer] = useState<number | undefined>(undefined);
  const latestMiles = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const [list, placeList] = await Promise.all([api.listMaintenance(), api.listServicePlaces()]);
      setRecords(list.records);
      setPlaces(placeList.places);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
    // Documents are an extra: if they cannot be loaded the services still show, just without their documents.
    try {
      setDocuments((await api.listDocuments()).documents);
    } catch {
      setDocuments([]);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    // The odometer field starts as the latest reading, unless the owner already typed something.
    api
      .listReadings()
      .then((r) => {
        const latest = r.readings[0]?.miles;
        latestMiles.current = latest;
        setLatestOdometer(latest);
        if (latest !== undefined) setForm((f) => (odometerEdited || f.odometer !== "" ? f : { ...f, odometer: String(latest) }));
      })
      .catch(() => undefined);
  }, [refresh]);

  const checked = toRequest(form, MAINTENANCE_TYPES, today);
  const shown = records === null ? [] : applyFilter(records, places, filter);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!checked.request) return;
    setError(false);
    setMessage(null);
    try {
      const saved = await api.logMaintenance(checked.request);
      setForm({ ...blankForm(today, latestMiles.current === undefined ? "" : String(latestMiles.current)) });
      setOdometerEdited(false);
      setMessage(`Saved ${saved.services.join(", ")}.`);
    } catch {
      return setError(true);
    }
    await refresh();
  }

  return (
    <Page title="Maintenance">
      <div className="mb-5">
        <RecentDocuments documents={documents} records={records} />
      </div>
      <div className="grid gap-5 text-ink lg:grid-cols-2">
        <form onSubmit={(e) => void track(() => submit(e))} className="space-y-3" noValidate>
          <ServiceFields
            idPrefix="new"
            form={form}
            places={places}
            today={today}
            onChange={(next) => {
              if (next.odometer !== undefined) setOdometerEdited(true);
              setForm((f) => ({ ...f, ...next }));
              setMessage(null);
            }}
          />
          {checked.problem && form.ticked.length + form.custom.length > 0 && <p className="text-sm">{checked.problem}</p>}
          <Button type="submit" disabled={checked.request === undefined} busy={busy}>
            Save service
          </Button>
          <p className="text-sm text-muted">After saving, add a photo or PDF of the receipt from the service in the list.</p>
          <Presence>{message ? <p role="status" className="text-gtext">{message}</p> : null}</Presence>
          <Presence>{error ? <p role="alert">That did not work. Try again.</p> : null}</Presence>
        </form>

        <div className="space-y-5">
          <LastDoneSection records={records} loadFailed={loadFailed} onRetry={() => void refresh()} latestOdometer={latestOdometer} />

          <section aria-labelledby="service-history" className="rounded-2xl border border-line bg-card p-4 text-ink">
            <h2 id="service-history" className="font-bold">
              Services
            </h2>
            {records === null ? (
              loadFailed ? (
                <div role="alert" className="mt-2 space-y-2">
                  <p>We could not load your services.</p>
                  <Button type="button" variant="ghost" onClick={() => void refresh()}>
                    Try again
                  </Button>
                </div>
              ) : (
                <Skeleton lines={3} />
              )
            ) : records.length === 0 ? (
              <p className="mt-2 text-muted">No services yet. Choose what was done above, then save.</p>
            ) : (
              <>
                <HistoryFilters records={records} places={places} filter={filter} onChange={setFilter} shown={shown} />
                {shown.length === 0 ? (
                  <p className="mt-2 text-muted">No services match. Choose All services or All places to see the rest.</p>
                ) : (
                  <ul className="mt-2">
                    {shown.map((record) => (
                      <ServiceRow key={record.id} record={record} places={places} documents={documents.filter((d) => d.recordId === record.id)} today={today} onChanged={refresh} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <PlacesSection places={places} records={records ?? []} onChanged={refresh} />
        </div>
      </div>
    </Page>
  );
}
