# Personal Life Tracker: Product Spec (Draft v0.3)

Status: planning, with foundation code in place. Technical choices are recorded in [DECISIONS.md](DECISIONS.md). Stories and acceptance criteria are in Linear (project Life Tracker); the valid criterion IDs are in [docs/ac-ids.txt](docs/ac-ids.txt).

## 1. Purpose

A private, single-user web app (installable on a phone) for tracking health, mileage, and charitable giving. It is also a public portfolio project. The code is public. The data and the login are private.

## 2. Goals

- Track weekly mileage, with graphs, from a quick odometer entry and an imported spreadsheet history.
- Track charitable giving by month, including special contributions.
- Track weight and workouts, with workouts imported from Apple Watch.
- Be fast and pleasant on a phone, installed as a PWA.
- Cost roughly $0 to $2 per month to run.
- Look professional enough to show in a portfolio.
- Be secure enough for real health and giving data.
- Show good engineering practice: protected `main`, pull requests, automated tests on a test pyramid, and a manual, approved release.

## 3. Non-goals

- Multi-user support, sign-ups, or sharing. Only the owner can store data.
- **Finance and transaction tracking.** Bank transactions, accounts, budgets, and spending analysis are out of scope. They live in a separate private repository, because the owner does not want transaction data on an internet-hosted app at all (ADR-0021).
- Storing raw uploaded files.
- Native iOS app.

## 4. Guiding principles

1. **Nothing personal in the repo.** No real data, not even in tests.
2. **Fail closed.** If identity cannot be confirmed as the owner, the API returns nothing.
3. **Store the minimum.** Keep parsed rows only, not source files. No bank or transaction data at all.
4. **Phone first.** Every screen is designed for a phone, then scaled up.
5. **Demo is separate from real.** Demo mode never touches the real backend.
6. **Nothing reaches production by accident.** Changes merge by pull request; releases are manual and approved.

## 5. Users and access

| Who | Can do |
|---|---|
| Owner (signed in with GitHub) | Everything |
| Anonymous visitor | View the demo with fake data, in the browser only |
| Any other GitHub user | Signs in, gets denied, stores nothing |

- GitHub is the only login provider. Passkeys and 2FA are enforced on the GitHub account.
- Two checks protect the API: Cloudflare Access at the edge (GitHub sign-in, owner-only policy), and an owner check in the API that verifies the signed Access token and compares the identity to the owner setting (ADR-0006 as amended by ADR-0021). The GitHub username alone is not trusted for the check, because usernames can change hands. GitHub is the only way in.
- Owner identity lives in app settings, not in the repo.
- There is no test-only bypass in the auth code (ADR-0006).

## 6. Feature areas

Priority: **MVP** = first release, **Next** = soon after, **Later** = nice to have.

### 6.1 Finance (removed)

Out of scope as of 2026-11-10 (ADR-0021). Transaction tracking, accounts, categories and rules, bank file import, spending summaries, and the related "Next" and "Later" ideas live in a separate private repository. Nothing financial is stored in this app. This section number is kept so other references stay stable. The retired stories are FIN-01 to FIN-09 in Linear (canceled); their criterion IDs are marked retired in [docs/ac-ids.txt](docs/ac-ids.txt).

### 6.2 Health

| Feature | Priority |
|---|---|
| Log weight (a value; it is dated when saved, with no date to enter), with a trend line and moving average. Pounds or kilograms. | MVP |
| Log workouts manually (type, duration, notes; dated when saved, with no date to enter) | MVP |
| Import workouts from an Apple Health export (the ZIP is opened in the browser) | MVP |
| Workout history, weekly and monthly totals, consistency streaks | MVP |
| Goals: target weight, workouts per week | Next |
| Import weight from the Apple Health export too | Next |
| Optional daily check-in: mood (1 to 5) and hours slept | Next |
| Correlation view (for example, workouts vs. mood vs. miles driven) | Later |

