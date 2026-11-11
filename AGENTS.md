# AGENTS.md

Instructions for AI coding agents (and humans) working on Life Tracker. Read this first.

## What this is

A private, single-user web app (installable PWA) for health, mileage, and giving. **Finance and transaction tracking are not part of this app** (ADR-0021); never add them. The code is public. The data and login are private. Read these before building anything:

- [SPEC.md](SPEC.md): features, priorities, security requirements
- [ARCHITECTURE.md](ARCHITECTURE.md): layers, dependency rules, sequence diagrams
- [DECISIONS.md](DECISIONS.md): why each technical choice was made (ADRs). Check here before changing a choice.
- [TESTING.md](TESTING.md): the test pyramid, what goes at which level, CI jobs
- [OBSERVABILITY.md](OBSERVABILITY.md): logging rules
- [docs/cloudflare-release-setup.md](docs/cloudflare-release-setup.md): the Cloudflare token and secrets the Release workflow needs
- [docs/azure-setup.md](docs/azure-setup.md): one-time Azure resource setup. **Obsolete after MIG-07**; the app is moving to Cloudflare + Neon (ADR-0021)
- [docs/ac-ids.txt](docs/ac-ids.txt): the list of valid acceptance-criterion IDs. The stories and criteria text are in Linear.
- [wireframes-suite.html](wireframes-suite.html): every MVP screen at mobile, tablet, and desktop widths

If these documents conflict with a request, say so and ask. Do not silently pick one.

## Hard rules

1. **No personal data in the repo.** No bank or financial data of any kind, no account numbers, names, birthdates, photos, odometer history, or health values. Not in code, tests, fixtures, comments, or commit messages. Use synthetic data only. Any child in the demo is fictional.
2. **No secrets in the repo.** No connection strings, subscription or tenant IDs, tokens, or the owner's user IDs (GitHub, Cloudflare Access, or Static Web Apps) in any file. Use GitHub secrets and Cloudflare or Azure app settings.
3. **Never commit** `*.csv`, `*.xlsx`, Apple Health exports, or local settings. Test and demo fixtures are generated in code, not stored as data files.
4. **Fail closed.** If the owner cannot be confirmed, the API returns nothing.
5. **Do not store uploaded files.** Parse (in the browser where possible), keep the parsed rows, discard the file.
6. **No private data in logs or telemetry.** All logging goes through `telemetry/logger.ts` and its field allow-list.
7. **Demo mode never calls the real API.**
8. Commit with the GitHub noreply email only. `scripts/check-hygiene.sh` checks this in CI.
9. **No test-only bypass in auth code.** `ownerGuard` never reads an environment flag. Tests sign synthetic Cloudflare Access tokens with a throwaway key and pass that key in (`api/src/testing/accessTokens.ts`, `web/e2e/support/accessKeys.mjs`).
10. **Never apply migrations from the app.** Only the release workflow (or a developer against a local database) runs them.

## Git, pull requests, and release

