import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ownerGuard } from "./ownerGuard";

// Synthetic identities only. The IDs are made up and are not tied to any real account.
const OWNER_ID = "synthetic-owner-id-0001";

function principal(overrides: Record<string, unknown> = {}): string {
  const body = {
    identityProvider: "github",
    userId: OWNER_ID,
    userDetails: "synthetic-user",
    userRoles: ["anonymous", "authenticated", "owner"],
    ...overrides,
  };
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}

describe("ownerGuard", () => {
  it("[AC-FND-02.1] lets the owner through", () => {
    expect(ownerGuard(principal(), OWNER_ID)).toEqual({ ok: true });
  });

  it("[AC-FND-02.3] returns 401 when there is no identity header", () => {
    expect(ownerGuard(undefined, OWNER_ID)).toEqual({ ok: false, status: 401 });
    expect(ownerGuard("", OWNER_ID)).toEqual({ ok: false, status: 401 });
  });

  it("[AC-FND-02.3] returns 401 for an identity header that cannot be read", () => {
    for (const bad of ["not base64 !!", Buffer.from("not json").toString("base64"), Buffer.from("[]").toString("base64"), Buffer.from("null").toString("base64")]) {
      expect(ownerGuard(bad, OWNER_ID)).toEqual({ ok: false, status: 401 });
    }
  });

  it("[AC-FND-02.3] treats an anonymous principal (no user ID) as no identity", () => {
    expect(ownerGuard(principal({ userId: null, userRoles: ["anonymous"] }), OWNER_ID)).toEqual({ ok: false, status: 401 });
  });

  it("[AC-FND-02.4] returns 403 for a signed-in user whose ID is not the owner's", () => {
    expect(ownerGuard(principal({ userId: "synthetic-other-id-0002" }), OWNER_ID)).toEqual({ ok: false, status: 403 });
  });

  it("[AC-FND-02.4] returns 403 when the owner ID matches but the owner role is missing", () => {
    expect(ownerGuard(principal({ userRoles: ["anonymous", "authenticated"] }), OWNER_ID)).toEqual({ ok: false, status: 403 });
  });

  it("[AC-FND-02.4] returns 403 when the provider is not GitHub", () => {
    expect(ownerGuard(principal({ identityProvider: "aad" }), OWNER_ID)).toEqual({ ok: false, status: 403 });
  });

  it("[AC-FND-02.4] never trusts the user name, only the user ID", () => {
    expect(ownerGuard(principal({ userId: "synthetic-other-id-0002", userDetails: OWNER_ID }), OWNER_ID)).toEqual({ ok: false, status: 403 });
  });

  it("[AC-FND-02.5] denies everyone when the owner ID setting is missing or blank", () => {
    for (const missing of [undefined, "", "   "]) {
      expect(ownerGuard(principal(), missing)).toEqual({ ok: false, status: 403 });
      expect(ownerGuard(principal({ userId: "" }), missing)).toEqual({ ok: false, status: 401 });
    }
  });

  it("[AC-FND-02.5] property: with no owner ID set, no identity is ever allowed", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string()), fc.string(), (userId, roles, provider) => {
        const result = ownerGuard(principal({ userId, userRoles: roles, identityProvider: provider }), undefined);
        expect(result.ok).toBe(false);
      }),
    );
  });

  it("[AC-FND-02.4] property: only the exact owner ID with the owner role and GitHub passes", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (userId) => {
        const result = ownerGuard(principal({ userId }), OWNER_ID);
        expect(result.ok).toBe(userId === OWNER_ID);
      }),
    );
  });

  it("[AC-FND-02.8] gives the same answer whatever the environment says", () => {
    const before = { ...process.env };
    try {
      for (const flag of ["test", "development", "production"]) {
        process.env.NODE_ENV = flag;
        process.env.CI = "true";
        process.env.AUTH_BYPASS = "1";
        expect(ownerGuard(undefined, OWNER_ID)).toEqual({ ok: false, status: 401 });
        expect(ownerGuard(principal({ userId: "synthetic-other-id-0002" }), OWNER_ID)).toEqual({ ok: false, status: 403 });
      }
    } finally {
      process.env = before;
    }
  });
});
