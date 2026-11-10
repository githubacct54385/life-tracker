// Test support only: signs synthetic Cloudflare Access tokens with a throwaway key made at test time.
// Production code never imports this file (api/src/layerRules.test.ts checks it). The Worker verifies these tokens
// through the same path as real ones; it is given this key set instead of Access's published one.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import type { KeySource } from "../auth/accessGuard.js";

export const TEST_SETTINGS = {
  ACCESS_TEAM_DOMAIN: "team.example.test",
  ACCESS_AUD: "synthetic-aud-0001",
  OWNER_EMAIL: "owner@example.test",
};

export async function createTestIssuer() {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const keys: KeySource = () => createLocalJWKSet({ keys: [jwk] });
  const sign = (email: string | null, overrides: { aud?: string; expiresInSeconds?: number } = {}) =>
    new SignJWT(email === null ? {} : { email })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(`https://${TEST_SETTINGS.ACCESS_TEAM_DOMAIN}`)
      .setAudience(overrides.aud ?? TEST_SETTINGS.ACCESS_AUD)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + (overrides.expiresInSeconds ?? 600))
      .sign(pair.privateKey);
  return { keys, sign, publicJwk: jwk };
}
