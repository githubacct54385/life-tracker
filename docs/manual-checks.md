# Manual checks

Acceptance criteria that cannot be automated. Each line starts with the criterion ID and ends with `last checked: YYYY-MM-DD`, or `last checked: not yet`. `scripts/ac-coverage.mjs` counts a criterion as covered only when it has a real date. Re-check before a release that touches the area.

Format: `- AC-ID: what to do | result notes | last checked: date`

- AC-FND-01.3: Confirm secret scanning, push protection, Dependabot (github-actions and npm) and CodeQL (actions and JavaScript/TypeScript) are on. | Checked with the GitHub API. | last checked: 2026-11-09
- AC-FND-01.4: Confirm the `hygiene` job runs the secret-pattern scan and passes. | Enforced by CI job `hygiene`; green on PR #6. | last checked: 2026-11-09
- AC-FND-01.5: Confirm branch protection applies to admins and blocks force pushes. | enforce_admins true, force pushes off, linear history on. | last checked: 2026-11-09
- AC-FND-01.6: Confirm required checks are `hygiene` and `test`, branch must be up to date, squash only. | strict true; merge commits and rebase off. | last checked: 2026-11-09
- AC-FND-01.7: Confirm `scripts/ac-coverage.mjs` runs in the `hygiene` job. | Runs in CI; green on PR #6. | last checked: 2026-11-09
- AC-FND-02.2: On the deployed site, sign in with a GitHub account that has not been invited as `owner` and confirm the access-denied page appears (HTTP 403), with a working sign-out link. | The SWA CLI emulator sends such a user to the sign-in redirect instead of 403, so the e2e tests prove only that the app and data stay out of reach. | last checked: not yet
- AC-FND-02.6: Install the PWA on an iPhone, sign in with GitHub from the home-screen icon, confirm the app opens signed in and sign-in does not bounce to Safari. | last checked: not yet
- AC-FND-05.1: Add the app to the iPhone home screen and confirm it opens full screen. | last checked: not yet
- AC-OPS-02.2: Restore the database to a point in time into a new database, confirm tables exist, delete the copy. | last checked: not yet
- AC-OPS-02.4: In the Azure portal, confirm the free-offer setting is "auto-pause until next month", not "continue and bill". | Checked through the Azure CLI: useFreeLimit true, behavior AutoPause. | last checked: 2026-11-08
- AC-OPS-02.5: In the database's Alerts page, confirm a rule on "Free amount remaining" (under 10,000) sends email to the owner. | Rule and email action created 2026-11-08; delivery not tested yet. | last checked: not yet
- AC-FND-03.2: Against the real Azure database, connect once as `lt_app` (query editor) and confirm `CREATE TABLE` is denied while a SELECT on an app table works. | The automated test proves this with an equivalent login in a container; this confirms the real server setup. | last checked: not yet
- AC-OPS-01.1: After the first API call in production, open Application Insights, then Transaction search, and confirm a request and a failure from the API appear. | last checked: not yet
- AC-OPS-01.4: Confirm the Log Analytics daily cap is on at 0.1 GB and `api/host.json` has sampling enabled. | last checked: not yet
- AC-OPS-01.5: Confirm the 403 alert and the availability alert exist, the availability test targets the home page only, and trigger one to see the email. | last checked: not yet
