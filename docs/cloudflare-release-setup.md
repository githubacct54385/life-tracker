# Release setup (Cloudflare deploy token)

One-time setup for MIG-05. The Release workflow (`.github/workflows/release.yml`) deploys with `wrangler deploy`, so it needs a Cloudflare API token and your account ID. Both live only in the GitHub `production` environment, never in the repository.

Cloudflare renames menus often. The names below were right when this was written.

## 1. Create the API token
1. Cloudflare dashboard, your profile (top right), **API Tokens**, **Create Token**.
2. Use the **Edit Cloudflare Workers** template.
3. Narrow it: under Account Resources pick **Include, your account** only. Under Zone Resources pick the least it allows (the app has no custom domain yet, so none is needed; remove the zone permissions if the template lets you). Add an expiry date you will remember (for example one year).
4. Create the token and copy it once. Cloudflare will not show it again.

## 2. Find the account ID
Workers & Pages, Overview. The **Account ID** is on the right. It is not a password, but this project keeps account identifiers out of the repository anyway.

## 3. Add the secrets to the `production` environment
GitHub, the repository, Settings, **Environments**, `production`, **Environment secrets**:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 2 |
| `DATABASE_ADMIN_URL` | the Neon admin connection string (already set if you ran migrations from GitHub before) |

Do not add them as repository secrets. Environment secrets are released only after you approve the run.

## 4. What the Worker already holds
The Worker keeps its own runtime settings in Cloudflare (`DATABASE_URL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_EMAIL`). The deploy uses `--keep-vars`, so it does not remove them. Check them once after the first Release run (Worker, Settings, Variables and secrets).

## 5. Run a release
GitHub, Actions, **Release**, Run workflow on `main`, then approve the `production` environment when GitHub asks. Open the run summary to see the commit and the migrations applied. Then open the site in a private window: it should send you to the Access login.

## Rotating the token
Create a new token (step 1), replace `CLOUDFLARE_API_TOKEN` in the environment, then delete the old token in Cloudflare.
