#!/usr/bin/env bash
# Runs a filtered set of tests with everything they need set up and torn down for you.
#
#   scripts/run-tests.sh unit <vitest args>      e.g. scripts/run-tests.sh unit web src/pages/groceries -t "AC-GRO-01.1"
#   scripts/run-tests.sh int  <vitest args>      e.g. scripts/run-tests.sh int api src/handlers/groceryApi.int.test.ts
#   scripts/run-tests.sh e2e  <playwright args>  e.g. scripts/run-tests.sh e2e e2e/stack/groceriesOffline.spec.ts -g "AC-GRO-02"
#
# unit: no Docker. The first argument after "unit" or "int" is the package (web, api or shared).
# int:  needs Docker running. The tests start and remove their own Postgres container (Testcontainers).
# e2e:  needs Docker running. This script starts a throwaway Postgres on a free local port, runs the
#       Playwright specs you name, then removes the container and puts api/.dev.vars back as it was.
#
# Nothing here touches Neon, Cloudflare or any real data. See docs/local-docker.md.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-2}"; }
[ $# -ge 1 ] || usage
kind="$1"; shift

need_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running. Start Docker Desktop (or OrbStack or Colima) and run this again." >&2
    exit 1
  fi
}

case "$kind" in
  unit|int)
    [ $# -ge 1 ] || usage
    pkg="$1"; shift
    case "$pkg" in web|api|shared) ;; *) echo "Package must be web, api or shared, not '$pkg'." >&2; exit 2 ;; esac
    if [ "$kind" = int ]; then
      need_docker
      exec pnpm --filter "$pkg" exec vitest run --config vitest.int.config.ts "$@"
    fi
    exec pnpm --filter "$pkg" exec vitest run "$@"
    ;;
  e2e)
    need_docker
    name="lt-e2e-$$"
    devvars="$root/api/.dev.vars"
    backup="$(mktemp)"
    had_devvars=0
    if [ -f "$devvars" ]; then cp "$devvars" "$backup"; had_devvars=1; fi

    cleanup() {
      docker rm -f "$name" >/dev/null 2>&1 || true
      if [ "$had_devvars" = 1 ]; then cp "$backup" "$devvars"; else rm -f "$devvars"; fi
      rm -f "$backup"
    }
    trap cleanup EXIT INT TERM

    echo "Starting a throwaway Postgres ($name)..."
    docker run -d --rm --name "$name" \
      -e POSTGRES_PASSWORD=e2e-only \
      -p 127.0.0.1::5432 \
      postgres:16 >/dev/null
    for _ in $(seq 1 60); do
      docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break
      sleep 1
    done
    docker exec "$name" pg_isready -U postgres >/dev/null
    docker exec "$name" createdb -U postgres lt_e2e
    port="$(docker port "$name" 5432/tcp | head -n1 | sed 's/.*://')"
    export E2E_ADMIN_DATABASE_URL="postgresql://postgres:e2e-only@127.0.0.1:${port}/lt_e2e"

    pnpm --filter web exec playwright install chromium >/dev/null
    pnpm --filter web exec playwright test --trace off "$@"
    ;;
  *) usage ;;
esac
