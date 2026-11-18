-- GIV-02: special contributions. A separate table, so regular giving (regular_gifts) stays clean.
-- A special contribution has a name or occasion instead of a "for" month. given_on is a plain calendar date (ADR-0007).
-- Money is decimal(12,2) (ADR-0007); the code works in integer cents.
CREATE TABLE special_contributions (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  given_on   date          NOT NULL,
  occasion   text          NOT NULL CHECK (char_length(btrim(occasion)) BETWEEN 1 AND 80),
  amount     numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  method     text          NOT NULL CHECK (method IN ('check', 'card')),
  created_at timestamptz   NOT NULL DEFAULT now(),
  updated_at timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX special_contributions_given_on_idx ON special_contributions (given_on DESC, id DESC);
