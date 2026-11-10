# Backlog for Linear (Draft v0.2)

Project name: **Life Tracker**. Use the existing Linear team (key `ALE`). Do not create teams. Milestones (not issues) hold the phases from SPEC.md section 12, so they don't use up the 250-issue allowance.

**Created in Linear on 2026-11-08:** project Life Tracker, 6 milestones, and 34 issues (ALE-5 to ALE-38, numbered in the order they were created, not the order to work on them). The 4 archived onboarding issues (ALE-1 to ALE-4) also exist.

**Changed on 2026-11-10 (ADR-0021):** finance and transaction tracking moved to a separate private repository, so FIN-01 to FIN-09 (ALE-19 to ALE-27) are canceled. A new milestone "0. Platform migration" adds MIG-01 to MIG-07 (ALE-39 to ALE-45) for the move to Cloudflare Workers and Neon Postgres. In total 45 of the 250 free-plan issues are used. When a criterion changes here, change it in the Linear issue too.

## Sizing rules

- One issue is one **vertical slice**: a user-visible capability that works end to end (screen, API, database) and can be demoed. Target 1 to 3 days of work.
- No sub-issues, because each one counts toward the 250. Use the acceptance criteria list as the checklist.
- Split an issue if it has more than about 8 acceptance criteria. Merge issues if one cannot be demoed without the other.
- Only MVP work is in Linear for now: **32 active issues** (see the count at the end). "Next" and "Later" features stay in SPEC.md and become issues when they are about to start. That leaves a large margin under 250.

## Standing requirements for every story

These apply to all stories and are not repeated as criteria on each one:

- The work merges through a pull request with green CI (AGENTS.md, ADR-0004).
- New API methods are added to both `client.ts` and `demoApi.ts`. The shared contract test (AC-DEM-01.5) fails if one is missing.
- Layout is checked at mobile, tablet, and desktop widths.
- Tests follow TESTING.md: each criterion is proven at the lowest level that can prove it.

## Acceptance criteria IDs

Format: `AC-<AREA>-<NN>.<n>`, for example `AC-MIL-03.2`.

- `<AREA>-<NN>` is the story key, and it is the prefix of the Linear issue title (`MIL-03: Mileage stats and graphs`). Using our own key means the ID never depends on Linear's numbering.
- IDs are never reused or renumbered. A removed criterion stays in the list as `- AC-X-NN.n (retired): reason`.
- Tests include the ID in the test name. See AGENTS.md.

Areas: MIG platform migration, FND foundation, DEM demo, MIL mileage, GIV giving, HLT health, DSH dashboard, SET settings, OPS operations. FIN (finance) is retired: see Milestone 3.

## Milestones

Story keys never change, even when a story moves to a different milestone.

0. **Platform migration:** MIG-01 to MIG-07 (7 issues). Move from Azure to Cloudflare Workers + Access and Neon Postgres before more feature work (ADR-0021). Order: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07.
1. **Foundation:** FND-01 to FND-06, SET-03, OPS-01, DEM-01 (9 issues). Logging, security headers, and the demo skeleton are here because their rules apply from the first handler and the first screen. Suggested order: FND-02 and FND-05 first, to settle the iOS PWA sign-in risk early.
2. **Mileage MVP:** MIL-01 to MIL-04, OPS-02 (5). OPS-02 (usage alerts, restore test, export procedure) comes before any real data is loaded.
3. **(Removed) Finance MVP:** FIN-01 to FIN-09 are retired and canceled in Linear. Finance moved to a separate private repository (ADR-0021).
4. **Giving MVP:** GIV-01 to GIV-03 (3)
5. **Health MVP:** HLT-01 to HLT-04 (4). Do the Apple Health memory spike before HLT-03 (ADR-0009).
6. **Dashboard and polish:** DSH-01, SET-01, SET-02, DEM-02 (4)

## Change log

### v0.3 (2026-11-10)

- Finance removed: FIN-01 to FIN-09 retired. Money destination removed from navigation (FND-04). Dashboard, settings, security, and demo stories updated (DSH-01, SET-01, SET-03, DEM-02).
- New milestone 0 with MIG-01 to MIG-07 for the move to Cloudflare + Neon.
- FND-03, FND-05, FND-06, OPS-01, OPS-02 reworded for Postgres and Cloudflare. Their Azure-specific criteria are retired and replaced by MIG stories, not renumbered.

