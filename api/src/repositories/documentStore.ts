// The only place that touches Cloudflare R2 (ADR-0024). Files for maintenance documents live in a private bucket bound to the
// Worker as DOCUMENTS; there is no public URL, so a file can be read only through the API after the owner check.
// The Worker gives each request its bucket with `withRequestDocuments`, the same way it gives each request its database.
import { AsyncLocalStorage } from "node:async_hooks";

/** The few R2 bucket methods used here. The real R2Bucket binding satisfies it, and tests pass a plain object. */
export interface DocumentBucket {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
}

/** Stored files by key. Keys are random and carry no file name. */
export interface DocumentStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The file, or undefined when no file has this key (never an error: a missing file must not break a screen). */
  get(key: string): Promise<Uint8Array | undefined>;
  /** Deleting a key that does not exist succeeds. */
  delete(key: string): Promise<void>;
}

const requestBuckets = new AsyncLocalStorage<DocumentBucket>();

/** Runs one request with its bucket. Without a bucket the function still runs, and a document call fails closed. */
export function withRequestDocuments<T>(bucket: DocumentBucket | undefined, run: () => Promise<T>): Promise<T> {
  return bucket ? requestBuckets.run(bucket, run) : run();
}

function bucketForRequest(): DocumentBucket {
  const bucket = requestBuckets.getStore();
  if (!bucket) throw Object.assign(new Error("The DOCUMENTS bucket is not bound"), { code: "DOCUMENTS_NOT_BOUND" });
  return bucket;
}

export const r2DocumentStore: DocumentStore = {
  async put(key, bytes, contentType) {
    await bucketForRequest().put(key, bytes, { httpMetadata: { contentType } });
  },
  async get(key) {
    const object = await bucketForRequest().get(key);
    return object ? new Uint8Array(await object.arrayBuffer()) : undefined;
  },
  async delete(key) {
    await bucketForRequest().delete(key);
  },
};
