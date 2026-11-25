# Plan: moving production to sign-in and per-person data

The order of Releases for ADR-0026. Each step is built and rehearsed on staging (ADR-0025) first. The rule from ADR-0004 holds throughout: a migration must work with the code that is live, because the old code runs briefly after it. Nothing here is done until its story is merged and released.

## Order

| Step | Story | What goes to production | Visible to the owner | Rollback |
|---|---|---|---|---|
| 1 | SET-04 (part 1) | An empty `users` table, and a **nullable** `user_id` on every data table, with per-person unique indexes beside the old ones. A migration only: no code uses them yet. | Nothing | Old code ignores the new columns and tables, so nothing needs reverting. They can stay. |
| 2 | SET-04 (part 2) | The code switch: every query limited to the signed-in person's `user_id`. Cloudflare Access is still the only gate. On the owner's first request, the app creates the owner's admin row from the verified Access email (the email is not in the repository, so this cannot be a migration) (safe to repeat, and safe when two requests arrive at once). Rows with no person are given to it by migration 0012 in step 3. | Nothing | Revert the pull request and Release again. The new `user_id` values are harmless to old code. |
| 3 | SET-04 (part 3, a later Release) | Migration 0012: a last fill of any empty `user_id` with the first admin (rows an old instance wrote during the switch), then `NOT NULL`, and removal of the old single-person unique rules (one weight a day, one place name). If rows have no person and no admin exists yet, it stops with a message saying to open the app once as the owner, changing nothing. | Nothing | Drop the `NOT NULL` in a new migration. |
| 4 | SET-07, SET-10 | Google sign-in, sessions and the public homepage and login page. **Cloudflare Access is still in front** of the app routes, so nothing changes for the owner yet. | New homepage | Revert the pull request. Access is unchanged. |
| 5 | SET-08 | The Admin page, invitations, remove and delete. | New page | Revert. Invites are plain rows. |
| 6 | Cutover | Turn off the Cloudflare Access application for the **app routes** of production. The app's own sign-in is now the gate. Keep Access available to re-enable. | Sign in with Google instead of the Access page | Re-enable the Access application. The owner is signed in through the old path again. |
| 7 | SET-05, SET-09 | Request access (public write route, Turnstile, Resend note to the owner) and "Delete my data". "Delete my data" must also call `clearGroceryDevice()` (ADR-0027, AC-SET-09.9). | New buttons | Revert. |

The smoke test identity (ADR-0023) must keep working through step 6. Decide in SET-07 whether it uses a service session or stays on Access headers for staging.

## Rehearsed on staging first

- **Step 1 and 2:** seed owner-shaped rows **before** migrating (a reading, a service with a document), run the migration, and check the backfill left every row with the owner's `user_id` and the app still shows all of it. The seed script supports a reset to try again.
- **Step 3:** run the `NOT NULL` migration against a database that has rows from two people (done by `requirePersonMigration.int.test.ts` in CI). On staging, open the staging site once as the owner before the Release, so the admin row exists.
- **Step 4 to 7:** sign in with a second Google account, invite it, remove it, delete its data, and check the owner's data is untouched. Run the "person A cannot reach person B" tests against the real database.
- **Cutover (step 6):** staging keeps Access in front as an extra layer. The cutover is therefore rehearsed on a second Worker route or by temporarily disabling the staging Access application, then re-enabling it.

## Checks before each production Release

- The `staging-smoke` status passed on the commit (the Release gate, OPS-08).
- The manual checks for the step were done on staging and recorded in `docs/manual-checks.md`.
- A Neon restore point is noted (point-in-time restore, see [backup-and-restore.md](backup-and-restore.md)) before steps 1 and 3.

## Not planned

- Removing the old Access identity code from the Worker. That is a later cleanup after the cutover has been stable for a while.
- Emails to invited or deleted people. Needs a verified domain (ADR-0026).
