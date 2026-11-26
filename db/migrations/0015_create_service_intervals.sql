-- MIL-09: how often each kind of service is due, per person. A new table, so the live code is not affected and there is nothing to
-- fill in. A service type has one row (its name is matched ignoring letter case), with a miles interval, a months interval, or both.
CREATE TABLE service_intervals (
  id           bigserial   PRIMARY KEY,
  user_id      bigint      NOT NULL REFERENCES users (id),
  service_name text        NOT NULL CHECK (char_length(service_name) BETWEEN 1 AND 40),
  miles        integer     CHECK (miles BETWEEN 1 AND 200000),
  months       integer     CHECK (months BETWEEN 1 AND 120),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (miles IS NOT NULL OR months IS NOT NULL)
);
CREATE UNIQUE INDEX service_intervals_person_name ON service_intervals (user_id, (lower(service_name)));
