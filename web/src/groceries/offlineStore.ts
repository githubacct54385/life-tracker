// The only thing the app keeps on the device about a person (ADR-0027): the grocery list as this phone last saw it, and the changes
// not yet sent. One small IndexedDB database, written only by this module. Nothing else is stored here, and a test checks that.
import type { AddGroceryRequest, EditGroceryRequest, GroceryItem } from "@life-tracker/shared";

/** A change waiting to be sent, in the order it was made. */
export type QueuedChange =
  | { kind: "add"; item: AddGroceryRequest }
  | { kind: "edit"; id: string; edit: EditGroceryRequest }
  | { kind: "remove"; id: string }
  | { kind: "clear" };

/** What the device holds: the list as it should look now (saved copy plus waiting changes) and the changes still to send. */
export interface SavedGroceries {
  items: GroceryItem[];
  queue: QueuedChange[];
}

export interface GroceryStore {
  /** Undefined when this device has nothing saved. */
  read(): Promise<SavedGroceries | undefined>;
  write(saved: SavedGroceries): Promise<void>;
  /** Deletes everything this module saved. */
  clear(): Promise<void>;
}

export const GROCERY_DATABASE = "life-tracker-groceries";
const STORE = "state";
const KEY = "groceries";

/** A store that lives only in memory: for the demo, and for a browser with no IndexedDB. Nothing is written to the device. */
export function memoryStore(): GroceryStore {
  let saved: SavedGroceries | undefined;
  return {
    read: async () => (saved ? structuredClone(saved) : undefined),
    write: async (next) => {
      saved = structuredClone(next);
    },
    clear: async () => {
      saved = undefined;
    },
  };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GROCERY_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function indexedDbStore(): GroceryStore {
  return {
    read: async () => (await run<SavedGroceries | undefined>("readonly", (store) => store.get(KEY))) ?? undefined,
    write: async (saved) => {
      await run("readwrite", (store) => store.put(saved, KEY));
    },
    clear: async () => {
      await run("readwrite", (store) => store.delete(KEY));
    },
  };
}

let device: GroceryStore | undefined;

/** The store this browser uses: IndexedDB when there is one, otherwise memory. */
export function deviceStore(): GroceryStore {
  return (device ??= typeof indexedDB === "undefined" ? memoryStore() : indexedDbStore());
}

/**
 * Deletes the saved list and the waiting changes from this device. Called at sign out, when the trip is finished or the list is
 * cleared, and by "Delete my data" (SET-09). It never throws: a device that cannot be cleared must not block signing out.
 */
export async function clearGroceryDevice(store: GroceryStore = deviceStore()): Promise<void> {
  try {
    await store.clear();
  } catch {
    // Nothing more can be done here, and nothing private should be logged.
  }
}
