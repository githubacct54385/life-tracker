# Setup from scratch

Everything needed to stand the app up on a new set of accounts. It replaces the old Azure guide (removed in MIG-07). All parts fit free plans (Cost rule in AGENTS.md). Nothing here goes into the repository: every value is stored in Neon, Cloudflare, or GitHub.

Cloudflare, GitHub and Neon rename menus often. If a name below is gone, look for the closest one.

## What gets stored where

| Value | Where it lives | Used by |
|---|---|---|
| `DATABASE_ADMIN_URL` (Neon admin login, direct connection) | GitHub `production` environment secret | The Release workflow, to run migrations |
| `DATABASE_URL` (Neon `lt_app` login, pooled connection) | Cloudflare Worker secret | The Worker, at run time |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_EMAIL` | Cloudflare Worker secrets | The Worker, to check the owner's Access token |
| `DOCUMENTS` (R2 bucket binding, `life-tracker-documents`) | `api/wrangler.jsonc` (a name, not a secret) | The Worker, for car-service documents (ADR-0024) |
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
6. Create the document bucket (MIL-07, ADR-0024), described next.

### Document bucket (Cloudflare R2)
Car-service documents (a photo or PDF a shop gave) are stored in a private R2 bucket. Do this once, before the first Release that includes MIL-07, because the deploy fails if the bucket named in `api/wrangler.jsonc` does not exist.
1. Cloudflare dashboard, **Storage & databases**, **R2 object storage**. R2 may ask for a payment method before it can be enabled. The app allows up to 100 MB per document and 250 MB per service. The free allowance (10 GB stored, 1 million writes and 10 million reads a month, no download fees) is far above what a few dozen documents a year use, so the cost stays $0. Check the current numbers on the page.
2. **Create bucket**, name `life-tracker-documents`, location Automatic, storage class Standard.
3. Leave public access off: do not enable the `r2.dev` address or a custom domain. A document is read only through the API after the owner check.
4. The Release token needs **Account, Workers R2 Storage, Edit** besides **Edit Cloudflare Workers** ([cloudflare-release-setup.md](cloudflare-release-setup.md)). Without it the deploy cannot attach the bucket.
5. The binding is the `r2_buckets` entry in `api/wrangler.jsonc` (name `DOCUMENTS`). There is no key, token or secret for the bucket in the Worker.
6. Optional: a second bucket named `life-tracker-documents-staging` for testing uploads without touching real documents. Nothing binds it yet; it is for a staging Worker if one is added.
7. R2 cannot restore a deleted file the way Neon can restore the database. The app asks before deleting a document. To keep a copy, download the documents you care about.
8. Check it with the AC-MIL-07.9 entry in [manual-checks.md](manual-checks.md).

## 4. First release
GitHub, Actions, **Release**, Run workflow on `main`, then approve the `production` environment. Open the run summary to see the commit and the migrations applied. Open the site in a private window: it should ask you to sign in, and `/api/health` should answer after you do.

## 5. Check it
Work through the entries in [manual-checks.md](manual-checks.md) for MIG-04, MIG-05 and OPS-01. They record what was checked and when.

## 6. Backups and cost safeguards
Before loading real data, follow [backup-and-restore.md](backup-and-restore.md) (restore and `pg_dump` export) and do the OPS-02 entries in [manual-checks.md](manual-checks.md).

## Costs to watch
All free plans: Cloudflare Workers and Zero Trust (50 users), Neon, GitHub. Do not turn on paid add-ons. Workers Logs keeps 3 days of history (see [OBSERVABILITY.md](../OBSERVABILITY.md)).
