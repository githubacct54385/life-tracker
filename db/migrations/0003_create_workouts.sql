-- HLT-02: workouts. One row per workout. A manual workout is dated (a plain calendar date, ADR-0007) when it is saved.
-- `source` says where the row came from: 'manual' now, 'apple_watch' once the Apple Health import (HLT-03) exists.
CREATE TABLE workouts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workout_date date        NOT NULL,
  workout_type text        NOT NULL CHECK (char_length(workout_type) BETWEEN 1 AND 40),
  minutes      integer     NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
  note         text        CHECK (note IS NULL OR char_length(note) <= 500),
  source       text        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'apple_watch')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workouts_date_idx ON workouts (workout_date DESC, id DESC);
