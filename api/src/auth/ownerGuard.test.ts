import fc from "fast-check";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import type { AccessConfig } from "./accessConfig";
import { ownerGuard } from "./ownerGuard";

// Synthetic identities and a throwaway key made for this test run. Nothing here is real.
const config: AccessConfig = { teamDomain: "team.example.test", audience: "synthetic-aud-0001", ownerEmail: "owner@example.test" };
const NOW = new Date("2026-11-10T12:00:00Z");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;
let otherPrivateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] });
  otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
});

interface Options {
  email?: string | null;
  aud?: string;
  iss?: string;
  exp?: number | null;
  key?: CryptoKey;
  kid?: string;
  alg?: string;
}

async function token(o: Options = {}): Promise<string> {
  const claims: Record<string, unknown> = {};
  if (o.email !== null) claims.email = o.email ?? config.ownerEmail;
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: o.alg ?? "RS256", kid: o.kid ?? "k1" })
    .setIssuer(o.iss ?? `https://${config.teamDomain}`)
    .setAudience(o.aud ?? config.audience)
    .setIssuedAt(nowSeconds - 60);
  if (o.exp !== null) jwt.setExpirationTime(o.exp ?? nowSeconds + 600);
  return jwt.sign(o.key ?? privateKey);
}

const guard = (t: string | undefined, c: AccessConfig | undefined = config) => ownerGuard(t, c, keys, NOW);

describe("ownerGuard", () => {
  it("[AC-MIG-04.2] lets the owner through", async () => {
    expect(await guard(await token())).toEqual({ ok: true });
  });

  it("[AC-MIG-04.3] returns 401 when there is no token", async () => {
    expect(await guard(undefined)).toEqual({ ok: false, status: 401 });
    expect(await guard("")).toEqual({ ok: false, status: 401 });
  });

  it("[AC-MIG-04.3] returns 401 for a token that cannot be read", async () => {
    for (const bad of ["not a token", "a.b.c", "....", "eyJhbGciOiJub25lIn0.e30."]) {
      expect(await guard(bad)).toEqual({ ok: false, status: 401 });
    }
  });

  it("[AC-MIG-04.2][AC-MIG-04.3] returns 401 for a token signed with a different key", async () => {
    expect(await guard(await token({ key: otherPrivateKey }))).toEqual({ ok: false, status: 401 });
  });

  it("[AC-MIG-04.2][AC-MIG-04.3] returns 401 for a token whose key id is unknown", async () => {
    expect(await guard(await token({ kid: "unknown" }))).toEqual({ ok: false, status: 401 });
  });

  it("[AC-MIG-04.2][AC-MIG-04.3] returns 401 for an expired token and for one with no expiry", async () => {
    expect(await guard(await token({ exp: nowSeconds - 1 }))).toEqual({ ok: false, status: 401 });
    expect(await guard(await token({ exp: null }))).toEqual({ ok: false, status: 401 });
  });

  it("[AC-MIG-04.2][AC-MIG-04.3] returns 401 for the wrong audience or the wrong issuer", async () => {
    expect(await guard(await token({ aud: "another-application" }))).toEqual({ ok: false, status: 401 });
    expect(await guard(await token({ iss: "https://other.example.test" }))).toEqual({ ok: false, status: 401 });
  });

  it("[AC-MIG-04.2][AC-MIG-04.3] returns 401 for a token that uses another algorithm", async () => {
    const secret = new TextEncoder().encode("a-shared-secret-of-sufficient-length-0123456789");
    const hs = await new SignJWT({ email: config.ownerEmail })
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setIssuer(`https://${config.teamDomain}`)
      .setAudience(config.audience)
      .setExpirationTime(nowSeconds + 600)
      .sign(secret);
    expect(await guard(hs)).toEqual({ ok: false, status: 401 });
  });

  it("[AC-MIG-04.3] returns 403 for a valid token whose email is not the owner's", async () => {
    expect(await guard(await token({ email: "someone-else@example.test" }))).toEqual({ ok: false, status: 403 });
  });

  it("[AC-MIG-04.3] returns 403 for a valid token with no email, such as a service token", async () => {
    expect(await guard(await token({ email: null }))).toEqual({ ok: false, status: 403 });
    expect(await guard(await token({ email: "" }))).toEqual({ ok: false, status: 403 });
  });

  it("[AC-MIG-04.2] compares the email without regard to letter case, and not as a partial match", async () => {
    expect(await guard(await token({ email: "OWNER@Example.test" }))).toEqual({ ok: true });
    expect(await guard(await token({ email: "xowner@example.test" }))).toEqual({ ok: false, status: 403 });
    expect(await guard(await token({ email: "owner@example.test.evil.test" }))).toEqual({ ok: false, status: 403 });
  });

  it("[AC-MIG-04.2] denies everyone when the settings are missing, even with a valid owner token", async () => {
    expect(await ownerGuard(await token(), undefined, keys, NOW)).toEqual({ ok: false, status: 403 });
    expect(await ownerGuard(undefined, undefined, keys, NOW)).toEqual({ ok: false, status: 401 });
  });

  it("[AC-MIG-04.2] property: only the configured email passes, whatever the other address is", async () => {
    await fc.assert(
      fc.asyncProperty(fc.emailAddress(), async (email) => {
        const result = await guard(await token({ email }));
        expect(result.ok).toBe(email.toLowerCase() === config.ownerEmail);
      }),
      { numRuns: 25 },
    );
  });

  it("[AC-MIG-04.2][AC-MIG-04.6] gives the same answer whatever the environment says", async () => {
    const before = { ...process.env };
    try {
      for (const flag of ["test", "development", "production"]) {
        process.env.NODE_ENV = flag;
        process.env.CI = "true";
        process.env.AUTH_BYPASS = "1";
        expect(await guard(undefined)).toEqual({ ok: false, status: 401 });
        expect(await guard(await token({ email: "someone-else@example.test" }))).toEqual({ ok: false, status: 403 });
      }
    } finally {
      process.env = before;
    }
  });
});
