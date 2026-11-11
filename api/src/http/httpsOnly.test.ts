import { describe, expect, it } from "vitest";
import { httpsRedirect } from "./httpsOnly";

describe("https only", () => {
  it("[AC-SET-03.1] redirects plain http to https, keeping path and query", () => {
    const res = httpsRedirect(new Request("http://app.example.test/api/health?x=1"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.example.test/api/health?x=1");
  });

  it("[AC-SET-03.1] leaves https and local development alone", () => {
    expect(httpsRedirect(new Request("https://app.example.test/"))).toBeNull();
    expect(httpsRedirect(new Request("http://localhost:8787/"))).toBeNull();
    expect(httpsRedirect(new Request("http://127.0.0.1:8787/"))).toBeNull();
  });
});
