# Decisions (ADRs)

One entry per decision that is costly to reverse. Each says what we chose, why, and what it costs us. To change a decision, add a new entry that supersedes the old one. Do not delete history.

**Status values:** *Accepted* (agreed, build on it), *Verify* (agreed, but it rests on a cloud-provider fact that must be checked in the portal or the provider's docs before we depend on it), *Superseded* (replaced by a later entry; kept for history), and *Withdrawn* (the feature it served is out of scope; kept for history).

| # | Decision | Status |
|---|---|---|
| 0001 | Hosting and database | Superseded by 0021 |
| 0002 | Data access and migrations | Accepted (Postgres `pg` driver since MIG-02) |
| 0003 | Database credentials and network | Superseded by 0021 |
| 0004 | Source control, pull requests, and manual release | Accepted (deploy target changes with 0021) |
| 0005 | Testing strategy | Accepted |
| 0006 | Auth testing and request protection | Accepted (identity mechanics superseded by 0021) |
| 0007 | Dates, time zones, money | Accepted |
| 0008 | Weekly mileage algorithm | Accepted |
| 0009 | Apple Health is parsed in the browser | Accepted, spike first |
| 0010 | Import fingerprints and commit validation | Withdrawn (finance moved out, 0021) |
| 0011 | Income and transfers are category types | Withdrawn (finance moved out, 0021) |
| 0012 | Frontend and tooling stack | Accepted (Functions model superseded by 0021) |
| 0013 | Public repo, license, and planning documents | Accepted |
| 0014 | Demo parity | Accepted |
| 0015 | Product choices from the spec's open questions | Accepted |
| 0016 | Bank export layout and pending rows | Withdrawn (finance moved out, 0021) |
| 0017 | Navigation and layout | Accepted, amended by 0021 (no Money) |
| 0018 | Integration tests run in CI; locally they are optional | Accepted (Postgres container with 0021) |
| 0019 | Pull request screenshots are release assets | Accepted |
| 0020 | How the API and `shared` are packaged for deploy | Superseded by 0021 |
| 0021 | Move to Cloudflare Workers + Neon Postgres; finance moved out of this app | Accepted |

---

## ADR-0001: Hosting and database

> **Superseded by [ADR-0021](#adr-0021-move-to-cloudflare-workers--neon-postgres-and-move-finance-out-of-this-app) (2026-11-10).** Kept for history. Do not build on the Azure details below.


**Decision.** Azure Static Web Apps (Free plan) serves the React app and runs the managed API (Azure Functions, HTTP triggers only). Data is in Azure SQL Database, serverless, on the free offer. We choose the setting "auto-pause until next month" when the monthly free allowance is used up, instead of "continue and bill".

**Why.** It keeps the cost at $0 as a hard cap, which matches the $0 to $2 target.

**Consequences.**
- The database auto-pauses and the first request after a pause is slow (cold start of up to about a minute). The client shows a loading state and retries once.
- If the free allowance runs out, the app is unavailable until the next month. Accept this.
- The availability check pings the static home page only, never the database, so it does not burn free seconds.
- Checked against Microsoft's documentation in November 2026: each free database gets 100,000 vCore seconds, 32 GB of data, and 32 GB of backup storage per month. Up to 10 free databases per subscription. Auto-pause after 15 idle minutes is fixed. Choosing "bill over usage" can never be switched back to auto-pause, so choose auto-pause at creation. The region of the first free database applies to all free databases in the subscription. An alert on the "Free amount remaining" metric warns before the allowance runs out (AC-OPS-02.5). Still confirm the setting in the portal after creation (AC-OPS-02.4).
- **Region (November 2026):** everything is in **Central US**. West US 2, East US 2, East US and West Europe were restricted for new SQL servers on this subscription, and Central US is the only Static Web Apps API region that accepts them, so the API and database share a region. The subscription is Pay-As-You-Go (real billing, no spending cap), so the budget alert and the free-allowance alert matter.
- **Auto-pause delay:** Microsoft's page says free-tier databases pause after 15 idle minutes, but the created database reports a 60-minute delay. Watch the "Free amount remaining" metric over the first weeks. At 60 minutes, each wake-up uses up to about 1,800 vCore seconds of the 100,000 monthly allowance, so roughly 55 wake-ups a month fit.

## ADR-0002: Data access and migrations

> **Amended by ADR-0021 (2026-11-10, implemented in MIG-02).** The driver is `pg` (node-postgres), not `mssql`. The journal is `migrations.schema_migrations`, in a schema the app role cannot see. Each migration file runs in one transaction; there is no `GO` batch splitting. Everything else (hand-written parameterized SQL only in `repositories/`, numbered journaled migrations that refuse to run if an applied file changed) stands. In the Worker (MIG-03) the same code may use Neon's serverless driver, which has the same API.


**Decision.** The API uses the `mssql` package with hand-written, parameterized SQL, only inside `repositories/`. Migrations are numbered `.sql` files (`0001_create_accounts.sql`) in `db/migrations/`, applied by a small script (`pnpm migrate`, code in `api/src/db/`) that records applied files in a journal table and refuses to run if an already-applied file changed.

**Why.** It keeps SQL visible and reviewable in a portfolio, and makes the "SQL only in repositories" rule easy to check. A query builder or ORM would add a layer to learn for little gain at this size.

**Consequences.** More typing for queries. Every repository function needs an integration test against a real database (see TESTING.md).

## ADR-0003: Database credentials and network

> **Superseded by [ADR-0021](#adr-0021-move-to-cloudflare-workers--neon-postgres-and-move-finance-out-of-this-app) (2026-11-10).** Kept for history. The two-login idea carries over (app role and admin role); the Azure firewall and Static Web Apps details do not.


**Decision.** Two database logins:
- An **app login** for the API with read and write on the app's tables only. No schema changes. Its password lives in the Static Web Apps application settings. Rotate it once a year.
- An **admin login** used only by the release workflow and by the owner locally to run migrations. It lives in the GitHub `production` environment secrets.

The free SWA plan has no fixed outbound IPs and no managed identity, so the database firewall must allow Azure services. The least-privilege app login is what limits the damage.

**Why.** Managed identity needs a paid plan (about $9 per month). We can revisit that if the app ever outgrows the free plan.

**Consequences.** One long-lived password to rotate. **Verify** whether GitHub-hosted runners can reach the database through "allow Azure services". If not, the release workflow opens a firewall rule for the runner's IP and removes it afterward (already sketched in `release.yml`).

## ADR-0004: Source control, pull requests, and manual release

> **Amended by ADR-0021 (2026-11-10).** Same release gates. The deploy target is Cloudflare (`wrangler deploy` with a scoped API token), migrations run against Neon, and there is no Azure OIDC login, Static Web Apps "Other" source, or firewall step.


**Decision.**
- The code lives in a **public GitHub repository**.
- `main` is protected: no direct pushes (also for the owner), pull requests only, the required CI checks must pass, the branch must be up to date, conversations must be resolved, squash merge only, linear history, no force pushes.
- **Merging to `main` does not deploy.** Production changes through the manual **Release** workflow (`workflow_dispatch`, `main` only). The job uses the GitHub `production` environment, which requires the owner's approval. Steps: check that CI passed on this commit (waiting up to 10 minutes if CI is still running, and stopping at once if a check failed, so a release can be started right after a merge), log in to Azure with OIDC (no stored Azure password), apply pending SQL migrations, deploy the site and API, write a summary (commit, migrations applied).
- **Migrations run before the deploy.** If a migration fails, nothing is deployed. Because the old code runs for a short time on the new schema, migrations must be backward compatible: expand first, remove later. CI fails on destructive statements unless the file has an explicit `-- allow-destructive` marker.
- The Azure Static Web Apps resource must be created **without** its built-in GitHub deployment (choose "Other", or delete the workflow Azure adds), because that workflow deploys on every push and would bypass the release gate.
- PR preview environments are off on the free plan until we confirm they cannot reach the production database.
- Commit email is the GitHub noreply address. The one-time setup is `scripts/setup-github.sh`.

**Why.** It gives a safe, reviewable path to production even for a solo project, and it is a good portfolio story. A manual release means a bad merge cannot reach real data by itself.

**Consequences.**
- Releasing needs one extra click (the approval). That is intended.
- Rolling back means releasing an earlier fix or revert. Migrations are not rolled back automatically, which is why they must be additive.
- Dependabot, secret scanning, push protection, and CodeQL are enabled (AC-FND-01.3).

## ADR-0005: Testing strategy

**Decision.** A test pyramid: most tests are unit tests, fewer are integration tests, and very few are end-to-end tests. Each acceptance criterion is proven at the lowest level that can prove it. Details are in [TESTING.md](TESTING.md).

**Why.** Unit tests are fast and pinpoint failures. The risky parts of this app (parsing, dedupe, mileage math, auth) are pure logic or database behavior, which the lower levels cover well. End-to-end tests are slow and flaky, so they cover only a few critical journeys.

**Consequences.** The layer rules in ARCHITECTURE.md are also what make unit testing cheap: services depend on repository interfaces and can be tested with in-memory fakes.

## ADR-0006: Auth testing and request protection

> **Amended by ADR-0021 (2026-11-10).** Identity comes from a signed Cloudflare Access token, not the `x-ms-client-principal` header. `ownerGuard` verifies the token (signature, audience, expiry) and compares the identity to the owner setting; it still fails closed and has no bypass. The `OWNER_ID`, `staticwebapp.config.json`, Microsoft-sign-in block, and SWA CLI emulator details below are replaced by Access policy and signed test tokens. The custom-header rule and "no rate limiting" stand.


**Decision.**
- `ownerGuard` reads only the identity header and the owner setting. There is no environment-based bypass. Tests send synthetic owner, non-owner, and missing identities.
- **Who counts as the owner (corrected November 2026).** Static Web Apps passes the API an `x-ms-client-principal` header with `identityProvider`, `userDetails` (the GitHub username), `userRoles`, and a `userId`. That `userId` is **not** the GitHub numeric ID: it is an opaque ID that is unique per app and per user, and it changes if the user is removed and re-added. The owner check therefore compares that `userId` to the `OWNER_ID` app setting, and also requires the `owner` role and the `github` provider. The username is never used, because usernames can be renamed and reused. If the owner is ever removed and re-invited, the ID changes, access fails closed, and `OWNER_ID` must be updated. After the first sign-in, the owner reads their `userId` from `/.auth/me` and stores it as `OWNER_ID`. Until it is set, every request is denied.
- The edge rules in `staticwebapp.config.json` require the `owner` role for every route except the sign-in and demo pages, and block the pre-configured Microsoft sign-in (`/.auth/login/aad` returns 404), because that provider lets any Microsoft account sign in.
- Local development and Playwright use the SWA CLI auth emulator.
- Every non-GET request must carry a custom header (and uploads use it too). Requests without it are rejected. This protects cookie-based sessions from cross-site requests.
- No rate limiting in the API for now. The edge role check plus the 403-spike alert is enough for one user.

**Why.** A test-only bypass is the most common way "fail closed" quietly stops being true.

## ADR-0007: Dates, time zones, money

**Decision.**
- Dates are plain local calendar dates (SQL `date`). One owner time zone is an app setting, used for "this week", "today", and the due-banner.
- Apple Health workouts are stored as a UTC start time plus a local date derived at import with the owner's time zone.
- Money is `decimal(12,2)` in the database and integer cents in code, converted once at the parser boundary. US dollars only.
- Weight is stored in one unit (pounds). A setting chooses pounds or kilograms for display and entry.

**Why.** It avoids off-by-one-day bugs and floating-point money errors, which are the usual sources of wrong totals.

## ADR-0008: Weekly mileage algorithm

> **Amended 2026-11-10 (owner decision, MIL-02).** The app no longer guesses a missing Friday. The original rule (interpolating a Friday value between the readings on either side, and marking such weeks "estimated") is replaced by the rule below. The original is kept at the end for history.

**Decision.** Weeks run **Friday to Thursday**. Each week has at most one **check-in**: its earliest reading. A reading taken on Saturday (or any day up to Thursday) still counts for that week; the period since the last check-in is then simply longer (8 days instead of 7). Miles for a period are the difference between two consecutive check-in readings. A week with no reading at all is **missing**: the app shows it as a gap ("no reading") and the next period covers the longer gap. Readings are always dated when they are entered (the screen never asks for a date), so a late reading counts for the week it is entered in and an old gap stays a gap; history from before the app comes in through the spreadsheet import, which carries its own dates. Nothing is interpolated or extrapolated, so there are no "estimated" weeks. Two readings on one date keep the higher value, so the result never depends on the order readings were entered.

**Why.** The owner wants the app to be forgiving about a late reading or a missed week but never to invent odometer values.

**Consequences.** Periods can be 6, 7, 8 or more days long. Charts show each period's actual miles as they are, with no scaling to 7 days, so an 8-day period is drawn as an 8-day period (owner decision, 2026-11-10). Editing a reading keeps its date; deleting one removes it for good. Needs property tests: results do not change when readings are added in a different order, and periods join end to end so days and miles add up to the first-to-last change.

**Original decision (superseded).** Each Friday got an odometer value: the actual reading if one was taken that day, otherwise linear interpolation by date between the nearest readings on either side. A week using an interpolated value was marked estimated. No extrapolation past the last reading.

## ADR-0009: Apple Health is parsed in the browser

**Decision.** The Apple Health export ZIP is opened in the browser, in a Web Worker, with a streaming unzip and a streaming XML reader. Only workouts are read. Only the workout rows are sent to the API, which validates them and saves them. Duplicates are detected with a key of start time, type, and duration.

**Why.** Exports can be hundreds of megabytes or more. Uploading them to a managed Function would hit size and time limits. Parsing in the browser also guarantees the file is never stored (hard rule 5).

**Consequences.** Memory limits on iPhone Safari are the risk. **Spike first** (before HLT-03 starts): test with a large synthetic export on a real phone. If it cannot work, fall back to "import from a computer" and say so (AC-HLT-03.7). The architecture gets a browser-side `importers/` module.

## ADR-0010: Import fingerprints and commit validation

> **Withdrawn (2026-11-10).** Finance and transaction tracking moved to a separate private repository ([ADR-0021](#adr-0021-move-to-cloudflare-workers--neon-postgres-and-move-finance-out-of-this-app)). Kept for history only; nothing here applies to this app.


**Decision.** A transaction's fingerprint is a hash of account, posted date, amount, and cleaned description, plus an **occurrence number** (1 for the first identical row in that account on that date, 2 for the second, and so on). The unique index covers the fingerprint (which includes the occurrence). The preview marks a row duplicate when its fingerprint already exists.

The commit call receives rows from the browser, so it does not trust them: it validates the schema, caps the row count (5,000), recomputes fingerprints, and rejects unknown categories or accounts.

**Why.** Bank rows have no unique ID, and two identical purchases on one day are real (AC-FIN-04.3). Without an occurrence number, either they collapse into one or the unique index rejects the import.

**Known gap.** If a bank changes a description between exports it will look new. Pending rows, the most common cause, are skipped on import (ADR-0016). Imports can be undone (FIN-09) to recover.

## ADR-0011: Income and transfers are category types

> **Withdrawn (2026-11-10).** Finance and transaction tracking moved to a separate private repository ([ADR-0021](#adr-0021-move-to-cloudflare-workers--neon-postgres-and-move-finance-out-of-this-app)). Kept for history only; nothing here applies to this app.


**Decision.** Every category has a type: **expense**, **income**, or **transfer**. "Spent" counts expenses only. This is in the MVP because AC-FIN-07.4 needs it. Automatic detection of transfers between own accounts and splitting a transaction stay in *Next*.

## ADR-0012: Frontend and tooling stack

> **Amended by ADR-0021 (2026-11-10).** The Azure Functions Node v4 model is replaced by Hono on a Cloudflare Worker. Recharts mention of FIN-07.5 below referred to a retired criterion; chart accessibility now applies to mileage and health charts (AC-MIL-03.4, AC-HLT-01.2).


**Decision.** pnpm workspaces (`web`, `api`, `shared`). React, TypeScript, Vite, React Router, TanStack Query, Recharts, Tailwind. zod schemas in `shared/` for every request and response. ESLint and Prettier. `dependency-cruiser` enforces the layer rules. Azure Functions Node programming model v4.

**Why.** These are common, well documented, and recognizable to reviewers. Recharts is quick to build with; its accessibility (text alternatives, colors) is our responsibility and is covered by AC-FIN-07.5.

**Consequences.** Low-stakes choices. Swap a library if it gets in the way, and add a new entry.

## ADR-0013: Public repo, license, and planning documents

> **Amended by ADR-0021 (2026-11-10).** The "primary bank's CSV format" wording no longer applies; there is no bank data in this project.


**Decision.** MIT license. The planning documents are public, so they use generic wording: "a child", "charitable giving", "the primary bank's CSV format", and the wireframes use "Example Bank". Real names, amounts, bank, and dates stay out of the repo.

**Why.** Hard rule 1. The spec describes how the app is used, not who the owner is.

## ADR-0014: Demo parity

**Decision.** `demoApi.ts` and `client.ts` implement one TypeScript interface. A shared contract test suite runs against both, so the demo cannot drift. Every feature story adds its methods to both. A page-level test suite runs the real pages against `demoApi`, with no network.

## ADR-0015: Product choices from the spec's open questions

**Decision.**
- Mood and sleep logging stay in *Next*, not the first release.
- Look: calm and professional, in forest green (primary #2F6B4F, full palette in wireframes-suite.html). Light, dark, and system themes are offered.
- Domain: the free Azure URL for now. Revisit before sharing the demo widely.
- AI-assisted insights: no. The privacy cost is not worth it.
- Family journal: free text, with tags later. The module itself is *Next*.
- Real column layout of the primary bank's export: confirmed from a redacted sample, see ADR-0016. Only column names and fake rows may ever be committed.

## ADR-0016: Bank export layout and pending rows

> **Withdrawn (2026-11-10).** Finance and transaction tracking moved to a separate private repository ([ADR-0021](#adr-0021-move-to-cloudflare-workers--neon-postgres-and-move-finance-out-of-this-app)). Kept for history only; nothing here applies to this app.


**Context.** Redacted samples of the primary bank's checking and credit-card downloads (checked November 2026) showed the real layout. The bank's own download is a **CSV with a header row** (DATE, DESCRIPTION, AMOUNT, CHECK #, STATUS), every field in double quotes except that an empty CHECK # may be written as nothing at all (`,,`), dates as text in MM/DD/YYYY, amounts as decimal text with two places, signed (negative is money out, the same for both account types), a STATUS of Posted or Pending, and newest first. Checking and credit card use the same layout. The owner also keeps an Excel copy made by converting that CSV; it gains a merged title row naming the account, stores dates as text and amounts as numbers, and declares a sheet range far past the last data row. One checking row in the CSV sample had only 4 fields instead of 5 (probably a redaction artifact, but a real file could do the same).

**Decision.**
- The importer accepts **.csv and .xlsx**. The spreadsheet reader already needed for the mileage import (MIL-04) is reused. Limits: 5 MB and 5,000 rows, and a cap on uncompressed size, because an .xlsx is a zip file.
- Layout detection finds the header row by its column names (case-insensitive), so an optional title row above it (as in the Excel copy) is skipped. **A file with no header row is not supported in the MVP**: no real sample needs it. The configurable column mapping is where it would be added later. Trailing empty rows are ignored.
- The CSV reader follows standard quoting. Quoted and unquoted empty fields both mean "empty". It tolerates a UTF-8 byte-order mark and Windows line endings. A row with the wrong number of fields is **rejected with its row number** and the rest still import (AC-FIN-02.7). The parser never guesses which column is missing.
- The title row may suggest which account a file belongs to, but its digits are dropped like any account number (hard rule 5 and AC-FIN-02.5). The same goes for file names: nothing is taken from them.
- Dates are parsed from text with an explicit format, never guessed. Amounts from CSV text are parsed digit by digit into integer cents with no floating point (thousands separators are tolerated). Amounts from spreadsheet cells, which arrive as a mix of whole numbers and decimals, are rounded to cents.
- **Pending rows are skipped** and counted in the preview. A pending row can change date and text when it posts, so importing it would create a duplicate later. The cost is that very recent purchases appear a day or two late.
- The CHECK # column is read but not stored for now. It may help with giving later.

**Status.** Settled. The .xlsx is a conversion of the bank's CSV, and both are supported. Still unknown: whether large amounts ever contain thousands separators or whether other account types (savings, loans) use a different layout. The parser reports an unrecognized layout clearly instead of guessing.

## ADR-0017: Navigation and layout

> **Amended by ADR-0021 (2026-11-10).** The Money destination, transaction editing sheet/panel, CSV bank import rule, and "Upload CSV" quick action are removed. Current navigation: **Mobile:** bottom tab bar with five tabs, Home, Giving, Health, Car, More (Settings inside More). **Tablet:** icon rail with Home, Giving, Health, Car, More. **Desktop:** sidebar with Home, Giving, Health, Car, Settings. Quick actions: add weight, add workout, log odometer, add giving. The rest of this entry is historical.


**Decision.** Decided while reviewing [wireframes-suite.html](wireframes-suite.html).
- **Destinations:** Home, Money, Giving, Health, Car, Settings. **Giving is its own feature**, not part of Money's transaction handling.
- **Mobile (under 640 px):** a bottom tab bar with five tabs: Home, Money, Health, Car, More. Giving and Settings are inside More (Giving first). A sixth tab would be cramped.
- **Tablet (640 to 1023 px):** a left icon rail with labels: Home, Money, Giving, Health, Car, More.
- **Desktop (1024 px and up):** a left sidebar with all six destinations. The active group expands to show its pages.
- **Editing a transaction:** a bottom sheet below 1024 px, including on tablet, and a side panel at 1024 px and up (AC-FIN-05.4).
- **CSV bank import** is desktop only. No "remind me" shortcut on smaller screens.
- **Quick actions** on the dashboard: add weight, add workout, log odometer everywhere. Upload CSV on desktop only.
- **Accent:** forest green. **Theme:** light, dark, or system (AC-SET-01.3).

**Why.** It keeps the phone bar at the usual maximum of five tabs while giving Giving its own place where there is room. If Giving turns out to be used often on the phone, promoting it to a sixth tab or swapping it with Car is a small change.

## ADR-0018: Integration tests run in CI; locally they are optional

> **Amended by ADR-0021 (2026-11-10).** The database is Postgres, not SQL Server. The Postgres image is small and runs natively on Apple Silicon, so the "x86 only, slow locally" reason below mostly goes away. CI still always runs integration tests and `CI=true` still turns a skip into a failure. Revisit making them required locally once the Postgres container is in place.


**Decision.** Integration tests that need SQL Server run in a Testcontainers container, one container per run. CI always runs them. On a developer machine they run only if Docker is available, and are skipped with a warning if not. The decision logic (which migrations to run, change detection) is a pure module with unit tests, so the important rules are checked on every machine.

**Why.** The SQL Server image is x86 only, so Apple Silicon needs slow emulation, and Docker is not installed on the owner's Mac. Requiring it locally would slow every change for little gain, while CI on `ubuntu-latest` has Docker and runs the full set before any merge.

**Consequences.** A database bug can first show up in CI. Setting `CI=true` turns the skip into a failure, so CI cannot silently skip. Revisit if a local Docker setup becomes convenient.

Migration code lives in `api/src/db/` (the only non-repository place allowed to import `mssql`), the API's app login is the `db_datareader` + `db_datawriter` user from `docs/azure-setup.md`, and the integration test creates the same kind of login to prove it cannot change the schema.

## ADR-0019: Pull request screenshots are release assets, added by the agent

**Decision.** Screenshots for a pull request are taken, uploaded, and attached by `scripts/pr-screenshots.mjs` (`pnpm pr-screenshots`), with no manual step for the owner.
- It builds `main` (before) and the branch (after), serves each with the Static Web Apps CLI using a synthetic owner identity, and screenshots each named screen at 360, 768, and 1280 px.
- Images are uploaded to one prerelease tagged `pr-screenshots`, named `pr-<number>-<screen>-<width>-<before|after>.png`, and the Screenshots table in the pull request is rewritten with links. A screen missing on `main` is marked "new screen".
- The workflow `.github/workflows/pr-screenshots-cleanup.yml` deletes a pull request's assets (by the `pr-<number>-` prefix) when the pull request merges or closes.
- AGENTS.md makes the agent responsible for getting a pull request fully ready, so the owner only reviews.

**Why.** GitHub has no supported API for attaching images to a description, and AGENTS.md forbids image files in the repo. Release assets are not files in the repo or its history, `gh` can upload them, and they can be deleted. Rejected: an orphan branch of images (puts image files in the repo), CI artifacts (need a login and do not show inline), browser automation of drag and drop (undocumented and fragile), and an outside image host (sends content to a third party).

**Consequences.** The repo is public, so the images are public. That is acceptable only because they show synthetic demo data, and the script never serves anything else. Running the script creates a release and tag if they do not exist. The `Release` workflow is manual only, so it is not triggered. If the cleanup workflow fails, old images stay until deleted by hand with `gh release delete-asset pr-screenshots <name>`.

## ADR-0020: How the API and `shared` are packaged for deploy

> **Superseded by [ADR-0021](#adr-0021-move-to-cloudflare-workers--neon-postgres-and-move-finance-out-of-this-app) (2026-11-10).** Kept for history. The Worker is bundled by Wrangler, so the staged-folder packaging and Oryx workarounds no longer apply. The idea of testing the built output (`verify-api-bundle`) should carry over.


**Decision.**
- `shared` stays plain TypeScript for development: `main` points at `src/index.ts`, so Vite, Vitest, and `tsc -p .` need no build step. It also has `tsconfig.build.json` (NodeNext, with declarations) and a `publishConfig` that points at the compiled `dist/`.
- `@life-tracker/shared` is a runtime `dependency` of the API in development, because compiled API code imports it. It is not installed as a package in the deployed folder (see below).
- `scripts/stage-api.mjs` builds the deploy folder `.stage/api`: `pnpm deploy --prod` with the hoisted layout (a flat `node_modules` of real folders that survives being zipped), and no source or config files. `shared` is copied, compiled, to `dist/_shared`, and the script rewrites `from "@life-tracker/shared"` in the compiled files to a relative path. The staged `package.json` has no build script and no dependency on `shared`.
- `scripts/verify-api-bundle.mjs` loads every compiled module in that folder with plain Node. CI and the Release workflow both run it, so a build that only works under Vitest cannot reach production.
- The Release workflow deploys prebuilt folders (`web/dist` and `.stage/api`) with `skip_app_build` and no `api_build_command`, so what CI verified is what ships. The deploy client then cannot detect the API language, so the step sets `FUNCTION_LANGUAGE=node` and `FUNCTION_LANGUAGE_VERSION=22`. (`skip_api_build` is not an input of the v1 action.) Setting the language makes the deploy client run an Oryx build on `.stage/api`: `npm install --production` inside a hidden `.oryx_prod_node_modules` folder (with only `package.json` copied in), a copy into `node_modules`, a plain `npm install` (which deletes any package `package.json` does not list), and `npm run build` if a build script exists. Keeping `shared` in `node_modules` failed three ways in three Release runs: as a `file:` dependency it became a symlink that clashed with the real folder, left out of `package.json` it was deleted, and as a relative `file:` path it did not resolve inside the hidden folder. So `shared` ships as plain files in `dist/_shared`, imported by relative path, and Oryx has nothing to resolve, copy, prune or build.
- The migration CLI is not compiled into the API build. It runs from source with `pnpm migrate`.

**Why.** The first handler that imported `shared` crashed under Node, and nothing in CI ran the built output. A prebuilt, verified folder removes the difference between what is tested and what is deployed, and avoids Azure's Oryx build guessing at a pnpm workspace.

**Consequences.** The staged folder is about 70 MB, mostly the `mssql` dependency tree. Watch it against the Static Web Apps API size limit (**Verify** on the first release). If it gets close, bundle the API with a bundler instead.

## ADR-0021: Move to Cloudflare Workers + Neon Postgres, and move finance out of this app

**Status.** Accepted, 2026-11-10. The full write-up and open items are in the Linear document "ADR-0021: Move to Cloudflare Workers + Neon Postgres". Work is tracked in the Linear milestone "0. Platform migration" (MIG-01 to MIG-07).

**Context.** The app ran on Azure Static Web Apps (Free), Azure Functions, and an Azure SQL free-offer database. Developer experience was poor: the first Release run failed at the Static Web Apps deploy step, serverless auto-pause made the first request slow, GitHub runners needed a firewall workaround, and local development relied on an Azure-specific emulator and header. Separately, the owner decided that bank transactions must not live on an internet-hosted app at all, even encrypted.

**Decision.**

*Scope.* Finance and transaction tracking is removed from this project and handled in a separate private repository. Giving (regular gifts and special contributions) stays. There are no accounts, categories, rules, bank CSV import, or transaction tables here. FIN-01 to FIN-09 are canceled. ADR-0010, 0011 and 0016 are withdrawn. Navigation has no Money destination (see ADR-0017 note).

*Platform.*

| Concern | Choice |
|---|---|
| Web hosting | Cloudflare Workers with static assets (React/Vite build) |
| API | Hono on the same Worker, `/api/*`, TypeScript |
| Database | Neon Postgres (free plan, scale to zero) |
| Login | Cloudflare Access with GitHub as identity provider and an owner-only policy. `ownerGuard` also verifies the signed Access token in the API. |
| Migrations | Numbered `.sql` files via `pnpm migrate`, journaled, admin role only (ADR-0002 model) |
| Database roles | App role (read/write, no schema changes) and admin role (migrations only, GitHub `production` secret) |
| Logging | Workers Logs through the existing allow-listed logger; optional Sentry free tier |
| Release | Same manual, approval-gated workflow; `wrangler deploy` with a scoped Cloudflare API token |
| Tests | Integration tests on a Postgres Testcontainer |

**Why.** One tool (`wrangler`) for local dev, preview and deploy. Owner-only access is still enforced at the edge and again in the API. Neon wakes quickly and offers branching. Total cost stays at about $0.

**Alternatives rejected.** Vercel Hobby + Neon: good developer experience, but no edge identity layer, so login would be application code, and Hobby is non-commercial only. Supabase: free projects pause after a week of inactivity and Pro ($25 per month) breaks the $0 cap. Staying on Azure: the pain is structural.

**Consequences and risks (Verify).**
- **Worker CPU time.** The free plan caps CPU per request, so spreadsheet parsing (MIL-04) happens in the browser and only validated rows are sent, as in ADR-0009. Check current limits in MIG-03.
- **Neon free plan.** Limited compute hours, 0.5 GB storage, and a short restore window. Confirm current numbers on neon.com/pricing in MIG-02. Mitigation: `pg_dump` export procedure (OPS-02).
- **No IP allow-list on the Neon free plan.** Security rests on TLS, long random credentials, and least-privilege roles. Credentials live only in Cloudflare and GitHub secrets.
- **iOS PWA sign-in through Access** is the main unknown. Test early (AC-MIG-04.7).
- **Cloudflare Access free tier.** Confirm the user limit and session length (MIG-04).
- Pricing figures were taken from third-party summaries on 2026-11-10. Confirm on the official pages.
- Rewrite needed for `ownerGuard`, handler wiring, the SQL repositories, the Release workflow, the logger sink, and the setup docs. Until MIG-02 to MIG-07 land, the code in the repo still targets Azure.

**Order of work.** MIG-01 (docs and scope) then MIG-02 (database), MIG-03 (Worker API), MIG-04 (Access), MIG-05 (release), MIG-06 (logging), MIG-07 (decommission Azure). Resume FND-04, FND-05, SET-03, and Mileage work after MIG-05 passes.

## ADR-0022: Spreadsheet reader for the mileage import

**Decision.** `web/src/importers/` reads the owner's mileage history in the browser (MIL-04). CSV goes through a small in-house reader (standard quoting, byte-order mark, Windows line endings). `.xlsx` goes through the `read-excel-file` package (MIT, browser build). The sheet's rows are turned into readings by a pure function (`mileageGrid.ts`) that finds the header row by its column names, reads Date (ISO, US month/day/year, or a date cell) and Start Miles, ignores the sheet's Miles Driven except to compare, and reports a bad row by its row number while the rest still import. Limits follow ADR-0016: 5 MB, 5,000 rows, and 50 MB uncompressed (checked from the zip's central directory before parsing). `write-excel-file` is a dev dependency used only to build `.xlsx` test fixtures in code (no spreadsheet is ever committed).

**Why.** Parsing in the browser keeps the file off the server (hard rule 5) and off the Worker's CPU limit (ADR-0009, ADR-0021). `read-excel-file` is small, maintained, MIT-licensed and reads date cells as dates. SheetJS `xlsx` on npm is no longer published there. Writing our own `.xlsx` reader would mean hand-parsing zip, shared strings and date styles for no gain.

**Duplicates.** A reading is a duplicate when a stored reading has the same date and the same miles. The server skips duplicates in one statement and also within one request, so importing the same file twice adds nothing and the unique-index change is not needed (an old build that logs two equal readings on one day keeps working).

**Miles Driven.** A row's Miles Driven is read as the miles driven in the week that starts on that row (the next Start Miles minus this one). This is the assumption that decides which rows are flagged; confirm it against the real sheet.

**Note.** ADR-0016 (bank layout) is withdrawn, so no finance import will reuse this reader here.
