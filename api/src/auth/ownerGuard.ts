// Decides whether a request comes from the owner (ADR-0006 as amended by ADR-0021, hard rules 4 and 9).
// Input: the Cloudflare Access token, the settings, and a source of public keys. It reads no environment
// variable and has no test-only path: tests sign tokens with their own key and pass that key in.
import { createHash, timingSafeEqual } from "node:crypto";
import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { issuerFor, type AccessConfig } from "./accessConfig.js";

/** `readOnly` is set only for the smoke-test service token (ADR-0023). The app then allows GET and HEAD and nothing else. */
/** `email` is the person the request is for, lower-case. The smoke-test token has no email of its own, so it reads as the owner. */
export type GuardResult = { ok: true; email: string; readOnly?: true } | { ok: false; status: 401 | 403 };

const deny401: GuardResult = { ok: false, status: 401 };
const deny403: GuardResult = { ok: false, status: 403 };

function sameText(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * 401: no valid Access token (missing, forged, expired, wrong audience or issuer). Nothing else is revealed.
 * 403: a valid token for someone who is not the owner, or no owner is configured.
 * One extra identity can be allowed: the Access service token whose client ID is `config.smokeClientId`. It is
 * verified exactly like an owner token (signature, issuer, audience, expiry) and is marked read-only.
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
  let commonName: unknown;
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      issuer: issuerFor(config.teamDomain),
      audience: config.audience,
      currentDate: now,
      requiredClaims: ["exp"],
    });
    email = payload["email"];
    commonName = payload["common_name"];
  } catch {
    return deny401;
  }

  // Service tokens carry no email. Only the one configured smoke-test token is let in, and only to read.
  if (typeof email !== "string" || email === "") {
    const smoke = config.smokeClientId;
    if (smoke && typeof commonName === "string" && commonName !== "" && sameText(commonName, smoke)) return { ok: true, email: config.ownerEmail.trim().toLowerCase(), readOnly: true };
    return deny403;
  }
  return sameText(email.toLowerCase(), config.ownerEmail.toLowerCase()) ? { ok: true, email: email.trim().toLowerCase() } : deny403;
}