### v0.2 (from v0.1)

- FND-01: AC-FND-01.1 retired (push to `main` no longer deploys). Replaced by FND-06. Added criteria for protected `main`.
- New stories: FND-06 (manual release), FIN-08 (accounts and manual entry), FIN-09 (undo an import).
- Moved to earlier milestones: SET-03, OPS-01, DEM-01 to Foundation; OPS-02 to Mileage.
- FIN: category types (income, expense, transfer), rule order, fingerprint occurrence numbers, commit validation, merchant cleanup.
- HLT-03: Apple Health parsed in the browser.
- MIL-02: Friday-to-Thursday weeks with interpolation.
- FND-02: custom-header request protection and no auth bypass. FND-03: separate admin login, migration journal. FND-04: tablet icon rail approved, and Giving is its own destination (inside More on phone).
- Wording made generic (no bank name, no personal details).

---

## Milestone 0: Platform migration

Move from Azure (Static Web Apps, Functions, Azure SQL) to Cloudflare Workers + Access and Neon Postgres, before more feature work. Decision and risks: ADR-0021. Existing FND and OPS criteria that name Azure keep their IDs (tests reference them) and are reworded as each MIG story lands.

### MIG-01: ADR-0021 and repo scope cleanup
**Story:** As the owner, I want the decision recorded and finance scope removed from the repo, so that docs match the plan before code changes.
- AC-MIG-01.1: `DECISIONS.md` has ADR-0021 (Cloudflare + Neon), and ADR-0001, 0003, 0006, 0012, 0020 are marked superseded or amended where they name Azure.
- AC-MIG-01.2: SPEC.md, BACKLOG.md, ARCHITECTURE.md, TESTING.md and AGENTS.md no longer describe transactions, accounts, categories, rules, bank CSV import, or Money. ADR-0010, 0011, 0016 are marked withdrawn.
- AC-MIG-01.3: ADR-0017 and `wireframes-suite.html` show five destinations (Home, Giving, Health, Car, More/Settings) with no Money.
- AC-MIG-01.4: A repo scan finds no bank-transaction code, schema, fixtures, or docs (see AC-SET-03.3).

### MIG-02: Neon database, roles, and migrations port
**Story:** As the developer, I want the schema and data layer on Neon Postgres, so that all SQL still lives in one place.
- AC-MIG-02.1: A Neon project exists (single region near the Worker) with two roles: an app role that can read and write app tables but not change the schema, and an admin role used only for migrations.
- AC-MIG-02.2: Existing numbered migrations are ported from T-SQL to Postgres (for example `numeric(12,2)` for money), applied by `pnpm migrate`, and recorded in the journal table. No finance tables are created.
- AC-MIG-02.3: `mssql` is removed. A Postgres driver is used only inside `db/` and `repositories/` (dependency-cruiser rules still pass).
- AC-MIG-02.4: Integration tests run against a Postgres Testcontainer in CI (ADR-0018).
- AC-MIG-02.5: The destructive-migration CI check (AC-FND-06.5) still works on Postgres syntax.
- AC-MIG-02.6: Connection strings live only in Cloudflare secrets and the GitHub `production` environment. None are in the repo.
- AC-MIG-02.7: A cold-start query after idle completes in well under 5 seconds (measured once, recorded in `docs/manual-checks.md`). (Manual check.)

### MIG-03: API on Cloudflare Workers
**Story:** As the developer, I want the API to run as a Cloudflare Worker, so that I can run and deploy it with one tool.
- AC-MIG-03.1: The Azure Functions handlers are replaced by Worker routes (Hono or equivalent). Layers (handler, service, repository) and dependency-cruiser rules are unchanged.
- AC-MIG-03.2: The Worker serves the built web app as static assets and routes `/api/*` to the API.
- AC-MIG-03.3: `requestGuard` (custom header on non-GET) works as before.
- AC-MIG-03.4: `wrangler dev` runs web and API locally against a local or branch Neon database.
- AC-MIG-03.5: A health route returns 200 with no data, passes through the logger, and has a test.
- AC-MIG-03.6: The bundled Worker stays under the plan's size limit, and the CPU-time limit is checked against the heaviest planned request.
- AC-MIG-03.7: Security headers and a Content Security Policy are set by the Worker (supports SET-03).

