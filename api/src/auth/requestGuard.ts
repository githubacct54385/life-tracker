// Cross-site request protection (ADR-0006). Contains no identity logic.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";

/** Allowed, or refused with 403. It carries no identity, unlike ownerGuard's result. */
export type RequestGuardResult = { ok: true } | { ok: false; status: 403 };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Any method that is not clearly read-only needs the custom header, uploads included. Unknown methods fail closed. */
export function requestGuard(method: string, headers: Record<string, string | undefined>): RequestGuardResult {
  if (SAFE_METHODS.has(method.toUpperCase())) return { ok: true };
  const found = Object.entries(headers).find(([name]) => name.toLowerCase() === REQUEST_GUARD_HEADER);
  return found?.[1] === REQUEST_GUARD_VALUE ? { ok: true } : { ok: false, status: 403 };
}
