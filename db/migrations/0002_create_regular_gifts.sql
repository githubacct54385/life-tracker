-- GIV-01: regular gifts. One row per gift. Several gifts can exist for one month, so there is no unique constraint.
-- given_on is a plain calendar date (never a time, ADR-0007). for_month holds the first day of the month the gift is for.
-- Money is decimal(12,2) (ADR-0007); the code works in integer cents.
CREATE TABLE regular_gifts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  given_on   date          NOT NULL,
  for_month  date          NOT NULL CHECK (for_month = date_trunc('month', for_month)::date),
  amount     numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  method     text          NOT NULL CHECK (method IN ('check', 'card')),
  created_at timestamptz   NOT NULL DEFAULT now(),
  updated_at timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX regular_gifts_for_month_idx ON regular_gifts (for_month DESC, given_on DESC, id DESC);
