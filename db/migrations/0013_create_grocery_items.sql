-- GRO-01: the grocery list. One list per person, so one table. A new table, so the live code is not affected and there is nothing to fill in.
-- The client chooses each item's id (a UUID), so sending the same "add" twice makes one item. The id is unique per person, not for
-- everyone, so one person's ids say nothing about another's. No history is kept: finishing a trip deletes the rows.
CREATE TABLE grocery_items (
  id         uuid        NOT NULL,
  user_id    bigint      NOT NULL REFERENCES users (id),
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  quantity   text        NOT NULL DEFAULT '' CHECK (char_length(quantity) <= 20),
  note       text        NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  section    text        NOT NULL CHECK (section IN ('Produce', 'Bakery', 'Meat and fish', 'Dairy and eggs', 'Frozen', 'Pantry', 'Drinks', 'Household', 'Other')),
  found      boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- Reading one person's list in the order it was written, and deleting it.
CREATE INDEX grocery_items_user_order_idx ON grocery_items (user_id, created_at, id);
