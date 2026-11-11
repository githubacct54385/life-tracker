# Setup from scratch

Everything needed to stand the app up on a new set of accounts. It replaces the old Azure guide (removed in MIG-07). All parts fit free plans (Cost rule in AGENTS.md). Nothing here goes into the repository: every value is stored in Neon, Cloudflare, or GitHub.

Cloudflare, GitHub and Neon rename menus often. If a name below is gone, look for the closest one.

## What gets stored where

| Value | Where it lives | Used by |
|---|---|---|
| `DATABASE_ADMIN_URL` (Neon admin login, direct connection) | GitHub `production` environment secret | The Release workflow, to run migrations |
| `DATABASE_URL` (Neon `lt_app` login, pooled connection) | Cloudflare Worker secret | The Worker, at run time |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_EMAIL` | Cloudflare Worker secrets | The Worker, to check the owner's Access token |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub `production` environment secret | The Release workflow, to deploy |
| GitHub OAuth app client ID and secret | Cloudflare Zero Trust (identity provider) | Sign-in through GitHub |

## 1. GitHub repository
1. Create the repository and push the code.
2. Run `scripts/setup-github.sh` (needs `gh` signed in as the owner). It protects `main`, allows squash merges only, turns on security scanning and creates the `production` environment with you as the required reviewer.
3. Do not connect Cloudflare's own Git deployment to the repository. Only the Release workflow deploys.

## 2. Neon (database)
Follow [db/setup/README.md](../db/setup/README.md). In short: create a free project, keep the admin direct connection string as `DATABASE_ADMIN_URL`, create the `lt_app` role with `db/setup/app-role.sql`, and keep its pooled connection string as `DATABASE_URL`.

## 3. Cloudflare (Worker, login, deploy token)
1. Create a free Cloudflare account. Open Workers & Pages once so the account gets its `workers.dev` address.
2. Deploy the Worker once by hand so it has an address: from `api/`, run `pnpm exec wrangler login`, then `pnpm exec wrangler deploy`.
3. Set up owner-only login with Cloudflare Access: follow [cloudflare-access-setup.md](cloudflare-access-setup.md). It ends with the three Access secrets on the Worker.
4. Add `DATABASE_URL` as a Worker secret (Worker, Settings, Variables and secrets, **Secret**).
5. Create the deploy token and add the GitHub secrets: follow [cloudflare-release-setup.md](cloudflare-release-setup.md).

## 4. First release
GitHub, Actions, **Release**, Run workflow on `main`, then approve the `production` environment. Open the run summary to see the commit and the migrations applied. Open the site in a private window: it should ask you to sign in, and `/api/health` should answer after you do.

## 5. Check it
Work through the entries in [manual-checks.md](manual-checks.md) for MIG-04, MIG-05 and OPS-01. They record what was checked and when.

## Costs to watch
All free plans: Cloudflare Workers and Zero Trust (50 users), Neon, GitHub. Do not turn on paid add-ons. Workers Logs keeps 3 days of history (see [OBSERVABILITY.md](../OBSERVABILITY.md)).
