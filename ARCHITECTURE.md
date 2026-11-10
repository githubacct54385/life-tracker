# Life Tracker: Architecture Diagrams (Draft v0.3)

All diagrams are [Mermaid](https://mermaid.js.org/) code blocks, so they render on GitHub and in VS Code (see the tool comparison at the bottom).

**Stack.** Decided in [DECISIONS.md](DECISIONS.md) (ADR-0021): a React app (Vite, PWA) served by a Cloudflare Worker that also runs the API (TypeScript, Hono), Cloudflare Access for the owner-only login, and Neon Postgres. A `shared/` package holds the zod schemas used by both sides. File names below are proposals. If a name changes, the structure still holds.

> **Migration in progress.** The code in the repo still targets Azure (Static Web Apps, Functions, Azure SQL) until stories MIG-02 to MIG-07 land. These diagrams show the target. Finance and transaction tracking are **not part of this app** (ADR-0021); they live in a separate private repository.

## 1. Deployment overview

Where things run, and who talks to whom. Note the two separate paths: users reach the app through the Cloudflare edge, and code reaches production only through the manual Release workflow.

```mermaid
flowchart LR
    phone["Phone (installed PWA)"]
    desk["Desktop browser"]
    gh["GitHub (identity provider)"]
    dev["Developer: pull request"]

    subgraph github["GitHub (public repo)"]
        main["main (protected: PR only)"]
        ci["Actions: CI (hygiene, test)"]
        rel["Actions: Release (manual, owner approval)"]
    end

    subgraph cf["Cloudflare"]
        access["Access: owner-only GitHub sign-in at the edge"]
        worker["Worker: serves the React app and the API"]
        logs["Workers Logs"]
    end

    neon[("Neon Postgres")]

    phone --> access
    desk --> access
    access -. "sign in" .-> gh
    access --> worker
    worker -- "app role (read/write)" --> neon
    worker -. "logs" .-> logs

    dev --> main
    main --> ci
    rel -- "1. migrations (admin role)" --> neon
    rel -- "2. wrangler deploy" --> worker
```

Merging to `main` does not touch Cloudflare or Neon. Only the Release workflow does.

## 2. Main code files and what they do

Not every file, just the ones that carry the structure. Arrows point from a file to the thing it depends on. The rule that keeps this clean: **dependencies only point downward**, so nothing in `repositories/` ever imports from `handlers/`.

```mermaid
flowchart TD
    subgraph shared["shared/"]
        schemas["schemas/: zod request and response shapes"]
    end

    subgraph web["Frontend: web/src"]
        main["main.tsx: app start, router, service worker"]
        pages["pages/: one screen per area (Home, Giving, Health, Car, Settings)"]
        comps["components/: shared UI (tables, charts, forms)"]
        importers["importers/: browser-side readers (appleHealth worker, mileage spreadsheet)"]
        client["api/client.ts: typed fetch calls, the only place that talks to the API"]
        demo["demo/demoApi.ts: same interface as client.ts, but seeded fake data in the browser"]
        sw["sw.js: caches the app shell only, never API data"]
    end

    subgraph fn["API: api/src (Worker)"]
        handlers["handlers/: HTTP entry points (mileage, giving, health)"]
        guard["auth/ownerGuard.ts: validates the Access token, checks the owner identity, fails closed, no bypass"]
        reqguard["auth/requestGuard.ts: requires the custom header on non-GET calls"]
        services["services/: business rules (mileageService, givingService, workoutService)"]
        repos["repositories/: all SQL queries, one file per table group"]
        db["db/connection.ts: Postgres connection, app role"]
        log["telemetry/logger.ts: structured logging with a redaction filter"]
    end

    subgraph ops["Database tooling (not part of the running app)"]
        migrations["db/migrations/*.sql: numbered, additive"]
        migrate["pnpm migrate (api/src/db/migrate-cli.ts): applies migrations, admin role, journal table"]
    end

    pgdb[("Neon Postgres")]
    wlogs["Workers Logs"]

    main --> pages
    main --> sw
    pages --> comps
    pages --> client
    pages --> importers
    pages -. "demo mode only" .-> demo
    client --> schemas
    demo --> schemas
    importers --> schemas

    client -- "HTTPS" --> handlers

    handlers --> guard
    handlers --> reqguard
    handlers --> schemas
    handlers --> services
    handlers --> log
    services --> repos
    repos --> db
    db --> pgdb
    log --> wlogs

    migrate --> migrations
    migrate --> pgdb
```

**One-line job of each layer**

| Layer | Job | Must not |
|---|---|---|
| `pages/`, `components/` | Draw screens, hold UI state | Call `fetch` directly |
| `importers/` | Read big or untrusted files in the browser (Apple Health, mileage spreadsheet) and output validated rows | Send the file anywhere |
| `api/client.ts` | Single doorway from the UI to the API | Contain business rules |
| `demo/demoApi.ts` | Stand-in for `client.ts` with fake data | Ever call the real API |
| `shared/schemas` | One definition of every request and response | Import from `web` or `api` |
| `handlers/` | Parse and validate the request, check the owner, call a service, shape the response | Contain SQL or business rules |
| `auth/ownerGuard.ts` | Reject anyone who is not the owner | Trust the edge check alone, or read an environment flag |
| `auth/requestGuard.ts` | Reject non-GET requests without the custom header | Contain any identity logic |
| `services/` | The rules: mileage weeks, giving totals, workout streaks, validation | Know about HTTP or SQL |
| `repositories/` | The only code that talks to SQL | Contain business rules |
| `telemetry/logger.ts` | One logging door, strips personal data | Log health values, odometer values, or gift amounts |
| `pnpm migrate` (`api/src/db/migrate-cli.ts`, runner in `api/src/db/`) | Apply SQL migrations with the admin role (`DATABASE_ADMIN_URL`). `db/` is the only place besides `repositories/` that imports the Postgres driver | Run inside the app |

A dependency check (dependency-cruiser) enforces these arrows in CI (AC-FND-03.6): handlers may not skip to repositories or `db`, services may not import `db`, only `repositories/` may use `db/`, and `db/` imports nothing above it. An ESLint rule rejects SQL text outside `repositories/`, `db/`, and tests (AC-FND-03.3; write SQL keywords in UPPER CASE so the rule can see them).

**Where each test level plugs in** (details in [TESTING.md](TESTING.md))

| Boundary | Test level |
|---|---|
| Inside `services/`, `shared/`, importers, guards, logger, components | Unit (in-memory fakes for repositories) |
| `repositories/` and `pnpm migrate` against a real Postgres | Integration |
| `handlers/` called with fake requests against a real Postgres | Integration |
| `pages/` against `demoApi`; `client.ts` and `demoApi.ts` against one contract suite | Integration |
| The built app in a browser through `wrangler dev` | End-to-end |

## 3. Sequence: every request is checked twice

This is the same for all endpoints. It is the "fail closed" rule from the spec. Tests use this same path with synthetic signed tokens. There is no test-only shortcut.

```mermaid
sequenceDiagram
    actor User
    participant Edge as Cloudflare Access
    participant API as Worker handler
    participant G as ownerGuard
    participant RG as requestGuard

    User->>Edge: request to /api/anything
    alt not signed in or not on the owner policy
        Edge-->>User: redirect to sign-in, or access denied
    else owner policy passes
        Edge->>API: forwards request with a signed Access token
        API->>G: verify token signature, audience and expiry, compare identity to the owner setting
        alt token invalid, identity does not match, or setting missing
            G-->>API: deny
            API-->>User: 401 or 403, no data
        else match
            G-->>API: allow
            API->>RG: non-GET? custom header present?
            alt header missing
                RG-->>API: deny
                API-->>User: 403, nothing changed
            else ok
                RG-->>API: allow
                API-->>User: response
            end
        end
    end
```

## 4. Sequence: importing from Apple Health (in the browser)

The big file never leaves the phone or computer. A background worker reads workouts from the ZIP, and only those rows are sent.

```mermaid
sequenceDiagram
    actor Owner
    participant Page as Health import page
    participant W as importers/appleHealth worker
    participant Client as api/client.ts
    participant H as handlers/workouts
    participant S as workoutService
    participant R as repositories

    Owner->>Page: Choose export.zip
    Page->>W: start(file)
    loop streaming
        W->>W: unzip a chunk, read XML, keep Workout elements only
        W-->>Page: progress
    end
    alt too big for this device
        W-->>Page: error, suggest importing from a computer
    else done
        W-->>Page: workout rows (validated by shared schema)
        Page->>Client: commitWorkouts(rows)
        Client->>H: POST /api/workouts/import
        H->>H: owner, header, schema, row cap
        H->>S: import(rows)
        S->>R: insert rows not already present (start time, type, duration)
        R-->>S: counts
        H-->>Page: imported N, skipped M
    end
    Note over Page,W: The ZIP and XML are never uploaded or stored.
```

The mileage spreadsheet import (MIL-04) follows the same shape: the browser reads the file, shows a preview, and sends only validated readings to the API.

## 5. Flow: from change to production

```mermaid
flowchart TD
    A["Branch: mil-01-log-odometer"] --> B["Open pull request"]
    B --> C{"CI: hygiene + test green, branch up to date?"}
    C -- "no" --> A
    C -- "yes" --> D["Squash merge to main"]
    D --> E["Nothing deploys"]
    E --> F["Owner starts Release workflow on main"]
    F --> G{"Owner approves 'production' environment?"}
    G -- "no" --> X["Stopped, nothing changed"]
    G -- "yes" --> H{"CI passed on this exact commit?"}
    H -- "no" --> X
    H -- "yes" --> I["Apply pending SQL migrations (admin role)"]
    I --> J{"Migrations OK?"}
    J -- "no" --> X
    J -- "yes" --> K["wrangler deploy: site and API"]
    K --> L["Summary: commit and migrations applied"]
```

## 6. Data model (ER diagram)

Only the tables the MVP needs. No raw files, and no financial or bank data (ADR-0021). Weekly mileage is computed from readings, not stored (ADR-0008). Every table also has created and updated timestamps, left out below.

```mermaid
erDiagram
    ODOMETER_READING {
        int id PK
        date read_on
        int miles
        string note
    }
    GIFT {
        int id PK
        date given_on
        date for_month "null for special"
        numeric amount
        string method
        string kind "regular or special"
        string occasion "special only"
        string note
    }
    WEIGHT_ENTRY {
        int id PK
        date logged_on UK
        numeric pounds
    }
    WORKOUT {
        int id PK
        timestamptz started_at_utc
        date done_on "local date"
        string type
        int minutes
        string source "manual or watch"
    }
    APP_SETTING {
        string key PK
        string value "time zone, weight unit, theme"
    }
```

`WORKOUT` has a unique index on (start time, type, minutes) so re-imports skip repeats. `WEIGHT_ENTRY` is unique per day. All tables stand alone for now, so they have no lines.

## 7. Tool comparison: which diagramming tool?

Your two requirements are (1) viewable in VS Code and (2) viewable on GitHub.

| Tool | GitHub renders it | VS Code | Diagram types | Notes |
|---|---|---|---|---|
| **Mermaid** | Yes, natively in any `.md` | Yes, with an extension (or built in, see below) | Flowchart, sequence, ER, state, class, Gantt, C4 (experimental), more | Diagram is plain text, so it diffs cleanly in Git. Layout is automatic and less controllable. |
| PlantUML | No (needs a server or pre-rendered images) | Yes, extension plus Java | Very wide range, best UML coverage | Extra setup and a build step to show on GitHub. |
| D2 | No | Extension exists | Flowcharts, architecture; prettier output | Needs pre-rendered SVGs committed to the repo. |
| draw.io (diagrams.net) | Only as exported images, or `.drawio.svg` files | Yes, official extension | Anything, drag and drop | Full layout control, but the source is XML, so Git diffs are unreadable. |
| Excalidraw | Only as exported images | Yes, extension | Hand-drawn sketches | Good for whiteboarding, not for maintained docs. |
| Structurizr (C4) | No | Limited | Proper C4 architecture model | Powerful but heavy for a one-person project. |

**Recommendation: stay with Mermaid.** It is the only option that meets both requirements with no build step, and for a portfolio repo it shows reviewers the diagrams right on the README page. Mermaid is a good fit for every diagram type you asked for. Use draw.io only if you ever need a polished, hand-laid-out poster diagram, and commit it as a `.drawio.svg`.

**Viewing in VS Code:** install the extension *Markdown Preview Mermaid Support* (`bierner.markdown-mermaid`), then open the Markdown preview with `Cmd+Shift+V`. Without an extension, the built-in preview shows the code, not the picture.

**Other diagram types worth keeping up to date**

| Diagram | Why it helps | Included here |
|---|---|---|
| Deployment overview | Shows hosting, release path, and cost surface | Section 1 |
| Dependency graph | Keeps layers clean | Section 2 |
| Sequence | Follows one action across modules | Sections 3, 4 |
| Change-to-production flow | Shows the gates between a commit and real data | Section 5 |
| ER | Agrees on tables before writing SQL | Section 6 |
| State | Catches missing failure paths in multi-step flows | Add when a multi-step flow needs one |
| Screen flow (navigation map) | Later, once wireframes settle | Not yet |