### MIG-04: Owner-only login with Cloudflare Access
**Story:** As the owner, I want GitHub sign-in enforced at the edge and re-checked in the API, so that my private data stays private.
- AC-MIG-04.1: A Cloudflare Access application protects the whole site (including `/api/*`) using GitHub as identity provider and a policy that allows only the owner.
- AC-MIG-04.2: `ownerGuard` validates the Access token (signature, audience, expiry) and compares the identity to a configured owner identifier. It denies access if the setting or the token is missing (fail closed, no bypass flag).
- AC-MIG-04.3: A request with no valid token returns 401 and no data. A valid token for a non-owner returns 403.
- AC-MIG-04.4: Signing in as another GitHub account shows an access-denied screen (replaces AC-FND-02.2 after migration). (Manual check.)
- AC-MIG-04.5: `/demo` stays reachable without login (DEM-01) through a scoped Access bypass path that serves only static demo assets and never the API.
- AC-MIG-04.6: Tests use the same auth path with synthetic signed tokens and a test key set. No production bypass.
- AC-MIG-04.7: The iPhone home-screen PWA signs in and stays signed in (replaces AC-FND-02.6 after migration). (Manual check.)

### MIG-05: Release pipeline to Cloudflare
**Story:** As the owner, I want the manual, approval-gated release to deploy to Cloudflare, so that nothing reaches real data without my approval.
- AC-MIG-05.1: The Release workflow still runs only when started manually on `main`, waits for `production` environment approval before using any secret, and checks CI passed on the exact commit.
- AC-MIG-05.2: Migrations run first against Neon with the admin role. If one fails, nothing is deployed.
- AC-MIG-05.3: Deploy uses `wrangler deploy` with a scoped Cloudflare API token held as a `production` environment secret.
- AC-MIG-05.4: The run summary lists the commit and the migrations applied.
- AC-MIG-05.5: The workflow test is updated for the new steps and does not assert Azure inputs.
- AC-MIG-05.6: The first real Release run succeeds end to end and the site loads behind Access. (Manual check.)

### MIG-06: Logging and observability on Cloudflare
**Story:** As the owner, I want errors and slow calls visible without leaking data, after leaving Application Insights.
- AC-MIG-06.1: The Application Insights dependency is removed. Request and error logs go to Workers Logs (optionally Sentry free tier).
- AC-MIG-06.2: All logging still goes through the one allow-listed logger. The test that fails on fake odometer, weight, workout, or gift values in captured logs still passes.
- AC-MIG-06.3: An email alert fires on a spike of 403 responses (replaces the ADR-0006 alert). (Manual check.)
- AC-MIG-06.4: `OBSERVABILITY.md` is updated.

### MIG-07: Azure decommission and setup docs
**Story:** As the owner, I want Azure gone and the new setup documented, so that nothing bills and a fresh setup is repeatable.
- AC-MIG-07.1: `docs/azure-setup.md` is replaced by `docs/setup.md` covering Cloudflare (Workers, Access, API token) and Neon (project, roles, secrets).
- AC-MIG-07.2: The Entra federated credential, Static Web App, Function app, SQL server, and Azure budget alert are deleted after the first successful Cloudflare release. (Manual check.)
- AC-MIG-07.3: No Azure references remain in workflows, package.json, or docs except historical ADR notes.
- AC-MIG-07.4: The Azure subscription shows no running billable resources. (Manual check.)

## Milestone 1: Foundation

### FND-01: Hosting and CI pipeline
**Story:** As the owner, I want every change to be checked automatically before it can reach `main`, so that broken or unsafe code does not get in.
- AC-FND-01.1 (retired): "A push to `main` builds and deploys the site." Replaced by AC-FND-06.1, because merging must not deploy.
- AC-FND-01.2: A pull request runs lint, type check, and the unit, integration, and end-to-end tests, and blocks merge on failure.
- AC-FND-01.3: Secret scanning (with push protection), Dependabot, and CodeQL are enabled on the repo.
- AC-FND-01.4: No secrets, subscription IDs, or tenant IDs appear in the repo. CI scans for them.
- AC-FND-01.5: Direct pushes to `main` are blocked for everyone, including the owner. Every change merges by pull request.
- AC-FND-01.6: A pull request can merge only when the required checks (`hygiene`, `test`) pass and the branch is up to date with `main`. Merge is by squash.
- AC-FND-01.7: `scripts/ac-coverage.mjs` runs in CI. It fails on test IDs that are not in BACKLOG.md or point at retired criteria, and it reports criteria with no test.

