# Cloudflare Access setup (owner-only login)

One-time setup for MIG-04. Access keeps everyone but the owner out at the edge. The Worker checks the signed Access token again on every `/api/*` request (`api/src/auth/ownerGuard.ts`), so a mistake here still fails closed: with any of the three settings below missing, the API answers nobody.

Nothing in this guide goes into the repository. The values are Worker settings.

## 1. Turn on Zero Trust (free plan)
1. Cloudflare dashboard, Zero Trust. Pick a team name. Choose the **Free** plan (up to 50 users; this app has one).
2. Your team domain is `<team>.cloudflareaccess.com`.

## 2. Add GitHub as the login method
1. Zero Trust, Settings, Authentication, Login methods, Add new, GitHub.
2. In GitHub, Settings, Developer settings, OAuth Apps, New. Homepage: your site. Callback URL: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`.
3. Paste the client ID and secret into Cloudflare. **Remove the One-time PIN method** so GitHub is the only way in.

## 3. Protect the site
1. Zero Trust, Access, Applications, Add, Self-hosted. Application domain: the Worker's hostname, no path (covers `/api/*` too).
2. Session duration: pick a long one (the owner is on a phone). Note it in the manual check for AC-MIG-04.7.
3. Policy 1, **Allow**: Include, Emails, the owner's GitHub email. Nothing else.
4. Copy the **Application Audience (AUD) tag** from the application's overview.

## 4. Keep the demo public (needs DEM-01)
Add a second application on the same hostname with path `/demo` (and `/demo/*`) and a policy of action **Bypass** for Everyone. Nothing under `/api` may be listed here.

## 5. Give the Worker its settings
| Name | Value | Where |
|---|---|---|
| `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` | Worker variable or secret |
| `ACCESS_AUD` | the AUD tag from step 3 | Worker secret |
| `OWNER_EMAIL` | the owner's GitHub email, as in the policy | Worker secret |

Use `npx wrangler secret put <NAME>` (run in `api/`) or the dashboard. For local `pnpm dev`, put real or invented values in `api/.dev.vars` (git-ignored). The API then expects a token, so for local work use the end-to-end test setup (`web/e2e/support/accessKeys.mjs`) or call it through the deployed site.

## 6. Check it
Run the manual checks AC-MIG-04.1, 04.4, 04.5 and 04.7 in `docs/manual-checks.md` and record the date.
