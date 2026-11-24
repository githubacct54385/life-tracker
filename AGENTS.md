# AGENTS.md

Instructions for AI coding agents (and humans) working on Life Tracker. Read this first.

## What this is

A web app (installable PWA) for health, mileage, and giving, used by the owner and by a few people the owner invites, each with their own private data (ADR-0026). **Finance and transaction tracking are not part of this app** (ADR-0021); never add them. The code is public. Each person's data is private to them. Sign-in is by invitation only. Read these before building anything:

- [SPEC.md](SPEC.md): features, priorities, security requirements
- [ARCHITECTURE.md](ARCHITECTURE.md): layers, dependency rules, sequence diagrams
- [DECISIONS.md](DECISIONS.md): why each technical choice was made (ADRs). Check here before changing a choice.
- [TESTING.md](TESTING.md): the test pyramid, what goes at which level, CI jobs
- [OBSERVABILITY.md](OBSERVABILITY.md): logging rules
- [docs/cloudflare-release-setup.md](docs/cloudflare-release-setup.md): the Cloudflare token and secrets the Release workflow needs
- [docs/setup.md](docs/setup.md): set up Neon, Cloudflare and GitHub from scratch (Cloudflare + Neon, ADR-0021)
- [docs/privacy.md](docs/privacy.md): what is stored about a person and how it is deleted
- [docs/multi-person-plan.md](docs/multi-person-plan.md): the order of Releases for sign-in and per-person data
- [docs/ac-ids.txt](docs/ac-ids.txt): the list of valid acceptance-criterion IDs. The stories and criteria text are in Linear.
- [wireframes-suite.html](wireframes-suite.html): every MVP screen at mobile, tablet, and desktop widths

If these documents conflict with a request, say so and ask. Do not silently pick one.

## Hard rules