### FND-02: Owner-only login
**Story:** As the owner, I want to sign in with GitHub and be the only person who can reach data, so that my private data stays private.
- AC-FND-02.1: Signing in as the owner shows the app.
- AC-FND-02.2: Signing in as any other GitHub account shows the access-denied screen.
- AC-FND-02.3: An API request with no identity returns 401 and no data.
- AC-FND-02.4: An API request from a non-owner returns 403 and no data, even if the edge check is bypassed.
- AC-FND-02.5: If the owner ID setting is missing, every API request is denied.
- AC-FND-02.6: Sign-in works inside the installed iOS PWA. (Manual check.)
- AC-FND-02.7: Every POST, PATCH, PUT, and DELETE request without the required custom header is rejected, including uploads.
- AC-FND-02.8: `ownerGuard` has no environment-based bypass. Tests use synthetic identity headers.

### FND-03: Database and data access layer
**Story:** As the developer, I want a database with a single data-access layer, so that all SQL lives in one place.
- AC-FND-03.1: Schema migrations run from the repo, are repeatable, and are recorded in a journal table.
- AC-FND-03.2: The API connects with a least-privilege login that can read and write app tables but cannot change the schema. Migrations use a separate admin login.
- AC-FND-03.3: All SQL is in `repositories/`, and a lint rule fails if SQL appears elsewhere.
- AC-FND-03.4: Tests run against a throwaway Postgres container with synthetic data only (SQL Server until MIG-02 lands).
- AC-FND-03.5: The migration script refuses to run if an already-applied migration file has changed.
- AC-FND-03.6: Layer rules (`pages` to `client` to `handlers` to `services` to `repositories` to `db`) are enforced by a dependency check in CI.

### FND-04: Responsive app shell
**Story:** As the owner, I want the app to adapt to phone, tablet, and desktop, so that it feels right on whichever device I use.
- AC-FND-04.1: Below 640 px wide, navigation is a bottom tab bar (Home, Giving, Health, Car, More). Settings is inside More.
- AC-FND-04.2: From 640 to 1023 px, navigation is a left icon rail (Home, Giving, Health, Car, More).
- AC-FND-04.3: At 1024 px and wider, navigation is a left sidebar (Home, Giving, Health, Car, Settings).
- AC-FND-04.4: No horizontal scrolling at 360, 768, and 1280 px widths.
- AC-FND-04.5: Light and dark themes both work at every breakpoint.

### FND-05: PWA and offline behavior
**Story:** As the owner, I want to install the app on my phone, so that it opens like a native app.
- AC-FND-05.1: The app can be added to the iPhone home screen and opens full screen. (Manual check.)
- AC-FND-05.2: Only the app shell is cached. API responses are never cached.
- AC-FND-05.3: When offline, a clear offline message shows and no private data is displayed.
- AC-FND-05.4: While the database wakes from idle, the app shows a loading state and retries once instead of an error.

### FND-06: Manual release pipeline
**Story:** As the owner, I want to release to production by hand, with database migrations applied first, so that nothing reaches real data without my approval.
- AC-FND-06.1: Production is deployed only by a manually started Release run on `main`. Merging to `main` does not deploy.
- AC-FND-06.2: The Release run waits for the owner's approval on the `production` environment before it uses any production secret.
- AC-FND-06.3: The release first checks that CI passed on the exact commit being released.
- AC-FND-06.4: Pending SQL migrations run before the site and API are deployed. If a migration fails, nothing is deployed.
- AC-FND-06.5: CI fails on destructive migration statements (drop, rename, narrowing a column) unless the file has an explicit `-- allow-destructive` marker.
- AC-FND-06.6: The run summary lists the commit released and the migrations applied.
- AC-FND-06.7: Cloud access uses OIDC federation or environment secrets (a scoped Cloudflare API token and Neon credentials as `production` secrets after MIG-05; Azure OIDC until then). No credentials are in the repo.

