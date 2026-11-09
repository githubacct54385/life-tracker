# Life Tracker: Architecture Diagrams (Draft v0.2)

All diagrams are [Mermaid](https://mermaid.js.org/) code blocks, so they render on GitHub and in VS Code (see the tool comparison at the bottom).

**Stack.** Decided in [DECISIONS.md](DECISIONS.md): a React app (Vite, PWA) on Azure Static Web Apps, its managed API on Azure Functions (TypeScript), and Azure SQL. A `shared/` package holds the zod schemas used by both sides. File names below are proposals. If a name changes, the structure still holds.

## 1. Deployment overview

Where things run, and who talks to whom. Note the two separate paths: users reach the app through the hosting edge, and code reaches production only through the manual Release workflow.

```mermaid
flowchart LR
    phone["Phone (installed PWA)"]
    desk["Desktop browser (CSV import)"]
    gh["GitHub OAuth (login)"]
    dev["Developer: pull request"]

    subgraph github["GitHub (public repo)"]
        main["main (protected: PR only)"]
        ci["Actions: CI (hygiene, test)"]
        rel["Actions: Release (manual, owner approval)"]
    end

    subgraph azure["Azure"]
        swa["Static Web Apps: serves the React app, enforces owner role"]
        api["Managed API: Azure Functions"]
        sql[("Azure SQL Database")]
        ai["Application Insights"]
    end

    phone --> swa
    desk --> swa
    swa -. "sign in" .-> gh
    swa --> api
    api -- "app login (read/write)" --> sql
    api -. "logs, traces" .-> ai

    dev --> main
    main --> ci
    rel -- "1. migrations (admin login)" --> sql
    rel -- "2. deploy site and API" --> swa
```

Merging to `main` does not touch Azure. Only the Release workflow does.

## 2. Main code files and what they do

Not every file, just the ones that carry the structure. Arrows point from a file to the thing it depends on. The rule that keeps this clean: **dependencies only point downward**, so nothing in `repositories/` ever imports from `handlers/`.

```mermaid
flowchart TD
    subgraph shared["shared/"]
        schemas["schemas/: zod request and response shapes"]
    end

    subgraph web["Frontend: web/src"]
        main["main.tsx: app start, router, service worker"]
        pages["pages/: one screen per area (Home, Money, Health, Car, Giving, Settings)"]
        comps["components/: shared UI (tables, charts, forms)"]
        importers["importers/: browser-side readers (appleHealth worker)"]
        client["api/client.ts: typed fetch calls, the only place that talks to the API"]
        demo["demo/demoApi.ts: same interface as client.ts, but seeded fake data in the browser"]
        sw["sw.js: caches the app shell only, never API data"]
    end

    subgraph fn["API: api/src"]
        handlers["handlers/: HTTP entry points (transactions, import, mileage, giving, health)"]
        guard["auth/ownerGuard.ts: checks the owner's user ID and role from the identity header, fails closed, no bypass"]
        reqguard["auth/requestGuard.ts: requires the custom header on non-GET calls"]
        services["services/: business rules (importService, categorizer, mileageService)"]
        parsers["parsers/: CSV and XLSX readers (primaryBank.ts, columnMapping.ts)"]
        dedupe["services/dedupe.ts: fingerprints with occurrence numbers"]
        repos["repositories/: all SQL queries, one file per table group"]
        db["db/connection.ts: pooled connection, app login"]
        log["telemetry/logger.ts: structured logging with a redaction filter"]
    end

    subgraph ops["Database tooling (not part of the running app)"]
        migrations["db/migrations/*.sql: numbered, additive"]
        migrate["scripts/migrate: applies migrations, admin login, journal table"]
    end

    sqldb[("Azure SQL")]
    insights["Application Insights"]

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
    services --> parsers
    services --> dedupe
    services --> repos
    dedupe --> repos
    repos --> db
    db --> sqldb
    log --> insights

    migrate --> migrations
    migrate --> sqldb
```

**One-line job of each layer**

| Layer | Job | Must not |
|---|---|---|
| `pages/`, `components/` | Draw screens, hold UI state | Call `fetch` directly |
| `importers/` | Read big files in the browser (Apple Health) and output validated rows | Send the file anywhere |
| `api/client.ts` | Single doorway from the UI to the API | Contain business rules |
| `demo/demoApi.ts` | Stand-in for `client.ts` with fake data | Ever call the real API |
| `shared/schemas` | One definition of every request and response | Import from `web` or `api` |
| `handlers/` | Parse and validate the request, check the owner, call a service, shape the response | Contain SQL or business rules |
| `auth/ownerGuard.ts` | Reject anyone who is not the owner | Trust the edge check alone, or read an environment flag |
| `auth/requestGuard.ts` | Reject non-GET requests without the custom header | Contain any identity logic |
| `services/` | The rules: categorize, dedupe, mileage weeks, validation | Know about HTTP or SQL |
| `parsers/` | Turn a file into clean row objects, drop account numbers | Write to the database |
| `repositories/` | The only code that talks to SQL | Contain business rules |
| `telemetry/logger.ts` | One logging door, strips personal data | Log amounts, merchants, or health values |
| `scripts/migrate` | Apply SQL migrations with the admin login | Run inside the app |

A dependency check (dependency-cruiser) enforces these arrows in CI (AC-FND-03.6).

**Where each test level plugs in** (details in [TESTING.md](TESTING.md))

| Boundary | Test level |
|---|---|
| Inside `services/`, `parsers/`, `shared/`, guards, logger, components | Unit (in-memory fakes for repositories) |
| `repositories/` and `scripts/migrate` against a real SQL Server | Integration |
| `handlers/` called with fake requests against a real SQL Server | Integration |
| `pages/` against `demoApi`; `client.ts` and `demoApi.ts` against one contract suite | Integration |
| The built app in a browser through the SWA CLI | End-to-end |

## 3. Sequence: uploading a CSV

Import is two calls. Nothing is saved on the first one. The browser holds the parsed rows between the calls, so the server never stores the file. Because those rows come back from the browser, the commit call treats them as untrusted input.

```mermaid
sequenceDiagram
    actor Owner
    participant Page as Import page
    participant Client as api/client.ts
    participant H as handlers/import
    participant G as ownerGuard + requestGuard
    participant P as parsers
    participant S as importService
    participant D as dedupe
    participant R as repositories
    participant DB as Azure SQL

    Owner->>Page: Choose account, drop statement.csv
    Page->>Client: previewImport(file, accountId)
    Client->>H: POST /api/import/preview
    H->>G: verify owner and header
    G-->>H: ok
    H->>H: check size and type
    H->>P: parse(file)
    P-->>H: rows (account numbers dropped, merchant cleaned)
    H->>S: preview(rows, accountId)
    S->>D: compute fingerprints with occurrence numbers
    S->>R: find existing fingerprints for date range
    R->>DB: SELECT
    DB-->>R: fingerprints
    R-->>S: fingerprints
    S->>D: mark duplicates
    D-->>S: rows with status new or duplicate
    S->>S: apply category rules in order
    S-->>H: preview result
    H-->>Client: rows, counts, detected format
    Client-->>Page: show preview
    Note over Page: File is gone. Rows live only in browser memory.

    Owner->>Page: Fix categories, press Import
    Page->>Client: commitImport(rows, accountId)
    Client->>H: POST /api/import/commit
    H->>G: verify owner and header
    H->>H: validate schema, row cap, known category and account
    H->>S: commit(rows)
    S->>D: recompute fingerprints, re-check duplicates
    S->>R: insert batch and transactions (one transaction)
    R->>DB: INSERT
    DB-->>R: ok
    R-->>S: counts
    S-->>H: 128 imported
    H-->>Client: result
    Client-->>Page: success screen
```

Why re-check duplicates on commit: another import could have happened between preview and commit, and the database also has a unique index on the fingerprint as the final safety net. Undoing an import deletes the rows that belong to one batch (FIN-09).

## 4. Sequence: every request is checked twice

This is the same for all endpoints. It is the "fail closed" rule from the spec. Tests use this same path with synthetic identity headers. There is no test-only shortcut.

```mermaid
sequenceDiagram
    actor User
    participant Edge as Static Web Apps edge
    participant API as Function handler
    participant G as ownerGuard
    participant RG as requestGuard

    User->>Edge: request to /api/anything
    alt not signed in or not owner role
        Edge-->>User: 401 or 403
    else owner role present
        Edge->>API: forwards request with identity header
        API->>G: compare user ID and role from the identity header to OWNER_ID setting
        alt ID does not match, or setting missing
            G-->>API: deny
            API-->>User: 403, no data
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

## 5. Sequence: fixing a category and "teaching the app"

```mermaid
sequenceDiagram
    actor Owner
    participant Page as Transactions page
    participant H as handlers/transactions
    participant S as categorizer
    participant R as repositories
    participant DB as Azure SQL

    Owner->>Page: Set category, tick "apply to similar"
    Page->>H: PATCH /api/transactions/{id}
    H->>S: recategorize(id, category, createRule=true)
    S->>R: update this transaction
    S->>R: save rule (merchant contains text, next position)
    S->>R: find other uncategorized matches
    R->>DB: UPDATE and INSERT in one transaction
    DB-->>R: ok
    R-->>S: 3 updated
    S-->>H: result
    H-->>Page: updated rows
```

## 6. State diagram: life of an import

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Uploading: file dropped
    Uploading --> Rejected: wrong type, too big, unreadable
    Uploading --> Previewing: parsed OK
    Rejected --> Idle: try again
    Previewing --> Previewing: edit categories, filter rows
    Previewing --> Committing: press Import
    Previewing --> Idle: cancel
    Committing --> Done: rows saved
    Committing --> Failed: database error, nothing saved
    Failed --> Previewing: retry
    Done --> Undone: undo this import
    Undone --> [*]
    Done --> [*]
```

## 7. Sequence: importing from Apple Health (in the browser)

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

## 8. Flow: from change to production

```mermaid
flowchart TD
    A["Branch: fin-03-import-preview"] --> B["Open pull request"]
    B --> C{"CI: hygiene + test green, branch up to date?"}
    C -- "no" --> A
    C -- "yes" --> D["Squash merge to main"]
    D --> E["Nothing deploys"]
    E --> F["Owner starts Release workflow on main"]
    F --> G{"Owner approves 'production' environment?"}
    G -- "no" --> X["Stopped, nothing changed"]
    G -- "yes" --> H{"CI passed on this exact commit?"}
    H -- "no" --> X
    H -- "yes" --> I["Apply pending SQL migrations (admin login)"]
    I --> J{"Migrations OK?"}
    J -- "no" --> X
    J -- "yes" --> K["Deploy site and API"]
    K --> L["Summary: commit and migrations applied"]
```

## 9. Data model (ER diagram)

Only the tables the MVP needs. No account numbers, no raw files. Weekly mileage is computed from readings, not stored (ADR-0008). Every table also has created and updated timestamps, left out below.

```mermaid
erDiagram
    ACCOUNT ||--o{ TRANSACTION : holds
    ACCOUNT ||--o{ IMPORT_BATCH : "imported into"
    IMPORT_BATCH ||--o{ TRANSACTION : contains
    CATEGORY ||--o{ TRANSACTION : labels
    CATEGORY ||--o{ RULE : "assigned by"

    ACCOUNT {
        int id PK
        string name
        string type "checking, credit card, cash"
    }
    IMPORT_BATCH {
        int id PK
        int account_id FK
        date imported_on
        int row_count
        string source_format
    }
    TRANSACTION {
        int id PK
        int account_id FK
        int batch_id FK "null for manual entries"
        date posted_on
        decimal amount
        string description "original text"
        string merchant "cleaned name"
        string note
        int category_id FK
        string source "import or manual"
        string fingerprint UK "includes occurrence"
        int occurrence
    }
    CATEGORY {
        int id PK
        string name
        string type "expense, income, transfer"
    }
    RULE {
        int id PK
        string merchant_contains
        int category_id FK
        int position "first match wins"
    }
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
        decimal amount
        string method
        string kind "regular or special"
        string occasion "special only"
        string note
    }
    WEIGHT_ENTRY {
        int id PK
        date logged_on UK
        decimal pounds
    }
    WORKOUT {
        int id PK
        datetime started_at_utc
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

`WORKOUT` has a unique index on (start time, type, minutes) so re-imports skip repeats. The last few tables stand alone for now, so they have no lines.

## 10. Tool comparison: which diagramming tool?

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
| Sequence | Follows one action across modules | Sections 3, 4, 5, 7 |
| State | Catches missing failure paths in multi-step flows | Section 6 |
| Change-to-production flow | Shows the gates between a commit and real data | Section 8 |
| ER | Agrees on tables before writing SQL | Section 9 |
| Screen flow (navigation map) | Later, once wireframes settle | Not yet |
