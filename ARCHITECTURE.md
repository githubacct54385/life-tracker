# Life Tracker: Architecture Diagrams (Draft v0.3)

All diagrams are [Mermaid](https://mermaid.js.org/) code blocks, so they render on GitHub and in VS Code (see the tool comparison at the bottom).

**Stack.** Decided in [DECISIONS.md](DECISIONS.md) (ADR-0021): a React app (Vite, PWA) served by a Cloudflare Worker that also runs the API (TypeScript, Hono), Cloudflare Access for the owner-only login, and Neon Postgres. A `shared/` package holds the zod schemas used by both sides. File names below are proposals. If a name changes, the structure still holds.

> **Migration complete (ADR-0021).** The data layer is on Postgres (MIG-02). The API runtime is a Cloudflare Worker (Hono) as of MIG-03: `api/src/worker.ts` routes `/api/*` to `api/src/app.ts` and everything else to the static assets. Login is Cloudflare Access with the owner re-checked in the API as of MIG-04. The release workflow deploys to Cloudflare (MIG-05) and logs go to Workers Logs (MIG-06). Azure is retired (MIG-07). These diagrams match the running system. Finance and transaction tracking are **not part of this app** (ADR-0021); they live in a separate private repository.

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
    r2[("R2 bucket: maintenance documents (private)")]

    phone --> access
    desk --> access
    access -. "sign in" .-> gh
    access --> worker
    worker -- "app role (read/write)" --> neon
    worker -- "DOCUMENTS binding (ADR-0024)" --> r2
    worker -. "logs" .-> logs

    dev --> main
    main --> ci
    rel -- "1. migrations (admin role)" --> neon
    rel -- "2. wrangler deploy" --> worker
```

Merging to `main` does not touch Cloudflare or Neon. Only the Release workflow does. The R2 bucket has no public address: the Worker is its only reader, after the owner check (ADR-0024). Its file access sits in `repositories/documentStore.ts`, the one place that touches R2, and the Worker hands each request its bucket the same way it hands it its database.

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
        handlers["handlers/: HTTP entry points (odometer, mileage, giving, health)"]
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

On the Worker, `services/requestScope.ts` (backed by `repositories/requestDatabase.ts`) gives each `/api/*` request its own small connection pool built from the `DATABASE_URL` secret and closes it afterwards, because a Worker cannot reuse a network connection across requests (MIL-01). The URL is never logged.

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

## 3.1 Sequence: signing in with Google (target, SET-07)

This replaces the Cloudflare Access hop for production once SET-07 ships (staging keeps Access in front as an extra layer). The session check is the same "fail closed" rule as in section 3.

```mermaid
sequenceDiagram
    actor Person
    participant W as Worker
    participant G as Google
    participant DB as Postgres

    Person->>W: open the site, press "Sign in with Google"
    W-->>Person: redirect to Google with state, nonce and PKCE challenge
    Person->>G: sign in with Google
    G-->>Person: redirect back with a code
    Person->>W: /auth/callback with code and state
    W->>G: exchange the code, verify the ID token (signature, issuer, audience, expiry, email_verified)
    W->>DB: find the user row for the verified email, or an unused unexpired invite
    alt no row and no invite
        W-->>Person: "no access" page (same answer for every unknown email), no data
    else active person
        W->>DB: save last sign-in, make the session
        W-->>Person: signed HttpOnly cookie, redirect to the app
    end
    Person->>W: any later /api request with the cookie
    W->>DB: read the user row (status, role) on every request
    alt removed, expired or unknown
        W-->>Person: 401, nothing else
    else active
        W->>DB: queries limited to this person (user_id)
        W-->>Person: response
    end
```

## 3.2 Sequence: requesting access (target, SET-05)

```mermaid
sequenceDiagram
    actor Visitor
    participant W as Worker
    participant T as Turnstile
    participant DB as Postgres
    participant R as Resend
    actor Admin

    Visitor->>W: POST /api/access-requests (email, optional message, Turnstile token)
    W->>T: verify the token
    W->>DB: rate limit, pending cap, merge the same email, store the request
    W-->>Visitor: the same "thanks" answer whatever the email is
    W->>R: "new access request" to the owner only (no message text)
    Admin->>W: open the Admin page (signed in as admin)
    W-->>Admin: pending requests, people, last sign-in
    Admin->>W: approve (makes an invitation) or decline (deletes it)
    Admin-->>Visitor: tells them by hand (copy-ready message)
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

> **People (ADR-0026, SET-04):** every table below also has a required `user_id` (`NOT NULL`, migration 0012) pointing at the `users` table (id, email, role, status, created, last sign-in). Every query in `repositories/` is limited to the signed-in person (`WHERE user_id = ...`), through a per-request scope (`db/requestUser.ts`) that throws when no person is set, so a query can never run unfiltered. The owner's row is created the first time they are seen. Migration 0012 gave every row saved before people existed to that admin, made `user_id` required, and replaced the old one-weight-a-day and one-place-name rules with per-person ones. `db/personTables.ts` lists the tables that hold a person's data.

Weekly mileage is computed from readings, not stored (ADR-0008). No files and no financial or bank data are stored (ADR-0021). Every table also has created and updated timestamps, left out below. The same diagram is in the [README](README.md).

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

Weight is unique per person per day and a place name is unique per person ignoring letter case (the old single-person versions of these rules go in SET-04 part 3). A timed workout has `minutes` and no `reps`; a counted one (pushups) has `reps` and no `minutes`, and the database requires one or the other. Money is `numeric(12,2)` in the database and integer cents in code (ADR-0007).

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
