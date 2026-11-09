// The only door for logging (AGENTS.md hard rule 6, OBSERVABILITY.md).
// Accepts an event name and a small allow-list of fields. Anything else is dropped, never written.

export type LogLevel = "info" | "warn" | "error";

/** Field name -> check for its value. A value that fails its check is dropped. */
const allowedFields = {
  requestId: (v: unknown) => typeof v === "string" && /^[A-Za-z0-9-]{1,64}$/.test(v),
  route: (v: unknown) => typeof v === "string" && /^[a-z0-9/_-]{1,64}$/.test(v),
  statusCode: (v: unknown) => Number.isInteger(v) && (v as number) >= 100 && (v as number) <= 599,
  durationMs: (v: unknown) => Number.isInteger(v) && (v as number) >= 0,
  rowCount: (v: unknown) => Number.isInteger(v) && (v as number) >= 0,
  errorType: (v: unknown) => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v),
} as const satisfies Record<string, (v: unknown) => boolean>;

export type LogField = keyof typeof allowedFields;
export type LogFields = Partial<Record<LogField, string | number>>;

export const ALLOWED_LOG_FIELDS = Object.keys(allowedFields) as LogField[];

const eventNamePattern = /^[a-z][a-z0-9_.]{0,63}$/;

export type LogSink = (level: LogLevel, line: string) => void;

// Azure Functions forwards stdout/stderr to Application Insights as traces.
const consoleSink: LogSink = (level, line) => {
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
};

/** Error class name only. Never the message, which can contain data. */
export function errorTypeOf(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  return allowedFields.errorType(name) ? name : "UnknownError";
}

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(sink: LogSink = consoleSink): Logger {
  const write = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    const entry: Record<string, unknown> = {
      level,
      event: eventNamePattern.test(event) ? event : "invalid_event_name",
    };
    let dropped = 0;
    for (const [key, value] of Object.entries(fields)) {
      const check = Object.hasOwn(allowedFields, key) ? (allowedFields as Record<string, (v: unknown) => boolean>)[key] : undefined;
      if (check?.(value)) entry[key] = value;
      else dropped += 1;
    }
    // Count only. The dropped names and values are never written.
    if (dropped > 0) entry.droppedFields = dropped;
    sink(level, JSON.stringify(entry));
  };
  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}

export const logger = createLogger();