### SET-03: Security headers and upload limits
**Story:** As the owner, I want the app hardened, so that health, mileage, and giving data are protected.
- AC-SET-03.1: HTTPS only, with a Content Security Policy and standard security headers.
- AC-SET-03.2: All upload endpoints (the mileage spreadsheet import, MIL-04) enforce size and type limits on the server.
- AC-SET-03.3: A scan of the repo finds no CSV, export, or real data files, and no code or schema for bank transactions.

### OPS-01: Logging and observability
**Story:** As the owner, I want errors and slow calls visible, so that I can fix problems without leaking data.
- AC-OPS-01.1: The hosting platform's log service receives request and failure telemetry from the API (Application Insights until MIG-06, then Workers Logs).
- AC-OPS-01.2: All logging goes through one logger that accepts only an allow-list of fields.
- AC-OPS-01.3: A test fails if a fake gift amount, weight, workout, or odometer value appears in captured logs.
- AC-OPS-01.4: Sampling is on and a daily data cap is set, where the platform offers them.
- AC-OPS-01.5: Alerts exist for a spike in 403s and for a failed availability check. The availability check requests the static home page only, never the database.

### DEM-01: Demo mode
**Story:** As a visitor, I want to try the app with fake data, so that I can see what it does without signing in.
- AC-DEM-01.1: `/demo` loads without login and shows a "Demo, fake data" ribbon.
- AC-DEM-01.2: Demo mode never calls the real API (verified by a test that fails on any network call to the API).
- AC-DEM-01.3: Demo data is synthetic and in the browser only.
- AC-DEM-01.4: Demo works at mobile, tablet, and desktop widths.
- AC-DEM-01.5: One shared contract test suite runs against both `client.ts` and `demoApi.ts`, so they stay the same interface.

## Milestone 2: Mileage MVP

### MIL-01: Log an odometer reading
**Story:** As the owner, I want to enter this week's odometer reading in a few taps, so that the Friday check-in takes seconds.
- AC-MIL-01.1: The reading field is focused when the screen opens, and the date defaults to today.
- AC-MIL-01.2: A reading lower than the previous one shows a warning and requires confirmation.
- AC-MIL-01.3: An implausibly high jump shows a warning and requires confirmation.
- AC-MIL-01.4: Entries can be added for any date, including past dates, and can be edited or deleted later.

### MIL-02: Weekly miles and gaps
**Story:** As the owner, I want miles per week calculated from readings, so that skipped Fridays do not break the history.
- AC-MIL-02.1: Weeks run Friday to Thursday. Miles for a week are the difference between the odometer values on consecutive Fridays (ADR-0008).
- AC-MIL-02.2: A Friday with no reading gets an interpolated value, by date, between the nearest readings on either side. Readings on any weekday take part. Nothing is extrapolated past the last reading.
- AC-MIL-02.3: A week that uses an interpolated Friday value is marked estimated, and is visually distinct and labeled in the list.
- AC-MIL-02.4: Adding, editing, or deleting a reading recalculates the affected weeks, and the result does not depend on the order readings were entered.

### MIL-03: Mileage stats and graphs
**Story:** As the owner, I want trends and totals, so that I can see how much I drive.
- AC-MIL-03.1: A bar chart shows miles per week.
- AC-MIL-03.2: Rolling 8-week average, monthly totals, and yearly totals are shown.
- AC-MIL-03.3: The busiest and quietest weeks are identified.
- AC-MIL-03.4: The chart is readable at mobile, tablet, and desktop widths, and has a text alternative.

### MIL-04: Import Excel mileage history
**Story:** As the owner, I want to import my existing spreadsheet, so that my earlier history is not lost.
- AC-MIL-04.1: An .xlsx or CSV with Date and Start Miles columns is accepted.
- AC-MIL-04.2: Miles driven is recalculated, not read from the file.
- AC-MIL-04.3: Rows where the recalculated value differs from the sheet's value are flagged in the preview.
- AC-MIL-04.4: Re-importing the same file creates no duplicates.
- AC-MIL-04.5: The uploaded file is not stored.

