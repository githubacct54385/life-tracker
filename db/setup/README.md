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
2. In the Neon dashboard, open Connect, turn **Connection pooling off**, and copy the **direct** connection string of the default role. This is the admin URL. Migrations take a session-level lock and run multi-statement scripts, which a pooler can break. The app's own connection (step 5) uses the pooled string. Do not paste either string into chat, a file in this repo, or an issue. Neon's strings end in `sslmode=require`; the `pg` driver currently treats that as `verify-full` and prints a warning about a coming change. Write `sslmode=verify-full` instead to keep today's strict behavior and silence it (Neon's certificates are publicly trusted).
3. Store it as the GitHub `production` environment secret `DATABASE_ADMIN_URL`, and keep it in a shell variable for the next steps. Neither command below puts the value in your shell history:

   ```bash
   read -rs DATABASE_ADMIN_URL && export DATABASE_ADMIN_URL   # paste the string, press Return (nothing is shown)
   printf %s "$DATABASE_ADMIN_URL" | gh secret set DATABASE_ADMIN_URL --env production --repo githubacct54385/life-tracker
   ```

   `psql` is needed for step 4: `brew install libpq`, then use `/opt/homebrew/opt/libpq/bin/psql` (or add that folder to your PATH).
4. Create the app role and its grants with `app-role.sql` (needs `psql`):

   ```bash
   APP_PW="$(openssl rand -hex 32)"
   psql "$DATABASE_ADMIN_URL" -v app_password="$APP_PW" -f db/setup/app-role.sql
   ```

5. Build the app connection string from the admin URL with the user `lt_app`, the password `$APP_PW`, and the **pooled** host (the hostname with `-pooler` in it; keep `sslmode=require`). Do it in the shell so nothing is typed by hand:

   ```bash
   APP_URL="$(APP_PW="$APP_PW" node -e 'const u = new URL(process.env.DATABASE_ADMIN_URL); u.username = "lt_app"; u.password = process.env.APP_PW; if (!u.hostname.includes("-pooler")) u.hostname = u.hostname.replace(".", "-pooler."); console.log(u.toString())')"
   ```

   Store it as the `DATABASE_URL` Cloudflare secret in MIG-03. If you do not have a Cloudflare account set up yet, skip storing it: running step 4 again later issues a fresh password.
6. Run the migrations: `DATABASE_ADMIN_URL=... pnpm migrate` (the Release workflow does this for you after MIG-05).
7. Run `app-role-grants.sql` again if you ever create tables outside `pnpm migrate`. Tables created by migrations are covered automatically by the default privileges.

To rotate the app password, repeat steps 4 and 5; `app-role.sql` changes the password when the role already exists.

## Backups

Point-in-time restore and the manual `pg_dump` export procedure: [docs/backup-and-restore.md](../docs/backup-and-restore.md).

## Verify (manual checks, `docs/manual-checks.md`)

- AC-MIG-02.1: connect once as `lt_app` and confirm `CREATE TABLE x (id int)` is denied while `SELECT` on an app table works.
- AC-MIG-02.7: let the database idle past its suspend time, then time one query through the app connection. Record the result.
