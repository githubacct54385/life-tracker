import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALLOWED_LOG_FIELDS, createLogger, errorTypeOf } from "./logger.js";

// Synthetic values only. None of these is real data.
const FAKE_MERCHANT = "Fake Coffee Shop 123";
const FAKE_AMOUNT = "-4821.37";
const FAKE_WEIGHT = "81.6";
const FAKE_ODOMETER = "123456";
const BANNED = [FAKE_MERCHANT, FAKE_AMOUNT, FAKE_WEIGHT, FAKE_ODOMETER];

function capture() {
  const lines: string[] = [];
  return { lines, log: createLogger((_level, line) => lines.push(line)) };
}

describe("logger allow-list", () => {
  it("[AC-OPS-01.2] writes allowed fields as one JSON line", () => {
    const { lines, log } = capture();
    log.info("request.done", { requestId: "abc-123", route: "mileage/list", statusCode: 200, durationMs: 42, rowCount: 3 });
    expect(JSON.parse(lines[0]!)).toEqual({
      level: "info",
      event: "request.done",
      requestId: "abc-123",
      route: "mileage/list",
      statusCode: 200,
      durationMs: 42,
      rowCount: 3,
    });
  });

  it("[AC-OPS-01.2] drops fields that are not on the allow-list and reports only a count", () => {
    const { lines, log } = capture();
    log.info("import.done", { rowCount: 5, merchant: FAKE_MERCHANT, amount: -10, body: { a: 1 } });
    const entry = JSON.parse(lines[0]!);
    expect(entry).toEqual({ level: "info", event: "import.done", rowCount: 5, droppedFields: 3 });
    expect(lines[0]).not.toContain("merchant");
  });

  it("[AC-OPS-01.2] drops an allowed field whose value has the wrong shape", () => {
    const { lines, log } = capture();
    log.warn("request.done", { route: "a b?x=1", statusCode: "200", durationMs: 1.5, errorType: "bad type!" });
    expect(JSON.parse(lines[0]!)).toEqual({ level: "warn", event: "request.done", droppedFields: 4 });
  });

  it("[AC-OPS-01.2] does not treat inherited object keys as allowed fields", () => {
    const { lines, log } = capture();
    log.info("x", JSON.parse('{"__proto__": 1, "constructor": 2, "toString": 3}'));
    expect(JSON.parse(lines[0]!)).toEqual({ level: "info", event: "x", droppedFields: 3 });
  });

  it("[AC-OPS-01.2] replaces an event name that could carry data", () => {
    const { lines, log } = capture();
    log.error(`saved ${FAKE_MERCHANT}`);
    expect(JSON.parse(lines[0]!).event).toBe("invalid_event_name");
  });

  it("[AC-OPS-01.2] errorType keeps the class name and never the message", () => {
    expect(errorTypeOf(new TypeError(`bad ${FAKE_AMOUNT}`))).toBe("TypeError");
    expect(errorTypeOf("a string")).toBe("UnknownError");
  });
});

describe("no private values in captured logs", () => {
  it("[AC-OPS-01.3] a fake merchant, amount, weight, or odometer value never reaches the output", () => {
    const { lines, log } = capture();
    log.info("import.done", { merchant: FAKE_MERCHANT, amount: FAKE_AMOUNT, weight: FAKE_WEIGHT, odometer: FAKE_ODOMETER, rowCount: 2 });
    log.error("import.failed", { errorType: errorTypeOf(new Error(`row had ${FAKE_MERCHANT} ${FAKE_AMOUNT}`)), description: FAKE_MERCHANT });
    log.warn(`oops ${FAKE_ODOMETER}`, { route: FAKE_MERCHANT, requestId: FAKE_WEIGHT.replace(".", "!") });
    const output = lines.join("\n");
    for (const value of BANNED) expect(output).not.toContain(value);
  });

  it("[AC-OPS-01.3] holds for arbitrary field names and values", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.anything()), (fields) => {
        const { lines, log } = capture();
        log.info("probe", fields);
        const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
        const keys = Object.keys(entry).filter((k) => !["level", "event", "droppedFields"].includes(k));
        for (const key of keys) expect(ALLOWED_LOG_FIELDS).toContain(key);
      }),
    );
  });
});
