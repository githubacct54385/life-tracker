# Testing Strategy

We use the **test pyramid**: many fast unit tests, fewer integration tests, and very few end-to-end tests. See ADR-0005 in [DECISIONS.md](DECISIONS.md).

```
          /\
         /e2e\        a few dozen        real browser, whole app, slow
        /------\
       / integ  \     ~20% of tests      real Postgres, real handlers
      /----------\
     /    unit    \   ~70% of tests      no network, no database, milliseconds
    /--------------\
```

The percentages are a guide for where to put effort, not a target to hit by counting.

**The rule: prove each acceptance criterion at the lowest level that can prove it.** If a unit test can show it, do not also write an end-to-end test for it. Move up a level only when the thing under test is the connection between parts (SQL, HTTP, the browser).

Test names carry the AC ID. See [AGENTS.md](AGENTS.md) for the format and the `scripts/ac-coverage.mjs` check.

## Levels

### 1. Unit tests (Vitest)

**What they are.** One function, class, or component with no network, no database, no clock, and no file system. Each runs in milliseconds, so the whole level finishes in seconds.

**What belongs here**

| Area | Examples |
|---|---|
| Parsers | Mileage XLSX and CSV (Date and Start Miles columns, text dates, trailing empty rows, malformed rows reported with row numbers, re-import creates no duplicates), Apple Health workout extraction. All fixtures are built in code with invented values. |
| Mileage | weekly check-ins, late readings, missing weeks, sanity warnings (ADR-0008) |
| Calculations | Weight moving average, workout streaks, giving totals by "for" month and special contributions |
| Security logic | `ownerGuard` decision (pure function of header and setting), custom-header check, logger allow-list and redaction |
| Schemas | zod request and response schemas, upload type and size checks |
| UI | Components with Testing Library: forms, warnings that need confirmation, empty states, navigation switching at the three breakpoints (given a width prop or media-query stub) |

**How**
- Services are tested with **in-memory fake repositories**. The layer rules make this possible: services depend on repository interfaces, not on SQL.
- **Property tests** (fast-check) for rules that must hold for any input: spread miles add up to the gap, re-importing any set of readings or workouts adds nothing, results do not depend on the order readings were entered.
- Inject the clock and the time zone. Never read the real date inside logic.
- Co-locate: `foo.ts` next to `foo.test.ts`.

**Speed budget.** The full unit run stays under 30 seconds. If it grows past that, find out why before adding more.

### 2. Integration tests (Vitest, real Postgres)

**What they are.** Several real parts working together. The database is a real Postgres started in a container (Testcontainers) with migrations applied from scratch, so the same tests run on a laptop and in CI.

**What belongs here**

| Area | Examples |
|---|---|
| Migrations | Apply from empty; apply twice is a no-op; changing an applied file is refused; destructive statements are flagged (AC-FND-03.1, AC-FND-06.4) |
| Repositories | Every query, against the real schema. Unique indexes reject duplicates (one weight per day, repeated workouts). A failed multi-row write rolls back fully |
| Least privilege | The app role can read and write app tables and cannot alter the schema (AC-FND-03.2) |
| Handlers | Call the handler with a fake request and synthetic identity headers: no identity gives 401, non-owner 403, missing owner setting denies everything, missing custom header is rejected, upload size and type limits, an import commit is all or nothing |
| Logging | Capture all log output during a request that handles fake data and fail if a fake gift amount, weight, workout, or odometer value appears (AC-OPS-01.3) |
| Pages | Real pages rendered against `demoApi`, so no network: the mileage import flow, forms |
| Contract | One shared suite runs against `client.ts` (HTTP mocked at the network edge) and `demoApi.ts`. Both must pass, so the demo cannot drift (AC-DEM-01.5) |

**How**
- One container per test run. Each test file gets a clean schema (truncate or recreate), so tests do not depend on each other.
- Name files `*.int.test.ts` and run them with a separate Vitest project.
- Data comes from **builders in code** (`aGift({ amountCents: 1250 })`), never from files.

**Local note (ADR-0018, amended by ADR-0021).** The database is Postgres (`postgres:17-alpine`), which is small and runs natively on Apple Silicon. **CI is still the source of truth for integration tests**, and locally they are optional: one container is started per run (`api/src/db/globalSetup.int.ts`). If no Docker is found on a laptop, database tests are skipped with a visible warning; when the `CI` variable is set they never skip, and a missing Docker fails the job. Logic that does not need a database (migration planning, checksums, batch splitting, layer rules) is covered by unit tests that always run.

