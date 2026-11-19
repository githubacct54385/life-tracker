// Test support only (used by *.int.test.ts): reads the document and service rows directly, to check what was really stored.
import { getPool } from "../db/connection.js";

export async function documentKeys(recordId?: number): Promise<string[]> {
  const result = recordId === undefined
    ? await getPool().query<{ object_key: string }>("SELECT object_key FROM maintenance_documents")
    : await getPool().query<{ object_key: string }>("SELECT object_key FROM maintenance_documents WHERE record_id = $1", [recordId]);
  return result.rows.map((row) => row.object_key);
}

export async function serviceExists(id: number): Promise<boolean> {
  return ((await getPool().query("SELECT 1 FROM maintenance_records WHERE id = $1", [id])).rowCount ?? 0) > 0;
}
