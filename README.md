# Life Tracker

A web app (installable PWA) for health, mileage, and giving. It is used by its owner and by a few invited people, each with their own private data. Finance is not part of this app. The code is public. Sign-in is by invitation only. A demo with fake data runs entirely in the browser.

**Status:** in daily use by its owner. Running on Cloudflare Workers and Neon Postgres (ADR-0021) with a staging environment (ADR-0025) and a manual, approved release. Sign-in for invited people, with each person's data kept separate, is being built now (ADR-0026). Stories are tracked in Linear.

## How it fits together

Rendered by GitHub. The same diagrams, with more detail and the request sequences, are in [ARCHITECTURE.md](ARCHITECTURE.md).

### System architecture

A browser talks to one Cloudflare Worker that serves the React app and the API. Production and staging are separate copies of the whole stack, so a change is tried on staging with synthetic data before it can reach production.

```mermaid
flowchart TB
    user["Browser or installed PWA"]

    subgraph prod["Production"]
        pa["Cloudflare Access: sign-in"]
        pw["Worker: React app + Hono API"]
        pdb[("Neon Postgres")]
        pr2[("R2: private documents")]
        pa --> pw
        pw -- "least-privilege app role" --> pdb
        pw -- "private binding, no public address" --> pr2
    end

    subgraph stg["Staging"]
        sa["Cloudflare Access"]
        sw["Worker: same code, synthetic data only"]
        sdb[("Neon: separate project")]
        sr2[("R2: separate bucket")]
        sa --> sw
        sw --> sdb
        sw --> sr2
    end

    user --> pa
    user --> sa
```

### From a change to production

Merging never deploys. Staging deploys on its own after CI passes, and the production Release is manual, needs the owner's approval, and refuses a commit that has not passed CI and the staging smoke test.

```mermaid
flowchart LR
    pr["Pull request"] --> ci["CI: lint, types, unit, integration, end-to-end"]
    ci --> main["Squash merge to main (protected)"]
    main --> stg["Staging workflow: migrate, deploy, smoke test"]
    stg --> status["Commit status: staging-smoke"]
    status --> rel["Release: manual, owner approves, needs CI and staging-smoke"]
    rel --> mig["Migrations (admin role)"]
    mig --> dep["Deploy Worker"]
    dep --> prod["Production"]
```

### Code layers

Dependencies point downward only, and `dependency-cruiser` fails the build if one points up. SQL lives in repositories and business rules in services. Demo mode swaps the API client for an in-browser one with the same interface, so the demo never calls the real API.

```mermaid
flowchart TD
    pages["web pages (React)"] --> client["api/client.ts"]
    pages -.-> demo["demo/demoApi.ts (in-browser, fake data)"]
    client -- "HTTPS /api" --> handlers["handlers: parse, check the person, shape the response"]
    handlers --> services["services: business rules"]
    services --> repositories["repositories: all the SQL, one person's rows at a time"]
    repositories --> db["db: connection, per-request person scope"]
    db --> neon[("Postgres")]
    shared["shared: zod schemas used by both sides"] -.-> client
    shared -.-> handlers
```

### Data model

Every table that holds a person's data has a `user_id`, and every query is limited to the signed-in person (ADR-0026). Weekly mileage is computed from readings, not stored. No files are stored in the database; documents live in the private R2 bucket and the table keeps only a key.

```mermaid
erDiagram
    users {
        bigint id PK
        text email UK "lower-case"
        text role "admin or user"
        text status "active or removed"
        timestamptz last_login_at
    }
    odometer_readings {
        bigint id PK
        bigint user_id FK
        date reading_date
        int miles
    }
    weight_entries {
        bigint id PK
        bigint user_id FK
        date entry_date "one per person per day"
        numeric pounds
    }
    workouts {
        bigint id PK
        bigint user_id FK
        date workout_date
        text workout_type
        int minutes "or reps"
        int reps
        text source "manual or apple_watch"
    }
    regular_gifts {
        bigint id PK
        bigint user_id FK
        date given_on
        date for_month
        numeric amount
        text method
    }
    special_contributions {
        bigint id PK
        bigint user_id FK
        date given_on
        text occasion
        numeric amount
    }
    service_places {
        bigint id PK
        bigint user_id FK
        text name "unique per person, ignoring case"
    }
    maintenance_records {
        bigint id PK
        bigint user_id FK
        date service_date
        int odometer_miles
        text done_by "shop or home"
        bigint place_id FK
        int cost_cents
        text_list services
    }
    maintenance_documents {
        bigint id PK
        bigint user_id FK
        bigint record_id FK
        text object_key "where the file is in R2"
        text content_type
        int bytes
    }
    users ||--o{ odometer_readings : has
    users ||--o{ weight_entries : has
    users ||--o{ workouts : has
    users ||--o{ regular_gifts : has
    users ||--o{ special_contributions : has
    users ||--o{ service_places : has
    users ||--o{ maintenance_records : has
    users ||--o{ maintenance_documents : has
    service_places ||--o{ maintenance_records : "used by"
    maintenance_records ||--o{ maintenance_documents : "has files"
```