### 3. End-to-end tests (Playwright)

**What they are.** The real built app in a real browser, served locally (`wrangler dev`). Slow, so we keep the set small.

There are two kinds, and it matters which is which (OPS-04):

| Kind | Where | What is real | What is faked |
|---|---|---|---|
| **Full stack** | `web/e2e/stack/` | The built app, the Worker, the owner check with a synthetic Access token, the API, the SQL, the real migrations, the least-privilege `lt_app` database role, and a real Postgres | Nothing |
| **Screen checks** (these specs fake the API) | the other files in `web/e2e/` | The built app, the Worker and the owner check | The API answers: the specs use `page.route` to give fixed synthetic data, so a layout or accessibility check sees the same screen at 360, 768 and 1280 px every time |

A full-stack test fails if the API answers 5xx or the page logs a console error (`web/e2e/support/stack.ts`, proven by `stack/guard.spec.ts`). Each full-stack test starts from empty tables.

**Full-stack journeys.** Odometer (log, the warning and its confirmation, edit, delete), weight (log, replace, delete), workouts (a timed one and pushups), regular gifts and special contributions, car maintenance (the place drop-down, a service at home, the future-date rule), car-service documents (a photo is redrawn and served privately from R2, a PDF, a 36 MB PDF streamed through the real Worker, the full-screen viewer, Recent documents and Download, a refused file, delete), the mileage spreadsheet import (and re-importing adds nothing), and the dashboard showing what was saved (AC-OPS-04.3).

**Screen checks.** Layout (no sideways scrolling, navigation at the three widths), accessibility (axe, keyboard, 44 px), and the screens' own detail at the three widths. Behaviour is proven in unit tests and in the full-stack journeys, not here.

**Also in this set.** Owner signs in and another account is refused (AC-FND-02.1, 02.2), offline shows the offline message (AC-FND-05.3), and demo mode makes zero API requests (AC-DEM-01.2).

**How**
- Only layout tests use the three-width matrix. Other tests run at one width.
- Prefer role-based locators (`getByRole`). Avoid sleeps; wait for conditions.
- Auth uses a synthetic owner and a synthetic non-owner (synthetic signed Access tokens). There is no bypass in the app.
- The tests run one at a time, because the full-stack ones share one database.
- **The database.** `web/e2e/support/prepareDatabase.mjs` runs first. It empties the schema, applies the real migrations with `pnpm migrate`, creates the `lt_app` role with `db/setup/app-role-grants.sql`, and writes its connection string to the git-ignored `api/.dev.vars`. It refuses any database that is not on this computer or whose name does not contain `e2e`.
- **In CI** a `postgres` service container is started and `E2E_ADMIN_DATABASE_URL` is set. If it is missing in CI the job fails.
- **Locally** start any Postgres, create an empty database with `e2e` in its name, and run:

```
export E2E_ADMIN_DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5432/lt_e2e
pnpm test:e2e
```

Without it, the full-stack tests are skipped with a message, and the screen checks still run.

### Manual checks

Some criteria cannot be automated, such as sign-in inside the installed iOS PWA and a real database restore. They go in [docs/manual-checks.md](docs/manual-checks.md) with the AC ID and the date last checked. Re-check before each release that touches the area.

## Which level for which criterion (quick guide)

| Question | Level |
|---|---|
| Is it a calculation, parser, or rule with inputs and outputs? | Unit |
| Does it depend on SQL behavior (index, transaction, permission)? | Integration |
| Does it depend on HTTP, headers, or status codes? | Integration (handler) |
| Is it how one screen reacts to data? | Unit (component) or integration (page on `demoApi`) |
| Does it need a real browser feature (viewport, offline, service worker, navigation)? | End-to-end |
| Does it need a real phone or the real hosting account? | Manual |

## CI jobs

Defined in `.github/workflows/ci.yml`. Required checks on `main` are `hygiene` and `test`.

| Job | Runs | Contents |
|---|---|---|
| `hygiene` | Every push and PR, even before code exists | Forbidden files (`*.csv`, `*.xlsx`, exports, local settings), secret-like strings, commit emails, `scripts/ac-coverage.mjs`, destructive-migration check |
| `test` | Every push and PR once `package.json` exists | Install, lint, type check, unit tests, integration tests, build, end-to-end tests |

