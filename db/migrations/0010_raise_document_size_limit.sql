-- MIL-07 follow-up: a document may now be up to 100 MB (was 5 MB). Only the size check on the new table changes.
-- The old check is replaced by a wider one, so rows stored under the old limit stay valid and the code that is live while
-- this runs (5 MB) keeps working. The marker is needed because dropping a constraint looks destructive to CI.
-- allow-destructive
ALTER TABLE maintenance_documents DROP CONSTRAINT maintenance_documents_bytes_check;
ALTER TABLE maintenance_documents ADD CONSTRAINT maintenance_documents_bytes_check CHECK (bytes > 0 AND bytes <= 104857600);
