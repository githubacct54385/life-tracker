# Cloudflare Workers limits check (MIG-03, AC-MIG-03.6)

Checked 2026-11-10 against <https://developers.cloudflare.com/workers/platform/limits/>. Re-check before relying on a number; Cloudflare changes these.

| Limit | Free | Paid | Where it matters here |
|---|---|---|---|
| Worker size, uncompressed | 64 MiB | 64 MiB | Bundle is about 0.3 MiB. `pnpm check:worker-size` fails over 5 MiB (our tripwire) or 64 MiB (the limit). Runs in CI. |
| CPU time per request | 10 ms | 30 s default, up to 5 min | See below. Time spent waiting on Neon or the network does not count. |
| Subrequests per request | 50 | 10,000 | One request opens one Postgres connection. Imports must commit in one transaction, not row by row. |
| Requests per day | 100,000 | unlimited | `run_worker_first` means static files count too. One user, so far below this. |
| Static asset files / size | 20,000 files, 25 MiB each | 100,000 files | The built web app is a few files. |

## CPU time against the heaviest planned request

The heaviest request planned is an import commit (MIL-04 mileage spreadsheet, HLT-03 Apple Health workouts): the browser parses the file and sends validated rows, and the API re-validates every row (AGENTS.md: server validates everything) and writes them in one transaction.

- A plain loop that regex-checks and integer-checks 20,000 rows and round-trips them through JSON took about 5 ms of CPU in Node (measured 2026-11-10; workerd is the same V8 engine but slower on cold code). zod costs several times more per row. So a very large import can pass the 10 ms Free limit on CPU alone.
- Parsing the spreadsheet or XML on the server would be far worse, which is why parsing stays in the browser (ADR-0009).

Decision for this story: stay on the Free plan, keep parsing in the browser, and when MIL-04 and HLT-03 are built, send rows in batches (for example 500 rows per request, each in its own transaction, safe to repeat because re-import creates no duplicates) and measure CPU on the deployed Worker (Workers Logs show CPU time per request). If a realistic batch still exceeds 10 ms, move to the Workers Paid plan ($5/month) rather than weakening validation. That is a cost change the owner decides.

Health requests do almost no work (a few hundred microseconds), far below the limit.
