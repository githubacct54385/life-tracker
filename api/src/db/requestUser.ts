// Whose data a request may touch (ADR-0026). The app sets this once per request, after the person is confirmed, and every
// repository query reads it. It is deliberately not a parameter anyone can forget: with no person set, a query throws
// instead of running without a filter (hard rule 4, fail closed).
import { AsyncLocalStorage } from "node:async_hooks";

const requestPeople = new AsyncLocalStorage<number>();

/** Runs `run` for one person. Everything it calls (and awaits) sees that person's id. */
export function withRequestUser<T>(userId: number, run: () => Promise<T>): Promise<T> {
  return requestPeople.run(userId, run);
}

/** The person this request is for. Throws when there is none, so a query can never run unscoped. */
export function currentUserId(): number {
  const id = requestPeople.getStore();
  if (id === undefined) throw Object.assign(new Error("No person is set for this request"), { code: "NO_PERSON" });
  return id;
}
