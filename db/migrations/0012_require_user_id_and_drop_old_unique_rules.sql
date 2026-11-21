-- allow-destructive
-- SET-04 part 3 (ADR-0026, docs/multi-person-plan.md step 3). The code that is live now (the part 2 release) writes user_id on every
-- row and filters every query by it, so it is safe to make the column required and to remove the old single-person unique rules.
-- Nothing here changes what the owner sees. A failure rolls the whole file back (each migration is one transaction).

-- 1. A last fill. Any row still without a person was written by an older instance while the switch was happening, which means it is
--    the owner's. It goes to the first admin. With no admin and no such rows (a new, empty database) this does nothing.
UPDATE odometer_readings     SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) WHERE user_id IS NULL;
UPDATE regular_gifts         SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) WHERE user_id IS NULL;
UPDATE special_contributions SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) WHERE user_id IS NULL;
UPDATE workouts              SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) WHERE user_id IS NULL;
UPDATE weight_entries        SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) WHERE user_id IS NULL;
UPDATE service_places        SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) WHERE user_id IS NULL;
UPDATE maintenance_records   SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) WHERE user_id IS NULL;
UPDATE maintenance_documents SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) WHERE user_id IS NULL;

-- 2. Say clearly why it stops, instead of Postgres's generic "contains null values". This happens only when rows exist and no one
--    has signed in as the owner yet (the app creates the owner's row on their first request).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM odometer_readings WHERE user_id IS NULL
    UNION ALL SELECT 1 FROM regular_gifts WHERE user_id IS NULL
    UNION ALL SELECT 1 FROM special_contributions WHERE user_id IS NULL
    UNION ALL SELECT 1 FROM workouts WHERE user_id IS NULL
    UNION ALL SELECT 1 FROM weight_entries WHERE user_id IS NULL
    UNION ALL SELECT 1 FROM service_places WHERE user_id IS NULL
    UNION ALL SELECT 1 FROM maintenance_records WHERE user_id IS NULL
    UNION ALL SELECT 1 FROM maintenance_documents WHERE user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Some rows belong to no person and there is no admin user to give them to. Open the app once as the owner (this creates the owner''s row and claims the rows), then run the release again.';
  END IF;
END $$;

-- 3. Every row now belongs to a person.
ALTER TABLE odometer_readings     ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE regular_gifts         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE special_contributions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE workouts              ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE weight_entries        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE service_places        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE maintenance_records   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE maintenance_documents ALTER COLUMN user_id SET NOT NULL;

-- 4. The old rules said "one weight a day" and "one place name" for the whole database. The per-person rules from 0011
--    (weight_entries_user_date_idx, service_places_user_name_idx) now do that job for each person.
ALTER TABLE weight_entries DROP CONSTRAINT weight_entries_entry_date_key;
DROP INDEX service_places_name_idx;
