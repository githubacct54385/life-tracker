// The only place that touches Cloudflare R2 (ADR-0024). Files for maintenance documents live in a private bucket bound to the
// Worker as DOCUMENTS; there is no public URL, so a file can be read only through the API after the owner check.
// The Worker gives each request its bucket with `withRequestDocuments`, the same way it gives each request its database.
import { AsyncLocalStorage } from "node:async_hooks";
import { DependencyUnavailable } from "../http/unavailable.js";

/** The few R2 bucket methods used here. The real R2Bucket binding satisfies it, and tests pass a plain object. */
export interface DocumentBucket {
  put(key: string, value: ReadableStream<Uint8Array> | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
  delete(key: string): Promise<void>;
}

export interface StoredFile {
  body: ReadableStream<Uint8Array>;
  size: number;
}

/** Stored files by key. Keys are random and carry no file name. */
export interface DocumentStore {
  /** Streams the file in. `size` is its exact length in bytes: R2 needs it up front to take a stream, and ends the upload if the stream differs. */
  put(key: string, body: ReadableStream<Uint8Array>, contentType: string, size: number): Promise<void>;
  /** The file as a stream, or undefined when no file has this key (never an error: a missing file must not break a screen). */
  get(key: string): Promise<StoredFile | undefined>;
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

/** The Workers runtime's stream with a fixed length, which R2 needs to take a stream. It does not exist in Node, where tests use a plain bucket. */
type FixedLengthStreamConstructor = new (length: number) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };

/** Any failure of the bucket means documents are not available right now (OPS-14). The error itself is dropped: it can name the bucket. */
async function viaR2<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    throw new DependencyUnavailable("documents");
  }
}

export const r2DocumentStore: DocumentStore = {
  put: (key, body, contentType, size) => viaR2(() => putToR2(key, body, contentType, size)),
  get: (key) => viaR2(() => getFromR2(key)),
  delete: (key) => viaR2(() => deleteFromR2(key)),
};

const putToR2: DocumentStore["put"] = async (key, body, contentType, size) => {
    const bucket = bucketForRequest();
    const options = { httpMetadata: { contentType } };
    const FixedLengthStream = (globalThis as { FixedLengthStream?: FixedLengthStreamConstructor }).FixedLengthStream;
    if (!FixedLengthStream) {
      await bucket.put(key, body, options);
      return;
    }
    const fixed = new FixedLengthStream(size);
    await Promise.all([bucket.put(key, fixed.readable, options), body.pipeTo(fixed.writable)]);
};

const getFromR2: DocumentStore["get"] = async (key) => {
  const object = await bucketForRequest().get(key);
  return object ? { body: object.body, size: object.size } : undefined;
};

const deleteFromR2: DocumentStore["delete"] = async (key) => {
  await bucketForRequest().delete(key);
};
