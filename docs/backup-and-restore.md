# Backup and restore (Neon)

AC-OPS-02.3. Two safety nets protect the data: Neon's point-in-time restore (short window on the free plan) and a manual `pg_dump` export you keep yourself. Do both before loading real data (OPS-02). Context: ADR-0021.

**No dump file ever goes into this repository.** A dump contains private data. Keep it in private storage only (an encrypted disk image or folder, or a private cloud drive). `*.sql`, `*.dump` and similar files must never be committed (AGENTS.md hard rule 3).

## 1. Point-in-time restore (Neon)

Neon keeps a history of changes for a limited time (the window depends on the plan; confirm the current length on neon.com/pricing and in the project's Settings, Storage or Restore window). To recover from a bad change inside the window:

1. Neon console, your project, **Backup & Restore** (or **Branches**, then create a branch).
2. Create a branch from a **past point in time** (pick a time before the problem).
3. Open the new branch's connection details and check the data (see "Check a dump or branch" below).
4. To keep the restored data, restore the main branch from that point (Neon's "Restore" action) or copy rows back with a dump of the branch. Delete branches you no longer need so they do not use up storage.

Trying this once on harmless data is manual check AC-OPS-02.2 in [manual-checks.md](manual-checks.md).

## 2. Manual export with `pg_dump`

Use this on a schedule you can keep up (for example monthly, and before any risky migration or import) and always before leaving the free plan or deleting the project.

Prerequisites: PostgreSQL client tools of version 17 or newer (`brew install libpq`, then use `/opt/homebrew/opt/libpq/bin/pg_dump`, or add that folder to your PATH). The dump must come from a client at least as new as the server.

1. Get the **direct** (not pooled) connection string of the admin role from the Neon console: Connect, turn Connection pooling off. This is the same value as the GitHub `production` secret `DATABASE_ADMIN_URL` (see [db/setup/README.md](../db/setup/README.md)). Never paste it into chat, an issue, or a file in this repo.
2. Put it in a shell variable without leaving it in your shell history:

   ```bash
   read -rs DATABASE_ADMIN_URL && export DATABASE_ADMIN_URL   # paste, press Return (nothing is shown)
   ```

3. Write the dump to private storage. Replace `PRIVATE_DIR` with a folder **outside this repository** (for example an encrypted volume):

   ```bash
   PRIVATE_DIR="/path/to/private/backups"
   pg_dump "$DATABASE_ADMIN_URL" --format=custom --no-owner --no-privileges \
     --file "$PRIVATE_DIR/life-tracker-$(date +%Y-%m-%d).dump"
   ```

   `--format=custom` is compressed and works with `pg_restore`. `--no-owner --no-privileges` lets the dump restore into a database with different roles; the `lt_app` role and grants are recreated from `db/setup/app-role.sql`.
4. Check the file exists and is not empty, then list what it contains:

   ```bash
   ls -lh "$PRIVATE_DIR"/life-tracker-*.dump
   pg_restore --list "$PRIVATE_DIR/life-tracker-$(date +%Y-%m-%d).dump" | head -40
   ```

   The list should include the app tables and the `migrations.schema_migrations` journal.
5. Clear the variable when done: `unset DATABASE_ADMIN_URL`.

Keep a few recent dumps and delete older ones. Do not email dumps or store them in an unencrypted shared folder.

## 3. Restore a dump

Restore into a **new, empty** target (a new Neon branch or project, or a local Postgres), never over live data without a fresh dump first.

1. Create the target database and get its admin connection string as `TARGET_URL` (set with `read -rs`, as above).
2. Restore:

   ```bash
   pg_restore --no-owner --no-privileges --dbname "$TARGET_URL" "$PRIVATE_DIR/life-tracker-YYYY-MM-DD.dump"
   ```

3. Recreate the app role and grants on the target, as in step 4 of [db/setup/README.md](../db/setup/README.md) (`app-role.sql`), then point `DATABASE_URL` at the target if it should become the live database.

## Check a dump or branch

Connect with `psql "$TARGET_URL"` and run `\dt` to see the tables, then `SELECT count(*)` on one table and compare with what you expect. Do not copy row values into issues, pull requests or chat.
