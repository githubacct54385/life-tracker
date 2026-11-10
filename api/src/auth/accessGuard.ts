// Connects the Worker's request and settings to ownerGuard. The only place that knows the Access header name
// and where Access publishes its keys.
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { certsUrl, readAccessConfig, type AccessSettings } from "./accessConfig.js";
import { ownerGuard, type GuardResult } from "./ownerGuard.js";

/** Cloudflare Access adds this header to every request it lets through. */
export const ACCESS_TOKEN_HEADER = "cf-access-jwt-assertion";

/** Gives the public keys for a team domain. Tests supply their own; the Worker uses Access's published keys. */
export type KeySource = (teamDomain: string) => JWTVerifyGetKey;

const cache = new Map<string, JWTVerifyGetKey>();

/** Fetches and caches Access's public keys. jose refreshes them when a token names a key it has not seen. */
export const remoteKeys: KeySource = (teamDomain) => {
  let keys = cache.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(certsUrl(teamDomain), { cooldownDuration: 30_000 });
    cache.set(teamDomain, keys);
  }
  return keys;
};

export async function authenticate(headers: Headers, settings: AccessSettings, keySource: KeySource): Promise<GuardResult> {
  const config = readAccessConfig(settings);
  const token = headers.get(ACCESS_TOKEN_HEADER) ?? undefined;
  // With no settings the guard denies without checking the token, so no key lookup is needed.
  const keys = config ? keySource(config.teamDomain) : () => Promise.reject(new Error("no keys"));
  return ownerGuard(token, config, keys as JWTVerifyGetKey);
}
