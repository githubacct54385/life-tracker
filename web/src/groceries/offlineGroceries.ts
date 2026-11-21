// The grocery list with a copy on the device (ADR-0027). The screen talks to this, not to the API directly. Every change shows at once,
// is kept in a queue, and is sent when there is signal. The server is always the source of truth: once the queue is empty the saved copy
// is replaced by the server's list.
import { guessSection, MAX_GROCERY_ITEMS, type AddGroceryRequest, type EditGroceryRequest, type GroceryItem } from "@life-tracker/shared";
import { ApiError } from "../api/client";
import type { Api } from "../api/types";
import { type GroceryStore, type QueuedChange, type SavedGroceries } from "./offlineStore";

/** A waiting change the server turned down. The screen tells the person, then they dismiss it. */
export interface Refusal {
  id: string;
  /** Which change was refused, in the person's words ("Add milk"). */
  what: string;
  reason: string;
}

export interface GroceryView {
  items: GroceryItem[];
  /** True when the last attempt to reach the server failed for lack of signal: the list is the saved copy. */
  offline: boolean;
  /** How many changes are waiting to be sent. */
  pending: number;
  /** True when the server answered the list request with an error (not a missing signal). */
  failed: boolean;
  refusals: Refusal[];
}

export interface OfflineGroceries {
  /** Shows the saved copy, sends what is waiting, then shows the server's list. Never throws for lack of signal. */
  open(): Promise<GroceryView>;
  add(request: AddGroceryRequest): Promise<GroceryView>;
  edit(id: string, edit: EditGroceryRequest): Promise<GroceryView>;
  remove(id: string): Promise<GroceryView>;
  /** Finish trip and clear list. Also deletes the saved copy and the waiting changes from the device (AC-GRO-02.5). */
  clear(): Promise<GroceryView>;
  /** Sends what is waiting. Safe to call at any time, including while a send is running. */
  sync(): Promise<GroceryView>;
  dismiss(refusalId: string): GroceryView;
  /** Subscribe to changes made by a background send. Returns the unsubscribe function. */
  subscribe(listener: (view: GroceryView) => void): () => void;
}

/** Only the answers of a server mean a change was heard. Anything else (a failed fetch) is "no signal". */
const heardFrom = (error: unknown): error is ApiError => error instanceof ApiError;
/** A refusal of the change itself, as opposed to a problem that may pass (sign-in, a busy server). */
const refused = (error: ApiError) => error.status === 400 || error.status === 404 || error.status === 409;

function describe(change: QueuedChange, items: GroceryItem[]): string {
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name;
  switch (change.kind) {
    case "add":
      return `Add ${change.item.name}`;
    case "edit":
      return `Change ${change.edit.name}`;
    case "remove":
      return `Remove ${nameOf(change.id) ?? "an item"}`;
    case "clear":
      return "Clear the list";
  }
}

/** Folds a new change into the waiting ones: the latest change to an item replaces the earlier ones, and an item added and removed while offline is never sent. */
export function enqueue(queue: QueuedChange[], change: QueuedChange): QueuedChange[] {
  if (change.kind === "clear") return [change];
  if (change.kind === "add") return [...queue, change];
  const targets = (c: QueuedChange) => (c.kind === "add" ? c.item.id : c.kind === "edit" || c.kind === "remove" ? c.id : undefined);
  const wasAddedHere = queue.some((c) => c.kind === "add" && c.item.id === change.id);
  const rest = queue.filter((c) => c.kind === "add" || targets(c) !== change.id);
  if (change.kind === "remove" && wasAddedHere) return rest.filter((c) => !(c.kind === "add" && c.item.id === change.id));
  return [...rest, change];
}

/** The list as it should look after a change. */
export function applyChange(items: GroceryItem[], change: QueuedChange): GroceryItem[] {
  switch (change.kind) {
    case "add":
      if (items.some((i) => i.id === change.item.id)) return items;
      return [...items, { id: change.item.id, name: change.item.name, quantity: change.item.quantity ?? "", note: change.item.note ?? "", section: change.item.section ?? guessSection(change.item.name), found: false }];
    case "edit":
      return items.map((i) => (i.id === change.id ? { id: i.id, ...change.edit } : i));
    case "remove":
      return items.filter((i) => i.id !== change.id);
    case "clear":
      return [];
  }
}

