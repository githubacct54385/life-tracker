// Rules for the documents attached to a car service (MIL-07, ADR-0024). Nothing here touches SQL or R2 directly.
//  * The type comes from the file's own first bytes. The name and the claimed type are never used, and no name is kept.
//  * A file streams to storage and is never held in memory, so a large scan does not need a large Worker.
//  * A file is stored under a random key, then its row is added. If the row is refused, the file is removed again.
//  * Deleting removes the file first and the row second, so a failed file delete keeps the row and can be retried.
import { sniffDocumentType, type MaintenanceDocument } from "@life-tracker/shared";
import { documentRepository, type DocumentRepository, type StoredDocument } from "../repositories/documentRepository.js";
import { r2DocumentStore, type DocumentStore } from "../repositories/documentStore.js";
import { currentUserId } from "../repositories/requestPerson.js";

export type UploadOutcome =
  | { status: "saved"; document: MaintenanceDocument }
  | { status: "unsupported_type" | "no_record" | "full" | "too_much" | "too_large" | "bad_length" };
export type ReadOutcome = { status: "found"; contentType: string; size: number; body: ReadableStream<Uint8Array> } | { status: "not_found" };

export interface DocumentService {
  /** Every document, for the Car screens to group by service. */
  list(): Promise<MaintenanceDocument[]>;
  /** `length` is the declared size of `body`. The body is read once, as a stream. */
  upload(recordId: number, body: ReadableStream<Uint8Array>, length: number): Promise<UploadOutcome>;
  /** The file as a stream, or not_found when there is no such document or its file is gone. */
  read(id: number): Promise<ReadOutcome>;
  /** False when there is no such document. */
  remove(id: number): Promise<boolean>;
  /** Deletes every stored file of a service, before the service is removed. A failure is thrown so the service is kept and the delete can be retried. */
  removeAllFor(recordId: number): Promise<void>;
  /** True when the document store answers (OPS-14). It asks for a key that is never used, so no file is read and nothing is written. */
  reachable(): Promise<boolean>;
}

/** The browser-facing shape: no storage key. */
const toPublic = (document: StoredDocument): MaintenanceDocument => ({ id: document.id, recordId: document.recordId, contentType: document.contentType, bytes: document.bytes, createdAt: document.createdAt });

const SNIFF_BYTES = 1024;

/** A key no document ever has: person keys start with a number and a slash. */
const HEALTH_PROBE_KEY = "health-probe";

/** Reads just enough from the start of a stream to tell its type, and gives back a stream that still starts at the beginning. */
async function peek(body: ReadableStream<Uint8Array>, wanted: number): Promise<{ head: Uint8Array; rest: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let finished = false;
  while (total < wanted && !finished) {
    const next = await reader.read();
    if (next.done) finished = true;
    else {
      chunks.push(next.value);
      total += next.value.byteLength;
    }
  }
  const head = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    head.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const rest = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head.byteLength > 0) controller.enqueue(head);
      if (finished) controller.close();
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return { head: head.subarray(0, wanted), rest };
}

/** Passes a stream through and counts it. A stream longer than `limit` is stopped, so a wrong declared length cannot store more than was allowed. */
function counting(source: ReadableStream<Uint8Array>, limit: number) {
  const state = { count: 0, exceeded: false };
  const stream = source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        state.count += chunk.byteLength;
        if (state.count > limit) {
          state.exceeded = true;
          controller.error(new Error("The body is longer than its declared length"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return { stream, state };
}

export function createDocumentService(repo: DocumentRepository, store: DocumentStore, newKey: () => string = () => `${currentUserId()}/${crypto.randomUUID()}`): DocumentService {
  return {
    async list() {
      return (await repo.list()).map(toPublic);
    },

    async upload(recordId, body, length) {
      const { head, rest } = await peek(body, SNIFF_BYTES);
      const contentType = sniffDocumentType(head);
      if (!contentType) {
        await rest.cancel().catch(() => {});
        return { status: "unsupported_type" };
      }
      const room = await repo.room(recordId, length);
      if (room !== "ok") {
        await rest.cancel().catch(() => {});
        return { status: room };
      }

      const key = newKey();
      const { stream, state } = counting(rest, length);
      try {
        await store.put(key, stream, contentType, length);
      } catch (error) {
        await store.delete(key).catch(() => {});
        if (state.exceeded) return { status: "too_large" };
        throw error;
      }
      if (state.count !== length) {
        await store.delete(key);
        return { status: "bad_length" };
      }
      try {
        const result = await repo.insert(recordId, key, contentType, length);
        if (result.status === "saved") return { status: "saved", document: toPublic(result.document) };
        await store.delete(key);
        return { status: result.status };
      } catch (error) {
        await store.delete(key).catch(() => {});
        throw error;
      }
    },

    async read(id) {
      const document = await repo.find(id);
      if (!document) return { status: "not_found" };
      const file = await store.get(document.objectKey);
      return file ? { status: "found", contentType: document.contentType, size: file.size, body: file.body } : { status: "not_found" };
    },

    async remove(id) {
      const document = await repo.find(id);
      if (!document) return false;
      await store.delete(document.objectKey);
      await repo.remove(id);
      return true;
    },

    async reachable() {
      try {
        await store.get(HEALTH_PROBE_KEY);
        return true;
      } catch {
        return false;
      }
    },

    async removeAllFor(recordId) {
      for (const key of await repo.keysFor(recordId)) await store.delete(key);
    },
  };
}

export const documentService = createDocumentService(documentRepository, r2DocumentStore);
