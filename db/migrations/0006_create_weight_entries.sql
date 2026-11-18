-- HLT-01: weight. One row per calendar day (AC-HLT-01.3), dated when it is saved (a plain date, ADR-0007).
-- Stored in pounds to 0.1 (ADR-0007). The owner's pounds-or-kilograms setting only changes entry and display.
CREATE TABLE weight_entries (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_date date         NOT NULL UNIQUE,
  pounds     numeric(5,1) NOT NULL CHECK (pounds >= 20 AND pounds <= 1500),
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);
