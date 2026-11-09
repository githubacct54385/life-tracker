# Backlog for Linear (Draft v0.2)

Project name: **Life Tracker**. Use the existing Linear team (key `ALE`). Do not create teams. Milestones (not issues) hold the phases from SPEC.md section 12, so they don't use up the 250-issue allowance.

**Created in Linear on 2026-11-08:** project Life Tracker, 6 milestones, and 34 issues (ALE-5 to ALE-38, numbered in the order they were created, not the order to work on them). The 4 archived onboarding issues (ALE-1 to ALE-4) also exist, so 38 of the 250 free-plan issues are used. When a criterion changes here, change it in the Linear issue too.

## Sizing rules

- One issue is one **vertical slice**: a user-visible capability that works end to end (screen, API, database) and can be demoed. Target 1 to 3 days of work.
- No sub-issues, because each one counts toward the 250. Use the acceptance criteria list as the checklist.
- Split an issue if it has more than about 8 acceptance criteria. Merge issues if one cannot be demoed without the other.
- Only MVP work is in Linear for now: **34 issues**. "Next" and "Later" features stay in SPEC.md and become issues when they are about to start. That leaves a large margin under 250.

## Standing requirements for every story

These apply to all stories and are not repeated as criteria on each one:

- The work merges through a pull request with green CI (AGENTS.md, ADR-0004).
- New API methods are added to both `client.ts` and `demoApi.ts`. The shared contract test (AC-DEM-01.5) fails if one is missing.
- Layout is checked at mobile, tablet, and desktop widths.
- Tests follow TESTING.md: each criterion is proven at the lowest level that can prove it.

## Acceptance criteria IDs

Format: `AC-<AREA>-<NN>.<n>`, for example `AC-FIN-03.2`.

- `<AREA>-<NN>` is the story key, and it is the prefix of the Linear issue title (`FIN-03: Import preview`). Using our own key means the ID never depends on Linear's numbering.
- IDs are never reused or renumbered. A removed criterion stays in the list as `- AC-X-NN.n (retired): reason`.
- Tests include the ID in the test name. See AGENTS.md.

Areas: FND foundation, DEM demo, MIL mileage, FIN finance, GIV giving, HLT health, DSH dashboard, SET settings, OPS operations.

## Milestones

Story keys never change, even when a story moves to a different milestone.

1. **Foundation:** FND-01 to FND-06, SET-03, OPS-01, DEM-01 (9 issues). Logging, security headers, and the demo skeleton are here because their rules apply from the first handler and the first screen. Suggested order: FND-02 and FND-05 first, to settle the iOS PWA sign-in risk early.
2. **Mileage MVP:** MIL-01 to MIL-04, OPS-02 (5). OPS-02 (budget alert, restore test) comes before any real data is loaded.
3. **Finance MVP:** FIN-01 to FIN-09 (9). Suggested order: FIN-01, FIN-08, FIN-02, FIN-03, FIN-04, FIN-09, FIN-05, FIN-06, FIN-07.
4. **Giving MVP:** GIV-01 to GIV-03 (3)
5. **Health MVP:** HLT-01 to HLT-04 (4). Do the Apple Health memory spike before HLT-03 (ADR-0009).
6. **Dashboard and polish:** DSH-01, SET-01, SET-02, DEM-02 (4)

## Change log from v0.1

- FND-01: AC-FND-01.1 retired (push to `main` no longer deploys). Replaced by FND-06. Added criteria for protected `main`.
- New stories: FND-06 (manual release), FIN-08 (accounts and manual entry), FIN-09 (undo an import).
- Moved to earlier milestones: SET-03, OPS-01, DEM-01 to Foundation; OPS-02 to Mileage.
- FIN: category types (income, expense, transfer), rule order, fingerprint occurrence numbers, commit validation, merchant cleanup.
- HLT-03: Apple Health parsed in the browser.
- MIL-02: Friday-to-Thursday weeks with interpolation.
- FND-02: custom-header request protection and no auth bypass. FND-03: separate admin login, migration journal. FND-04: tablet icon rail approved, and Giving is its own destination (inside More on phone).
- Wording made generic (no bank name, no personal details).

