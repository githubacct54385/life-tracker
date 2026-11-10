import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, withSecurityHeaders } from "./securityHeaders";

describe("security headers", () => {
  it("[AC-MIG-03.7] sets the full header set on a static file response", () => {
    const res = withSecurityHeaders(new Response("<html></html>", { headers: { "content-type": "text/html" } }), { api: false });
    expect(res.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("content-type")).toBe("text/html");
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("[AC-MIG-03.7] marks API responses no-store", () => {
    expect(withSecurityHeaders(new Response("{}"), { api: true }).headers.get("cache-control")).toBe("no-store");
  });

  it("[AC-MIG-03.7] the policy blocks framing, plugins, foreign scripts and foreign connections", () => {
    const directives = new Map(CONTENT_SECURITY_POLICY.split("; ").map((d) => [d.split(" ")[0], d] as const));
    expect(directives.get("default-src")).toBe("default-src 'self'");
    expect(directives.get("script-src")).toBe("script-src 'self'");
    expect(directives.get("connect-src")).toBe("connect-src 'self'");
    expect(directives.get("object-src")).toBe("object-src 'none'");
    expect(directives.get("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directives.get("base-uri")).toBe("base-uri 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-eval");
    expect(directives.get("script-src")).not.toContain("unsafe-inline");
  });

  it("[AC-MIG-03.7] works on an immutable response, as returned by the assets binding", () => {
    const immutable = Response.redirect("https://example.test/next", 302);
    const res = withSecurityHeaders(immutable, { api: false });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.test/next");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
