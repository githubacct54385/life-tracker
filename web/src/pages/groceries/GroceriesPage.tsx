import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  foundItems,
  GROCERY_SECTIONS,
  groceryCounts,
  groupBySection,
  MAX_GROCERY_ITEMS,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY_LENGTH,
  type GroceryItem,
  type GrocerySection,
} from "@life-tracker/shared";
import { useOfflineGroceries } from "../../groceries/GroceryStoreContext";
import type { GroceryView, OfflineGroceries } from "../../groceries/offlineGroceries";
import { useOnline } from "../../pwa/useOnline";
import { Button } from "../../ui/Button.js";
import { Skeleton } from "../../ui/Skeleton.js";
import { useBusy } from "../../ui/useBusy.js";
import { Page } from "../Page";
import { newItemId } from "./itemId";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";
const textButton = "inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline";

/** One item: tap the name to mark it found (or put it back), "Edit" to change it, move it to another section or remove it. */
function ItemRow({ item, list, onToggle }: { item: GroceryItem; list: OfflineGroceries; onToggle: (item: GroceryItem) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [note, setNote] = useState(item.note);
  const [section, setSection] = useState<GrocerySection>(item.section);

  const open = () => {
    setName(item.name);
    setQuantity(item.quantity);
    setNote(item.note);
    setSection(item.section);
    setEditing(true);
  };

  // The change shows at once and is sent in the background (or kept for later when there is no signal).
  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    void list.edit(item.id, { name: name.trim(), quantity: quantity.trim(), note: note.trim(), section, found: item.found });
    setEditing(false);
  }

  const id = `edit-${item.id}`;
  return (
    <li className="border-b border-line py-1 last:border-b-0">
      <div className="flex items-center gap-1">
        <button type="button" aria-pressed={item.found} onClick={() => onToggle(item)} className="flex min-h-11 flex-1 items-center gap-3 rounded-md px-1 py-2 text-left">
          <span aria-hidden className={`flex size-6 flex-none items-center justify-center rounded-md border-2 ${item.found ? "border-g700 bg-g700 text-white" : "border-muted"}`}>
            {item.found ? "✓" : ""}
          </span>
          <span className={`min-w-0 flex-1 break-words ${item.found ? "text-muted line-through" : "text-ink"}`}>
            <span className="font-bold">{item.name}</span>
            {item.quantity && <span> · {item.quantity}</span>}
            {item.note && <span className="block text-sm font-normal text-muted">{item.note}</span>}
          </span>
        </button>
        {!editing && (
          <button type="button" className={textButton} aria-label={`Edit ${item.name}`} onClick={open}>
            Edit
          </button>
        )}
      </div>

      {editing && (
        <form aria-label={`Change ${item.name}`} className="mt-2 mb-3 space-y-3 rounded-xl border border-line bg-sunk p-3" noValidate onSubmit={save}>
          <div>
            <label className="block font-bold text-ink" htmlFor={`${id}-name`}>
              Name
            </label>
            <input id={`${id}-name`} className={inputClass} value={name} maxLength={MAX_NAME_LENGTH} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block font-bold text-ink" htmlFor={`${id}-quantity`}>
              Quantity
            </label>
            <input id={`${id}-quantity`} className={inputClass} value={quantity} maxLength={MAX_QUANTITY_LENGTH} autoComplete="off" onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="block font-bold text-ink" htmlFor={`${id}-note`}>
              Note
            </label>
            <input id={`${id}-note`} className={inputClass} value={note} maxLength={MAX_NOTE_LENGTH} autoComplete="off" onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <label className="block font-bold text-ink" htmlFor={`${id}-section`}>
              Section
            </label>
            <select id={`${id}-section`} className={inputClass} value={section} onChange={(e) => setSection(e.target.value as GrocerySection)}>
              {GROCERY_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!name.trim()}>
              Save change
            </Button>
            <Button variant="ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="ghost" type="button" onClick={() => void list.remove(item.id)}>
              Remove item
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

function Group({ title, items, ...handlers }: { title: string; items: GroceryItem[] } & Omit<Parameters<typeof ItemRow>[0], "item">) {
  const heading = `group-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={heading} className="mt-5">
      <h2 id={heading} className="text-sm font-bold text-muted">
        {title}
      </h2>
      <ul className="m-0 list-none p-0">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} {...handlers} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The grocery list (GRO-01, GRO-02): one list, grouped by store section, tick items as they are found, "Finish trip" deletes the lot.
 * Every change shows at once. It is sent in the background, or kept on this device until there is signal (ADR-0027).
 */
export function GroceriesPage({ titleLevel = 1 }: { titleLevel?: 1 | 2 } = {}) {
  const list = useOfflineGroceries();
  const online = useOnline();
  const [busy, track] = useBusy();
  const field = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<GroceryView | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"finish" | "clear" | null>(null);

  useEffect(() => {
    let current = true;
    const unsubscribe = list.subscribe((next) => current && setView(next));
    void list.open().then((next) => current && setView(next));
    return () => {
      current = false;
      unsubscribe();
    };
  }, [list]);

  const items = view?.items ?? null;
  const offline = !online || view?.offline === true;

  // The fields are emptied at once, before anything is saved, so what is typed next is never wiped by a save finishing late. Saving is a
  // few milliseconds on the device, and the list shows the change when it is done. There is no "busy" lock: each item has its own id.
  function add(event: FormEvent) {
    event.preventDefault();
    const added = name.trim();
    if (!added) return;
    if ((items?.length ?? 0) >= MAX_GROCERY_ITEMS) return setMessage(`The list is full (${MAX_GROCERY_ITEMS} items). Finish the trip or remove some items.`);
    const request = { id: newItemId(), name: added, ...(quantity.trim() ? { quantity: quantity.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    setName("");
    setQuantity("");
    setNote("");
    setMessage(`Added ${added}.`);
    field.current?.focus(); // the keyboard stays open for the next item
    void list.add(request); // the screen updates through the list's own notification
  }

  async function clear() {
    setView(await list.clear());
    setConfirming(null);
    setMessage("The list is empty.");
  }

  const handlers = { list, onToggle: (item: GroceryItem) => void list.edit(item.id, { name: item.name, quantity: item.quantity, note: item.note, section: item.section, found: !item.found }) };
  const counts = groceryCounts(items ?? []);
  const found = foundItems(items ?? []);

  return (
    <Page title="Groceries" level={titleLevel}>
      <form className="space-y-3 text-ink" noValidate onSubmit={add}>
        <label className="block font-bold" htmlFor="grocery-name">
          Add an item
        </label>
        <div className="flex gap-2">
          <input ref={field} id="grocery-name" className={inputClass} value={name} maxLength={MAX_NAME_LENGTH} autoComplete="off" enterKeyHint="done" onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>
            Add
          </Button>
        </div>
        <button type="button" className={textButton} aria-expanded={showMore} aria-controls="grocery-more" onClick={() => setShowMore((open) => !open)}>
          {showMore ? "Hide quantity and note" : "Add a quantity or a note"}
        </button>
        {showMore && (
          <div id="grocery-more" className="space-y-3">
            <div>
              <label className="block font-bold" htmlFor="grocery-quantity">
                Quantity
              </label>
              <input id="grocery-quantity" className={inputClass} value={quantity} maxLength={MAX_QUANTITY_LENGTH} autoComplete="off" onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <label className="block font-bold" htmlFor="grocery-note">
                Note
              </label>
              <input id="grocery-note" className={inputClass} value={note} maxLength={MAX_NOTE_LENGTH} autoComplete="off" onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
      </form>

      <div role="status" className="mt-2 min-h-6 text-ink">
        {message}
      </div>
      {offline && (
        <p role="status" className="mt-1 rounded-xl border border-line bg-sunk p-3 text-ink">
          <b>Offline.</b> This is the list as this phone last saw it. Your changes are saved here and are sent when you are back online.
          {view && view.pending > 0 ? ` ${view.pending} ${view.pending === 1 ? "change is" : "changes are"} waiting.` : ""}
        </p>
      )}
      {view?.refusals.map((refusal) => (
        <div key={refusal.id} role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-sunk p-3 text-ink">
          <p>
            <b>{refusal.what}</b> was not saved. {refusal.reason}
          </p>
          <Button variant="ghost" type="button" aria-label={`Dismiss: ${refusal.what}`} onClick={() => list.dismiss(refusal.id)}>
            Dismiss
          </Button>
        </div>
      ))}
      {view?.failed && (
        <p role="alert" className="text-ink">
          Could not load the list from the server. Showing what this phone has. Try again later.
        </p>
      )}

      {items === null && <Skeleton lines={4} className="mt-3" />}

      {items !== null && items.length === 0 && <p className="mt-4">{offline ? "This phone has no saved list yet. Add items, or open the list once with signal." : "Your list is empty. Add what you need above."}</p>}

      {items !== null && items.length > 0 && (
        <div className="text-ink">
          <p className="mt-2 font-bold">
            Found {counts.found} of {counts.total}
          </p>
          {groupBySection(items).map((group) => (
            <Group key={group.section} title={group.section} items={group.items} {...handlers} />
          ))}
          {found.length > 0 && <Group title="Found" items={found} {...handlers} />}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="button" onClick={() => setConfirming("finish")}>
              Finish trip
            </Button>
            <Button variant="ghost" type="button" onClick={() => setConfirming("clear")}>
              Clear list
            </Button>
          </div>
          {confirming && (
            <div role="alert" className="mt-3 rounded-xl border border-line bg-sunk p-4 text-ink">
              <p>
                {confirming === "finish" ? "Finish the trip? " : "Clear the list? "}
                All {counts.total} {counts.total === 1 ? "item is" : "items are"} deleted for good. No history is kept.
              </p>
              <div className="mt-3 flex gap-2">
                <Button type="button" busy={busy} onClick={() => void track(clear)}>
                  {confirming === "finish" ? "Yes, finish the trip" : "Yes, clear the list"}
                </Button>
                <Button variant="ghost" type="button" disabled={busy} onClick={() => setConfirming(null)}>
                  Keep the list
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