---

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
- AC-FND-03.4: Tests run against a throwaway SQL Server container with synthetic data only.
- AC-FND-03.5: The migration script refuses to run if an already-applied migration file has changed.
- AC-FND-03.6: Layer rules (`pages` to `client` to `handlers` to `services` to `repositories` to `db`) are enforced by a dependency check in CI.

### FND-04: Responsive app shell
**Story:** As the owner, I want the app to adapt to phone, tablet, and desktop, so that it feels right on whichever device I use.- AC-FND-04.1: Below 640 px wide, navigation is a bottom tab bar (Home, Money, Health, Car, More). Giving and Settings are inside More.
- AC-FND-04.2: From 640 to 1023 px, navigation is a left icon rail (Home, Money, Giving, Health, Car, More).
- AC-FND-04.3: At 1024 px and wider, navigation is a left sidebar (Home, Money, Giving, Health, Car, Settings).
- AC-FND-04.4: No horizontal scrolling at 360, 768, and 1280 px widths.
- AC-FND-04.5: Light and dark themes both work at every breakpoint.

### FND-05: PWA and offline behavior
**Story:** As the owner, I want to install the app on my phone, so that it opens like a native app.
- AC-FND-05.1: The app can be added to the iPhone home screen and opens full screen. (Manual check.)
- AC-FND-05.2: Only the app shell is cached. API responses are never cached.
- AC-FND-05.3: When offline, a clear offline message shows and no private data is displayed.
- AC-FND-05.4: While the database wakes from auto-pause, the app shows a loading state and retries once instead of an error.

### FND-06: Manual release pipeline
**Story:** As the owner, I want to release to production by hand, with database migrations applied first, so that nothing reaches real data without my approval.
- AC-FND-06.1: Production is deployed only by a manually started Release run on `main`. Merging to `main` does not deploy.
- AC-FND-06.2: The Release run waits for the owner's approval on the `production` environment before it uses any production secret.
- AC-FND-06.3: The release first checks that CI passed on the exact commit being released.
- AC-FND-06.4: Pending SQL migrations run before the site and API are deployed. If a migration fails, nothing is deployed.
- AC-FND-06.5: CI fails on destructive migration statements (drop, rename, narrowing a column) unless the file has an explicit `-- allow-destructive` marker.
- AC-FND-06.6: The run summary lists the commit released and the migrations applied.
- AC-FND-06.7: Azure access uses OIDC federation or environment secrets. No credentials are in the repo.

### SET-03: Security headers and upload limits
**Story:** As the owner, I want the app hardened, so that financial and health data are protected.
- AC-SET-03.1: HTTPS only, with a Content Security Policy and standard security headers.
- AC-SET-03.2: All upload endpoints enforce size and type limits on the server.
- AC-SET-03.3: A scan of the repo finds no CSV, export, or real data files.

### OPS-01: Logging and observability
**Story:** As the owner, I want errors and slow calls visible, so that I can fix problems without leaking data.
- AC-OPS-01.1: Application Insights receives request and failure telemetry from the API.
- AC-OPS-01.2: All logging goes through one logger that accepts only an allow-list of fields.
- AC-OPS-01.3: A test fails if a fake merchant, amount, weight, or odometer value appears in captured logs.
- AC-OPS-01.4: Sampling is on and a daily data cap is set.
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
- AC-OPS-02.1: An Azure budget alert is set at about $5.
- AC-OPS-02.2: Database point-in-time restore is enabled and a restore has been tried once. (Manual check.)
- AC-OPS-02.3: A documented manual export procedure exists in the repo (no data in the repo).
- AC-OPS-02.4: The database is set to auto-pause until next month when the free allowance is used up, not to continue and bill (ADR-0001). (Manual check.)
- AC-OPS-02.5: An email alert fires when the free database allowance is low (under 10,000 vCore seconds remaining). (Manual check.)

## Milestone 3: Finance MVP

