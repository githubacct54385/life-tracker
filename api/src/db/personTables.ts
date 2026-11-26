// Every table that holds one person's data (ADR-0026, SET-04), in one place. A table here has a `user_id` column.
// The order is safe for deleting a person's rows: a table comes before the tables it points at (documents, then records, then places).
// Deleting a person's data (SET-08, SET-09) walks this list, and an integration test fails if a table is added to the
// database without being listed here, so a new table cannot quietly hold data that deletion would miss.
export const PERSON_TABLES = [
  "grocery_items",
  "maintenance_documents",
  "service_intervals",
  "maintenance_records",
  "service_places",
  "odometer_readings",
  "weight_entries",
  "workouts",
  "workout_goals",
  "regular_gifts",
  "special_contributions",
] as const;

export type PersonTable = (typeof PERSON_TABLES)[number];
