-- SET-04 (ADR-0026): the app gets people. This step only ADDS things, so the code that is live keeps working unchanged.
-- Every data table gets a nullable user_id. The live code does not write it yet, so it stays empty until the next release
-- switches the code and fills it for the owner. NOT NULL and the removal of the old single-person unique rules come in a later release.

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Stored lower-case and trimmed, so one Google address is one person. The database holds emails; the repository, logs and telemetry never do.
  email         text        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(btrim(email))),
  role          text        NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX users_email_idx ON users (email);

ALTER TABLE odometer_readings      ADD COLUMN user_id bigint REFERENCES users (id);
ALTER TABLE regular_gifts          ADD COLUMN user_id bigint REFERENCES users (id);
ALTER TABLE special_contributions  ADD COLUMN user_id bigint REFERENCES users (id);
ALTER TABLE workouts               ADD COLUMN user_id bigint REFERENCES users (id);
ALTER TABLE weight_entries         ADD COLUMN user_id bigint REFERENCES users (id);
ALTER TABLE service_places         ADD COLUMN user_id bigint REFERENCES users (id);
ALTER TABLE maintenance_records    ADD COLUMN user_id bigint REFERENCES users (id);
ALTER TABLE maintenance_documents  ADD COLUMN user_id bigint REFERENCES users (id);

-- Finding and deleting one person's rows.
CREATE INDEX odometer_readings_user_idx     ON odometer_readings (user_id, reading_date DESC, id DESC);
CREATE INDEX regular_gifts_user_idx         ON regular_gifts (user_id, for_month DESC, given_on DESC, id DESC);
CREATE INDEX special_contributions_user_idx ON special_contributions (user_id, given_on DESC, id DESC);
CREATE INDEX workouts_user_idx              ON workouts (user_id, workout_date DESC, id DESC);
CREATE INDEX maintenance_records_user_idx   ON maintenance_records (user_id, service_date DESC, id DESC);
CREATE INDEX maintenance_documents_user_idx ON maintenance_documents (user_id, record_id, id);

-- The same rules as before, but per person. The old single-person rules stay for now; a later release removes them.
-- Rows with no user_id yet never clash with each other here (NULLs are distinct), so this cannot fail on existing data.
CREATE UNIQUE INDEX weight_entries_user_date_idx  ON weight_entries (user_id, entry_date);
CREATE UNIQUE INDEX service_places_user_name_idx  ON service_places (user_id, lower(name));