Cadence as the suite grows:
- **Every push to a PR branch:** unit tests, lint, type check (fast feedback).
- **Every PR before merge:** everything above plus integration, build, and the end-to-end set.
- **Weekly scheduled run on `main`:** the full set, to catch drift from dependency updates.
- **Before a release:** the Release workflow checks that CI passed on the exact commit being released.

## Practices

- **Test-first for pure logic.** Write the failing test from the AC, then the code (parsers, mileage, totals).
- **Coverage.** Require a high threshold (about 90% lines and branches) on `services/` and `parsers/` only. A global percentage invites tests that exist only to raise the number.
- **No real-looking data.** Use builders and generated fixtures. Do not store `.csv`, `.xlsx`, or export files, even small ones. A sample import file for the demo is produced by code.
- **Do not mock what you own** beyond layer boundaries. Mock the repository interface in a service test; do not mock internal helpers.
- **Avoid.** Testing business rules through the UI (an inverted pyramid), large snapshot tests, tests that depend on order or the real clock, and sleeps.
- **Flaky tests.** Fix or delete within a week. A flaky required check teaches people to ignore red.
- **Optional later.** Mutation testing (Stryker) on the parsers and the mileage code, to check that the tests would catch a real bug.

## What the tests check, in plain English

`pnpm tests:list` prints every automated test as a sentence, grouped by area, story and criterion, with its level and file. It is built from the test names in the code, so it cannot drift, and nothing is kept by hand. A pull request's CI run shows the same list in its job summary.

```bash
pnpm tests:list                       # everything
pnpm tests:list GRO                   # one area (or a story such as GRO-02, or a criterion such as AC-GRO-02.4)
pnpm tests:list GRO-02 --commands     # also the command that runs each test
pnpm tests:list none                  # tests that name no acceptance criterion (the gaps)
```

Write test names as sentences that say what is true, because that sentence is what the list shows.

For a short, non-technical view of the browser tests only, read [docs/what-the-browser-tests-check.md](docs/what-the-browser-tests-check.md). It is written by hand in plain sentences, and a test fails when it and the browser tests disagree about which criteria are covered, so add a line there when a browser test covers a new criterion.

## Coverage

CI measures line and branch coverage of the unit tests (`shared`, `api`, `web`) and of the API integration tests, and shows a table with the change against the latest run on `main` in the job summary of every run. The full report is saved as the `coverage-report` artifact. **End-to-end tests are not part of the coverage numbers**, because they test the built app from outside; they prove behaviour, not lines.

The minimum for each set is in `coverage.config.json` (today's real number, rounded down), and CI fails when a set falls below its minimum. Raise a minimum when coverage rises. Never lower one to pass CI: if a file cannot sensibly be covered, add it to `exclude` in the same file with a reason. Run it yourself with `pnpm coverage:unit` (no Docker) or `pnpm coverage:int` (Docker running), then `pnpm coverage:summary`.

## The coverage and Lighthouse badges

After a green run on `main`, the `badges` job in `ci.yml` writes two small JSON files (`coverage.json`, `lighthouse.json`) to the `badges` release, and the README badges read them through shields.io. They hold only a percentage and a colour. It is the only CI job with write permission. Coverage is the lines covered by the unit tests of all packages together; Lighthouse shows the lowest performance and accessibility scores. A badge shows "invalid" until the first run on `main` after this was added has published its file.

## Lighthouse (performance, accessibility, installability)

`node scripts/lighthouse.mjs` (or `pnpm lighthouse` after `pnpm build`) serves the built app, opens the `/demo` page in Chromium on the phone profile, and takes the median of three Lighthouse runs. It fails when the Accessibility score is under 95, when the first screen loads more JavaScript than the budget in `lighthouse.config.json`, or when the app could not be installed (a manifest with icons, and a service worker with a fetch handler; Lighthouse 13 no longer has its own installability audit, so `scripts/lighthouse-lib.mjs` checks it). A failed check is retried once before it counts. CI runs it on pull requests that change `web/` and on every push to `main`, writes the table to the job summary and saves the reports as the `lighthouse-reports` artifact. Home, Car and Health are added when SET-10 gives them a public demo.

## Commands (once code exists)

Step-by-step setup for a laptop, including a Mac, is in the [README](README.md#run-the-tests-locally).

```
pnpm test:unit     # fast, run constantly
pnpm test:int      # starts a database container
pnpm test:e2e      # builds, starts the local server, runs Playwright (full-stack tests need E2E_ADMIN_DATABASE_URL)
pnpm test          # all three, as CI does
node scripts/ac-coverage.mjs [--strict]
```
