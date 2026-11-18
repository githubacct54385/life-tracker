-- HLT-02: workouts counted in repetitions (pushups). Additive:
--  * `reps` is a new nullable column.
--  * `minutes` may now be empty, because a pushups workout has a count and no duration.
--  * every workout must still have minutes or reps (the new check), so a row can never have neither.
-- Existing rows keep their minutes and get no reps, so they stay valid. Code that is live while this runs only
-- writes timed workouts; the new code writes pushups. The existing 1-to-1440 check on `minutes` is untouched.
-- allow-destructive: ALTER COLUMN ... DROP NOT NULL only loosens a rule. No data is removed or changed.
ALTER TABLE workouts ADD COLUMN reps integer CHECK (reps BETWEEN 1 AND 10000);
ALTER TABLE workouts ALTER COLUMN minutes DROP NOT NULL;
ALTER TABLE workouts ADD CONSTRAINT workouts_minutes_or_reps CHECK (minutes IS NOT NULL OR reps IS NOT NULL);
