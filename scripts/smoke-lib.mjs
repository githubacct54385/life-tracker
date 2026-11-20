// The checks run against a deployed Life Tracker after a staging deploy (OPS-08, ADR-0025). Read-only: only GET requests.
// Kept free of any I/O of its own so tests can drive it with a fake `fetch`. It prints status codes and short reasons,
// never a header value, a body, or a count of anything private.

/** Paths that list data. The smoke identity can read them and cannot write (ADR-0023). */
export const READ_PATHS = ["/api/odometer", "/api/gifts", "/api/gifts/special", "/api/weight", "/api/workouts"];

/** What an unsigned request may come back as. Access redirects to its sign-in page; the Worker itself answers 401. It must never be 200. */
const REFUSED = new Set([301, 302, 303, 307, 308, 401, 403]);

// A header value may hold printable ASCII only. A stray space, newline or carriage return from a paste makes `fetch`
// and `curl` refuse to send it, and the error does not say why. Say it here, and say only the length.
const SAFE_HEADER_VALUE = /^[\x21-\x7e]+$/;

export function credentialProblem(name, value) {
  if (!value) return `${name} is not set.`;
  if (!SAFE_HEADER_VALUE.test(value)) return `${name} has a space or a hidden character in it (length ${value.length}). Save it again without one.`;
  return null;
}

/** A short, safe reason for a failed request. Never the message, because some messages repeat the header value. */
export function reasonOf(error) {
  const code = error && typeof error === "object" && "cause" in error && error.cause && typeof error.cause === "object" ? error.cause.code : undefined;
  const name = error && typeof error === "object" && typeof error.name === "string" ? error.name : "error";
  return code ? `${name} ${code}` : name;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request, tried again when the connection fails or the server answers 5xx. A sleeping Neon database takes a few
 * seconds to wake, and the first request after a deploy can hit that. A 4xx is an answer, so it is not tried again.
 */
async function request(fetchImpl, sleep, attempts, delayMs, url, headers) {
  let last = "";
  for (let n = 1; n <= attempts; n += 1) {
    try {
      const res = await fetchImpl(url, { headers, redirect: "manual", signal: AbortSignal.timeout(20_000) });
      if (res.status < 500) return { status: res.status };
      last = `status ${res.status}`;
    } catch (error) {
      last = reasonOf(error);
    }
    if (n < attempts) await sleep(delayMs * n);
  }
  return { error: last };
}

/**
 * Runs the checks and returns `{ ok, lines }`.
 *  1. An unsigned request must be refused (it must not get 200).
 *  2. /api/health with the smoke identity answers 200.
 *  3. /api/health/db answers 200, which proves the Worker reaches the database.
 *  4. Each list answers 200.
 */
export async function runSmoke({ base, id, secret, fetchImpl = fetch, sleep = pause, attempts = 4, delayMs = 2000 }) {
  const root = base.replace(/\/$/, "");
  const signed = { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret };
  const lines = [];
  let ok = true;
  const record = (pass, text) => {
    if (!pass) ok = false;
    lines.push(`${pass ? "ok  " : "FAIL"} ${text}`);
  };

  const unsigned = await request(fetchImpl, sleep, attempts, delayMs, `${root}/api/health`, {});
  if (unsigned.error !== undefined) record(false, `--- GET /api/health without the token (${unsigned.error})`);
  else record(REFUSED.has(unsigned.status), `${unsigned.status} GET /api/health without the token (must be refused, not 200)`);

  for (const path of ["/api/health", "/api/health/db", ...READ_PATHS]) {
    const result = await request(fetchImpl, sleep, attempts, delayMs, `${root}${path}`, signed);
    if (result.error !== undefined) record(false, `--- GET ${path} (${result.error})`);
    else record(result.status === 200, `${result.status} GET ${path}`);
  }

  lines.push(ok ? "All checks passed." : "Some checks failed.");
  return { ok, lines };
}
