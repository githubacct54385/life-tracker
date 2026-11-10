# Migrations

Numbered, additive SQL files, applied in order by `pnpm migrate` (see ADR-0002 and ADR-0003).

- Name: `NNNN_short_description.sql`, for example `0001_create_odometer_readings.sql`. Numbers never repeat.
- Put `GO` on its own line to split batches (needed before `CREATE VIEW` and the like).
- Each file runs in one transaction and is recorded in `dbo.SchemaMigrations` with a checksum.
- **Never edit a file after it is applied anywhere.** The script refuses to run and says which file changed. Add a new migration instead.
- Keep them backward compatible with the code that is live (add first, remove in a later release). Destructive statements need a `-- allow-destructive` marker.
- Never put data (real or synthetic) in a migration, except reference rows the app needs.
