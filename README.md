# Life Tracker

A private, single-user web app (installable PWA) for health, mileage, and giving. Finance is not part of this app. The code is public. The data and the login are private. A demo with fake data runs entirely in the browser.

**Status:** planning and foundation. Hosted on Cloudflare Workers + Neon Postgres (ADR-0021). Stories are tracked in Linear.

## Read first

| Document | What it covers |
|---|---|
| [SPEC.md](SPEC.md) | Features, priorities, security requirements |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, dependency rules, diagrams |
| [DECISIONS.md](DECISIONS.md) | Why each technical choice was made |
| [TESTING.md](TESTING.md) | The test pyramid and CI |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Logging rules |
| [docs/setup.md](docs/setup.md) | Set up Neon, Cloudflare and GitHub from scratch |
| [docs/ac-ids.txt](docs/ac-ids.txt) | Valid acceptance-criterion IDs (the stories and criteria text are in Linear) |
| [AGENTS.md](AGENTS.md) | Working rules for contributors and AI coding agents |

## Run it locally

```bash
pnpm install
printf 'DATABASE_URL=<app-role connection string, local or Neon branch>\n' > api/.dev.vars   # git-ignored; never commit it
pnpm dev          # builds the web app, then `wrangler dev` serves web + API at http://localhost:8787
pnpm dev:web      # optional: Vite with hot reload at http://localhost:5173, forwarding /api to the Worker
```

Check it works: `curl localhost:8787/api/health` returns `{"status":"ok"}`, and `curl localhost:8787/api/health/db` returns the same only when the database answers. No Cloudflare login is needed for local runs.

Wireframes: [the full suite at mobile, tablet, and desktop widths](wireframes-suite.html).
## How changes reach production

1. Branch from `main`, named after the story (`mil-03-mileage-graphs`).
2. Open a pull request. CI must pass and the branch must be up to date.
3. Squash merge. **Merging does not deploy.**
4. The owner starts the **Release** workflow, approves it, and it applies database migrations and then deploys.

`main` accepts no direct pushes.

## Privacy

No real data is stored in this repository, and none may be. Test and demo data is synthetic and generated in code. See hard rules in [AGENTS.md](AGENTS.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
