-- MIL-01: odometer readings. One row per reading, dated (a plain calendar date, ADR-0007) when it was saved.
-- Two readings on one date are allowed: the higher one counts (ADR-0008), so there is no unique constraint on the date.
CREATE TABLE odometer_readings (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reading_date date        NOT NULL,
  miles        integer     NOT NULL CHECK (miles >= 0 AND miles <= 9999999),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX odometer_readings_date_idx ON odometer_readings (reading_date DESC, id DESC);