- `main` is protected. **Nobody pushes to it directly, including the owner.** Every change goes through a pull request.
- Branch names start with the story key, for example `mil-03-mileage-graphs`. Commit messages start with it too, for example `MIL-03: add rolling average line`.
- A pull request can merge only when CI is green and its branch is up to date with `main`. Merging is by **squash**, which keeps `main` linear.
- **Delete a pull request's branch after it merges.** The repository deletes head branches on merge, so merged work does not pile up. If a branch is still there after a merge, delete it by hand.
- Keep pull requests small, ideally one story or part of one.
- **Every pull request uses the template in [.github/pull_request_template.md](.github/pull_request_template.md).** Do not delete sections or remove checklist items. Mark an item not applicable with a reason instead of leaving it unticked.
- **Screenshots are required** for any pull request that changes a page or visible component. Show each changed screen at mobile (360 px), tablet (768 px), and desktop (1280 px), before and after, using synthetic data only. **The agent produces and attaches them. The owner does nothing.** Run `pnpm pr-screenshots --pr <number> --screen "Name=/path"` (repeat `--screen` per changed screen) after the pull request is open. It builds `main` and the branch, takes the screenshots, uploads them as assets of the `pr-screenshots` release, and fills the Screenshots table in the pull request. A screen that does not exist on `main` is shown as "new screen". Never commit images to the repo. A workflow deletes a pull request's images when it closes. See [DECISIONS.md](DECISIONS.md) ADR-0019.
- **The agent gets the pull request ready, and the owner only reviews.** Before saying a pull request is ready: push the branch, open it from the template, run `pnpm pr-screenshots` if the UI changed, fill every checklist item honestly (tick with a reason when not applicable, and leave an item unticked with a note when it is not true), tick the Linear acceptance criteria that have passing automated tests, move the issue to In Review, and confirm CI is green. Hand the owner the link and a short list of anything only they can do (for example a manual check on the deployed site). Do not hand over steps the agent can do itself.
- Good practice (accessibility, console errors, failure paths, rollback) is listed in the template. Tick each item or say why it does not apply.
- **Merging does not deploy.** Production changes only through the manual **Release** workflow (GitHub Actions, run on `main`). It waits for the owner's approval on the `production` environment, applies pending SQL migrations, then deploys the site and API. See [DECISIONS.md](DECISIONS.md) ADR-0004.
- Migrations must work with the code that is currently live, because the old code runs briefly after the migration. Add things first (new column, nullable), switch the code, and remove old things in a later release. CI fails on destructive statements unless the file has an explicit `-- allow-destructive` marker.
- Never edit a migration that has been released. Add a new one.
- **Dependabot pull requests are resolved as soon as they are ready.** Do not leave them waiting while feature work goes on. They conflict with each other, so a queue slows every later change. Check for open Dependabot pull requests at the start of each working session and before starting a new story.
  - Keep each one current with `@dependabot recreate`, which rebuilds it from `main`. Do not use "Update branch" or merge `main` in by hand. That creates a merge commit under the owner's personal email, which fails the hygiene check.
  - Merge a Dependabot pull request once CI is green and the branch is clean. Merge one at a time, lowest risk first, and recreate the rest after each merge.
  - For a major-version bump, read the release notes first. Say in "Release notes" of the pull request if the release path (`release.yml`) changed, because CI does not run that workflow.
  - If a bump fails CI, fix it in the same session or close it with a reason in the pull request. Do not leave it open.

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
| Tablet | 640 to 1023 px | Left icon rail (see wireframes-suite.html) |
| Desktop | 1024 px and wider | Left sidebar |

- Destinations: Home, Giving, Health, Car, Settings. The phone tab bar has five tabs (Home, Giving, Health, Car, More), and Settings is inside More. There is no Money destination (ADR-0021). See ADR-0017.
- Write mobile styles first, then add wider layouts.
- No horizontal scrolling at 360, 768, and 1280 px.
- Imports (Apple Health, mileage spreadsheet) are allowed on all viewports. If an Apple Health export is too large for the device, show "Import from a computer" (AC-HLT-03.7).
- Layout tests check all three widths. Only layout tests run the full width matrix.

## Testing

Follow [TESTING.md](TESTING.md). In short: a pyramid with many unit tests, fewer integration tests, and few end-to-end tests. Prove each acceptance criterion at the lowest level that can prove it. Write the failing test first for pure logic (parsers, mileage, totals).

## Acceptance criteria and test traceability

Every user story in Linear has acceptance criteria (AC) with a unique ID. The IDs (not the text) are listed in `docs/ac-ids.txt`.

**ID format:** `AC-<AREA>-<NN>.<n>`, for example `AC-MIL-03.2`.

- Area codes: MIG, FND, DEM, MIL, GIV, HLT, DSH, SET, OPS. (FIN is retired.)
- `<AREA>-<NN>` is the story key. It is also the prefix of the Linear issue title, for example `MIL-03: Mileage stats and graphs`.
- IDs are permanent. Never reuse or renumber one. Mark a removed criterion `(retired): reason` in its Linear issue, and add the word `retired` after its ID in `docs/ac-ids.txt`.
- When you add a criterion, take the next free number for that story, add it to the Linear issue, and add its ID to `docs/ac-ids.txt` in the same pull request.

**Tests must carry the ID in the test name**, inside square brackets at the start, so it shows up in every test report and can be found with grep:

```ts
// Unit or integration test (Vitest)
it('[AC-MIL-04.4] re-importing the same file creates no duplicates', async () => { /* ... */ });

// A test covering more than one criterion lists them all
it('[AC-MIL-04.1][AC-MIL-04.3] rejects bad files and flags changed rows', () => { /* ... */ });

// End-to-end (Playwright): put the ID in the title and also tag it
test('[AC-FND-04.1] phone shows the bottom tab bar', { tag: '@AC-FND-04.1' }, async ({ page }) => { /* ... */ });
```

Rules:

- One criterion can have several tests. A test may cover several criteria, but each ID must be in its name.
- Put the ID first in the name, exactly as written, with the `AC-` prefix.
- If a criterion cannot be automated (for example, "works inside the installed iOS PWA"), do not invent a test. Add it to `docs/manual-checks.md` with the same ID and the date it was last checked.
- A story is not done until every one of its criteria has either a passing automated test or a manual-check entry.
- Do not put real or realistic personal data in test names or fixtures.

