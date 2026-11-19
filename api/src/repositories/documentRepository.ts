import { MAX_DOCUMENTS_PER_RECORD, type DocumentType } from "@life-tracker/shared";
import { getPool } from "../db/connection.js";

export interface StoredDocument {
  id: number;
  recordId: number;
  /** Where the file is in R2. Never sent to the browser. */
  objectKey: string;
  contentType: DocumentType;
  bytes: number;
  /** ISO 8601. */
  createdAt: string;
}

export type InsertDocumentResult = { status: "saved"; document: StoredDocument } | { status: "no_record" } | { status: "full" };

interface Row {
  id: string;
  record_id: string;
  object_key: string;
  content_type: DocumentType;
  bytes: number;
  created_at: string;
}

const toDocument = (row: Row): StoredDocument => ({
  id: Number(row.id),
  recordId: Number(row.record_id),
  objectKey: row.object_key,
  contentType: row.content_type,
  bytes: row.bytes,
  createdAt: row.created_at,
});

const COLUMNS = "id, record_id, object_key, content_type, bytes, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS created_at";

/** SQL for the rows that point at stored files (MIL-07). The files themselves are in documentStore.ts. */
export interface DocumentRepository {
  /** Every document, oldest first. */
  list(): Promise<StoredDocument[]>;
  find(id: number): Promise<StoredDocument | undefined>;
  /** The storage keys of a service's documents. */
  keysFor(recordId: number): Promise<string[]>;
  /** Adds a document unless the service does not exist or already has the most allowed. One statement decides, so two uploads cannot both take the last place. */
  insert(recordId: number, objectKey: string, contentType: DocumentType, bytes: number): Promise<InsertDocumentResult>;
  /** True when a row was removed. */
  remove(id: number): Promise<boolean>;
}

export const documentRepository: DocumentRepository = {
  async list() {
    const result = await getPool().query<Row>(`SELECT ${COLUMNS} FROM maintenance_documents ORDER BY id`);
    return result.rows.map(toDocument);
  },

  async find(id) {
    const result = await getPool().query<Row>(`SELECT ${COLUMNS} FROM maintenance_documents WHERE id = $1`, [id]);
    return result.rows[0] ? toDocument(result.rows[0]) : undefined;
  },

  async keysFor(recordId) {
    const result = await getPool().query<{ object_key: string }>("SELECT object_key FROM maintenance_documents WHERE record_id = $1", [recordId]);
    return result.rows.map((row) => row.object_key);
  },

  async insert(recordId, objectKey, contentType, bytes) {
    const inserted = await getPool().query<Row>(
      `INSERT INTO maintenance_documents (record_id, object_key, content_type, bytes)
       SELECT r.id, $2, $3, $4 FROM maintenance_records r
       WHERE r.id = $1 AND (SELECT count(*) FROM maintenance_documents d WHERE d.record_id = r.id) < $5
       RETURNING ${COLUMNS}`,
      [recordId, objectKey, contentType, bytes, MAX_DOCUMENTS_PER_RECORD],
    );
    if (inserted.rows[0]) return { status: "saved", document: toDocument(inserted.rows[0]) };
    const exists = await getPool().query("SELECT 1 FROM maintenance_records WHERE id = $1", [recordId]);
    return (exists.rowCount ?? 0) > 0 ? { status: "full" } : { status: "no_record" };
  },

  async remove(id) {
    const result = await getPool().query("DELETE FROM maintenance_documents WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
