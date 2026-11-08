# Manual checks

Acceptance criteria that cannot be automated. Each line starts with the criterion ID and ends with `last checked: YYYY-MM-DD`, or `last checked: not yet`. `scripts/ac-coverage.mjs` counts a criterion as covered only when it has a real date. Re-check before a release that touches the area.

Format: `- AC-ID: what to do | result notes | last checked: date`

- AC-FND-02.6: Install the PWA on an iPhone, sign in with GitHub from the home-screen icon, confirm the app opens signed in and sign-in does not bounce to Safari. | last checked: not yet
- AC-FND-05.1: Add the app to the iPhone home screen and confirm it opens full screen. | last checked: not yet
- AC-OPS-02.2: Restore the database to a point in time into a new database, confirm tables exist, delete the copy. | last checked: not yet
- AC-OPS-02.4: In the Azure portal, confirm the free-offer setting is "auto-pause until next month", not "continue and bill". | Checked through the Azure CLI: useFreeLimit true, behavior AutoPause. | last checked: 2026-11-08
- AC-OPS-02.5: In the database's Alerts page, confirm a rule on "Free amount remaining" (under 10,000) sends email to the owner. | Rule and email action created 2026-11-08; delivery not tested yet. | last checked: not yet