## Read first

| Document | What it covers |
|---|---|
| [SPEC.md](SPEC.md) | Features, priorities, security requirements |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, dependency rules, diagrams |
| [DECISIONS.md](DECISIONS.md) | Why each technical choice was made |
| [TESTING.md](TESTING.md) | The test pyramid and CI |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Logging rules |
| [docs/setup.md](docs/setup.md) | Set up Neon, Cloudflare and GitHub from scratch |
| [docs/staging-setup.md](docs/staging-setup.md) | Set up the staging environment (OPS-08) |
| [docs/local-docker.md](docs/local-docker.md) | Install Docker, and how it is used for local databases and tests |
| [docs/privacy.md](docs/privacy.md) | What is stored about a person and how it is deleted |
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

## Run the tests locally

All three levels run on a Mac (Apple Silicon or Intel) and on Linux. CI runs the same commands, so a green run here is a good sign. The steps were written and checked on Linux, and nothing in them is Linux-only, so tell us if a step differs on your Mac.

**Once:** install Node 22 or newer (`brew install node@22`), then pnpm with `corepack enable` (the repo pins the pnpm version), then `pnpm install`.

| Level | Command | What it needs | Time |
|---|---|---|---|
| Unit, plus lint and types | `pnpm test:unit`, `pnpm lint`, `pnpm typecheck` | Nothing else | under a minute |
| Integration (real Postgres) | `pnpm test:int` | A running Docker | a few minutes the first time |
| End to end (real browser) | `pnpm test:e2e` | Chromium, and a local Postgres for the full-stack part | a few minutes |
| All of them, as CI does | `pnpm test` | All of the above | |

### Unit tests
No setup. `pnpm test:unit` runs the shared, api, web and scripts tests. Run one package with `pnpm --filter web test:unit` (or `api`, `shared`). Add a file name to run one test file, for example `pnpm --filter web test:unit ServiceDocuments`.

### Integration tests
These start a throwaway Postgres in a container and apply the real migrations to it, so they need a Docker that is running.

1. Install and start Docker Desktop (or OrbStack, or Colima). Step by step: [docs/local-docker.md](docs/local-docker.md).
2. `pnpm test:int`

The first run downloads the Postgres image. The database is created per run and removed afterwards, so nothing is left behind and nothing of yours is touched. **If Docker is not found, these tests are skipped with a warning, and they show as passed.** Look for "database tests are SKIPPED" in the output. CI never skips them. With Colima, run `colima start` first, and set `DOCKER_HOST` to its socket if the tests cannot find it.

### End-to-end tests
These build the site, start the real Worker (`wrangler dev`), and drive Chromium with Playwright. No Cloudflare login is needed.

1. Once: `pnpm --filter web exec playwright install chromium`
2. For the full-stack specs (`web/e2e/stack/`) you also need a local Postgres, which the tests fill with the real migrations. The easiest way is a Docker container (one command, see [docs/local-docker.md](docs/local-docker.md)). Or with Homebrew:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb lt_e2e
export E2E_ADMIN_DATABASE_URL="postgresql://$(whoami)@127.0.0.1:5432/lt_e2e"
```

3. `pnpm test:e2e`

To run one spec: `pnpm --filter web exec playwright test e2e/stack/maintenance.spec.ts`. To watch it in a visible browser, add `--headed`. A failed test leaves notes about the page under `web/test-results/`.

Things to know:
- **Without `E2E_ADMIN_DATABASE_URL`** the full-stack specs are skipped (with a message) and the screen-check specs (layout, accessibility) still run.
- **Use a database that only the tests use.** Its name must contain `e2e` and it must be on your computer, or the tests refuse to start. They **empty it at the start of every run**.
- **They change `api/.dev.vars`.** The tests replace the `DATABASE_URL` line there with the test database's login (other lines are left alone), and remove it when `E2E_ADMIN_DATABASE_URL` is not set. If you use `.dev.vars` for `pnpm dev`, save your own `DATABASE_URL` line first and put it back afterwards.
- **Ports 8788 and 9099** must be free. Close any other copy of the tests first, because two runs at once break each other.
- Document uploads use the local R2 that `wrangler dev` provides, so no Cloudflare bucket is touched.

More about what each level covers is in [TESTING.md](TESTING.md).

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
