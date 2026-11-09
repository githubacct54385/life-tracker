import { describe, expect, it } from "vitest";
import { authorize } from "./authorize";

const OWNER_ID = "synthetic-owner-id-0001";
const owner = Buffer.from(
  JSON.stringify({ identityProvider: "github", userId: OWNER_ID, userDetails: "synthetic-user", userRoles: ["authenticated", "owner"] }),
).toString("base64");

describe("authorize", () => {
  it("[AC-FND-02.3] checks identity before anything else, so an anonymous caller learns nothing", () => {
    expect(authorize({ method: "POST", headers: {} }, OWNER_ID)).toEqual({ ok: false, status: 401 });
  });

  it("[AC-FND-02.7] rejects the owner's own POST when the custom header is missing", () => {
    expect(authorize({ method: "POST", headers: { "x-ms-client-principal": owner } }, OWNER_ID)).toEqual({ ok: false, status: 403 });
  });

  it("[AC-FND-02.1] allows the owner's GET and header-carrying POST", () => {
    expect(authorize({ method: "GET", headers: { "x-ms-client-principal": owner } }, OWNER_ID)).toEqual({ ok: true });
    expect(authorize({ method: "PUT", headers: { "x-ms-client-principal": owner, "x-life-tracker": "1" } }, OWNER_ID)).toEqual({ ok: true });
  });

  it("[AC-FND-02.5] denies the owner when the setting is missing", () => {
    expect(authorize({ method: "GET", headers: { "x-ms-client-principal": owner } }, undefined)).toEqual({ ok: false, status: 403 });
  });
});
