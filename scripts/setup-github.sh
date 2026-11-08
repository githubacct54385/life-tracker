#!/usr/bin/env bash
# One-time GitHub setup for Life Tracker. Safe to re-run.
#
# Before running:
#   brew install gh
#   gh auth login          (choose GitHub.com, HTTPS, and log in with the browser)
#
# Run from the repo root:
#   bash scripts/setup-github.sh [repo-name]      (default: life-tracker)
#
# What it does, in order:
#   1. Sets this repo's commit email to your GitHub noreply address (hard rule 8)
#   2. Runs the hygiene and traceability checks
#   3. Makes the first commit and creates a PUBLIC GitHub repo (asks first)
#   4. Turns on secret scanning, push protection, Dependabot alerts, CodeQL
#   5. Allows squash merge only
#   6. Protects main: pull requests only (also for you), checks `hygiene` and `test`
#      must pass, branch up to date, linear history, no force pushes
#   7. Creates the `production` environment: you must approve each release, main only
set -euo pipefail

REPO_NAME="${1:-life-tracker}"
warn() { echo "WARNING: $*" >&2; }

command -v gh >/dev/null 2>&1 || { echo "gh is not installed. Run: brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Not logged in. Run: gh auth login"; exit 1; }
[ -d .git ] || { echo "Run this from the repo root (no .git folder here)."; exit 1; }

LOGIN=$(gh api user --jq .login)
USER_ID=$(gh api user --jq .id)
EMAIL="${USER_ID}+${LOGIN}@users.noreply.github.com"
REPO="${LOGIN}/${REPO_NAME}"

echo "1. Commit identity (this repo only)"
git config --local user.name "$(git config --global user.name 2>/dev/null || echo "$LOGIN")"
git config --local user.email "$EMAIL"
echo "   Commits will use the noreply address for ${LOGIN}."

echo "2. Checks"
git add -A
bash scripts/check-hygiene.sh
node scripts/ac-coverage.mjs

echo "3. First commit and public repository"
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git commit -q -F - <<'MSG'
Initial commit: planning documents, CI, and release workflows

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
fi

if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "   ${REPO} already exists. Skipping create."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/${REPO}.git"
else
  echo
  echo "   This will create ${REPO} as a PUBLIC repository and push everything committed so far."
  echo "   Look over the files first (git show --stat HEAD). Anyone on the internet can read them."
  read -r -p "   Create it now? [y/N] " answer
  [ "$answer" = "y" ] || { echo "Stopped. Nothing was created."; exit 1; }
  gh repo create "$REPO" --public --source=. --remote=origin --push \
    --description "Private single-user life tracker (finances, health, mileage, giving). Public code, private data."
fi
git push -u origin main 2>/dev/null || true

echo "4. Security features"
gh api -X PATCH "repos/${REPO}" --input - >/dev/null <<'JSON' || warn "could not enable secret scanning"
{ "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" } } }
JSON
gh api -X PUT "repos/${REPO}/vulnerability-alerts" >/dev/null || warn "could not enable Dependabot alerts"
gh api -X PUT "repos/${REPO}/automated-security-fixes" >/dev/null || warn "could not enable Dependabot security updates"
gh api -X PATCH "repos/${REPO}/code-scanning/default-setup" --input - >/dev/null <<'JSON' \
  || warn "CodeQL not enabled yet. Turn it on in Settings > Code security once there is TypeScript code (AC-FND-01.3)."
{ "state": "configured", "languages": ["actions"], "query_suite": "default" }
JSON
gh api -X PUT "repos/${REPO}/actions/permissions/workflow" --input - >/dev/null <<'JSON' || warn "could not set default workflow permissions"
{ "default_workflow_permissions": "read", "can_approve_pull_request_reviews": false }
JSON

echo "5. Merge settings"
gh api -X PATCH "repos/${REPO}" --input - >/dev/null <<'JSON'
{ "allow_squash_merge": true, "allow_merge_commit": false, "allow_rebase_merge": false,
  "delete_branch_on_merge": true, "has_wiki": false, "has_projects": false,
  "squash_merge_commit_title": "PR_TITLE", "squash_merge_commit_message": "PR_BODY" }
JSON

echo "6. Protect main"
gh api -X PUT "repos/${REPO}/branches/main/protection" --input - >/dev/null <<'JSON'
{ "required_status_checks": { "strict": true, "contexts": ["hygiene", "test"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": true },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true }
JSON

echo "7. Production environment (manual approval, main only)"
gh api -X PUT "repos/${REPO}/environments/production" --input - >/dev/null <<JSON
{ "prevent_self_review": false,
  "reviewers": [ { "type": "User", "id": ${USER_ID} } ],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
gh api -X POST "repos/${REPO}/environments/production/deployment-branch-policies" \
  -f name=main -f type=branch >/dev/null 2>&1 || true

cat <<DONE

Done: https://github.com/${REPO}

Still to do by hand (see DECISIONS.md ADR-0003 and ADR-0004):
  - Create the Azure resources. When creating the Static Web App, choose deployment source "Other".
    Do NOT let Azure add its own GitHub workflow: it deploys on every push and would bypass the release gate.
  - Add the secrets listed at the top of .github/workflows/release.yml to the 'production' environment
    (Settings > Environments > production). Never put them in the repo.
  - Confirm in Settings > Branches that main shows: require pull request, require status checks, no bypass.
  - From now on, never push to main. Work on a branch like fin-03-import-preview and open a pull request.
DONE
