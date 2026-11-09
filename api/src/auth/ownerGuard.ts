// Decides whether a request comes from the owner (ADR-0006, hard rules 4 and 9).
// A pure function of two inputs: the identity header and the OWNER_ID setting.
// It reads no environment variable and has no test-only path. Tests pass synthetic headers.
import { createHash, timingSafeEqual } from "node:crypto";
import { OWNER_PROVIDER, OWNER_ROLE } from "@life-tracker/shared";

export type GuardResult = { ok: true } | { ok: false; status: 401 | 403 };

const deny401: GuardResult = { ok: false, status: 401 };
const deny403: GuardResult = { ok: false, status: 403 };

interface Principal {
  identityProvider: unknown;
  userId: string;
  userRoles: unknown;
}

/** Reads the header Static Web Apps adds. Returns undefined for anything that is not a signed-in user. */
function readPrincipal(header: string | undefined): Principal | undefined {
  if (!header) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const p = parsed as Record<string, unknown>;
    if (typeof p.userId !== "string" || p.userId === "") return undefined; // anonymous callers have no user ID
    return { identityProvider: p.identityProvider, userId: p.userId, userRoles: p.userRoles };
  } catch {
    return undefined;
  }
}

function sameText(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * 401: nobody is signed in. 403: someone is, but is not the owner, or no owner is configured.
 * The user name is never used, only the opaque user ID (usernames can be renamed and reused).
 */
export function ownerGuard(principalHeader: string | undefined, ownerId: string | undefined): GuardResult {
  const principal = readPrincipal(principalHeader);
  if (!principal) return deny401;

  const configured = ownerId?.trim();
  if (!configured) return deny403; // fail closed: no owner setting, nobody gets in

  const roles = Array.isArray(principal.userRoles) ? principal.userRoles : [];
  const isOwner =
    principal.identityProvider === OWNER_PROVIDER && roles.includes(OWNER_ROLE) && sameText(principal.userId, configured);
  return isOwner ? { ok: true } : deny403;
}
