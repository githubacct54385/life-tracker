# Plan: moving production to sign-in and per-person data

The order of Releases for ADR-0026. Each step is built and rehearsed on staging (ADR-0025) first. The rule from ADR-0004 holds throughout: a migration must work with the code that is live, because the old code runs briefly after it. Nothing here is done until its story is merged and released.

## Order

| Step | Story | What goes to production | Visible to the owner | Rollback |
|---|---|---|---|---|
| 1 | SET-04 | A `users` table, with the owner as admin. A **nullable** `user_id` on every data table, backfilled to the owner. | Nothing | Old code ignores the new columns, so revert the code. The added columns can stay. |
| 2 | SET-04 | The code switch: every query limited to the signed-in person's `user_id`. Cloudflare Access still the only gate; the guard maps the verified Access email to the owner's user row. | Nothing | Revert the pull request and Release again. The data is unchanged. |
| 3 | SET-04 (later Release) | `NOT NULL` on `user_id` and per-person unique rules (for example, one reading per date per person). | Nothing | Drop the constraints in a new migration (additive path). |
| 4 | SET-07, SET-10 | Google sign-in, sessions and the public homepage and login page. **Cloudflare Access is still in front** of the app routes, so nothing changes for the owner yet. | New homepage | Revert the pull request. Access is unchanged. |
| 5 | SET-08 | The Admin page, invitations, remove and delete. | New page | Revert. Invites are plain rows. |
| 6 | Cutover | Turn off the Cloudflare Access application for the **app routes** of production. The app's own sign-in is now the gate. Keep Access available to re-enable. | Sign in with Google instead of the Access page | Re-enable the Access application. The owner is signed in through the old path again. |
| 7 | SET-05, SET-09 | Request access (public write route, Turnstile, Resend note to the owner) and "Delete my data". | New buttons | Revert. |

The smoke test identity (ADR-0023) must keep working through step 6. Decide in SET-07 whether it uses a service session or stays on Access headers for staging.

## Rehearsed on staging first

- **Step 1 and 2:** seed owner-shaped rows **before** migrating (a reading, a service with a document), run the migration, and check the backfill left every row with the owner's `user_id` and the app still shows all of it. The seed script supports a reset to try again.
- **Step 3:** run the `NOT NULL` migration against a database that has rows from two people.
- **Step 4 to 7:** sign in with a second Google account, invite it, remove it, delete its data, and check the owner's data is untouched. Run the "person A cannot reach person B" tests against the real database.
- **Cutover (step 6):** staging keeps Access in front as an extra layer. The cutover is therefore rehearsed on a second Worker route or by temporarily disabling the staging Access application, then re-enabling it.

## Checks before each production Release

- The `staging-smoke` status passed on the commit (the Release gate, OPS-08).
- The manual checks for the step were done on staging and recorded in `docs/manual-checks.md`.
- A Neon restore point is noted (point-in-time restore, see [backup-and-restore.md](backup-and-restore.md)) before steps 1 and 3.

## Not planned

- Removing the old Access identity code from the Worker. That is a later cleanup after the cutover has been stable for a while.
- Emails to invited or deleted people. Needs a verified domain (ADR-0026).