export function createOfflineGroceries(api: Api, store: GroceryStore, options: { online?: () => boolean } = {}): OfflineGroceries {
  const online = options.online ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
  let state: SavedGroceries = { items: [], queue: [] };
  let loaded = false;
  let offline = false;
  let failed = false;
  let refusals: Refusal[] = [];
  let nextRefusal = 1;
  let syncing: Promise<void> | undefined;
  const listeners = new Set<(view: GroceryView) => void>();

  const view = (): GroceryView => ({ items: state.items, offline, failed, pending: state.queue.length, refusals });
  const emit = () => listeners.forEach((listener) => listener(view()));

  async function persist() {
    try {
      // An empty list with nothing waiting is not saved at all: after a finished trip the device holds nothing.
      if (state.items.length === 0 && state.queue.length === 0) await store.clear();
      else await store.write(state);
    } catch {
      // The device could not save. The list still works for now; it just will not survive closing the app.
    }
  }

  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
      state = (await store.read()) ?? { items: [], queue: [] };
    } catch {
      state = { items: [], queue: [] };
    }
  }

  /** Sends the waiting changes in order. Stops at the first one that cannot be sent for lack of signal or a passing problem. */
  async function sendQueue(): Promise<boolean> {
    while (state.queue.length > 0) {
      const change = state.queue[0]!;
      try {
        if (change.kind === "add") {
          const result = await api.addGrocery(change.item);
          if (result.status === "list_full") throw new ApiError(409);
        } else if (change.kind === "edit") await api.editGrocery(change.id, change.edit);
        else if (change.kind === "remove") await api.deleteGrocery(change.id);
        else await api.clearGroceries();
      } catch (error) {
        if (!heardFrom(error)) {
          offline = true;
          return false;
        }
        offline = false;
        if (!refused(error)) return false; // sign-in or server trouble: keep it waiting
        const reason =
          error.status === 404 ? "It was not on the list any more, probably removed on another device." : error.status === 409 ? `The list is full (${MAX_GROCERY_ITEMS} items).` : "The server did not accept it.";
        refusals = [...refusals, { id: `r${nextRefusal++}`, what: describe(change, state.items), reason }];
      }
      state = { ...state, queue: state.queue.filter((waiting) => waiting !== change) }; // by identity: a change made during the send may have folded into the queue
      await persist();
    }
    return true;
  }

  async function runSync(): Promise<void> {
    await ensureLoaded();
    if (!online()) {
      offline = true;
      return;
    }
    if (!(await sendQueue())) return;
    try {
      const { items } = await api.listGroceries();
      offline = false;
      failed = false;
      // A change made while the list was being fetched is still waiting; show it on top of the server's list.
      state = { items: state.queue.reduce(applyChange, items), queue: state.queue };
      await persist();
    } catch (error) {
      offline = !heardFrom(error);
      failed = heardFrom(error);
    }
  }

  // A request to send that arrives while a send is running is not lost: the running one makes another pass when it is done.
  let again = false;
  async function syncUntilQuiet(): Promise<void> {
    do {
      again = false;
      await runSync();
    } while (again);
  }

  function sync(): Promise<GroceryView> {
    if (syncing) again = true;
    syncing ??= syncUntilQuiet().finally(() => {
      syncing = undefined;
      emit();
    });
    return syncing.then(view);
  }

  async function change(next: QueuedChange): Promise<GroceryView> {
    await ensureLoaded();
    state = { items: applyChange(state.items, next), queue: enqueue(state.queue, next) };
    await persist();
    emit();
    void sync(); // sent in the background; the screen already shows the change
    return view();
  }

  return {
    async open() {
      await ensureLoaded();
      emit();
      return sync();
    },
    add: (request) => change({ kind: "add", item: request }),
    edit: (id, edit) => change({ kind: "edit", id, edit }),
    remove: (id) => change({ kind: "remove", id }),
    async clear() {
      await ensureLoaded();
      // The items are gone from the device at once. Only the waiting "clear" (no item names) stays, so that finishing a trip with no
      // signal still reaches the server; once it is sent the device holds nothing.
      state = { items: [], queue: [{ kind: "clear" }] };
      await persist();
      emit();
      void sync();
      return view();
    },
    sync,
    dismiss(refusalId) {
      refusals = refusals.filter((r) => r.id !== refusalId);
      emit();
      return view();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
