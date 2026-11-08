# AGENTS.md

Instructions for AI coding agents (and humans) working on Life Tracker. Read this first.

## What this is

A private, single-user web app (installable PWA) for personal finances, health, mileage, and giving. The code is public. The data and login are private. Read these before building anything:

- [SPEC.md](SPEC.md): features, priorities, security requirements
- [ARCHITECTURE.md](ARCHITECTURE.md): layers, dependency rules, sequence diagrams
- [DECISIONS.md](DECISIONS.md): why each technical choice was made (ADRs). Check here before changing a choice.
- [TESTING.md](TESTING.md): the test pyramid, what goes at which level, CI jobs
- [OBSERVABILITY.md](OBSERVABILITY.md): logging rules
- [BACKLOG.md](BACKLOG.md): stories and acceptance criteria (mirrors Linear)
- [wireframes.html](wireframes.html) (phone) and [wireframes-desktop.html](wireframes-desktop.html) (desktop)

If these documents conflict with a request, say so and ask. Do not silently pick one.

## Hard rules

1. **No personal data in the repo.** No real transactions, account numbers, names, birthdates, photos, odometer history, or health values. Not in code, tests, fixtures, comments, or commit messages. Use synthetic data only. Any child in the demo is fictional.
2. **No secrets in the repo.** No connection strings, subscription or tenant IDs, tokens, or the owner's GitHub user ID in any file. Use GitHub secrets and Azure app settings.
3. **Never commit** `*.csv`, `*.xlsx`, Apple Health exports, or local settings. Test and demo fixtures are generated in code, not stored as data files.
4. **Fail closed.** If the owner cannot be confirmed, the API returns nothing.
5. **Do not store uploaded files.** Parse, keep the parsed rows, discard the file.
6. **No private data in logs or telemetry.** All logging goes through `telemetry/logger.ts` and its field allow-list.
7. **Demo mode never calls the real API.**
8. Commit with the GitHub noreply email only. `scripts/check-hygiene.sh` checks this in CI.
9. **No test-only bypass in auth code.** `ownerGuard` never reads an environment flag. Tests supply synthetic identity headers instead.
10. **Never apply migrations from the app.** Only the release workflow (or a developer against a local database) runs them.

## Git, pull requests, and release

- `main` is protected. **Nobody pushes to it directly, including the owner.** Every change goes through a pull request.
- Branch names start with the story key, for example `fin-03-import-preview`. Commit messages start with it too, for example `FIN-03: show duplicate rows in preview`.
- A pull request can merge only when CI is green and its branch is up to date with `main`. Merging is by **squash**, which keeps `main` linear.
- Keep pull requests small, ideally one story or part of one.
- **Merging does not deploy.** Production changes only through the manual **Release** workflow (GitHub Actions, run on `main`). It waits for the owner's approval on the `production` environment, applies pending SQL migrations, then deploys the site and API. See [DECISIONS.md](DECISIONS.md) ADR-0004.
- Migrations must work with the code that is currently live, because the old code runs briefly after the migration. Add things first (new column, nullable), switch the code, and remove old things in a later release. CI fails on destructive statements unless the file has an explicit `-- allow-destructive` marker.
- Never edit a migration that has been released. Add a new one.

## Code structure rules

Follow the layers in ARCHITECTURE.md. Dependencies point downward only: `pages` to `api/client` to `handlers` to `services` to `repositories` to `db`.

- SQL lives only in `repositories/`.
- Business rules live only in `services/`.
- Handlers parse the request, check the owner, call a service, and shape the response.
- The UI calls the API only through `api/client.ts`. Demo mode swaps in `demo/demoApi.ts`, which has the same interface. Every new API method is added to both, and the shared contract test must pass.
- Request and response shapes are zod schemas in `shared/`, used by both the client and the API.
- Server code validates everything it receives, including rows that the browser sends back at import commit.

If a change needs to break a layer rule, update ARCHITECTURE.md in the same change and explain why.

## Viewports

Every screen must work at three breakpoints. Mobile is the default and is designed first.

| Name | Width | Navigation |
|---|---|---|
| Mobile | under 640 px | Bottom tab bar |
| Tablet | 640 to 1023 px | Per the tablet wireframe (to be drawn before FND-04) |
| Desktop | 1024 px and wider | Left sidebar |

- Write mobile styles first, then add wider layouts.
- No horizontal scrolling at 360, 768, and 1280 px.
- **CSV bank import is desktop only** (1024 px and wider). Below that, hide the entry point and show "Import from a computer". Other imports (Apple Health, mileage spreadsheet) are allowed on all viewports.
- Layout tests check all three widths. Only layout tests run the full width matrix.

## Testing