Notes:
- Apple Health export: Health app, profile picture, Export All Health Data. This produces a ZIP with an XML file. The app opens it **in the browser** (in a background worker), reads only the workouts, and sends only those rows to the API. The ZIP itself never leaves the device (ADR-0009). Importing is a manual step. Fully automatic sync would need a native app or a third-party shortcut, and is out of scope.
- Risk: very large exports may not fit in phone browser memory. A spike on a real phone comes before building this. Fallback: import from a computer.
- Sleep without a watch: log bedtime and wake time by hand, which takes about 10 seconds. Mood and sleep only pay off if logged consistently, so they stay optional and are not in the first release.

### 6.3 Dashboard (home)

- One phone-sized screen with the latest weight and trend, last week's miles, workouts this week, and year-to-date giving.
- Quick actions: add weight, add workout, log odometer, add giving.

### 6.4 Settings and data control

| Feature | Priority |
|---|---|
| Sign out | MVP |
| Owner time zone and weight unit | MVP |
| Export all my data | Next |
| Delete all my data | Next |
| Light and dark theme | MVP |

### 6.5 Vehicle and mileage

| Feature | Priority |
|---|---|
| Weekly odometer entry (one number, fast on a phone). The screen never asks for a date or time: the reading is dated at the moment it is saved, so a late reading simply counts for the week it is entered in. | MVP |
| Import existing Excel history (upload the .xlsx or a CSV export of it). Columns: Date, Start Miles (Friday), Miles Driven. The importer reads Date and Start Miles, recalculates miles driven itself, and flags any row where its result differs from the sheet's calculated column. | MVP |
| Miles driven per week, with graphs | MVP |
| Rolling average, monthly and yearly totals, busiest and quietest weeks | MVP |
| Sanity checks: warn if a reading is lower than the last one or implausibly high | MVP |
| Missed weeks handled gracefully. History starts in late 2024 and has skipped Fridays, so gaps are normal, not errors. A missed week is shown as a gap ("no reading") and never guessed (ADR-0008). The app is flexible about late readings: a reading is always dated when it is entered, and readings can be edited or deleted later. Older history comes in through the spreadsheet import, which carries its own dates. | MVP |
| Weekly reminder (see 6.10) | MVP |
| Fuel fill-ups: gallons, cost, MPG and cost per mile (entered by hand) | Next |
| Maintenance reminders by mileage or date (oil change, tires, registration, insurance) | Next |
| Multiple vehicles | Later |

**How weeks are calculated (ADR-0008, amended 2026-11-10).** Weeks run Friday to Thursday. A week's reading is the earliest one taken in it, so a reading added on Saturday still counts for that Friday's week (the period is then 8 days). Miles for a period are the difference between consecutive weekly readings. The app never guesses a missing reading: a week with no reading is shown as a gap, and the screen is flexible about late readings and missed weeks (a reading is always dated when it is entered).

### 6.6 Giving (charitable)

| Feature | Priority |
|---|---|
| Log a gift: date given (a date only, never a time), **month it is for**, amount, payment method, optional note. The "for" month can differ from the date given (for example, a January gift made in early February). | MVP |
| Multiple gifts allowed for the same month. The month total is the sum. | MVP |
| **Special contributions** as a separate type with their own name or occasion (for example, a once or twice a year offering). Listed and totaled separately from regular monthly giving, but shown together in the yearly summary. | MVP |
| Monthly giving history (regular only), special contributions list, and year-to-date totals for each plus combined | MVP |
| Flag months with no regular gift recorded, so a missing entry is easy to spot | MVP (the "no gift" mark in GIV-03); a reminder is Next |
| Payment method on each gift (check, online service with card) | MVP |
| Yearly giving summary for tax records (totals only, not tax advice) | Next |
| Giving as a percent of income, with an optional personal target | Later |

Notes: the app stores amounts and dates, not receipt images, unless we decide later to add private file storage.

### 6.7 Family (a child)

This is the most sensitive module, because it is a child's information. Decided scope: growth log and journal only. Doctor and dentist visits stay in the calendar app. Minimum data only. In the repo and demo, any child is fictional with a nickname, never a real name, birthdate, photo, or school. The whole module is *Next*, so it is not in the first release or the first demo.

