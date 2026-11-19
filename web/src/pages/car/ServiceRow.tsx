import { useState } from "react";
import { MAINTENANCE_TYPES, type MaintenanceDocument, type MaintenanceRecord, type ServicePlace } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Button } from "../../ui/Button";
import { Presence } from "../../ui/Presence";
import { useBusy } from "../../ui/useBusy";
import { formatCents } from "../giving/giftFormat";
import { formFromRecord, toRequest, type ServiceForm } from "./maintenanceFormat";
import { formatMiles, shortDate } from "./readingFormat";
import { ServiceDocuments } from "./ServiceDocuments";
import { ServiceFields } from "./ServiceFields";

/** One saved service in the list, with edit and delete. */
export function ServiceRow({ record, places, documents, today, onChanged }: { record: MaintenanceRecord; places: ServicePlace[]; documents: MaintenanceDocument[]; today: string; onChanged: () => Promise<void> }) {
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
    <li className="rounded-2xl border border-line bg-card p-3 text-ink">
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3">
        <div aria-hidden="true" className="self-start rounded-xl bg-g100 py-1.5 text-center leading-tight text-g900">
          <span className="block text-xs font-bold tracking-wider">{shortDate(record.date).split(" ")[0]!.toUpperCase()}</span>
          <span className="block text-xl font-extrabold">{shortDate(record.date).split(" ")[1]}</span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <ul aria-label="What was done" className="flex min-w-0 flex-wrap gap-1.5">
              {record.services.map((name) => (
                <li key={name} className="rounded-full bg-g100 px-2.5 py-0.5 text-sm font-bold break-words text-g900">
                  {name}
                </li>
              ))}
            </ul>
            {record.costCents !== null && <b className="tabular-nums">{formatCents(record.costCents)}</b>}
          </div>
          <p className="mt-1 text-sm text-muted">
            {shortDate(record.date)} &middot; {record.doneBy === "home" ? "At home" : (record.place?.name ?? "A shop")}
            {record.odometerMiles !== null && <> &middot; {formatMiles(record.odometerMiles)} mi</>}
          </p>
          {record.note && <p className="mt-1 text-sm text-muted break-words">{record.note}</p>}
        </div>
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

