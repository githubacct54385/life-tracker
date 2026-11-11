// Security headers for every response the Worker sends, API and static files alike (AC-MIG-03.7, supports SET-03).

/**
 * Content Security Policy for the built web app.
 * `style-src` allows inline styles because React writes style attributes and the plain HTML pages carry a <style> block.
 * Scripts stay strictly same-origin; inline styles are the only relaxation (SET-03 reviewed it and keeps it for that reason).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const BASE_HEADERS: Record<string, string> = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};

/**
 * Returns a copy of the response with the security headers set. The input may be immutable (static assets), so it is never changed.
 * API responses also get `no-store`, because they carry private data.
 */
export function withSecurityHeaders(response: Response, options: { api: boolean }): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(BASE_HEADERS)) headers.set(name, value);
  if (options.api) headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