| Feature | Priority |
|---|---|
| Growth log: height and weight over time, with a chart | Next |
| Milestones and memories journal (first lost tooth, first bike ride), plus things said | Next |
| Books read together, and activities or sports being tried | Next |
| Parent-and-child time log: what we did, how often | Later |
| School: teachers, supply lists, and key dates | Later |
| Savings for the child (for example 529 contributions) | Later |
| Allowance and chore tracker, as the child gets older | Later |
| Photos in private storage (adds small storage cost and privacy risk) | Later |
| Age-based "coming up" prompts (checkup due, birthday planning) | Later |

### 6.8 More ideas to consider (pick a few at most)

- **Bills and due dates:** recurring bills with reminders (dates and notes only, no amounts from a bank).
- **Important dates and documents:** passport, registration, insurance, and warranty expirations, with reminders. Store the date and a note, not the document.
- **Personal journal and gratitude:** a few lines a day.
- **Goals and habits:** a general-purpose weekly check-in.
- **Health extras:** doctor visits, prescriptions, body measurements.
- **Home maintenance:** furnace filter, smoke detector batteries, and similar recurring chores.
- **Gift ideas and birthdays.**
- **Unified timeline and insights:** one searchable feed of everything, plus cross-module views (for example, workouts vs. weight trend).

### 6.9 Demo mode

- Reachable without login (for example `/demo`), clearly marked "Demo, fake data".
- Runs entirely in the browser with seeded, synthetic data. It never calls the real API.
- Shows the full MVP UI: dashboard, mileage, giving, and health.
- The mileage import screen works on a sample file generated in code, so visitors can see the import flow.
- The demo and the real client share one interface and one contract test suite (ADR-0014).

### 6.10 PWA and mobile

- Installable to the home screen, with a standalone full-screen display.
- Caches the app shell only, never health, mileage, or giving API responses.
- Bottom tab navigation on mobile.
- Offline: shows a clear "you're offline" state, no stored private data.
- While the database wakes from idle, the app shows a loading state and retries once (ADR-0021).
- To verify early: GitHub login inside the installed iOS PWA.

**Reminders (for example, a weekly odometer reminder on Friday morning)**

Options, from simplest to most capable:
1. **Recurring iPhone Reminder with a link** to the app's odometer screen. No infrastructure, very reliable, and works from day one.
2. **In-app "due" banner** on the dashboard whenever the weekly reading is missing. Needs no push at all.
3. **Web push notification** from the app. Works on iPhone only after the PWA is installed (iOS 16.4+). It needs a scheduled job, which Cloudflare Workers can run as a Cron Trigger, or a scheduled GitHub Actions workflow (which can run a few minutes late). Daylight saving time must be handled so it stays at the same local time.

Decision: ship 1 and 2 first (an iPhone Reminder every Friday morning linking to the odometer screen, plus the in-app banner). Push notifications are deferred.

### 6.11 Viewports

Three breakpoints: **mobile** (under 640 px, the default, bottom tabs), **tablet** (640 to 1023 px, left icon rail), **desktop** (1024 px and up, left sidebar). Destinations: Home, Giving, Health, Car, Settings. The phone tab bar has five tabs (Home, Giving, Health, Car, More), with Settings inside More (ADR-0017 as amended by ADR-0021). See wireframes-suite.html.

## 7. Security, privacy, and delivery requirements

**Repo hygiene (public repo)**
- Use the GitHub noreply email for commits, so no personal email appears in history. CI checks it.
- `.gitignore` for `*.csv`, `*.xlsx`, exports, and local settings. CI also fails if such files are tracked.
- Only synthetic fixtures for tests and demo data, generated in code.
- No subscription IDs, tenant IDs, connection strings, or secrets in the repo. Use GitHub secrets and Cloudflare secrets.
- Secret scanning with push protection, Dependabot, and CodeQL turned on.

