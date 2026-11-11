import { useSyncExternalStore } from "react";

// True while the client is waiting to retry after the database was asleep (AC-FND-05.4). Holds no data, only a flag.
let waking = false;
const listeners = new Set<() => void>();

export function setWaking(value: boolean): void {
  if (waking === value) return;
  waking = value;
  listeners.forEach((l) => l());
}

export function useWaking(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => waking,
    () => false,
  );
}