**Traceability check.** `scripts/ac-coverage.mjs` reads `docs/ac-ids.txt` for all `AC-` IDs, searches tests and `docs/manual-checks.md`, and prints:

- criteria with no test or manual check,
- test IDs that do not exist in `docs/ac-ids.txt`, or that point at retired criteria (typos).

CI fails on the second list and reports the first. When the MVP is feature-complete, switch CI to `--strict` so the first list fails too.

## Working with Linear

- Linear is the source of truth for status, stories, and criteria text. The repo keeps only the criterion IDs, in `docs/ac-ids.txt`.
- The free plan allows **250 issues**. It is unconfirmed whether closed issues count, so assume they do. **Do not create issues without being asked.**
- **Do not create teams.** Use the existing team (key `ALE`).
- **No sub-issues.** Use the acceptance criteria as the checklist.
- One issue is one vertical slice of 1 to 3 days. If one grows past about 8 criteria, propose a split and ask first.
- Issue title: `<AREA>-<NN>: <short name>`. Description: the user story, then the acceptance criteria with their IDs.
- Phases are Linear milestones inside the Life Tracker project. Do not make an issue for a phase.
- Only MVP work gets issues now. "Next" and "Later" items stay in SPEC.md until they are about to start.
- Reference the story key in branch names and commit messages (see Git section).
- **Issue lifecycle.** Updating the issue is part of the work, not an afterthought.
  - **Before starting:** assign the issue to the owner (`me`), set an estimate, and move it to **In Progress**. If it has no estimate, propose one and set it. Do not start code on an unassigned, unestimated issue.
  - **While working:** move it to **In Review** when the pull request is open and waiting for CI or review, if that status helps. Otherwise leave it In Progress.
  - **Before opening a pull request:** once the work is done, tick the Linear issue's acceptance-criteria checkboxes for every criterion that has a passing automated `[AC-...]` test. Leave unticked any criterion covered only by a manual check, and say so in the pull request.
  - **When complete:** after the pull request is merged and the definition of done is met, move the issue to **Done**. Never mark it Done on an open pull request.
  - Work on one issue at a time unless the owner says otherwise.

## Standing requirements for every story

These apply to all stories and are not repeated as criteria on each one:

- The work merges through a pull request with green CI (ADR-0004).
- New API methods are added to both `client.ts` and `demoApi.ts`. The shared contract test (AC-DEM-01.5) fails if one is missing.
- Layout is checked at mobile, tablet, and desktop widths.
- Tests follow TESTING.md: each criterion is proven at the lowest level that can prove it.

## Definition of done

1. All acceptance criteria met, each with a passing `[AC-...]` test or a manual-check entry.
2. Works at mobile, tablet, and desktop widths.
3. Lint, type check, and all test levels pass in CI. The change merged through a pull request.
4. No personal data, secrets, or banned log fields (see Hard rules).
5. New API methods exist in both `client.ts` and `demoApi.ts`.
6. Diagrams in ARCHITECTURE.md updated if the structure or a flow changed.
7. SPEC.md, DECISIONS.md, or `docs/ac-ids.txt` updated if behavior, a decision, or a criterion changed.
8. Any migration is backward compatible with the live code.

## Stack

Decided in [DECISIONS.md](DECISIONS.md):

- pnpm workspaces: `web`, `api`, `shared`.
- Web: React, TypeScript, Vite, PWA, React Router, TanStack Query, Recharts, Tailwind.
- API and hosting (target, ADR-0021): a Cloudflare Worker (Hono, TypeScript) serving the web app and `/api/*`, behind Cloudflare Access. Login is Cloudflare Access with the owner re-checked in the API (MIG-04).
- Database: Neon Postgres, hand-written parameterized SQL through the `pg` package, numbered `.sql` migrations (`DATABASE_URL` for the app role, `DATABASE_ADMIN_URL` for migrations). Setup: [db/setup/README.md](db/setup/README.md).
- Validation: zod, shared by client and API.
- Tests: Vitest, Testing Library, fast-check, Testcontainers (Postgres), Playwright with a local server (`wrangler dev` after MIG-03).
- Telemetry: Workers Logs (MIG-06), written only through the allow-listed logger.
- Source, CI, release, and login: GitHub (Actions, protected `main`, `production` environment).

## Cost

Target $0 per month. Do not add paid services, always-on compute, or extra cloud resources without asking.