### FIN-01: Category and rule management
**Story:** As the owner, I want categories and merchant rules, so that transactions can be sorted automatically.
- AC-FIN-01.1: Default categories exist, and I can add, rename, and delete categories.
- AC-FIN-01.2: A rule maps "merchant contains text" to a category. Matching ignores case.
- AC-FIN-01.3: Rules can be edited and deleted.
- AC-FIN-01.4: Deleting a category in use asks where to move its transactions.
- AC-FIN-01.5: Every category has a type: expense, income, or transfer (ADR-0011).
- AC-FIN-01.6: Rules are checked in order and the first match wins. I can reorder them.
- AC-FIN-01.7: A "re-apply rules" action categorizes existing uncategorized transactions and reports how many changed.

### FIN-08: Accounts and manual entry
**Story:** As the owner, I want to keep my accounts separate and add a transaction by hand, so that cash and gaps are covered.
- AC-FIN-08.1: I can add and rename accounts with a name and a type (checking, credit card, cash). No account numbers are ever stored.
- AC-FIN-08.2: Every transaction belongs to one account, and the transaction list can filter by account.
- AC-FIN-08.3: I can add a transaction by hand with date, amount, description, account, and category.
- AC-FIN-08.4: Manual transactions are labeled "manual" and can be edited and deleted.
- AC-FIN-08.5: An import asks which account the file belongs to and saves its transactions to that account.

### FIN-02: CSV upload and parsing
**Story:** As the owner, on my desktop, I want to upload a bank export file, so that I can bring in transactions.
- AC-FIN-02.1: The upload screen is available at 1024 px and wider.
- AC-FIN-02.2: Below 1024 px, the Import entry is hidden and a message says to import from a computer.
- AC-FIN-02.3: Only .csv and .xlsx files up to 5 MB and 5,000 rows are accepted, and others are rejected with a clear message. Trailing empty rows are ignored.
- AC-FIN-02.4: The primary bank's layout is detected by its header row (DATE, DESCRIPTION, AMOUNT, CHECK #, STATUS), in a .csv or an .xlsx, with or without a title row above the header. Dates are read as MM/DD/YYYY text, and amounts become integer cents. Column mapping is configurable so other banks can be added. A file with no recognizable header is rejected with a clear message.
- AC-FIN-02.5: Account numbers are dropped and never leave the parser, including any digits in the file's title row. The title row may only be used to suggest which account the file belongs to.
- AC-FIN-02.6: The uploaded file is not written to disk or storage.
- AC-FIN-02.7: A malformed row (a bad date or amount, or the wrong number of fields) is reported with its row number and does not stop the rest.
- AC-FIN-02.8: Each row gets a cleaned merchant name (processor prefixes and trailing reference numbers removed). The original text is kept and is what rules also match against.

### FIN-03: Import preview
**Story:** As the owner, I want to see what will be saved before saving, so that I can catch mistakes.
- AC-FIN-03.1: The preview shows counts for total, new, duplicate, and needs-category rows.
- AC-FIN-03.2: Rows can be filtered by status.
- AC-FIN-03.3: Duplicate rows are visually distinct and skipped by default.
- AC-FIN-03.4: Rules are applied to new rows, and unmatched rows show "Needs category".
- AC-FIN-03.5: A category can be set on a row inside the preview.
- AC-FIN-03.6: Nothing is saved to the database during preview.
- AC-FIN-03.7: Rows the bank marks Pending are shown as "Pending", counted, and skipped. They import on a later upload once they are Posted (ADR-0016).

### FIN-04: Duplicate detection and import commit
**Story:** As the owner, I want overlapping uploads to be safe, so that I never double-count a transaction.
- AC-FIN-04.1: Re-uploading the same file imports zero new rows.
- AC-FIN-04.2: A file overlapping an earlier one imports only the rows not already saved.
- AC-FIN-04.3: Two genuinely identical transactions on one day in the same account are both kept. Each gets an occurrence number in its fingerprint (ADR-0010).
- AC-FIN-04.4: A database failure during commit saves nothing (all or nothing).
- AC-FIN-04.5: The database enforces uniqueness of the fingerprint as a backstop if a duplicate slips past the app check.
- AC-FIN-04.6: After import, a success screen links to the new transactions.
- AC-FIN-04.7: The commit call validates every row it receives (schema, at most 5,000 rows, known category and account) and recomputes fingerprints itself. It does not trust values from the browser.