### OPS-02: Cost and backup safeguards
**Story:** As the owner, I want cost and data-loss protection before real data goes in, so that nothing surprises me.
- AC-OPS-02.1: Usage alerts exist on Cloudflare and Neon (a spend notification, and a warning before the free compute hours run out).
- AC-OPS-02.2: The Neon point-in-time restore window is confirmed for the plan in use, and a restore (branch from a past time) has been tried once. (Manual check.)
- AC-OPS-02.3: A documented manual export procedure (`pg_dump` to private storage) exists in the repo (no data in the repo).
- AC-OPS-02.4: Exceeding a free limit stops service instead of billing: the account stays on free plans with no paid add-ons (ADR-0021). (Manual check.)
- AC-OPS-02.5: An email alert fires when the free Neon compute hours are low. (Manual check.)

## Milestone 3: Finance MVP (removed)

Out of scope as of 2026-11-10 (ADR-0021). Transaction tracking moved to a separate private repository so bank data never touches this public-code, internet-hosted app. All FIN criteria are retired. The IDs stay here so they are never reused. The Linear issues (ALE-19 to ALE-27) are canceled.

### FIN-01: Category and rule management (retired)
- AC-FIN-01.1 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-01.2 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-01.3 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-01.4 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-01.5 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-01.6 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-01.7 (retired): out of scope, finance moved to another repository (ADR-0021).

### FIN-08: Accounts and manual entry (retired)
- AC-FIN-08.1 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-08.2 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-08.3 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-08.4 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-08.5 (retired): out of scope, finance moved to another repository (ADR-0021).

### FIN-02: CSV upload and parsing (retired)
- AC-FIN-02.1 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-02.2 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-02.3 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-02.4 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-02.5 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-02.6 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-02.7 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-02.8 (retired): out of scope, finance moved to another repository (ADR-0021).

### FIN-03: Import preview (retired)
- AC-FIN-03.1 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-03.2 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-03.3 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-03.4 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-03.5 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-03.6 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-03.7 (retired): out of scope, finance moved to another repository (ADR-0021).

### FIN-04: Duplicate detection and import commit (retired)
- AC-FIN-04.1 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-04.2 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-04.3 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-04.4 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-04.5 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-04.6 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-04.7 (retired): out of scope, finance moved to another repository (ADR-0021).

### FIN-09: Undo an import (retired)
- AC-FIN-09.1 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-09.2 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-09.3 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-09.4 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-09.5 (retired): out of scope, finance moved to another repository (ADR-0021).

### FIN-05: Transaction list and search (retired)
- AC-FIN-05.1 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-05.2 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-05.3 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-05.4 (retired): out of scope, finance moved to another repository (ADR-0021).

### FIN-06: Edit transaction and teach the app (retired)
- AC-FIN-06.1 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-06.2 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-06.3 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-06.4 (retired): out of scope, finance moved to another repository (ADR-0021).

### FIN-07: Monthly summary and trends (retired)
- AC-FIN-07.1 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-07.2 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-07.3 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-07.4 (retired): out of scope, finance moved to another repository (ADR-0021).
- AC-FIN-07.5 (retired): out of scope, finance moved to another repository (ADR-0021).

## Milestone 4: Giving MVP

### GIV-01: Log a regular gift
**Story:** As the owner, I want to log a gift against the month it is for, so that totals match my intent.
- AC-GIV-01.1: A gift has date given, month it is for, amount, and payment method (check or online card service).
- AC-GIV-01.2: The "for" month can differ from the date given.
- AC-GIV-01.3: Several gifts can exist for one month, and the month total is their sum.
- AC-GIV-01.4: Gifts can be edited and deleted.

### GIV-02: Special contributions
**Story:** As the owner, I want special offerings tracked separately, so that regular giving stays clean.
- AC-GIV-02.1: A special contribution has a name or occasion instead of a "for" month.
- AC-GIV-02.2: Special contributions are listed and totaled separately from regular giving.

### GIV-03: Giving history and totals
**Story:** As the owner, I want year-to-date totals, so that I can see my giving at a glance.
- AC-GIV-03.1: Regular giving is grouped by "for" month.
- AC-GIV-03.2: Year-to-date totals show regular, special, and combined.
- AC-GIV-03.3: A month with no regular gift is clearly marked "no gift".

