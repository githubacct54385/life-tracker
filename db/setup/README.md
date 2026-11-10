# Database setup (Neon Postgres)

One-time setup for the production database, and what the migration tooling expects. Decision and context: ADR-0021.
Everything here fits the Neon free plan. Check the plan's current limits on neon.com/pricing before relying on them.

## Two roles (ADR-0003, ADR-0021)

| Role | Used by | Can do | Lives in |
|---|---|---|---|
| **admin** (the role Neon creates with the project, owner of the database) | `pnpm migrate` in the Release workflow, and you locally | Change the schema | GitHub `production` environment secret `DATABASE_ADMIN_URL` |
| **lt_app** | The API (Cloudflare Worker) | Read and write app tables only. No schema changes. No access to the migration journal. | Cloudflare secret `DATABASE_URL` |

## Steps (you do these; they need your Neon account)

1. Create a Neon project on the free plan. Pick the region closest to where the Worker will run (US East or US Central for you). Postgres 17 is fine.
2. From the Neon dashboard, copy the **pooled** connection string of the default role. This is the admin URL. Do not paste it into chat, a file in this repo, or an issue.
3. Store it as the GitHub `production` environment secret `DATABASE_ADMIN_URL`. For local work, put it in an untracked shell variable, never in a file in the repo.
4. Create the app role and its grants with `app-role.sql` (needs `psql`):

   ```bash
   APP_PW="$(openssl rand -hex 32)"
   psql "$DATABASE_ADMIN_URL" -v app_password="$APP_PW" -f db/setup/app-role.sql
   ```

5. Build the app connection string by taking the admin URL and replacing the user with `lt_app` and the password with `$APP_PW` (keep `sslmode=require`). Store it as the `DATABASE_URL` Cloudflare secret (MIG-03) and discard `$APP_PW` from your shell history.
6. Run the migrations: `DATABASE_ADMIN_URL=... pnpm migrate` (the Release workflow does this for you after MIG-05).
7. Run `app-role-grants.sql` again if you ever create tables outside `pnpm migrate`. Tables created by migrations are covered automatically by the default privileges.

To rotate the app password, repeat steps 4 and 5; `app-role.sql` changes the password when the role already exists.

## Verify (manual checks, `docs/manual-checks.md`)

- AC-MIG-02.1: connect once as `lt_app` and confirm `CREATE TABLE x (id int)` is denied while `SELECT` on an app table works.
- AC-MIG-02.7: let the database idle past its suspend time, then time one query through the app connection. Record the result.
