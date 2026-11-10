# Testing Strategy

We use the **test pyramid**: many fast unit tests, fewer integration tests, and very few end-to-end tests. See ADR-0005 in [DECISIONS.md](DECISIONS.md).

```
          /\
         /e2e\        ~10 to 15 tests    real browser, whole app, slow
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

**What they are.** The real built app in a real browser, served locally (the SWA CLI until MIG-03, then `wrangler dev`), talking to the real API and a test database. Slow, so we keep the set small and only for journeys that cross every layer.

**Starting set (about 10 to 15 tests)**

| Journey | AC |
|---|---|
| Owner signs in and sees the app; another account sees access denied | AC-FND-02.1, AC-FND-02.2 |
| Offline shows the offline message and no private data | AC-FND-05.3 |
| Mileage spreadsheet import: choose file, preview, import, see the readings | AC-MIL-04 (happy path only) |
| Log an odometer reading, see it in the weekly list | AC-MIL-01 |
| Log a weight and a workout | AC-HLT-01, AC-HLT-02 |
| Demo mode makes zero API requests (any request to the API fails the test) | AC-DEM-01.2 |
| Layout: no horizontal scroll and correct navigation at 360, 768, and 1280 px | AC-FND-04, AC-DSH-01.4 |
| Accessibility scan (axe) on main screens | AC-SET-02 |

**How**
- Only layout tests use the three-width matrix. Other tests run at one width (mobile for quick actions).
- Prefer role-based locators (`getByRole`). Avoid sleeps; wait for conditions.
- Auth uses a synthetic owner and a synthetic non-owner (SWA CLI emulator until MIG-04, then synthetic signed Access tokens). There is no bypass in the app.
- Every test creates its own data through the API or a seed script and cleans up.

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

## Commands (once code exists)

```
pnpm test:unit     # fast, run constantly
pnpm test:int      # starts a database container
pnpm test:e2e      # builds, starts the local server, runs Playwright
pnpm test          # all three, as CI does
node scripts/ac-coverage.mjs [--strict]
```
