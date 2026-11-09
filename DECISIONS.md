# Decisions (ADRs)

One entry per decision that is costly to reverse. Each says what we chose, why, and what it costs us. To change a decision, add a new entry that supersedes the old one. Do not delete history.

**Status values:** *Accepted* (agreed, build on it) and *Verify* (agreed, but it rests on a cloud-provider fact that must be checked in the portal or the provider's docs before we depend on it).

| # | Decision | Status |
|---|---|---|
| 0001 | Hosting and database | Accepted |
| 0002 | Data access and migrations | Accepted |
| 0003 | Database credentials and network | Accepted, verify firewall behavior |
| 0004 | Source control, pull requests, and manual release | Accepted, verify SWA setup |
| 0005 | Testing strategy | Accepted |
| 0006 | Auth testing and request protection | Accepted |
| 0007 | Dates, time zones, money | Accepted |
| 0008 | Weekly mileage algorithm | Accepted |
| 0009 | Apple Health is parsed in the browser | Accepted, spike first |
| 0010 | Import fingerprints and commit validation | Accepted |
| 0011 | Income and transfers are category types | Accepted |
| 0012 | Frontend and tooling stack | Accepted |
| 0013 | Public repo, license, and planning documents | Accepted |
| 0014 | Demo parity | Accepted |
| 0015 | Product choices from the spec's open questions | Accepted |
| 0016 | Bank export layout and pending rows | Accepted |
| 0017 | Navigation and layout | Accepted |
| 0018 | Integration tests run in CI; locally they are optional | Accepted |
| 0019 | Pull request screenshots are release assets | Accepted |
| 0020 | How the API and `shared` are packaged for deploy | Accepted |

---

## ADR-0001: Hosting and database

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

**Decision.** The API uses the `mssql` package with hand-written, parameterized SQL, only inside `repositories/`. Migrations are numbered `.sql` files (`0001_create_accounts.sql`) in `db/migrations/`, applied by a small script (`pnpm migrate`, code in `api/src/db/`) that records applied files in a journal table and refuses to run if an already-applied file changed.

**Why.** It keeps SQL visible and reviewable in a portfolio, and makes the "SQL only in repositories" rule easy to check. A query builder or ORM would add a layer to learn for little gain at this size.

**Consequences.** More typing for queries. Every repository function needs an integration test against a real database (see TESTING.md).

## ADR-0003: Database credentials and network

**Decision.** Two database logins:
- An **app login** for the API with read and write on the app's tables only. No schema changes. Its password lives in the Static Web Apps application settings. Rotate it once a year.
- An **admin login** used only by the release workflow and by the owner locally to run migrations. It lives in the GitHub `production` environment secrets.

The free SWA plan has no fixed outbound IPs and no managed identity, so the database firewall must allow Azure services. The least-privilege app login is what limits the damage.

**Why.** Managed identity needs a paid plan (about $9 per month). We can revisit that if the app ever outgrows the free plan.

**Consequences.** One long-lived password to rotate. **Verify** whether GitHub-hosted runners can reach the database through "allow Azure services". If not, the release workflow opens a firewall rule for the runner's IP and removes it afterward (already sketched in `release.yml`).

## ADR-0004: Source control, pull requests, and manual release

**Decision.**
- The code lives in a **public GitHub repository**.
- `main` is protected: no direct pushes (also for the owner), pull requests only, the required CI checks must pass, the branch must be up to date, conversations must be resolved, squash merge only, linear history, no force pushes.
- **Merging to `main` does not deploy.** Production changes through the manual **Release** workflow (`workflow_dispatch`, `main` only). The job uses the GitHub `production` environment, which requires the owner's approval. Steps: check that CI passed on this commit, log in to Azure with OIDC (no stored Azure password), apply pending SQL migrations, deploy the site and API, write a summary (commit, migrations applied).
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

**Decision.** Weeks run **Friday to Thursday**. For each Friday in the history, compute an odometer value: the actual reading if one was taken that day, otherwise linear interpolation by date between the nearest readings on either side. Miles for a week are the difference between consecutive Friday values. A week is marked **estimated** if either of its two Friday values was interpolated. Readings on any date (not only Fridays) take part in the interpolation. No extrapolation past the last reading.

**Why.** One rule covers skipped Fridays, off-day entries, and backfills. It also matches how the spreadsheet is laid out.

**Consequences.** Needs property tests: spread miles sum to the total between readings, and results do not change when readings are added in a different order.

## ADR-0009: Apple Health is parsed in the browser

**Decision.** The Apple Health export ZIP is opened in the browser, in a Web Worker, with a streaming unzip and a streaming XML reader. Only workouts are read. Only the workout rows are sent to the API, which validates them and saves them. Duplicates are detected with a key of start time, type, and duration.

**Why.** Exports can be hundreds of megabytes or more. Uploading them to a managed Function would hit size and time limits. Parsing in the browser also guarantees the file is never stored (hard rule 5).

**Consequences.** Memory limits on iPhone Safari are the risk. **Spike first** (before HLT-03 starts): test with a large synthetic export on a real phone. If it cannot work, fall back to "import from a computer" and say so (AC-HLT-03.7). The architecture gets a browser-side `importers/` module.

## ADR-0010: Import fingerprints and commit validation

**Decision.** A transaction's fingerprint is a hash of account, posted date, amount, and cleaned description, plus an **occurrence number** (1 for the first identical row in that account on that date, 2 for the second, and so on). The unique index covers the fingerprint (which includes the occurrence). The preview marks a row duplicate when its fingerprint already exists.

The commit call receives rows from the browser, so it does not trust them: it validates the schema, caps the row count (5,000), recomputes fingerprints, and rejects unknown categories or accounts.

**Why.** Bank rows have no unique ID, and two identical purchases on one day are real (AC-FIN-04.3). Without an occurrence number, either they collapse into one or the unique index rejects the import.

**Known gap.** If a bank changes a description between exports it will look new. Pending rows, the most common cause, are skipped on import (ADR-0016). Imports can be undone (FIN-09) to recover.

## ADR-0011: Income and transfers are category types

**Decision.** Every category has a type: **expense**, **income**, or **transfer**. "Spent" counts expenses only. This is in the MVP because AC-FIN-07.4 needs it. Automatic detection of transfers between own accounts and splitting a transaction stay in *Next*.

## ADR-0012: Frontend and tooling stack

**Decision.** pnpm workspaces (`web`, `api`, `shared`). React, TypeScript, Vite, React Router, TanStack Query, Recharts, Tailwind. zod schemas in `shared/` for every request and response. ESLint and Prettier. `dependency-cruiser` enforces the layer rules. Azure Functions Node programming model v4.

**Why.** These are common, well documented, and recognizable to reviewers. Recharts is quick to build with; its accessibility (text alternatives, colors) is our responsibility and is covered by AC-FIN-07.5.

**Consequences.** Low-stakes choices. Swap a library if it gets in the way, and add a new entry.

## ADR-0013: Public repo, license, and planning documents

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

**Decision.**
- `shared` stays plain TypeScript for development: `main` points at `src/index.ts`, so Vite, Vitest, and `tsc -p .` need no build step. It also has `tsconfig.build.json` (NodeNext, with declarations) and a `publishConfig` that points at the compiled `dist/`.
- `@life-tracker/shared` is a runtime `dependency` of the API, not a dev dependency, because compiled API code imports it.
- `scripts/stage-api.mjs` builds the deploy folder `.stage/api`: `pnpm deploy --prod` with the hoisted layout (a flat `node_modules` of real folders that survives being zipped), no source or config files, and `shared` switched to its compiled output. `pnpm deploy` does not apply `publishConfig`, so the script does it.
- `scripts/verify-api-bundle.mjs` loads every compiled module in that folder with plain Node. CI and the Release workflow both run it, so a build that only works under Vitest cannot reach production.
- The Release workflow deploys prebuilt folders (`web/dist` and `.stage/api`) with `skip_app_build` and no `api_build_command`, so what CI verified is what ships. The deploy client then cannot detect the API language, so the step sets `FUNCTION_LANGUAGE=node` and `FUNCTION_LANGUAGE_VERSION=22`. (`skip_api_build` is not an input of the v1 action.) Setting the language makes the deploy client run an Oryx build on `.stage/api` anyway (`npm install --omit=dev`, then copy into `node_modules`). `stage-api.mjs` therefore removes `@life-tracker/shared` from the staged `package.json` (pnpm writes it as a build-machine `file:` path, which Oryx turned into a symlink that clashed with the real folder). `shared` stays in `node_modules`, compiled.
- The migration CLI is not compiled into the API build. It runs from source with `pnpm migrate`.

**Why.** The first handler that imported `shared` crashed under Node, and nothing in CI ran the built output. A prebuilt, verified folder removes the difference between what is tested and what is deployed, and avoids Azure's Oryx build guessing at a pnpm workspace.

**Consequences.** The staged folder is about 70 MB, mostly the `mssql` dependency tree. Watch it against the Static Web Apps API size limit (**Verify** on the first release). If it gets close, bundle the API with a bundler instead.
