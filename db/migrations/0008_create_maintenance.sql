-- MIL-05: the car maintenance log. A service is one row; its types are a short list. A shop is a "place", kept once
-- so it can be offered again (names are matched without regard to letter case). Additive only.
CREATE TABLE service_places (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX service_places_name_idx ON service_places (lower(name));

CREATE TABLE maintenance_records (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_date   date        NOT NULL,
  odometer_miles integer     CHECK (odometer_miles IS NULL OR (odometer_miles >= 0 AND odometer_miles <= 9999999)),
  done_by        text        NOT NULL CHECK (done_by IN ('shop', 'home')),
  place_id       bigint      REFERENCES service_places (id),
  cost_cents     integer     CHECK (cost_cents IS NULL OR (cost_cents >= 0 AND cost_cents <= 100000000)),
  note           text        CHECK (note IS NULL OR char_length(note) <= 500),
  services       text[]      NOT NULL CHECK (cardinality(services) BETWEEN 1 AND 8),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- A service done at home has no place.
  CONSTRAINT maintenance_home_has_no_place CHECK (done_by = 'shop' OR place_id IS NULL)
);
CREATE INDEX maintenance_records_date_idx ON maintenance_records (service_date DESC, id DESC);
