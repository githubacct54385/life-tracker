-- GIV-02: a regular gift can carry a description of what it is for, such as "November tithe".
-- Nullable and additive: gifts saved before this migration have no description, and the code that is live now never reads it.
ALTER TABLE regular_gifts ADD COLUMN description text CHECK (description IS NULL OR char_length(btrim(description)) BETWEEN 1 AND 80);
