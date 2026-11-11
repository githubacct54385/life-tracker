# Logging and Observability (v1.0)

> **Platform change (ADR-0021, MIG-06).** Logs now go to Cloudflare **Workers Logs**. Application Insights, Log Analytics, and the Azure budget alert are gone. The privacy rules below did not change.

## What we use

**Workers Logs**, switched on with the `observability` block in `api/wrangler.jsonc`. Every line the Worker writes to the console is kept and can be searched in the Cloudflare dashboard (Workers & Pages, the Worker, **Logs**). Cloudflare also records one entry per request (an "invocation log") with the status code and timing.

- **Cost:** $0. The free plan allows 200,000 log events a day with 3 days of history. One user stays far below that. If the limit were ever passed, Cloudflare stops keeping logs for the rest of the day; it does not bill.
- **Sampling:** every request is kept (`head_sampling_rate: 1`). Lower it only if volume ever becomes a problem.
- **History is short.** 3 days is enough to look into a problem you notice, not to audit last month. Do not rely on logs as a record.

## Why not something else

| Option | Verdict |
|---|---|
| **Workers Logs** | **Chosen.** Built in, no account or code to add, free. |
| Sentry (free tier) | Optional later for browser errors. Another account and another place data could leak, so not added now. |
| Logpush, Tail Workers, OpenTelemetry export | Need a paid plan or another service. Not needed for one user. |
| Self-hosted Loki or Grafana | Needs a server. Fails the $0 goal. |

I did not check Sentry's current free-tier limits.

## Privacy control (the important one)

The spec says: *no health, mileage, or giving data in logs or telemetry.* Workers Logs records whatever is written to the console, so this is enforced in code, not just intended.

- All logging goes through `api/src/telemetry/logger.ts`. Handlers and services never call `console` directly. A test fails if any Worker source file other than the logger's own sink uses `console` (AC-MIG-06.2).
- The logger takes an event name and a small allow-list of fields: request ID, route name, status code, duration, row count, and error type. Anything else is dropped and only counted.
- Never log: gift amounts, notes, descriptions, weights, workout details, odometer values, names, email addresses, tokens, or request bodies.
- Errors log the error class name only, never the message, which can contain data.
- A test captures all log output while a request handles fake data and fails if a fake gift amount, weight, workout, or odometer value appears (AC-OPS-01.3).
- Do not add the Cloudflare Web Analytics script or a browser telemetry SDK. They record page URLs and behavior for little gain.

## What to watch

| Signal | Where | Why |
|---|---|---|
| `api.unhandled_error` events | Workers Logs, search the event name | A bug. The `errorType` field says which kind. |
| Requests with `statusCode` 500 and up | Workers Logs | Same |
| Slow requests (`durationMs`) | Workers Logs | Cold database or a slow query |
| Denied sign-ins | Zero Trust, **Logs**, **Access** | Someone other than the owner trying to get in. Non-owners are stopped by Access before they reach the Worker, so the Worker's own logs rarely show them. |
| `statusCode` 401 or 403 from the Worker | Workers Logs | Should be near zero. A request got past Access without a valid owner token. |

## Alerts

There is no automatic alert. Cloudflare does not offer an email alert on log contents or status codes on the free plan, and strangers are stopped by Access before they reach the Worker, so a spike of 403s from the Worker would not show who was trying. The owner retired the old "email on a spike of 403s" criterion (AC-MIG-06.3) for this reason. If something seems wrong, look at the Access log and Workers Logs by hand (see "What to watch").

## Open items to verify

- Whether Zero Trust can email on denied sign-ins on the free plan. I did not find it in the documentation. If it can, add it and say so here.
- The exact free-plan log limits, which I took from Cloudflare's Workers Logs page (200,000 events a day, 3 days) and which may change.
