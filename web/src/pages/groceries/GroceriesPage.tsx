import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
import { useApi } from "../../api/ApiContext";
import { Button } from "../../ui/Button.js";
import { Skeleton } from "../../ui/Skeleton.js";
import { useBusy } from "../../ui/useBusy.js";
import { Page } from "../Page";
import { newItemId } from "./itemId";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";
const textButton = "inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline";

/** One item: tap the name to mark it found (or put it back), "Edit" to change it, move it to another section or remove it. */
function ItemRow({ item, onToggle, onChanged, onRemoved }: { item: GroceryItem; onToggle: (item: GroceryItem) => void; onChanged: (item: GroceryItem) => void; onRemoved: (id: string) => void }) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [note, setNote] = useState(item.note);
  const [section, setSection] = useState<GrocerySection>(item.section);
  const [error, setError] = useState(false);

  const open = () => {
    setName(item.name);
    setQuantity(item.quantity);
    setNote(item.note);
    setSection(item.section);
    setError(false);
    setEditing(true);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setError(false);
    try {
      onChanged(await api.editGrocery(item.id, { name, quantity, note, section, found: item.found }));
      setEditing(false);
    } catch {
      setError(true);
    }
  }

  async function remove() {
    setError(false);
    try {
      await api.deleteGrocery(item.id);
      onRemoved(item.id);
    } catch {
      setError(true);
    }
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
        <form aria-label={`Change ${item.name}`} className="mt-2 mb-3 space-y-3 rounded-xl border border-line bg-sunk p-3" noValidate onSubmit={(event) => void track(() => save(event))}>
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
            <Button type="submit" disabled={!name.trim()} busy={busy}>
              Save change
            </Button>
            <Button variant="ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="ghost" type="button" disabled={busy} onClick={() => void track(remove)}>
              Remove item
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="pb-2 text-sm">
          That did not work. Try again.
        </p>
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
 * The grocery list (GRO-01): one list, grouped by store section, tick items as they are found, "Finish trip" deletes the lot.
 * A change shows at once and is sent in the background; if the send fails the screen says so and shows the saved list again.
 */
export function GroceriesPage({ titleLevel = 1 }: { titleLevel?: 1 | 2 } = {}) {
  const api = useApi();
  const [busy, track] = useBusy();
  const field = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState<"finish" | "clear" | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems((await api.listGroceries()).items);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setError(false);
    setMessage(null);
    try {
      const result = await api.addGrocery({ id: newItemId(), name, ...(quantity.trim() ? { quantity } : {}), ...(note.trim() ? { note } : {}) });
      if (result.status === "list_full") return setMessage(`The list is full (${MAX_GROCERY_ITEMS} items). Finish the trip or remove some items.`);
      setItems((current) => (current ?? []).concat(result.item));
      setName("");
      setQuantity("");
      setNote("");
      setMessage(`Added ${result.item.name}.`);
      field.current?.focus(); // the keyboard stays open for the next item
    } catch {
      setError(true);
    }
  }

  function toggle(item: GroceryItem) {
    const next = { ...item, found: !item.found };
    setItems((current) => (current ?? []).map((i) => (i.id === item.id ? next : i)));
    setError(false);
    api.editGrocery(item.id, { name: item.name, quantity: item.quantity, note: item.note, section: item.section, found: next.found }).catch(() => {
      setError(true);
      void refresh();
    });
  }

  async function clear() {
    setError(false);
    try {
      await api.clearGroceries();
      setItems([]);
      setConfirming(null);
      setMessage("The list is empty.");
    } catch {
      setError(true);
    }
  }

  const handlers = {
    onToggle: toggle,
    onChanged: (changed: GroceryItem) => setItems((current) => (current ?? []).map((i) => (i.id === changed.id ? changed : i))),
    onRemoved: (id: string) => setItems((current) => (current ?? []).filter((i) => i.id !== id)),
  };
  const counts = groceryCounts(items ?? []);
  const found = foundItems(items ?? []);

  return (
    <Page title="Groceries" level={titleLevel}>
      <form className="space-y-3 text-ink" noValidate onSubmit={(event) => void track(() => add(event))}>
        <label className="block font-bold" htmlFor="grocery-name">
          Add an item
        </label>
        <div className="flex gap-2">
          <input ref={field} id="grocery-name" className={inputClass} value={name} maxLength={MAX_NAME_LENGTH} autoComplete="off" enterKeyHint="done" onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()} busy={busy}>
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
      {error && (
        <p role="alert" className="text-ink">
          That did not work. Try again.
        </p>
      )}
      {loadFailed && (
        <p role="alert" className="text-ink">
          Could not load the list. Try again later.
        </p>
      )}

      {items === null && !loadFailed && <Skeleton lines={4} className="mt-3" />}

      {items !== null && items.length === 0 && <p className="mt-4">Your list is empty. Add what you need above.</p>}

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
