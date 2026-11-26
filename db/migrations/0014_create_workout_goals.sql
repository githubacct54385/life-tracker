-- HLT-05: the weekly workout goal. One row per person, so a person has at most one goal and it needs no id. A new table, so the
-- live code is not affected and there is nothing to fill in. Removing the goal is deleting the row (the app does not do that yet).
CREATE TABLE workout_goals (
  user_id    bigint      PRIMARY KEY REFERENCES users (id),
  per_week   integer     NOT NULL CHECK (per_week BETWEEN 1 AND 14),
  updated_at timestamptz NOT NULL DEFAULT now()
);
