// Decides whether a request comes from the owner (ADR-0006 as amended by ADR-0021, hard rules 4 and 9).
// Input: the Cloudflare Access token, the settings, and a source of public keys. It reads no environment
// variable and has no test-only path: tests sign tokens with their own key and pass that key in.
import { createHash, timingSafeEqual } from "node:crypto";
import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { issuerFor, type AccessConfig } from "./accessConfig.js";

export type GuardResult = { ok: true } | { ok: false; status: 401 | 403 };

const deny401: GuardResult = { ok: false, status: 401 };
const deny403: GuardResult = { ok: false, status: 403 };

function sameText(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * 401: no valid Access token (missing, forged, expired, wrong audience or issuer). Nothing else is revealed.
 * 403: a valid token for someone who is not the owner, or no owner is configured.
 */
export async function ownerGuard(
  token: string | undefined,
  config: AccessConfig | undefined,
  keys: JWTVerifyGetKey,
  now: Date = new Date(),
): Promise<GuardResult> {
  if (!token) return deny401;
  if (!config) return deny403; // fail closed: no settings, nobody gets in

  let email: unknown;
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      issuer: issuerFor(config.teamDomain),
      audience: config.audience,
      currentDate: now,
      requiredClaims: ["exp"],
    });
    email = payload["email"];
  } catch {
    return deny401;
  }

  // Service tokens and other non-user identities carry no email and are not the owner.
  if (typeof email !== "string" || email === "") return deny403;
  return sameText(email.toLowerCase(), config.ownerEmail.toLowerCase()) ? { ok: true } : deny403;
}