**App and data**
- Owner-only access enforced in two places (see section 5).
- Every non-GET request must carry a custom header, to block cross-site requests (ADR-0006).
- The server validates everything it receives, including rows sent back by the browser at import commit (mileage and Apple Health).
- HTTPS only, security headers, and a Content Security Policy.
- Two database roles: a least-privilege one for the app, and an admin one used only for migrations (ADR-0003 idea, ADR-0021 platform). Encryption at rest and in transit. Neon's free plan has no IP allow-list, so credentials are long and random and live only in secrets.
- No raw file storage. No health, odometer, or giving values in logs or telemetry.
- Upload limits on file size and type.
- Backups through Neon point-in-time restore (window depends on the plan), plus a documented `pg_dump` export.
- Usage alerts on Cloudflare and Neon, and free plans only so a limit stops service instead of billing.

**Delivery and release (ADR-0004)**
- `main` is protected. No direct pushes, even by the owner. Every change is a pull request.
- A pull request needs green required checks (`hygiene`, `test`) and an up-to-date branch. Squash merge only.
- Merging does not deploy. Production is released by hand with the **Release** workflow, which waits for the owner's approval, checks CI passed on that commit, applies pending SQL migrations, then deploys. A failed migration stops the release.
- Migrations are additive and backward compatible with the live code. Destructive changes need an explicit marker and a deliberate two-step release.
- Tests follow the pyramid in [TESTING.md](TESTING.md).

## 8. Look and feel

Direction (ADR-0015): calm, modern, and professional, like a fintech or health dashboard rather than a toy.
- Clean typography, generous spacing, restrained forest-green palette with one accent (primary #2F6B4F, see wireframes-suite.html).
- Light and dark mode.
- Clear charts with accessible colors and text alternatives.
- Consistent card-based layout.

## 9. Screens to wireframe

1. Login and access-denied
2. Dashboard
3. Mileage: odometer entry, weekly list, graphs, spreadsheet import
4. Giving: gift log, special contributions, history and totals
5. Health: weight log with trend, workouts list and add, Apple Health import
6. Settings
7. Demo-mode banner and entry point
8. Tablet layout (done, in wireframes-suite.html)

## 10. Cost (estimate)

About $0 per month on the Cloudflare Workers free plan, Cloudflare Access free tier, and Neon free plan, plus an optional domain at about $10 to $15 per year (we start on the free `workers.dev` URL). Paid fallbacks if a limit bites: Workers Paid about $5 per month, Neon usage-based. Verify against current Cloudflare and Neon pricing before launch (ADR-0021). GitHub Actions minutes are free for public repos.

## 11. Open questions

1. Confirm the facts marked *Verify* in ADR-0021: Neon free-plan limits and restore window, Workers free-plan CPU and size limits, Cloudflare Access free-tier user limit and session length, and iOS PWA sign-in through Access.
2. Spike: can a phone browser open a large Apple Health export? (ADR-0009)

Answered (see DECISIONS.md): navigation, wireframes, and accent color (forest green); mileage columns, week calculation, and history (gaps allowed); reminder approach (iPhone Reminder plus banner); giving methods and structure; family scope; mood and sleep (Next); theme direction (calm fintech, one teal or blue accent); domain (free `workers.dev` URL for now); AI insights (no); family journal (free text, tags later); hosting and database; testing strategy; release process; time zone, money, and units.

## 12. Suggested phases

0. **Platform migration (done):** moved from Azure to Cloudflare Workers + Access and Neon Postgres (ADR-0021).
1. **Foundation:** hosting, login lock, database and migrations, PWA shell, CI and protected `main`, manual release pipeline, logging, security headers, demo skeleton.
2. **Mileage MVP:** odometer entry, Excel import, weekly stats and graphs, cost and backup safeguards. This is a small module and a good first end-to-end test of the whole stack, including the first real release.
3. **(Removed) Finance MVP:** out of scope, moved to a separate private repository (ADR-0021).
4. **Giving MVP:** gift log and yearly totals.
5. **Health MVP:** weight, workouts, Apple Health import.
6. **Dashboard and polish:** home screen, theme, accessibility, demo import walkthrough.
7. **Next features:** fuel and maintenance, Family module, goals, data export and delete.

Scope note: for a portfolio, a few polished modules beat many half-built ones. Everything in 6.8 is optional.
