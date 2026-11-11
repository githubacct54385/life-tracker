// HTTPS only (AC-SET-03.1). Cloudflare terminates TLS; this redirects any plain-http request to https before anything else runs.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Local development (`wrangler dev`) is plain http on loopback and is the only exception. */
export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

/** A permanent redirect to the https version of the URL, or null when the request is already https or local. */
export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol !== "http:" || isLocalHost(url.hostname)) return null;
  url.protocol = "https:";
  return new Response(null, {
    status: 308,
    headers: { location: url.toString(), "strict-transport-security": "max-age=31536000; includeSubDomains" },
  });
}
