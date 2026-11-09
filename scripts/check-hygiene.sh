#!/usr/bin/env bash
# Repo hygiene checks for a public repository (AGENTS.md hard rules 1 to 3 and 8).
# Run from the repo root. Checks tracked files only.
#
#   bash scripts/check-hygiene.sh
#   HYGIENE_RANGE=<base>..<head> bash scripts/check-hygiene.sh   # also checks commit emails
set -uo pipefail

failed=0
fail() { echo "HYGIENE FAIL: $*"; failed=1; }

# 1. Files that must never be tracked.
bad_files=$(git ls-files | grep -E -i \
  '(\.csv$|\.xlsx?$|\.xlsm$|\.bacpac$|\.sqlite$|(^|/)export(_cda)?\.(xml|zip)$|(^|/)apple_health_export/|(^|/)local\.settings\.json$|(^|/)\.env(\..*)?$|\.pem$|\.pfx$|\.key$)' \
  | grep -v -E '(^|/)\.env\.example$' || true)
if [ -n "$bad_files" ]; then
  fail "personal-data or secret-type files are tracked:"
  echo "$bad_files" | sed 's/^/  /'
fi

# 2. Secret-like strings in tracked text files.
patterns='Server=tcp:[A-Za-z0-9-]+\.database\.windows\.net|AccountKey=|SharedAccessSignature=|Password=[^;"< ]{4,};|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
hits=$(git grep -n -I -E "$patterns" -- . ':!scripts/check-hygiene.sh' || true)
if [ -n "$hits" ]; then
  fail "secret-like strings found:"
  echo "$hits" | sed 's/^/  /' | cut -c1-160
fi

# 3. Destructive migrations need an explicit marker (AC-FND-06.5).
if [ -d db/migrations ]; then
  for f in db/migrations/*.sql; do
    [ -e "$f" ] || continue
    if grep -E -i -q '\b(DROP[[:space:]]+(TABLE|COLUMN|INDEX|CONSTRAINT|VIEW)|sp_rename|TRUNCATE[[:space:]]+TABLE|ALTER[[:space:]]+COLUMN)\b' "$f" \
       && ! grep -q -- '-- allow-destructive' "$f"; then
      fail "$f has a destructive statement but no '-- allow-destructive' marker"
    fi
  done
fi

# 4. Commit author and committer emails must be GitHub noreply addresses (hard rule 8).
if [ -n "${HYGIENE_RANGE:-}" ]; then
  emails=$(git log --format='%ae%n%ce' "$HYGIENE_RANGE" | sort -u || true)
  while IFS= read -r e; do
    [ -z "$e" ] && continue
    if ! echo "$e" | grep -E -q '^(.+@users\.noreply\.github\.com|noreply@github\.com)$'; then
      fail "commit email is not a GitHub noreply address: $e"
    fi
  done <<< "$emails"
fi

if [ "$failed" -eq 0 ]; then echo "Hygiene OK"; fi
exit "$failed"
