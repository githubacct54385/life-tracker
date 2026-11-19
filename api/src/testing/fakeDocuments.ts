// In-memory stand-ins for the document table and the R2 bucket, for service and handler unit tests. Synthetic data only.
import { MAX_DOCUMENT_BYTES_PER_RECORD, MAX_DOCUMENTS_PER_RECORD } from "@life-tracker/shared";
import type { DocumentRepository, RoomResult, StoredDocument } from "../repositories/documentRepository.js";
import type { DocumentBucket, DocumentStore, StoredFile } from "../repositories/documentStore.js";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    total += next.value.byteLength;
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return all;
}

const streamOf = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

export function fakeDocumentRepo(recordIds: () => number[] = () => [1]): DocumentRepository & { rows: StoredDocument[] } {
  let nextId = 1;
  const rows: StoredDocument[] = [];
  const room = (recordId: number, bytes: number): RoomResult => {
    if (!recordIds().includes(recordId)) return "no_record";
    const mine = rows.filter((r) => r.recordId === recordId);
    if (mine.length >= MAX_DOCUMENTS_PER_RECORD) return "full";
    return mine.reduce((sum, r) => sum + r.bytes, 0) + bytes > MAX_DOCUMENT_BYTES_PER_RECORD ? "too_much" : "ok";
  };
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
    async room(recordId, bytes) {
      return room(recordId, bytes);
    },
    async insert(recordId, objectKey, contentType, bytes) {
      const answer = room(recordId, bytes);
      if (answer !== "ok") return { status: answer };
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
    async put(key: string, body: ReadableStream<Uint8Array>, contentType: string) {
      files.set(key, { bytes: await readAll(body), contentType });
    },
    async get(key: string): Promise<StoredFile | undefined> {
      const file = files.get(key);
      return file ? { body: streamOf(file.bytes), size: file.bytes.byteLength } : undefined;
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
      objects.set(key, { bytes: value instanceof Uint8Array ? value : await readAll(value), contentType: options?.httpMetadata?.contentType });
    },
    async get(key) {
      const found = objects.get(key);
      return found ? { body: streamOf(found.bytes), size: found.bytes.byteLength } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
