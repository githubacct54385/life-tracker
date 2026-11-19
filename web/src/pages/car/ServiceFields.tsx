import { useState } from "react";
import { Button } from "../../ui/Button";
import { MAINTENANCE_TYPES, MAX_MAINTENANCE_NOTE_LENGTH, MAX_SERVICE_NAME_LENGTH, type ServicePlace } from "@life-tracker/shared";
import { addableService, allServices, NEW_PLACE, type ServiceForm } from "./maintenanceFormat";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";
const labelClass = "block font-bold text-ink";

export interface FieldsProps {
  idPrefix: string;
  form: ServiceForm;
  places: ServicePlace[];
  today: string;
  onChange: (next: Partial<ServiceForm>) => void;
}

/** What was done, who did it, where, when, the mileage, the cost and a note. The same fields are used to add and to edit. */
export function ServiceFields({ idPrefix, form, places, today, onChange }: FieldsProps) {
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

