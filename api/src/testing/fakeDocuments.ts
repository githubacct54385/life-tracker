// In-memory stand-ins for the document table and the R2 bucket, for service and handler unit tests. Synthetic data only.
import { MAX_DOCUMENTS_PER_RECORD } from "@life-tracker/shared";
import type { DocumentRepository, StoredDocument } from "../repositories/documentRepository.js";
import type { DocumentBucket, DocumentStore } from "../repositories/documentStore.js";

export function fakeDocumentRepo(recordIds: () => number[] = () => [1]): DocumentRepository & { rows: StoredDocument[] } {
  let nextId = 1;
  const rows: StoredDocument[] = [];
  return {
    rows,
    async list() {
      return rows.map((r) => ({ ...r }));
    },
    async find(id) {
      const row = rows.find((r) => r.id === id);
      return row ? { ...row } : undefined;
    },
    async keysFor(recordId) {
      return rows.filter((r) => r.recordId === recordId).map((r) => r.objectKey);
    },
    async insert(recordId, objectKey, contentType, bytes) {
      if (!recordIds().includes(recordId)) return { status: "no_record" };
      if (rows.filter((r) => r.recordId === recordId).length >= MAX_DOCUMENTS_PER_RECORD) return { status: "full" };
      const document: StoredDocument = { id: nextId++, recordId, objectKey, contentType, bytes, createdAt: "2026-11-13T12:00:00Z" };
      rows.push(document);
      return { status: "saved", document: { ...document } };
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
  };
}

export function fakeDocumentStore(): DocumentStore & { files: Map<string, { bytes: Uint8Array; contentType: string }>; failDeletes: boolean } {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const store = {
    files,
    failDeletes: false,
    async put(key: string, bytes: Uint8Array, contentType: string) {
      files.set(key, { bytes, contentType });
    },
    async get(key: string) {
      return files.get(key)?.bytes;
    },
    async delete(key: string) {
      if (store.failDeletes) throw new Error("storage unavailable");
      files.delete(key);
    },
  };
  return store;
}

/** A bucket with the same few methods as R2, backed by a Map. Used to test the R2 adapter itself. */
export function fakeBucket(): DocumentBucket & { objects: Map<string, { bytes: Uint8Array; contentType?: string }> } {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    objects,
    async put(key, value, options) {
      objects.set(key, { bytes: value, contentType: options?.httpMetadata?.contentType });
    },
    async get(key) {
      const found = objects.get(key);
      return found ? { arrayBuffer: async () => found.bytes.slice().buffer } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
