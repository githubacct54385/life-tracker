import { describe, expect, it } from "vitest";
import { requestGuard } from "./requestGuard";

const good = { "x-life-tracker": "1" };

describe("requestGuard", () => {
  it.each(["POST", "PATCH", "PUT", "DELETE", "post", "delete"])("[AC-FND-02.7] rejects %s without the custom header", (method) => {
    expect(requestGuard(method, {})).toEqual({ ok: false, status: 403 });
  });

  it("[AC-FND-02.7] rejects an upload (multipart POST) without the custom header", () => {
    expect(requestGuard("POST", { "content-type": "multipart/form-data; boundary=x" })).toEqual({ ok: false, status: 403 });
  });

  it("[AC-FND-02.7] rejects a wrong or empty header value", () => {
    expect(requestGuard("POST", { "x-life-tracker": "" })).toEqual({ ok: false, status: 403 });
    expect(requestGuard("POST", { "x-life-tracker": "0" })).toEqual({ ok: false, status: 403 });
  });

  it("[AC-FND-02.7] accepts non-GET requests that carry the header, including uploads", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) expect(requestGuard(method, good)).toEqual({ ok: true });
    expect(requestGuard("POST", { ...good, "content-type": "multipart/form-data; boundary=x" })).toEqual({ ok: true });
  });

  it("[AC-FND-02.7] finds the header whatever its letter case", () => {
    expect(requestGuard("POST", { "X-Life-Tracker": "1" })).toEqual({ ok: true });
  });

  it("[AC-FND-02.7] does not require the header on GET, HEAD, or OPTIONS", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) expect(requestGuard(method, {})).toEqual({ ok: true });
  });

  it("[AC-FND-02.7] rejects an unknown method without the header (fail closed)", () => {
    expect(requestGuard("BREW", {})).toEqual({ ok: false, status: 403 });
  });
});
