import type { BrowserContext } from "@playwright/test";

// The SWA CLI emulator reads a base64 JSON cookie as the signed-in user. Setting it directly gives the
// same result as its login form, without loading that form's scripts from an outside CDN.
// All identities are synthetic.
export const OWNER = {
  identityProvider: "github",
  userId: "synthetic-owner-id-0001",
  userDetails: "synthetic-owner",
  userRoles: ["anonymous", "authenticated", "owner"],
  claims: [],
};

export const STRANGER = {
  identityProvider: "github",
  userId: "synthetic-stranger-id-0002",
  userDetails: "synthetic-stranger",
  userRoles: ["anonymous", "authenticated"],
  claims: [],
};

export async function signInAs(context: BrowserContext, user: typeof OWNER) {
  await context.addCookies([
    { name: "StaticWebAppsAuthCookie", value: Buffer.from(JSON.stringify(user)).toString("base64"), url: "http://localhost:4280" },
  ]);
}
