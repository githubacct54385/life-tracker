import { useSyncExternalStore } from "react";
import { DEPENDENCY_PARTS, unavailableParts, type DependencyPart } from "@life-tracker/shared";
import type { Api } from "./types";

// Which parts the server said are not available right now (OPS-14). Holds only the names of parts, never a message. Like wakeStatus.ts,
// it is a tiny store the API client writes to and the banner and the page messages read from.
let down: readonly DependencyPart[] = [];
const listeners = new Set<() => void>();

const same = (a: readonly DependencyPart[], b: readonly DependencyPart[]) => a.length === b.length && a.every((part, i) => part === b[i]);

/** Replaces the list. Kept in a fixed order so the same set is always the same list. */
export function setUnavailable(parts: readonly DependencyPart[]): void {
  const next = DEPENDENCY_PARTS.filter((part) => parts.includes(part));
  if (same(down, next)) return;
  down = next;
  listeners.forEach((l) => l());
}

/** A request came back 503 naming this part. */
export function reportUnavailable(part: DependencyPart): void {
  setUnavailable([...down, part]);
}

export function getUnavailable(): readonly DependencyPart[] {
  return down;
}

export function useUnavailableParts(): readonly DependencyPart[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => down,
    () => [],
  );
}

/**
 * Asks the server how its parts are, and updates the list. For a failure the client cannot see, such as a photo that did not load
 * (an <img> does not go through the client). A failed check changes nothing.
 */
export async function refreshAvailability(api: Pick<Api, "getAvailability">): Promise<void> {
  try {
    setUnavailable(unavailableParts(await api.getAvailability()));
  } catch {
    // A 503 has already reported itself, and no network at all is the offline notice's job.
  }
}
