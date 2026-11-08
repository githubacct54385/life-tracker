# Logging and Observability (Draft v0.1)

## Recommendation

Use **Azure Application Insights** (workspace-based), with three cost controls and one privacy control. For a single-user app this should stay inside the free allowance.

## Why Application Insights

- It is already in the Azure account, so there is nothing extra to sign up for.
- Microsoft's FAQ says the default Pay-as-you-go tier includes **5 GB of free data per month per billing account**. A one-user app will produce a tiny fraction of that.
- Beyond the free allowance, third-party sources quote roughly $2.30 to $2.76 per GB, depending on region. Check the Azure pricing page for your region before launch.
- Application Insights tables keep 90 days of data free of retention charges.
- It gives you what a portfolio reviewer likes to see: request traces, failures, dependency timings (the SQL calls), and a live metrics view.

## Alternatives considered

| Option | Cost | Verdict |
|---|---|---|
| **Application Insights** | Free to start, small beyond 5 GB | **Recommended.** Native to Azure and no extra accounts. |
| Plain Azure Functions logs only | Free | Too thin. Hard to search, and no traces across calls. |
| Sentry (free developer tier) | Free, with limits | Good for error tracking in the browser. Optional addition, but it is another account and another place for data to leak. |
| Grafana Cloud free tier | Free, with limits | Nice dashboards, but more setup, and no benefit over App Insights here. |
| Self-hosted (Loki, Prometheus) | Needs a VM, which costs more than the app | Poor fit for the $0 to $2 per month goal. |

I did not verify the Sentry and Grafana free-tier limits against their current pricing pages, so check them if you want to go that way.

## Cost controls

1. **Sampling.** Turn on adaptive sampling in the Functions telemetry settings, so volume is capped automatically. At one user, you may not need it, but it is a cheap safety net.
2. **Daily cap.** Set a daily data cap on the Log Analytics workspace (for example 0.1 GB per day). If something loops and floods logs, ingestion stops instead of billing. The tradeoff is that you lose logs for the rest of that day.
3. **Budget alert.** The spec already calls for an Azure budget alert at about $5. Keep that, and scope it to the whole subscription.
4. **Do not log chatty things.** Debug-level logs stay off in production.

## Privacy control (the important one)

The spec says: *no transaction or health data in logs or telemetry.* Application Insights captures request URLs, exception messages, and SQL command text by default, so this needs to be enforced in code, not just intended.

- All logging goes through `telemetry/logger.ts`. Handlers and services never call `console.log` or the SDK directly.
- The logger takes only an event name and a small allow-list of fields: request ID, route name, status code, duration, row counts, and error type.
- Never log: amounts, merchants, descriptions, weights, odometer values, names, or request bodies.
- Add a telemetry initializer that strips query strings and turns SQL command text off.
- Add a unit test with fake data that fails if a banned field name or a known fake merchant appears in captured output.
- The browser side: skip the Application Insights JavaScript SDK at first. It records page URLs and user behavior, which adds privacy surface for little gain.

## What to watch

| Signal | Why |
|---|---|
| Failed requests and exceptions | Bugs, and probes against the API |
| 401 and 403 count | Someone other than the owner trying to get in |
| Import duration and row counts | Catches slow parsing or a changed bank format |
| SQL dependency duration | Serverless database cold starts |
| Availability ping on the home page | Free, and tells you if the site is down |

Set up two alerts: a spike in 403s, and a failed availability test. Send them to email.

## Open items to verify

- Confirm that Application Insights is supported for the managed API in Static Web Apps in your setup. If it is not, a separate small Function App would be needed, which affects the cost estimate in the spec.
- Confirm the current free allowance and per-GB price in the Azure pricing calculator for your region.

Sources: [Application Insights FAQ](https://learn.microsoft.com/en-us/azure/azure-monitor/app/application-insights-faq), [Application Insights pricing](https://azure.microsoft.com/en-au/pricing/details/application-insights/)