Follow [TESTING.md](TESTING.md). In short: a pyramid with many unit tests, fewer integration tests, and few end-to-end tests. Prove each acceptance criterion at the lowest level that can prove it. Write the failing test first for pure logic (parsers, mileage, categorizer, totals).

## Acceptance criteria and test traceability

Every user story in BACKLOG.md and Linear has acceptance criteria (AC) with a unique ID.

**ID format:** `AC-<AREA>-<NN>.<n>`, for example `AC-FIN-03.2`.

- Area codes: FND, DEM, MIL, FIN, GIV, HLT, DSH, SET, OPS.
- `<AREA>-<NN>` is the story key. It is also the prefix of the Linear issue title, for example `FIN-03: Import preview`.
- IDs are permanent. Never reuse or renumber one. Mark removed criteria `(retired)`, in the form `- AC-FND-01.1 (retired): reason`.
- When you add a criterion, take the next free number for that story and add it to both BACKLOG.md and the Linear issue.

**Tests must carry the ID in the test name**, inside square brackets at the start, so it shows up in every test report and can be found with grep:

```ts
// Unit or integration test (Vitest)
it('[AC-FIN-04.1] re-uploading the same file imports zero new rows', async () => { /* ... */ });

// A test covering more than one criterion lists them all
it('[AC-FIN-02.3][AC-FIN-02.7] rejects bad files and reports the row number', () => { /* ... */ });

// End-to-end (Playwright): put the ID in the title and also tag it
test('[AC-FIN-02.2] phone hides CSV import', { tag: '@AC-FIN-02.2' }, async ({ page }) => { /* ... */ });
```

Rules:

- One criterion can have several tests. A test may cover several criteria, but each ID must be in its name.
- Put the ID first in the name, exactly as written, with the `AC-` prefix.
- If a criterion cannot be automated (for example, "works inside the installed iOS PWA"), do not invent a test. Add it to `docs/manual-checks.md` with the same ID and the date it was last checked.
- A story is not done until every one of its criteria has either a passing automated test or a manual-check entry.
- Do not put real or realistic personal data in test names or fixtures.

**Traceability check.** `scripts/ac-coverage.mjs` reads BACKLOG.md for all `AC-` IDs, searches tests and `docs/manual-checks.md`, and prints:

- criteria with no test or manual check,
- test IDs that do not exist in BACKLOG.md, or that point at retired criteria (typos).

CI fails on the second list and reports the first. When the MVP is feature-complete, switch CI to `--strict` so the first list fails too.

## Working with Linear

- Linear is the source of truth for status. BACKLOG.md holds the stories and criteria text and must match it.
- The free plan allows **250 issues**. It is unconfirmed whether closed issues count, so assume they do. **Do not create issues without being asked.**
- **Do not create teams.** Use the existing team (key `ALE`).
- **No sub-issues.** Use the acceptance criteria as the checklist.
- One issue is one vertical slice of 1 to 3 days. If one grows past about 8 criteria, propose a split and ask first.
- Issue title: `<AREA>-<NN>: <short name>`. Description: the user story, then the acceptance criteria with their IDs.
- Phases are Linear milestones inside the Life Tracker project. Do not make an issue for a phase.
- Only MVP work gets issues now. "Next" and "Later" items stay in SPEC.md until they are about to start.
- Reference the story key in branch names and commit messages (see Git section).

## Definition of done

1. All acceptance criteria met, each with a passing `[AC-...]` test or a manual-check entry.
2. Works at mobile, tablet, and desktop widths (CSV import: desktop only).
3. Lint, type check, and all test levels pass in CI. The change merged through a pull request.
4. No personal data, secrets, or banned log fields (see Hard rules).
5. New API methods exist in both `client.ts` and `demoApi.ts`.
6. Diagrams in ARCHITECTURE.md updated if the structure or a flow changed.
7. SPEC.md, BACKLOG.md, or DECISIONS.md updated if behavior or a decision changed.
8. Any migration is backward compatible with the live code.

## Stack

Decided in [DECISIONS.md](DECISIONS.md):

- pnpm workspaces: `web`, `api`, `shared`.
- Web: React, TypeScript, Vite, PWA, React Router, TanStack Query, Recharts, Tailwind.
- API: Azure Functions (Node, TypeScript) as the managed API of Azure Static Web Apps.
- Database: Azure SQL (serverless, free offer). Hand-written parameterized SQL through the `mssql` package. Numbered `.sql` migrations.
- Validation: zod, shared by client and API.
- Tests: Vitest, Testing Library, fast-check, Testcontainers (SQL Server), Playwright with the SWA CLI.
- Telemetry: Application Insights.
- Source, CI, release, and login: GitHub (Actions, protected `main`, `production` environment).

## Cost

Target $0 to $2 per month. Do not add paid services, always-on compute, or extra Azure resources without asking.
