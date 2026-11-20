# Docker on your computer: install, and how this project uses it

Written for a Mac. It covers what Docker is for in this project, how to install it, and the good habits for the three places it can help: the integration tests, a local database for trying the app, and the end-to-end tests. I could not run Docker where I wrote this (the Linux session has no Docker), so the commands come from the tools' documentation and this repository's code. If a step differs on your Mac, tell me and I will fix this page.

## The short answer

- **Do you need a Dockerfile?** No. Production does not run in a container. It runs as a Cloudflare Worker, and `wrangler dev` runs the same engine (workerd) on your computer. Putting the app in a container would add a second way to run it that production never uses. A Dockerfile would be a good answer to "how do I deploy a container app", and this is not that app.
- **Do you need Docker Compose?** Only if you want a database that stays running on your computer. It is optional (see "A database that stays running" below). The tests do not need it.
- **What do the integration tests use?** A library called Testcontainers. It starts a throwaway Postgres container for each test run and removes it afterwards. You do nothing except have Docker running.
- **What does CI use for the end-to-end tests?** A Postgres "service container" that GitHub Actions starts next to the job (`.github/workflows/ci.yml`). On your computer you start one yourself with one command.

## What Docker gives you here

| You want to | Without Docker | With Docker |
|---|---|---|
| Run the integration tests (`pnpm test:int`) | They are **skipped** and show as passed. You find failures only in CI. | They run, against the same kind of real Postgres CI uses. |
| Try the app against a real local database (`pnpm dev`) | Install Postgres with Homebrew, or point at a Neon branch | One command starts a database, one command removes it |
| Run the end-to-end tests with the real database | Install Postgres with Homebrew (what the README says today) | The same one command |
| Repeat a CI failure | Push and wait | Run the same test locally |

Nothing here touches Neon, Cloudflare or staging, and no real data goes into a local database (hard rule 1).

## Install

1. **Check your Mac.** Docker Desktop for Mac needs a recent macOS. It runs on Apple Silicon and Intel. The Postgres images this project uses are built for both.
2. **Install it.** Pick one:
   - Download **Docker Desktop** from docker.com (choose Apple Silicon or Intel to match your Mac; `uname -m` prints `arm64` for Apple Silicon), open the `.dmg` and drag Docker to Applications. Or with Homebrew: `brew install --cask docker`.
   - Lighter alternatives that work the same for this project: **OrbStack** (`brew install --cask orbstack`) or **Colima** (`brew install colima docker`, then `colima start`). They use less memory than Docker Desktop. Docker Desktop's licence is free for personal use and small businesses; check Docker's terms if that matters to you.
3. **Open Docker once** and accept the prompts (it asks for your Mac password to install helper tools). Wait until the whale icon in the menu bar stops animating and says it is running.
4. **Check it works:**

   ```bash
   docker version
   docker run --rm hello-world
   ```

   The second command downloads a tiny image and prints "Hello from Docker!". If the first command prints a version for both **Client** and **Server**, Docker is running.
5. **Sensible settings** (Docker Desktop, Settings, Resources): 2 CPUs and 4 GB of memory is plenty for Postgres. Turn off "Open Docker Dashboard at startup" if you do not want it popping up. You can also turn off "Start Docker Desktop when you sign in" and start it only when you need it, since it uses memory while running.
6. **Disk.** Docker Desktop takes a few GB, and each image takes a few hundred MB (Postgres is about 250 MB). With 452 GB free, this is not a concern. `docker system df` shows what Docker uses, and `docker system prune` frees what is not in use.

## 1. The integration tests (nothing to set up)

```bash
pnpm test:int
```

What happens (`api/src/db/globalSetup.int.ts`, `api/src/db/testDatabase.ts`):
- One Postgres 17 container starts for the whole run, on a random port, so it cannot clash with anything on your Mac.
- Each test file creates its own empty database inside it, applies the **real** migrations from `db/migrations`, and connects as the real least-privilege app role built from `db/setup/app-role-grants.sql`. So the tests prove the same database setup production uses.
- When the run ends, the container is removed. Nothing is left behind.

The first run downloads the image, so it is slower. Later runs start in seconds.

**Watch for the skip warning.** If Docker is not running, the tests print `database tests are SKIPPED` and still pass. That is on purpose, so a laptop without Docker can run the other tests, but it means a green run proves less. CI never skips them. If you use Colima or OrbStack and the tests cannot find Docker, set `DOCKER_HOST` to that tool's socket (`docker context ls` shows the address).

## 2. A database that stays running (for `pnpm dev` and the end-to-end tests)

For trying the app by hand, and for the end-to-end tests, you want one Postgres that stays running. One container, two databases (`lt_dev` for trying things, `lt_e2e` for the tests, which empty it on every run):

```bash
docker run -d --name lt-postgres \
  -e POSTGRES_PASSWORD=dev-only \
  -p 127.0.0.1:5432:5432 \
  -v lt-postgres-data:/var/lib/postgresql/data \
  postgres:16

docker exec lt-postgres createdb -U postgres lt_dev
docker exec lt-postgres createdb -U postgres lt_e2e
```

