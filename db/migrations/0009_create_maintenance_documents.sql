-- MIL-07: documents (a photo, screenshot or PDF) attached to a car service (ADR-0024). The file itself lives in a private
-- Cloudflare R2 bucket under object_key, a random key that carries no file name. Deleting a service deletes its rows here;
-- the application deletes the stored files first. Additive only.
CREATE TABLE maintenance_documents (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id    bigint      NOT NULL REFERENCES maintenance_records (id) ON DELETE CASCADE,
  object_key   text        NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 16 AND 100),
  content_type text        NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  bytes        integer     NOT NULL CHECK (bytes > 0 AND bytes <= 5242880),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_documents_record_idx ON maintenance_documents (record_id, id);
