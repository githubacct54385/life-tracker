import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { MAINTENANCE_TYPES, type ServicePlace } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Button } from "../../ui/Button";
import { Presence } from "../../ui/Presence";
import { useBusy } from "../../ui/useBusy";
import { toRequest, type ServiceForm } from "./maintenanceFormat";
import { ServiceFields } from "./ServiceFields";
import { FailureText } from "../../ui/FailureText";

export const blankForm = (today: string, odometer = ""): ServiceForm => ({ ticked: [], custom: [], doneBy: "shop", placeChoice: "", newPlace: "", cost: "", date: today, odometer, note: "" });

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The form for a new service (MIL-05), shown over the page as a sheet on a phone and a side panel on a computer (MIL-06).
 * Escape or Cancel closes it and saves nothing; saving closes it through `onSaved`. Focus goes in on open and back to the button on close.
 */
export function LogServicePanel({ places, today, latestOdometer, onSaved, onClose }: { places: ServicePlace[]; today: string; latestOdometer: number | undefined; onSaved: (message: string) => Promise<void>; onClose: () => void }) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [form, setForm] = useState<ServiceForm>(() => blankForm(today, latestOdometer === undefined ? "" : String(latestOdometer)));
  const [odometerEdited, setOdometerEdited] = useState(false);
  const [error, setError] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const checked = toRequest(form, MAINTENANCE_TYPES, today);

  // The odometer starts as the latest reading, which can arrive after the panel opens. Anything the owner typed is kept.
  useEffect(() => {
    if (latestOdometer !== undefined && !odometerEdited) setForm((f) => (f.odometer === "" ? { ...f, odometer: String(latestOdometer) } : f));
  }, [latestOdometer, odometerEdited]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = scroll;
      opener?.focus?.();
    };
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!checked.request) return;
    setError(false);
    try {
      const saved = await api.logMaintenance(checked.request);
      await onSaved(`Saved ${saved.services.join(", ")}.`);
    } catch {
      setError(true);
    }
  }

  // In a portal because the page's entry animation leaves a transform on it, and a transform makes `fixed` mean "inside the page column".
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-stretch md:justify-end">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="log-service-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-4 text-ink md:max-h-none md:w-[30rem] md:rounded-none">
        <div className="flex items-center justify-between gap-3">
          <h2 id="log-service-title" ref={heading} tabIndex={-1} className="text-xl font-bold">
            Log a service
          </h2>
          <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" onClick={onClose}>
            Close
          </button>
        </div>
        <form onSubmit={(e) => void track(() => submit(e))} className="mt-3 space-y-3" noValidate>
          <ServiceFields
            idPrefix="new"
            form={form}
            places={places}
            today={today}
            onChange={(next) => {
              if (next.odometer !== undefined) setOdometerEdited(true);
              setForm((f) => ({ ...f, ...next }));
            }}
          />
          {checked.problem && form.ticked.length + form.custom.length > 0 && <p className="text-sm">{checked.problem}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={checked.request === undefined} busy={busy}>
              Save service
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          </div>
          <p className="text-sm text-muted">After saving, add a photo or PDF of the receipt from the service in the list.</p>
          <Presence>{error ? <p role="alert"><FailureText fallback="That did not work. Try again." /></p> : null}</Presence>
        </form>
      </div>
    </div>,
    document.body,
  );
}