## Milestone 5: Health MVP

### HLT-01: Log and chart weight
**Story:** As the owner, I want to log my weight and see a trend, so that daily noise does not mislead me.
- AC-HLT-01.1: I can log a weight with a date, and edit or delete entries.
- AC-HLT-01.2: A chart shows daily values and a moving-average trend line, with a text alternative.
- AC-HLT-01.3: Only one entry per day is kept. A second entry asks to replace the first.
- AC-HLT-01.4: A setting chooses pounds or kilograms for entry and display. Values are stored in one unit (ADR-0007).

### HLT-02: Log workouts manually
**Story:** As the owner, I want to add a workout by hand, so that non-watch workouts count too.
- AC-HLT-02.1: A workout has type, date, duration, and an optional note.
- AC-HLT-02.2: Workouts can be edited and deleted.
- AC-HLT-02.3: Each workout shows its source (manual or Apple Watch).

### HLT-03: Import workouts from Apple Health
**Story:** As the owner, I want to open my Apple Health export in the app, so that watch workouts appear without typing.
- AC-HLT-03.1: The export ZIP is opened in the browser, and only workouts are read from it.
- AC-HLT-03.2: Re-importing creates no duplicate workouts (matched on start time, type, and duration).
- AC-HLT-03.3: A large export is processed in a background worker with a progress indicator, and the page stays responsive.
- AC-HLT-03.4: The ZIP and its XML never leave the device. Only the workout rows are sent to the API, and nothing is stored from the file itself.
- AC-HLT-03.5: The import works on a phone as well as on desktop.
- AC-HLT-03.6: The commit call validates the workout rows it receives (schema, row cap).
- AC-HLT-03.7: If an export is too large for the device, a clear message explains this, suggests importing from a computer, and nothing is saved.

### HLT-04: Workout history and consistency
**Story:** As the owner, I want weekly and monthly totals, so that I can see how consistent I am.
- AC-HLT-04.1: A history list shows workouts newest first.
- AC-HLT-04.2: Weekly and monthly totals of count and minutes are shown.
- AC-HLT-04.3: A streak of consecutive weeks meeting a workout count is shown.

## Milestone 6: Dashboard and polish

### DSH-01: Dashboard
**Story:** As the owner, I want one home screen, so that I can see everything at a glance.
- AC-DSH-01.1: It shows latest weight with trend, last week's miles, workouts this week, and year-to-date giving.
- AC-DSH-01.2: An odometer-due banner shows only when this week's reading is missing.
- AC-DSH-01.3: Quick actions: add weight, add workout, log odometer, add giving.
- AC-DSH-01.4: The layout uses one column on mobile, and a multi-column grid on tablet and desktop.

### SET-01: Settings and sign out
**Story:** As the owner, I want a settings screen, so that I can sign out and manage preferences.
- AC-SET-01.1: Sign out ends the session.
- AC-SET-01.2 (retired): Categories and rules were finance-only and are out of scope (ADR-0021).
- AC-SET-01.3: A theme switch offers light, dark, and system.
- AC-SET-01.4: The owner time zone and weight unit can be set (ADR-0007).

### SET-02: Accessibility and quality pass
**Story:** As a reviewer of the portfolio, I want the app to meet basic accessibility standards, so that it reads as professional.
- AC-SET-02.1: Text contrast meets WCAG AA in both themes.
- AC-SET-02.2: Every screen is usable with keyboard only on desktop.
- AC-SET-02.3: Touch targets are at least 44 px on mobile.
- AC-SET-02.4: Lighthouse accessibility score is 90 or higher on the main screens.
- AC-SET-02.5: Every list and chart has an empty state that says what to do next.

### DEM-02: Demo mileage import walkthrough
**Story:** As a visitor, I want to see the mileage spreadsheet import flow on a sample file, so that I understand the feature.
- AC-DEM-02.1: The demo import screen offers a built-in sample file, generated in code.
- AC-DEM-02.2: The demo walks through upload, preview, and done using the sample.
- AC-DEM-02.3: Nothing is sent to a server.

---

**Count: 32 active issues** (MIG 7, FND 6, MIL 4, GIV 3, HLT 4, DSH 1, SET 3, DEM 2, OPS 2), plus 9 canceled FIN issues.
