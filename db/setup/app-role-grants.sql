-- Least-privilege grants for the API's database role (ADR-0003, ADR-0021, AC-FND-03.2).
--
-- Run as the ADMIN role, once per database, after the role exists. Safe to run again.
-- The role name lt_app is fixed here; the integration test swaps in its own name and runs this same file.
--
-- What the app role gets: read and write on tables in the public schema (including tables
-- the admin role creates later), and use of their sequences.
-- What it never gets: CREATE on any schema, ownership of anything, or any access to the
-- "migrations" schema that holds the journal. So it cannot change the schema (hard rule 10).

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO lt_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lt_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO lt_app;

-- Applies to objects created later by the role running this file (the admin role runs the migrations).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO lt_app;
