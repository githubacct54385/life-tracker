import { readFileSync } from "node:fs";
import type { BrowserContext } from "@playwright/test";
import { importJWK, SignJWT, type JWK } from "jose";

// Plays the part of Cloudflare Access: signs a token and adds it to every request, as the edge does.
// The Worker checks it through the same code as in production, against the key server in support/accessKeys.mjs.
// All identities are synthetic.
export const TEAM_DOMAIN = "localhost:9099";
export const AUDIENCE = "e2e-synthetic-aud";
export const OWNER = { email: "owner@example.test" };
export const STRANGER = { email: "stranger@example.test" };
export const ACCESS_HEADER = "cf-access-jwt-assertion";

export async function accessToken(user: { email: string }, options: { expiresInSeconds?: number } = {}): Promise<string> {
  const jwk = JSON.parse(readFileSync("test-results/e2e-access-key.json", "utf8")) as JWK;
  const key = await importJWK(jwk, "RS256");
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(`http://${TEAM_DOMAIN}`)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + (options.expiresInSeconds ?? 600))
    .sign(key);
}

export async function signInAs(context: BrowserContext, user: { email: string }) {
  await context.setExtraHTTPHeaders({ [ACCESS_HEADER]: await accessToken(user) });
}
