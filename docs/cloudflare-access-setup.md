# Cloudflare Access setup (owner-only login)

One-time setup for MIG-04. Access keeps everyone but the owner out at the edge. The Worker checks the signed Access token again on every `/api/*` request (`api/src/auth/ownerGuard.ts`), so a mistake here still fails closed: with any of the three settings below missing, the API answers nobody.

Nothing in this guide goes into the repository. The values are Worker settings. Cloudflare renames menus often; the names below were right on 2026-11-10.

## 1. Turn on Zero Trust (free plan)
1. Cloudflare dashboard, Zero Trust. Pick a team name and the **Free** plan (up to 50 users; this app has one).
2. Your team domain is `<team>.cloudflareaccess.com`.

## 2. Add GitHub as the login method
1. In GitHub: Settings, Developer settings, OAuth Apps, New. Callback URL: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`. Generate a client secret (shown once).
2. Zero Trust, **Integrations**, **Identity providers**, Add, GitHub. Paste the client ID and secret.

## 3. Deploy the Worker once
The Worker needs a hostname before Access can protect it. From `api/`: `pnpm exec wrangler login`, then `pnpm exec wrangler deploy`. The address is `life-tracker.<subdomain>.workers.dev`. The "Self-hosted application" form is not used: it only accepts websites added to Cloudflare, not `workers.dev` addresses.

## 4. Create the owner policy
Zero Trust, Access controls, **Policies**, Add a policy: name "Owner only", action **Allow**, rule **Emails** with the owner's GitHub email (the primary verified one). Save.

## 5. Protect the Worker
1. Workers & Pages, the Worker, **Access** tab (also reachable from the Domains tab), **Protect this Worker behind Access**.
2. Scope **All traffic** (covers previews and `/api/*`). Policy: pick "Owner only". Session duration: 7 days is the longest offered. Apply Access.
3. Zero Trust, Access controls, Applications, open the new application, **Login methods** tab: turn off "Accept all available identity providers" and choose only GitHub. Save. This also turns on instant authentication, so sign-in goes straight to GitHub.
4. The Worker's Access tab shows the **AUD tag** and the team domain (inside the JWKS address).

## 6. Give the Worker its settings
Worker, Settings, Variables and secrets, add three **Secret** entries:

| Name | Value |
|---|---|
| `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | the AUD tag from step 5 |
| `OWNER_EMAIL` | the owner's GitHub email, as in the policy |

A later `wrangler deploy` can remove dashboard-set secrets. Check they are still there after any redeploy (MIG-05 should manage them).

For local `pnpm dev`, put the three values in `api/.dev.vars` (git-ignored). The API then expects a token, so for local work use the end-to-end setup (`web/e2e/support/accessKeys.mjs`).

## 7. The demo path (needs DEM-01)
Add a bypass for `/demo*` only. Nothing under `/api` may be bypassed. Note that with the Worker-level Access switch, a hostname policy for `/demo` needs a custom domain on a zone you own; settle this in DEM-01.

## 8. Check it
Manual checks AC-MIG-04.1, 04.4, 04.5 and 04.7 are in `docs/manual-checks.md`; record the date when each is done.
