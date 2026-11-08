# Life Tracker

A private, single-user web app (installable PWA) for personal finances, health, mileage, and giving. The code is public. The data and the login are private. A demo with fake data runs entirely in the browser.

**Status:** planning. There is no application code yet.

## Read first

| Document | What it covers |
|---|---|
| [SPEC.md](SPEC.md) | Features, priorities, security requirements |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, dependency rules, diagrams |
| [DECISIONS.md](DECISIONS.md) | Why each technical choice was made |
| [TESTING.md](TESTING.md) | The test pyramid and CI |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Logging rules |
| [docs/azure-setup.md](docs/azure-setup.md) | One-time Azure setup, step by step |
| [BACKLOG.md](BACKLOG.md) | Stories and acceptance criteria |
| [AGENTS.md](AGENTS.md) | Working rules for contributors and AI coding agents |

Wireframes: [the full suite at mobile, tablet, and desktop widths](wireframes-suite.html).
## How changes reach production

1. Branch from `main`, named after the story (`fin-03-import-preview`).
2. Open a pull request. CI must pass and the branch must be up to date.
3. Squash merge. **Merging does not deploy.**
4. The owner starts the **Release** workflow, approves it, and it applies database migrations and then deploys.

`main` accepts no direct pushes.

## Privacy

No real data is stored in this repository, and none may be. Test and demo data is synthetic and generated in code. See hard rules in [AGENTS.md](AGENTS.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
