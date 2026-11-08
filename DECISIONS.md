# Decisions (ADRs)

One entry per decision that is costly to reverse. Each says what we chose, why, and what it costs us. To change a decision, add a new entry that supersedes the old one. Do not delete history.

**Status values:** *Accepted* (agreed, build on it) and *Verify* (agreed, but it rests on a cloud-provider fact that must be checked in the portal or the provider's docs before we depend on it).

| # | Decision | Status |
|---|---|---|
| 0001 | Hosting and database | Accepted, verify free-offer limits |
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

---

## ADR-0001: Hosting and database

**Decision.** Azure Static Web Apps (Free plan) serves the React app and runs the managed API (Azure Functions, HTTP triggers only). Data is in Azure SQL Database, serverless, on the free offer. We choose the setting "auto-pause until next month" when the monthly free allowance is used up, instead of "continue and bill".

**Why.** It keeps the cost at $0 as a hard cap, which matches the $0 to $2 target.

**Consequences.**
- The database auto-pauses and the first request after a pause is slow (cold start of up to about a minute). The client shows a loading state and retries once.
- If the free allowance runs out, the app is unavailable until the next month. Accept this.
- The availability check pings the static home page only, never the database, so it does not burn free seconds.
- **Verify** the current free-offer limits and the exhaustion setting in the Azure portal before relying on this.

## ADR-0002: Data access and migrations

**Decision.** The API uses the `mssql` package with hand-written, parameterized SQL, only inside `repositories/`. Migrations are numbered `.sql` files (`0001_create_accounts.sql`) in `db/migrations/`, applied by a small script (`scripts/migrate`) that records applied files in a journal table and refuses to run if an already-applied file changed.

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

**Known gap.** If a bank changes a description between exports (for example a pending row becomes posted), it will look new. Imports can be undone (FIN-09) to recover.

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
- Look: calm fintech. One teal or blue accent, exact shade chosen during SET-02.
- Domain: the free Azure URL for now. Revisit before sharing the demo widely.
- AI-assisted insights: no. The privacy cost is not worth it.
- Family journal: free text, with tags later. The module itself is *Next*.
- Real column layout of the primary bank's CSV: still to confirm from a real download (redacted). Tracked in SPEC.md open questions. Only column names and one fake row may ever be shared or committed.
