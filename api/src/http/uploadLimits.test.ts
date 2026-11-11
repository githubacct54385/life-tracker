import { describe, expect, it } from "vitest";
import { IMPORT_JSON_UPLOAD, readUpload, type UploadPolicy } from "./uploadLimits";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const zipBytes = (extra = 0) => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(extra).fill(1)]);
const upload = (body: BodyInit, headers: Record<string, string>) => new Request("https://app.example.test/api/x", { method: "POST", body, headers });
// A policy with a content-signature check, to prove the generic checks. The real endpoint uses IMPORT_JSON_UPLOAD.
const small: UploadPolicy = { maxBytes: 16, contentTypes: [XLSX, "application/octet-stream"], signatures: [[0x50, 0x4b, 0x03, 0x04]] };

describe("upload limits", () => {
  it("[AC-SET-03.2] accepts a file of the right type and size", async () => {
    const res = await readUpload(upload(zipBytes(4), { "content-type": XLSX }), small);
    expect(res).toMatchObject({ ok: true });
    if (res.ok) expect(res.bytes.length).toBe(8);
  });

  it("[AC-SET-03.2] refuses a file over the size limit by its declared length", async () => {
    const res = await readUpload(upload(zipBytes(100), { "content-type": XLSX }), small);
    expect(res).toEqual({ ok: false, status: 413, error: "too_large" });
  });

  it("[AC-SET-03.2] refuses an oversized stream even when the declared length is false", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(zipBytes(10));
        c.enqueue(zipBytes(10));
        c.close();
      },
    });
    const req = new Request("https://app.example.test/api/x", { method: "POST", body: stream, headers: { "content-type": XLSX, "content-length": "4" }, duplex: "half" } as RequestInit);
    expect(await readUpload(req, small)).toEqual({ ok: false, status: 413, error: "too_large" });
  });

  it("[AC-SET-03.2] refuses a wrong content type and a file whose bytes are not a workbook", async () => {
    expect(await readUpload(upload(zipBytes(), { "content-type": "text/csv" }), small)).toMatchObject({ ok: false, status: 415 });
    expect(await readUpload(upload("a,b\n1,2", { "content-type": XLSX }), small)).toMatchObject({ ok: false, status: 415 });
  });

  it("[AC-SET-03.2] refuses a missing body and a malformed length", async () => {
    expect(await readUpload(new Request("https://app.example.test/api/x", { method: "POST", headers: { "content-type": XLSX } }), small)).toMatchObject({ ok: false });
    expect(await readUpload(upload(zipBytes(), { "content-type": XLSX, "content-length": "abc" }), small)).toMatchObject({ ok: false, status: 411 });
  });

  it("[AC-SET-03.2] the import policy takes only JSON, up to 512 KB, and does not look for a file signature", async () => {
    expect(IMPORT_JSON_UPLOAD).toEqual({ maxBytes: 512 * 1024, contentTypes: ["application/json"], signatures: [] });
    const body = '{"rows":[]}';
    expect(await readUpload(upload(body, { "content-type": "application/json; charset=utf-8" }), IMPORT_JSON_UPLOAD)).toMatchObject({ ok: true });
    expect(await readUpload(upload(body, { "content-type": "text/plain" }), IMPORT_JSON_UPLOAD)).toMatchObject({ ok: false, status: 415 });
  });
});