1. **No personal data in the repo.** No bank or financial data of any kind, no account numbers, names, birthdates, photos, odometer history, or health values. Not in code, tests, fixtures, comments, or commit messages. Use synthetic data only. Any child in the demo is fictional.
2. **No secrets in the repo.** No connection strings, subscription or tenant IDs, tokens, or the owner's user IDs (GitHub or Cloudflare Access) in any file. Use GitHub secrets and Cloudflare Worker secrets.
3. **Never commit** `*.csv`, `*.xlsx`, Apple Health exports, or local settings. Test and demo fixtures are generated in code, not stored as data files.
4. **Fail closed.** If the person cannot be confirmed as an active, invited user, the API returns nothing, and one person can never reach another person's data (the answer is "not found"). The only things open to an unsigned visitor are the homepage, the login page, the demo, and the one request-access write route, and a test proves every other route refuses. Until the sign-in work ships (SET-07), Cloudflare Access plus the owner check is the gate.
5. **Do not store uploaded files.** Parse (in the browser where possible), keep the parsed rows, discard the file. The one exception is documents the owner attaches to a car service, kept in private storage under the limits in [ADR-0024](DECISIONS.md#adr-0024-maintenance-documents-are-stored-privately-in-cloudflare-r2).
6. **No private data in logs or telemetry.** All logging goes through `telemetry/logger.ts` and its field allow-list.
7. **Demo mode never calls the real API.**
8. Commit with the GitHub noreply email only. `scripts/check-hygiene.sh` checks this in CI.
9. **No test-only bypass in auth code.** The auth guard (`ownerGuard` today, the session guard after SET-07) never reads an environment flag. Tests sign synthetic tokens (Cloudflare Access now, Google ID tokens later) with a throwaway key and pass that key in (`api/src/testing/accessTokens.ts`, `web/e2e/support/accessKeys.mjs`).
10. **Never apply migrations from the app.** Only the release workflow (or a developer against a local database) runs them.

## Git, pull requests, and release

- `main` is protected. **Nobody pushes to it directly, including the owner.** Every change goes through a pull request.
- Branch names start with the story key, for example `mil-03-mileage-graphs`. Commit messages start with it too, for example `MIL-03: add rolling average line`.
- A pull request can merge only when CI is green and its branch is up to date with `main`. Merging is by **squash**, which keeps `main` linear.
- **Delete a pull request's branch after it merges.** The repository deletes head branches on merge, so merged work does not pile up. If a branch is still there after a merge, delete it by hand.
- Keep pull requests small, ideally one story or part of one.
- **Every pull request uses the template in [.github/pull_request_template.md](.github/pull_request_template.md).** Do not delete sections or remove checklist items. Mark an item not applicable with a reason instead of leaving it unticked.
- **Screenshots are required** for any pull request that changes a page or visible component. They show each changed screen at mobile (360 px), tablet (768 px), and desktop (1280 px), before and after, using synthetic data only. **GitHub Actions takes and attaches them. The owner does nothing, and the agent needs no upload access.** When opening the pull request, the agent puts one line under the Screenshots heading naming the changed screens, for example `Screens: Home=/, Car=/car` (a name, `=`, and the path, separated by commas). The workflow `pr-screenshots.yml` then builds `main` and the branch, takes the screenshots, uploads them as assets of the `pr-screenshots` release, and fills the Screenshots table. A screen that does not exist on `main` is shown as "new screen". With no `Screens:` line it does nothing. Never commit images to the repo. A workflow deletes a pull request's images when it closes. `pnpm pr-screenshots --pr <number> --from-body` does the same by hand from a computer with GitHub access, and `--dry-run` only writes the images to a local folder. See [DECISIONS.md](DECISIONS.md) ADR-0019.
- **The agent gets the pull request ready, and the owner only reviews.** Before saying a pull request is ready: push the branch, open it from the template, add the `Screens:` line if the UI changed (the workflow attaches the screenshots), fill every checklist item honestly (tick with a reason when not applicable, and leave an item unticked with a note when it is not true), tick the Linear acceptance criteria that have passing automated tests, move the issue to In Review, and confirm CI is green. Hand the owner the link and a short list of anything only they can do (for example a manual check on the deployed site). Do not hand over steps the agent can do itself.
- **CI has the final say on whether code is good.** A green CI run on the pull request is what counts. The agent runs the checks in its own sandbox before pushing, and the owner does not have to repeat them.
- **When CI fails on GitHub Actions, ask the developer who should run the tests.** Do not start re-running tests on your own. First say which job and which test failed, then ask: "Do you want me to run the failing tests myself, or would you rather run them?" Wait for the answer. Either way, give the developer a **filtered command** that runs only the relevant tests, never the whole suite. Use `scripts/run-tests.sh`, which starts anything the tests need (a throwaway Postgres for end-to-end tests), runs only what you name, and removes everything afterwards, including restoring `api/.dev.vars`. The owner has Docker installed, so offer the script as the default. Other developers on this app should install Docker first (see [docs/local-docker.md](docs/local-docker.md)); suggest that to them, and then the script is the only command they need. Docker is not needed for unit tests. Run it from the repository root:
  - One unit test file or test name: `scripts/run-tests.sh unit web src/pages/groceries/GroceriesPage.test.tsx -t "typed for the next item"` (the package is `web`, `api` or `shared`). The `-t` text is matched against the test name, so an acceptance-criterion ID such as `-t "AC-GRO-01.1"` works.
  - One integration test file: `scripts/run-tests.sh int api src/handlers/groceryApi.int.test.ts`
  - One end-to-end spec: `scripts/run-tests.sh e2e e2e/stack/groceriesOffline.spec.ts`, and add `-g "AC-..."` to run one test.
  - Copy the file path and test name from the CI log, so the command matches the failure exactly. If the failure is lint or type checking, give `pnpm lint` or `pnpm typecheck` instead.
  - If the developer says to run it yourself, use the same filtered command, then push the fix and confirm CI is green.
- **To see what the tests check, run `pnpm tests:list`** (add an area, story or criterion to filter, and `--commands` to get the command that runs each test). It reads the test names, so write them as sentences. See [TESTING.md](TESTING.md).
- **Hand over a "try it" block with every finished feature.** It is optional and for the owner's own benefit, and it has two parts. First, how to see the feature working: fetch and switch to the branch (`git fetch origin <branch>`, `git switch <branch>`), then where to click, and any check only the owner can do. Second, a short "if you want fast feedback" list of commands the owner may run on their computer, never required: `pnpm lint`, `pnpm typecheck` and `pnpm test:unit` (about a minute, no Docker), and the heavier `pnpm test:int` (Docker running) and `pnpm test:e2e` (with `E2E_ADMIN_DATABASE_URL` set, see [docs/local-docker.md](docs/local-docker.md)) for reproducing a CI failure. Name anything that overwrites local files (the end-to-end run rewrites `api/.dev.vars`). A local pass never replaces CI, and a local failure that CI does not show is worth a look, not a blocker.
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

- Area codes: MIG, FND, DEM, MIL, GIV, HLT, DSH, SET, GRO, OPS. (FIN is retired.)
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
- **Interview the owner before a new issue, and keep them in the loop.** The owner wants to be involved in how features are shaped, in plain language, without reading code.
  - **Before creating an issue** (only when asked), interview the owner. Ask 3 to 6 short questions in everyday words, using the question tool, each with a recommended default first. Ask only where the answer changes what is built, how long it takes, or what it costs. Do not ask about things the code or the docs already settle.
  - Then write the issue: the story, the acceptance criteria with their IDs, and a "Decisions by the owner" section recording each answer (as GRO-01 does). Read the criteria back to the owner in plain words and fix them before any code is written. **The criteria are recorded in the Linear issue**, which stays the source of truth.
  - **Before starting an existing issue** that was not interviewed, restate its criteria in plain words and ask about anything unclear or anything the code makes impossible as written (for example, a criterion that names a page that does not exist yet). Record the answers in the issue.
  - **While building,** if a choice changes a criterion, its cost or what the owner will see, stop and ask. Do not pick silently.
  - **When handing over,** say in plain steps what to open and tap to see it work, and list each criterion as checked by a test, checked by hand (and by whom), or not done yet. The standing "try it" block still applies.
- **Issue lifecycle.** Updating the issue is part of the work, not an afterthought.
  - **Before starting:** assign the issue to the owner (`me`), set an estimate, and move it to **In Progress**. If it has no estimate, propose one and set it. Do not start code on an unassigned, unestimated issue.
  - **While working:** move it to **In Review** when the pull request is open and waiting for CI or review, if that status helps. Otherwise leave it In Progress.
  - **Before opening a pull request:** once the work is done, tick the Linear issue's acceptance-criteria checkboxes for every criterion that has a passing automated `[AC-...]` test. Leave unticked any criterion covered only by a manual check, and say so in the pull request.
  - **When complete:** an issue may be marked **Done** only when all three are true: (1) the pull request is **merged to `main`**, (2) the change is **deployed to staging** (the Staging workflow succeeded on the merge commit, shown by the `staging-smoke` status), and (3) **the owner has performed manual tests** of the feature and said so. Never mark it Done on an open pull request, before staging has the change, or on the agent's own testing alone. Staging is not production: production still needs the owner's Release (see below).
  - **Manual test steps are the agent's job.** The agent writes them, in plain steps for someone who has not read the code: where to open on staging (the address is the `STAGING_URL` variable of the `staging` environment, behind Cloudflare Access, with synthetic data only), what to tap, and what should happen. Cover the main path and one thing that should be refused or empty. **Put them in the Linear issue**, in a "Manual test steps" section with a checkbox for each step, because the issue is where Done is decided and it outlives the pull request. In the pull request, add one line that links to that section, and keep the technical "try it" block there (branch commands and the fast-feedback commands). Write the steps before opening the pull request, then **after the merge** check that staging has the change and tell the owner it is ready to test, with the steps. A change with nothing a person can see (tooling, docs, CI) still gets a short check, such as "open the README on GitHub and look for the new badge".
  - When the owner has finished the manual tests, tick the steps and any criteria that were covered only by a manual check (adding the date to `docs/manual-checks.md`), then move the issue to Done. If a step fails, leave the issue In Review and fix it in a new pull request.
  - **Three gates on an issue.** Check each one before the change, and do not skip it:
    - **Created:** a new issue (only when the owner asks for one) must have an **estimate** when it is created. If the owner did not give one, propose one and set it in the same call.
    - **Moved to In Progress:** the issue must be **assigned** (to `me`, the owner) at the moment it moves. Assign it in the same update that changes the status.
    - **Marked Done:** the change must be **merged to `main` and deployed to staging, and the owner must have done the manual tests** (see "When complete"). Also **every acceptance criterion must be ticked** first. A criterion covered by a manual check is ticked when the owner has done the check and `docs/manual-checks.md` shows the date. A retired criterion is marked `(retired): reason` instead of ticked. If any box is still empty, leave the issue In Review and say which criteria are missing, instead of marking it Done.
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
3. Lint, type check, and all test levels pass in CI. The change merged through a pull request, is deployed to staging, and the owner has done the manual tests.
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
