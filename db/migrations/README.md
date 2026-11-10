# Migrations

Numbered, additive Postgres SQL files, applied in order by `pnpm migrate` (see ADR-0002, ADR-0003 and ADR-0021). `pnpm migrate` needs `DATABASE_ADMIN_URL` (the admin role). One-time database and role setup is in [db/setup/README.md](../setup/README.md).

- Name: `NNNN_short_description.sql`, for example `0001_create_odometer_readings.sql`. Numbers never repeat.
- Plain Postgres SQL, no batch separators. Each file runs as one script inside one transaction, so a failure rolls the whole file back. Do not use statements Postgres refuses inside a transaction (for example `CREATE INDEX CONCURRENTLY`).
- Each applied file is recorded in `migrations.schema_migrations` with a checksum. That schema is invisible to the app role.
- Money columns are `numeric(12,2)` (ADR-0007). Prefer `bigint GENERATED ALWAYS AS IDENTITY` for ids and `date` / `timestamptz` for dates and times.
- Tables created here are readable and writable by the app role automatically (default privileges from `db/setup/app-role-grants.sql`). Do not put `GRANT` or `CREATE ROLE` in a migration.
- **Never edit a file after it is applied anywhere.** The script refuses to run and says which file changed. Add a new migration instead.
- Keep them backward compatible with the code that is live (add first, remove in a later release). Destructive statements need a `-- allow-destructive` marker.
- Never put data (real or synthetic) in a migration, except reference rows the app needs.
