-- Create (or rotate the password of) the API's database role, then grant it least privilege.
-- Run with psql as the ADMIN role. The password comes from a psql variable so it is never written to a file:
--
--   APP_PW="$(openssl rand -hex 32)"
--   psql "$DATABASE_ADMIN_URL" -v app_password="$APP_PW" -f db/setup/app-role.sql
--
-- Then build the app connection string from $APP_PW and store it as the DATABASE_URL secret. See db/setup/README.md.
-- Do not create this role from the Neon console: console-created roles can change the schema.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lt_app')
    THEN format('ALTER ROLE lt_app WITH LOGIN PASSWORD %L', :'app_password')
  ELSE format('CREATE ROLE lt_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', :'app_password')
END \gexec

\ir app-role-grants.sql
