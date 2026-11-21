# Staging setup (OPS-08)

Staging is a second copy of the app where a change runs on the real platform before it reaches production. It has its own Worker, its own Neon project, its own R2 bucket and its own login, and it holds **synthetic data only**. Nothing here touches production. Decision and reasons: [ADR-0025](../DECISIONS.md#adr-0025-a-staging-environment-sits-in-front-of-production).

Everything fits the free plans (Cost rule in AGENTS.md). Check each vendor's current limits on its pricing page before you create a resource. Neon, Cloudflare and GitHub rename menus often; look for the closest name if one below is gone.

Nothing in this guide goes into the repository. Every value is stored in Neon, Cloudflare or GitHub. Never paste a connection string into chat, an issue or a file in this repo.

## What lives where

| Value | Where it lives | Used by |
|---|---|---|
| `DATABASE_ADMIN_URL` (staging admin login, direct connection) | GitHub `staging` environment secret | The staging workflow, to run migrations (PR 2 of OPS-08) |
| `DATABASE_URL` (staging `lt_app` login, pooled connection) | Secret on the `life-tracker-staging` Worker | The Worker, at run time |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_EMAIL` | Secrets on the `life-tracker-staging` Worker | The Worker, to check the signed Access token |
| `DOCUMENTS` (R2 binding, `life-tracker-documents-staging`) | `api/wrangler.jsonc`, `env.staging` | The Worker, for documents |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub `staging` environment secret | The staging workflow, to deploy |
| Smoke-test service token (`SMOKE_CLIENT_ID`, `SMOKE_CLIENT_SECRET`) | GitHub `staging` environment secrets. The ID is also a secret on the staging Worker | The smoke test, and the Worker (to recognize the read-only identity) |
| `STAGING_URL` (the staging Worker's address) | GitHub `staging` environment **variable**, not a secret | The smoke test |

Keep every staging value apart from production's. A staging password or token is never the same string as a production one.

## 1. Neon: a separate staging project

Use a **new project**, not a branch of the production project. A branch starts as a copy of production's data, and deleting that data later does not remove it from the branch's history. A new project has never held real data.

1. In the Neon console, **New project** on the free plan.
   - Name: `life-tracker-staging`.
   - Postgres version and region: the same as production, so staging behaves the same.
   - Database name: **`lt_staging`**. The seed script and its safety check use this name to refuse to run against anything else, so do not leave the default.
2. Open **Connect**, turn **Connection pooling off**, pick the default role and the `lt_staging` database, and copy the **direct** connection string. This is the staging admin URL. Migrations need a session-level lock that a pooler can break. Write `sslmode=verify-full` in place of `sslmode=require` (the `pg` driver treats them the same today and warns about the change).
3. Keep it in a shell variable for the next steps. Nothing below puts it in your shell history:

   ```bash
   read -rs DATABASE_ADMIN_URL && export DATABASE_ADMIN_URL   # paste the staging admin string, press Return (nothing is shown)
   ```

   `psql` is needed: `brew install libpq`, then `export PATH="$(brew --prefix libpq)/bin:$PATH"`.

   `psql` has no built-in list of trusted certificate authorities, unlike the Node tools, so it fails on `sslmode=verify-full` with "root certificate file ... does not exist". Give `psql` its own copy of the URL that uses the Mac's trusted certificates, and use it for every `psql` command below. Keep `DATABASE_ADMIN_URL` as it is for `pnpm migrate`, because the Node driver reads `sslrootcert` as a file name:

   ```bash
   export PSQL_URL="${DATABASE_ADMIN_URL}&sslrootcert=system"
   ```

4. Check that you are on the staging database before changing anything:

   ```bash
   psql "$PSQL_URL" -Atc "select current_database()"
   ```

   It must print `lt_staging`. If it prints anything else, stop.
5. Create the app role and its grants. Run this from the repository root, with a **new** password (not production's):

   ```bash
   APP_PW="$(openssl rand -hex 32)"
   psql "$PSQL_URL" -v app_password="$APP_PW" -f db/setup/app-role.sql
   ```

6. Build the pooled app connection string. It is the admin URL with the user `lt_app`, that password, and the host that has `-pooler` in it:

   ```bash
   APP_URL="$(APP_PW="$APP_PW" node -e 'const u = new URL(process.env.DATABASE_ADMIN_URL); u.username = "lt_app"; u.password = process.env.APP_PW; if (!u.hostname.includes("-pooler")) u.hostname = u.hostname.replace(".", "-pooler."); console.log(u.toString())')"
   ```

   Keep `APP_URL` in the shell until step 3 of section 3 stores it as the Worker secret.
7. Create the schema with the migrations, from the repository root:

   ```bash
   pnpm migrate
   ```

   It prints the migrations it applied. This is the same command the Release workflow runs, so a migration is rehearsed here first.
8. Check the app role can use the tables but cannot change the schema (the same check as AC-MIG-02.1 for production):

   ```bash
   export APP_PSQL_URL="${APP_URL}&sslrootcert=system"
   psql "$APP_PSQL_URL" -Atc "select count(*) from odometer_readings"
   psql "$APP_PSQL_URL" -c "create table x (id int)"
   ```

   The first prints `0`. The second must fail with "permission denied". (If a table name differs, use any table from `db/migrations`.)

## 2. GitHub: the `staging` environment

1. GitHub, the repository, **Settings**, **Environments**, **New environment**, name `staging`.
2. **Deployment branches and tags**: **Selected branches**, add `main`. Do not add required reviewers: staging deploys on its own after CI passes.
3. Add the environment secret `DATABASE_ADMIN_URL` with the staging admin string:

   ```bash
   printf %s "$DATABASE_ADMIN_URL" | gh secret set DATABASE_ADMIN_URL --env staging --repo githubacct54385/life-tracker
   ```

4. The deploy token and account ID are added in section 4. The staging workflow itself arrives in PR 2 of OPS-08.

Environment secrets, not repository secrets: they are released only to a run that uses the `staging` environment on `main`.

## 3. Cloudflare: the staging Worker and its login

1. Create the Worker once by hand so it has an address. From `api/`: `pnpm exec wrangler deploy --env staging`. Its address is `life-tracker-staging.<your-subdomain>.workers.dev`. (Without `--env staging`, wrangler would deploy **production**. Always type it.)
2. Protect it with Cloudflare Access, the same way as production: follow [cloudflare-access-setup.md](cloudflare-access-setup.md) sections 4 and 5, but for the staging address. Create a **second** Access application with its own policy that allows only you. It has its own `AUD` tag.
3. Give the staging Worker its secrets (Worker `life-tracker-staging`, Settings, Variables and secrets, type **Secret**), or from `api/` with `pnpm exec wrangler secret put <NAME> --env staging`:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the staging `APP_URL` from section 1 step 6 |
   | `ACCESS_TEAM_DOMAIN` | the same team domain as production |
   | `ACCESS_AUD` | the **staging** application's AUD tag (not production's) |
   | `OWNER_EMAIL` | your email, as in the policy |

4. The staging bucket `life-tracker-documents-staging` already exists and is bound in `api/wrangler.jsonc`. Leave public access off, as for production.
5. Open the staging address in a private window. It must ask you to sign in, and `/api/health` must answer only after you have.

## 4. The deploy token, the smoke-test token and the address

1. Use a Cloudflare API token with the same permissions as the Release token ([cloudflare-release-setup.md](cloudflare-release-setup.md), steps 1 and 2). Cloudflare cannot limit a token to one Worker, so a staging token can still deploy production. Safety comes from the workflow: it is written so the staging workflow only ever runs `wrangler deploy --env staging`, never reads production secrets, and a test fails the build if that changes. Store it in the `staging` environment:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --env staging --repo githubacct54385/life-tracker
   gh secret set CLOUDFLARE_ACCOUNT_ID --env staging --repo githubacct54385/life-tracker
   ```

   `gh` asks for each value without echoing it.
2. For the smoke test, create a read-only service token for the staging application ([cloudflare-access-setup.md](cloudflare-access-setup.md) section 9, ADR-0023). Name it `smoke-test-staging` so it can be revoked without touching production's. Add a **Service Auth** policy for it on the **staging** application. Then store its Client ID as a secret on the staging Worker, and both values as `SMOKE_CLIENT_ID` and `SMOKE_CLIENT_SECRET` in the `staging` GitHub environment:

   ```bash
   printf %s "$SMOKE_CLIENT_ID" | pnpm --filter @life-tracker/api exec wrangler secret put SMOKE_CLIENT_ID --env staging
   printf %s "$SMOKE_CLIENT_ID" | gh secret set SMOKE_CLIENT_ID --env staging --repo githubacct54385/life-tracker
   printf %s "$SMOKE_CLIENT_SECRET" | gh secret set SMOKE_CLIENT_SECRET --env staging --repo githubacct54385/life-tracker
   ```

   **Paste carefully.** A stray space, tab or carriage return in a pasted value makes `curl` and Node refuse to send it, and the error does not say why (it showed up as `curl` returning `000` and Node a bare `TypeError`). Clean the two variables first, and check their lengths (the ID is 39 characters, the secret 54 at the time of writing):

   ```bash
   SMOKE_CLIENT_ID="$(printf %s "$SMOKE_CLIENT_ID" | tr -d '[:space:][:cntrl:]')"
   SMOKE_CLIENT_SECRET="$(printf %s "$SMOKE_CLIENT_SECRET" | tr -d '[:space:][:cntrl:]')"
   export SMOKE_CLIENT_ID SMOKE_CLIENT_SECRET
   echo "id:${#SMOKE_CLIENT_ID} secret:${#SMOKE_CLIENT_SECRET}"
   ```

3. Store the staging address as an environment **variable** (it is an address, not a secret, and it stays out of the repository). It is the address of the staging Worker, with no path:

   ```bash
   gh variable set STAGING_URL --env staging --repo githubacct54385/life-tracker --body "https://<the staging Worker address>"
   ```

   **Do this before the staging workflow is merged.** The first push to `main` after that starts it, and without the address its smoke test fails.

## 5. How a deploy to staging works

`.github/workflows/staging.yml` runs on its own after CI passes on a push to `main` (pull request and weekly CI runs never start it). It builds, applies the migrations to the staging database, deploys the staging Worker (`wrangler deploy --env staging --keep-vars`), and runs the smoke test. Its result is recorded on the commit as the status **`staging-smoke`**. Open the run in GitHub, Actions, **Staging**, to see the commit, the migrations applied and each smoke check.

**The Release gate.** The production Release waits for CI (`hygiene`, `test`) and for `staging-smoke` on the exact commit it is releasing, and stops at once if `staging-smoke` failed. If staging never ran for that commit (for example it was skipped), run **Staging** by hand on `main`, then run Release again. The Release workflow only reads the status. It cannot write one and never deploys to staging.

To try a branch or commit on staging without merging it: GitHub, Actions, **Staging**, **Run workflow**, choose **main** under "Use workflow from" (the `staging` environment gives its secrets only to runs from `main`), and put the branch name or commit in `ref`. That runs the branch's code with staging's secrets, so only run branches you wrote or have read.

The smoke test can also be run by hand against staging (it only reads):

```bash
SMOKE_CLIENT_ID=... SMOKE_CLIENT_SECRET=... node scripts/smoke.mjs "https://<the staging Worker address>"
```

It checks that an unsigned request is refused, that `/api/health` and `/api/health/db` answer (the second one proves the Worker reaches the staging database), and that each list can be read. If a token has a hidden character in it, it says which one (and never prints anything from it).

## 6. Sample data (and starting over)

Staging starts empty. **Open the staging site once first, signed in as yourself.** That creates your admin row, and every row of sample data belongs to a person, so the command stops with a message if there is no admin yet. Then, to fill it with made-up data so every page has something to show, run this from the repository root with the staging admin string in `DATABASE_ADMIN_URL` (the same variable as in section 1):

```bash
pnpm seed:staging
```

It adds 40 weekly odometer readings, about 40 weight entries, 36 workouts, 10 monthly gifts and 2 special contributions, 2 service places and 6 maintenance records. The data is the same every time, dated back from today, and made up in code: names are "Sample Garage" and so on, and no real data is ever read from a file.

To throw away whatever is in staging (including anything you tried out) and start again from the sample data:

```bash
pnpm seed:staging --reset
```

Safety rules built into the command:
- **It only runs against a database named `lt_staging`.** Any other name, including production's, is refused before it connects. This is why section 1 asks you to give the project that database name.
- **Without `--reset` it refuses a database that already has rows**, so running it twice cannot double the data.
- **It works in one transaction.** If anything fails, the database is left exactly as it was.
- **It never touches the documents bucket.** A reset removes the document rows, so any files you uploaded while testing are no longer listed or served, but they stay in the `life-tracker-documents-staging` bucket until you delete them in the Cloudflare dashboard (R2). They are test files, so this does no harm.
- **It prints only counts and fixed messages**, never the address or a row.

## 7. Check it

- Sections 1 to 4 can be checked with the commands in them. The sample data and the Release gate are described in sections 6 and 5.
- Any manual deploy of the staging Worker also needs `--keep-vars`, so the secrets set in Cloudflare are not removed: `wrangler deploy --env staging --keep-vars`.
- Staging holds synthetic data only. Never import a real spreadsheet, a real Apple Health export or a real document there.
- When something looks wrong, the first question is "which environment am I in?". The address says it, and `wrangler` without `--env staging` always means production.
