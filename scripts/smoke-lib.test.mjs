import { describe, expect, it, vi } from "vitest";
import { READ_PATHS, credentialProblem, reasonOf, runSmoke } from "./smoke-lib.mjs";

const BASE = "https://staging.example.test";
const ID = "0123456789abcdef0123456789abcdef.access";
const SECRET = "s".repeat(54);
const noWait = async () => {};

/** A fake fetch. `answers` maps "signed GET /path" or "unsigned GET /path" to a status, a thrown error, or a list of those in order. */
function fakeFetch(answers, calls = []) {
  return async (url, init) => {
    const path = new URL(url).pathname;
    const signed = init.headers["CF-Access-Client-Id"] !== undefined;
    const key = `${signed ? "signed" : "unsigned"} GET ${path}`;
    calls.push({ key, headers: init.headers, redirect: init.redirect });
    let answer = answers[key] ?? (signed ? 200 : 302);
    if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0];
    if (answer instanceof Error) throw answer;
    return { status: answer };
  };
}

const run = (answers, extra = {}) => runSmoke({ base: BASE, id: ID, secret: SECRET, fetchImpl: fakeFetch(answers, extra.calls), sleep: noWait, ...extra });

describe("smoke test", () => {
  it("[AC-OPS-08.5] passes when an unsigned request is refused and every signed read answers 200", async () => {
    const calls = [];
    const result = await run({}, { calls });
    expect(result.ok).toBe(true);
    expect(result.lines.at(-1)).toBe("All checks passed.");
    const signedPaths = calls.filter((c) => c.key.startsWith("signed")).map((c) => c.key.replace("signed GET ", ""));
    expect(signedPaths).toEqual(["/api/health", "/api/health/db", ...READ_PATHS]);
  });

  it("[AC-OPS-08.5] checks the database path, so a Worker that cannot reach its database fails the deploy", async () => {
    const result = await run({ "signed GET /api/health/db": 503 });
    expect(result.ok).toBe(false);
    expect(result.lines.join("\n")).toContain("--- GET /api/health/db (status 503)");
  });

  it("[AC-OPS-08.5] fails when an unsigned request is answered with 200, because the API would be open", async () => {
    const result = await run({ "unsigned GET /api/health": 200 });
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toContain("FAIL 200 GET /api/health without the token");
  });

  it.each([301, 302, 401, 403])("[AC-OPS-08.5] counts %i as a refused unsigned request", async (status) => {
    const result = await run({ "unsigned GET /api/health": status });
    expect(result.ok).toBe(true);
  });

  it("[AC-OPS-08.5] never sends the token on the unsigned request, and never follows a redirect", async () => {
    const calls = [];
    await run({}, { calls });
    const unsigned = calls.find((c) => c.key.startsWith("unsigned"));
    expect(unsigned.headers).toEqual({});
    expect(calls.every((c) => c.redirect === "manual")).toBe(true);
  });

  it("[AC-OPS-08.5] waits for a sleeping database: a 503 then a 200 passes, and a 401 is not tried again", async () => {
    const calls = [];
    const wake = await run({ "signed GET /api/health/db": [503, 503, 200] }, { calls });
    expect(wake.ok).toBe(true);
    expect(calls.filter((c) => c.key === "signed GET /api/health/db")).toHaveLength(3);

    const refusedCalls = [];
    const refused = await run({ "signed GET /api/weight": 401 }, { calls: refusedCalls });
    expect(refused.ok).toBe(false);
    expect(refusedCalls.filter((c) => c.key === "signed GET /api/weight")).toHaveLength(1);
  });

  it("[AC-OPS-08.5] gives up after the attempts and says why, with a safe reason and no header value", async () => {
    const failure = Object.assign(new TypeError(`Headers.append: "${SECRET}" is an invalid header value`), { cause: { code: "ECONNREFUSED" } });
    const result = await run({ "signed GET /api/odometer": failure });
    expect(result.ok).toBe(false);
    const text = result.lines.join("\n");
    expect(text).toContain("--- GET /api/odometer (TypeError ECONNREFUSED)");
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(ID);
  });

  it("[AC-OPS-08.5] tries a failing request the set number of times and then stops", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 502 }));
    const result = await runSmoke({ base: BASE, id: ID, secret: SECRET, fetchImpl, sleep: noWait, attempts: 3 });
    expect(result.ok).toBe(false);
    // 1 unsigned + 7 signed requests, each tried 3 times.
    expect(fetchImpl).toHaveBeenCalledTimes(8 * 3);
  });
});

describe("credentials", () => {
  it("[AC-OPS-08.5] accepts a normal token and names a missing one", () => {
    expect(credentialProblem(ID)).toBeNull();
    expect(credentialProblem("")).toBe("missing");
    expect(credentialProblem(undefined)).toBe("missing");
  });

  it.each([["a trailing newline", "abc\n"], ["a carriage return", "abc\r"], ["a space", "ab c"], ["a tab", "ab\tc"]])(
    "[AC-OPS-08.5] spots %s and answers with a fixed word that holds nothing from the value",
    (_label, value) => {
      expect(credentialProblem(value)).toBe("hidden");
    },
  );
});

describe("reasons", () => {
  it("[AC-OPS-08.5] reports the error name and code, and never its message", () => {
    expect(reasonOf(Object.assign(new TypeError("secret in here"), { cause: { code: "ENOTFOUND" } }))).toBe("TypeError ENOTFOUND");
    expect(reasonOf(new Error("secret in here"))).toBe("Error");
    expect(reasonOf("nonsense")).toBe("error");
    expect(reasonOf(undefined)).toBe("error");
  });
});