What the flags mean:
- `-p 127.0.0.1:5432:5432` makes the database reachable **only from your own computer**. Never leave out `127.0.0.1:`, because without it other devices on your Wi-Fi could connect.
- `-v lt-postgres-data:...` keeps the data when you stop the container. Leave this off if you want it to forget everything each time.
- `postgres:16` matches the version CI uses for the end-to-end tests. (The integration tests use 17, like Neon. If you want one version everywhere, say so and I will align them.)
- The password is only for this local container. It is not a real secret, and it never goes in the repository.

**Run the end-to-end tests against it:**

```bash
export E2E_ADMIN_DATABASE_URL="postgresql://postgres:dev-only@127.0.0.1:5432/lt_e2e"
pnpm --filter web exec playwright install chromium   # once
pnpm test:e2e
```

The tests refuse any database that is not on your computer or whose name does not contain `e2e`, and they empty it at the start of every run. They also rewrite the `DATABASE_URL` line in `api/.dev.vars` (see the README).

**Try the app by hand (`pnpm dev`):**

```bash
# once: make the app's restricted login, the same way production does
APP_PW="$(openssl rand -hex 16)"
docker cp db/setup lt-postgres:/tmp/setup
docker exec lt-postgres psql -U postgres -d lt_dev -v app_password="$APP_PW" -f /tmp/setup/app-role.sql

# apply the real migrations (admin login)
DATABASE_ADMIN_URL="postgresql://postgres:dev-only@127.0.0.1:5432/lt_dev" pnpm migrate

# point the Worker at the restricted login (api/.dev.vars is git-ignored)
printf 'DATABASE_URL=postgresql://lt_app:%s@127.0.0.1:5432/lt_dev\n' "$APP_PW" > api/.dev.vars
pnpm dev
```

Why copy the folder in: `app-role.sql` includes `app-role-grants.sql` (`\ir`), and psql looks for it next to the script. Piping the script in with `< file` leaves psql with no folder to look in, so it fails with "app-role-grants.sql: No such file or directory" after creating the role but before granting anything. Copying the folder into the container and giving psql the real path avoids that. Running it again is safe.

`api/.dev.vars` needs the Cloudflare Access settings too if you want to sign in locally. That part is in `docs/cloudflare-access-setup.md`. The end-to-end tests do not need it, because they sign synthetic tokens with a throwaway key.

**Day to day:**

```bash
docker stop lt-postgres      # stop it (data kept)
docker start lt-postgres     # start it again
docker logs lt-postgres      # see what it printed
docker rm -f lt-postgres && docker volume rm lt-postgres-data   # throw it all away
```

### Compose, if you prefer a file

The same container as a file, if you would rather type `docker compose up -d` than the long command. It is optional, and I have not added it to the repository. Say so and I will add it as `compose.yaml` with a `pnpm` shortcut:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev-only
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - lt-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10
volumes:
  lt-postgres-data:
```

## Good habits for this kind of project

1. **Use the container for the database, not for the app.** The database is the part that is painful to install and easy to break. The app (Vite and `wrangler dev`) runs fine on your Mac and gives faster reloads outside a container.
2. **One tool per job.** Testcontainers for tests (fresh and automatic every run, nothing shared, safe to run in parallel). A plain container or Compose for a database you keep. Do not point the integration tests at your long-running database. They create their own.
3. **Pin the image version** (`postgres:16`, not `postgres:latest`), so a new release cannot change your results. Keep it close to production (Neon runs Postgres 17).
4. **Bind to `127.0.0.1`.** A database on `0.0.0.0` is reachable from the whole network.
5. **No real data in a local database, ever** (hard rule 1). Use the demo, hand-typed test values, or synthetic data. The staging sample data script (`pnpm seed:staging`) refuses any database not named `lt_staging`, on purpose, so it will not touch your local one.
6. **Local logins are throwaway.** `dev-only` is fine for a container that only listens on your computer. Real database passwords never go in a command that you paste into chat or commit.
7. **Clean up now and then.** `docker system df` shows the space used, and `docker system prune` removes stopped containers and unused images.
8. **Same commands in CI and locally.** CI runs `pnpm test:int` and `pnpm test:e2e`. If they pass on your Mac with Docker, they should pass there.

## When something goes wrong

| Symptom | What it means | What to do |
|---|---|---|
| `database tests are SKIPPED` | Docker is not running, or the tests cannot find it | Start Docker. With Colima or OrbStack, check `docker context ls` and set `DOCKER_HOST` |
| `Cannot connect to the Docker daemon` | Docker is installed but not running | Open Docker Desktop and wait for it to say it is running |
| `port is already allocated` / `address already in use` on 5432 | Another Postgres (for example from Homebrew) is using the port | `brew services stop postgresql@16`, or change the left number: `-p 127.0.0.1:5433:5432` and use port 5433 in the URLs |
| The end-to-end tests say the database must be local and contain `e2e` | The safety check in `prepareDatabase.mjs` | Use the `lt_e2e` URL above |
| Tests are slow the first time | The Postgres image is downloading | Wait. It is cached afterwards |
| Docker uses a lot of memory | Docker Desktop reserves memory while it runs | Lower Settings, Resources, Memory, or quit Docker when you are not using it |

## What I would not do

- **Containerise the app or write a production Dockerfile.** Not needed on Workers (see the top).
- **Use Docker for staging or production.** They are Cloudflare and Neon, and that is the point of ADR-0021 and ADR-0025.
- **A dev container (VS Code) or a compose file that starts everything.** These can be nice for a team. For one person on a Mac they add more to maintain than they save. Worth doing only if you want it as a portfolio piece.
