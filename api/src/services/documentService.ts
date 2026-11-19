// Rules for the documents attached to a car service (MIL-07, ADR-0024). Nothing here touches SQL or R2 directly.
//  * The type comes from the file's own first bytes. The name and the claimed type are never used, and no name is kept.
//  * A file is stored under a random key, then its row is added. If the row is refused, the file is removed again.
//  * Deleting removes the file first and the row second, so a failed file delete keeps the row and can be retried.
import { sniffDocumentType, type MaintenanceDocument } from "@life-tracker/shared";
import { documentRepository, type DocumentRepository, type StoredDocument } from "../repositories/documentRepository.js";
import { r2DocumentStore, type DocumentStore } from "../repositories/documentStore.js";

export type UploadOutcome = { status: "saved"; document: MaintenanceDocument } | { status: "unsupported_type" } | { status: "no_record" } | { status: "full" };
export type ReadOutcome = { status: "found"; contentType: string; bytes: Uint8Array } | { status: "not_found" };

export interface DocumentService {
  /** Every document, for the Car screens to group by service. */
  list(): Promise<MaintenanceDocument[]>;
  upload(recordId: number, bytes: Uint8Array): Promise<UploadOutcome>;
  /** The file, or not_found when there is no such document or its file is gone. */
  read(id: number): Promise<ReadOutcome>;
  /** False when there is no such document. */
  remove(id: number): Promise<boolean>;
  /** Deletes every stored file of a service, before the service is removed. A failure is thrown so the service is kept and the delete can be retried. */
  removeAllFor(recordId: number): Promise<void>;
}

/** The browser-facing shape: no storage key. */
const toPublic = (document: StoredDocument): MaintenanceDocument => ({ id: document.id, recordId: document.recordId, contentType: document.contentType, bytes: document.bytes, createdAt: document.createdAt });

export function createDocumentService(repo: DocumentRepository, store: DocumentStore, newKey: () => string = () => crypto.randomUUID()): DocumentService {
  return {
    async list() {
      return (await repo.list()).map(toPublic);
    },

    async upload(recordId, bytes) {
      const contentType = sniffDocumentType(bytes);
      if (!contentType) return { status: "unsupported_type" };
      const key = newKey();
      await store.put(key, bytes, contentType);
      try {
        const result = await repo.insert(recordId, key, contentType, bytes.byteLength);
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
      const bytes = await store.get(document.objectKey);
      return bytes ? { status: "found", contentType: document.contentType, bytes } : { status: "not_found" };
    },

    async remove(id) {
      const document = await repo.find(id);
      if (!document) return false;
      await store.delete(document.objectKey);
      await repo.remove(id);
      return true;
    },

    async removeAllFor(recordId) {
      for (const key of await repo.keysFor(recordId)) await store.delete(key);
    },
  };
}

export const documentService = createDocumentService(documentRepository, r2DocumentStore);
