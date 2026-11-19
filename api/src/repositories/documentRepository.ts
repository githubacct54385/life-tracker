import { MAX_DOCUMENT_BYTES_PER_RECORD, MAX_DOCUMENTS_PER_RECORD, type DocumentType } from "@life-tracker/shared";
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

/** Whether a service can take another document of this size: it exists, has fewer than 10, and would stay within its total. */
export type RoomResult = "ok" | "no_record" | "full" | "too_much";
export type InsertDocumentResult = { status: "saved"; document: StoredDocument } | { status: Exclude<RoomResult, "ok"> };

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
  /** Asks before a file is stored, so a refused upload does not write and then delete a large file. The insert checks again. */
  room(recordId: number, bytes: number): Promise<RoomResult>;
  /** Adds a document unless the service does not exist, has the most allowed, or would pass its total size. One statement decides, so two uploads cannot both take the last place. */
  insert(recordId: number, objectKey: string, contentType: DocumentType, bytes: number): Promise<InsertDocumentResult>;
  /** True when a row was removed. */
  remove(id: number): Promise<boolean>;
}

async function roomFor(recordId: number, bytes: number): Promise<RoomResult> {
  const result = await getPool().query<{ n: number; total: string }>(
    `SELECT (SELECT count(*) FROM maintenance_documents WHERE record_id = r.id)::int AS n,
            (SELECT COALESCE(sum(bytes), 0) FROM maintenance_documents WHERE record_id = r.id)::text AS total
     FROM maintenance_records r WHERE r.id = $1`,
    [recordId],
  );
  const row = result.rows[0];
  if (!row) return "no_record";
  if (row.n >= MAX_DOCUMENTS_PER_RECORD) return "full";
  return Number(row.total) + bytes > MAX_DOCUMENT_BYTES_PER_RECORD ? "too_much" : "ok";
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

  room: roomFor,

  async insert(recordId, objectKey, contentType, bytes) {
    const inserted = await getPool().query<Row>(
      `INSERT INTO maintenance_documents (record_id, object_key, content_type, bytes)
       SELECT r.id, $2::text, $3::text, $4::integer FROM maintenance_records r
       WHERE r.id = $1 AND (SELECT count(*) FROM maintenance_documents d WHERE d.record_id = r.id) < $5::integer
         AND (SELECT COALESCE(sum(d.bytes), 0) FROM maintenance_documents d WHERE d.record_id = r.id) + $4::integer <= $6::bigint
       RETURNING ${COLUMNS}`,
      [recordId, objectKey, contentType, bytes, MAX_DOCUMENTS_PER_RECORD, MAX_DOCUMENT_BYTES_PER_RECORD],
    );
    if (inserted.rows[0]) return { status: "saved", document: toDocument(inserted.rows[0]) };
    // Refused: say why. A service that fits now (another upload finished first) is reported as full.
    const why = await roomFor(recordId, bytes);
    return { status: why === "ok" ? "full" : why };
  },

  async remove(id) {
    const result = await getPool().query("DELETE FROM maintenance_documents WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