### FIN-09: Undo an import
**Story:** As the owner, I want to undo a bad import, so that I never fear importing.
- AC-FIN-09.1: An import history lists each batch with date, account, and row count.
- AC-FIN-09.2: Undoing a batch deletes exactly that batch's transactions, after a confirmation.
- AC-FIN-09.3: The confirmation states how many of the batch's transactions were edited by hand since the import.
- AC-FIN-09.4: Undo is all or nothing.
- AC-FIN-09.5: After an undo, re-uploading the same file imports those rows again.

### FIN-05: Transaction list and search
**Story:** As the owner, I want to browse and filter transactions, so that I can find what I spent.
- AC-FIN-05.1: Transactions are listed newest first, with paging.
- AC-FIN-05.2: I can search by merchant text and filter by date range, category, and amount range.
- AC-FIN-05.3: A "needs category only" filter exists.
- AC-FIN-05.4: At 1024 px and wider the list is a table with an edit side panel. Below that it is a list with a bottom sheet.

### FIN-06: Edit transaction and teach the app
**Story:** As the owner, I want fixing one category to fix similar ones, so that I categorize less over time.
- AC-FIN-06.1: I can change a transaction's category, merchant text, and note.
- AC-FIN-06.2: "Apply to similar" creates a rule and updates other uncategorized matches.
- AC-FIN-06.3: The result states how many other transactions were updated.
- AC-FIN-06.4: Rule creation and updates happen in one database transaction.

### FIN-07: Monthly summary and trends
**Story:** As the owner, I want monthly totals and trends, so that I understand my spending.
- AC-FIN-07.1: A month view shows total spent, spending by category, and change versus the previous month.
- AC-FIN-07.2: Moving between months works with previous and next controls.
- AC-FIN-07.3: A trends chart shows spending over time.
- AC-FIN-07.4: "Spent" counts only expense-type categories. Income and transfers are excluded.
- AC-FIN-07.5: Charts use accessible colors and have text alternatives.

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
- AC-DSH-01.1: It shows this month's spending versus last month, latest weight with trend, last week's miles, and workouts this week.
- AC-DSH-01.2: An odometer-due banner shows only when this week's reading is missing.
- AC-DSH-01.3: Quick actions: add weight, add workout, log odometer. "Upload CSV" appears at 1024 px and wider only.
- AC-DSH-01.4: The layout uses one column on mobile, and a multi-column grid on tablet and desktop.

### SET-01: Settings and sign out
**Story:** As the owner, I want a settings screen, so that I can sign out and manage preferences.
- AC-SET-01.1: Sign out ends the session.
- AC-SET-01.2: Categories and rules are reachable from settings.
- AC-SET-01.3: A theme switch offers light, dark, and system.
- AC-SET-01.4: The owner time zone and weight unit can be set (ADR-0007).

### SET-02: Accessibility and quality pass
**Story:** As a reviewer of the portfolio, I want the app to meet basic accessibility standards, so that it reads as professional.
- AC-SET-02.1: Text contrast meets WCAG AA in both themes.
- AC-SET-02.2: Every screen is usable with keyboard only on desktop.
- AC-SET-02.3: Touch targets are at least 44 px on mobile.
- AC-SET-02.4: Lighthouse accessibility score is 90 or higher on the main screens.
- AC-SET-02.5: Every list and chart has an empty state that says what to do next.

### DEM-02: Demo import walkthrough
**Story:** As a visitor, I want to see the CSV import flow on a sample file, so that I understand the feature.
- AC-DEM-02.1: The demo import screen offers a built-in sample file, generated in code.
- AC-DEM-02.2: The demo walks through upload, preview, and done using the sample.
- AC-DEM-02.3: Nothing is sent to a server.

---

**Count: 34 issues** (FND 6, MIL 4, FIN 9, GIV 3, HLT 4, DSH 1, SET 3, DEM 2, OPS 2).
