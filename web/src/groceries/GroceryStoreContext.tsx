import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useApi } from "../api/ApiContext";
import { createOfflineGroceries, type OfflineGroceries } from "./offlineGroceries";
import { deviceStore, type GroceryStore } from "./offlineStore";

// Where the grocery list keeps its copy (ADR-0027). The real app uses the device's IndexedDB. The demo and tests give their own store.
const StoreContext = createContext<GroceryStore | undefined>(undefined);

export function GroceryStoreProvider({ store, children }: { store: GroceryStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The store the app uses for the grocery copy, for code that must delete it (sign out). */
export function useGroceryStore(): GroceryStore {
  return useContext(StoreContext) ?? deviceStore();
}

/** The offline-aware grocery list for this screen. It sends waiting changes when the signal returns and when the app comes to the front. */
export function useOfflineGroceries(): OfflineGroceries {
  const api = useApi();
  const store = useGroceryStore();
  const list = useMemo(() => createOfflineGroceries(api, store), [api, store]);
  useEffect(() => {
    const send = () => void list.sync();
    const whenVisible = () => document.visibilityState === "visible" && send();
    window.addEventListener("online", send);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      window.removeEventListener("online", send);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [list]);
  return list;
}
