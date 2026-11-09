# Azure setup walkthrough

One-time setup of the Azure resources Life Tracker needs. Everything here is meant to cost **$0**. Names below are suggestions; use your own, but keep personal information out of them, because some become public host names.

**Checked against Microsoft's documentation in November 2026. Not run end to end.** Portal screens move around, so if a label differs slightly, look for the closest match and keep the settings that matter (marked **Important**).

**What was actually done (2026-11-08):** these steps were run through the Azure CLI rather than the portal, in **Central US**. West US 2 was restricted for new SQL servers on this subscription (see ADR-0001). The resource names are the ones suggested below, except the SQL server (`sql-lifetracker-<digits>`). Passwords were generated in memory and sent straight to the Static Web App settings and the GitHub `production` secrets, so the admin password is not known to anyone; reset it in the portal if you ever need to log in as admin. What remains by hand: step 6d (invite yourself as `owner`) and 6e (`OWNER_ID`), which need a deployed site.

Never paste passwords, connection strings, or tokens into chat, a file in this repo, a commit, or an issue. Keep them in a password manager, then put them straight into the Azure setting or GitHub secret named in each step.

## What you will create

| # | Resource | Why | Cost |
|---|---|---|---|
| 1 | Budget alert | A safety net before anything else | Free |
| 2 | Resource group | One folder for everything, easy to delete | Free |
| 3 | Azure SQL logical server and a **free** database | The data | Free (free offer) |
| 4 | A least-privilege database user for the app | App can read and write, never change the schema | Free |
| 5 | Application Insights and a Log Analytics workspace, with a daily cap | Logs without surprise bills | Free allowance, capped |
| 6 | Static Web App (Free plan), no built-in GitHub deployment | Hosts the site and the API | Free |
| 7 | An Entra app registration for GitHub (OIDC) | Lets the Release workflow log in with no stored password | Free |
| 8 | GitHub `production` environment secrets | Where the Release workflow reads its secrets | Free |

**Do not create** a Key Vault, a separate Function App, a storage account, a Standard Static Web Apps plan, or an extra database. Each adds cost, and none is needed.

You can stop after step 4 and come back later: steps 5 to 8 are not needed until the stories that use them (OPS-01, FND-06, FND-02).

---

## 0. Before you start

- [ ] Sign in at <https://portal.azure.com>. You need a **subscription** (search "Subscriptions"). If you have none, create the free account. The free SQL offer works with most subscription types, but not Azure for Students Starter.
- [ ] The GitHub repo exists (run `scripts/setup-github.sh` first). Step 7 needs its exact name.
- [ ] Pick **one region** near you and use it everywhere. The region of the first free SQL database applies to all free databases in the subscription and cannot be changed. For the Static Web App, choose the same region if it is offered; if not, pick the closest one.
- [ ] Open a password manager. You will generate two strong passwords: a database **admin** password and a database **app** password.

## 1. Budget alert (do this first)

1. Search for **Cost Management + Billing**, then **Cost Management**, then **Budgets**, then **Add**.
2. Scope: your **subscription**. Name: `monthly-5-usd`. Reset period: **Monthly**. Amount: **5**.
3. Alert conditions: add **Actual** at 80% and 100%, and **Forecasted** at 100%.
4. Alert recipients: your email. **Create**.

This sets the repository's `AC-OPS-02.1` safeguard. Alerts warn you; they do not stop spending.

## 2. Resource group

1. Search **Resource groups**, then **Create**.
2. Subscription: yours. Name: `rg-life-tracker`. Region: your chosen region. **Create**.

## 3. Azure SQL: server and free database

1. Open <https://aka.ms/azuresqlhub> and, in **Create a database**, choose **Start free**.
2. **Basics**
   - Resource group: `rg-life-tracker`.
   - Database name: `lifetracker`.
   - Server: **Create new**. Server name: something unique and lowercase, such as `sql-lifetracker-<random digits>` (it becomes `<name>.database.windows.net`). Location: your region.
   - Authentication: **Use SQL authentication**. Server admin login: `ltadmin` (not `admin` or `sa`, which are reserved). Password: a long random one from your password manager.
3. Check the **cost summary** shows **$0 per month** and that the free offer is selected.
4. **Important:** find the option for what happens at the monthly limit and choose **Auto-pause the database until next month**. Do **not** choose "continue using database for additional charges": it cannot be switched back to auto-pause later.
5. **Networking** tab (or after creation, the server's **Networking** page):
   - Connectivity: **Public endpoint**.
   - **Allow Azure services and resources to access this server**: **Yes**. The free Static Web Apps plan has no fixed outgoing addresses, so this is required. The least-privilege app user (step 4) is what limits the damage.
   - **Add current client IP address**: **Yes**, for now, so you can use the portal's query editor and run migrations from your computer. Remove it when you no longer need it.
   - Minimum TLS version: **1.2**.
6. **Review + create**, then **Create**.

**Check:** open the database, **Overview**. You should see a **Free monthly vCore amount**. Under **Compute + storage**, confirm the free-limit behavior is **Auto-pause**. Record the check in `docs/manual-checks.md` (`AC-OPS-02.4`).

Know the behavior: the database auto-pauses after **15 idle minutes** (fixed), and the first request afterwards takes up to about a minute. Disconnect the portal query editor and any SQL tools when you are done; an open connection stops auto-pause and uses up free seconds.

### Free-allowance alert

1. On the database, open **Monitoring**, then **Alerts**, then **Create alert rule**.
2. Signal: **Free amount remaining**. Condition: less than **10000**. Action group: create one that emails you. **Create**.

This sets `AC-OPS-02.5`.

## 4. Least-privilege database user for the app

The app must be able to read and write data but never change the schema. Schema changes are made only by the admin login, from the Release workflow or from you.

1. On the database, open **Query editor (preview)** and sign in with the **SQL authentication** admin login (`ltadmin`).
2. Run this against the `lifetracker` database (not `master`). Replace the placeholder with a **different** long random password:

```sql
CREATE USER lt_app WITH PASSWORD = '<long random password>';
ALTER ROLE db_datareader ADD MEMBER lt_app;
ALTER ROLE db_datawriter ADD MEMBER lt_app;
```

3. Disconnect the query editor.

You will need two connection strings later. Build them yourself from these patterns and keep them in your password manager:

- **App** (user `lt_app`), for the Static Web App setting `SQL_CONNECTION`.
- **Admin** (user `ltadmin`), for the GitHub secret `SQL_ADMIN_CONNECTION`, used only to run migrations.

```
Server=tcp:<server>.database.windows.net,1433;Database=lifetracker;User ID=<user>;Password=<password>;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=60;
```

The long timeout lets a paused database wake up.

## 5. Application Insights and a daily data cap

1. Search **Application Insights**, then **Create**.
2. Resource group: `rg-life-tracker`. Name: `appi-life-tracker`. Region: your region. Resource mode: **Workspace-based**. Log Analytics workspace: **Create new**, named `log-life-tracker`. **Create**.
3. Open the Log Analytics workspace `log-life-tracker`, then **Usage and estimated costs**, then **Daily cap**, set it **On** at **0.1 GB**, **OK**. If something loops and floods logs, ingestion stops instead of billing.

You connect Application Insights to the Static Web App in step 6. The browser-side Application Insights script is **not** used (see OBSERVABILITY.md).

## 6. Static Web App (no built-in GitHub deployment)

1. Search **Static Web Apps**, then **Create**.
2. Resource group: `rg-life-tracker`. Name: `swa-life-tracker`. **Plan type: Free**. Region for Azure Functions and staging: your region (or the closest).
3. **Important: Deployment source: Other.** Do **not** connect GitHub here. Azure's built-in GitHub option adds its own workflow to the repo that deploys on every push, which would bypass the manual Release gate (ADR-0004).
4. **Review + create**, then **Create**, then **Go to resource**.

If your portal does not offer **Other**, create it from a terminal instead (needs the Azure CLI, `az login` first):

```
az staticwebapp create --name swa-life-tracker --resource-group rg-life-tracker --location <region> --sku Free
```

Without `--source`, nothing is connected to GitHub.

**Notes from the documentation:** the Free plan allows 25 role-assigned users through invitations, 100 GB of bandwidth, 250 MB per environment, and 30 MB per request. Managed functions support HTTP triggers only (fine), and Node.js 22 (`apiRuntime: node:22`). Managed identity and Key Vault references are not available on managed functions, which is why the app uses a database password (ADR-0003).

### 6a. Deployment token

1. On the Static Web App **Overview**, choose **Manage deployment token**, then **Copy to clipboard**.
2. Paste it **only** into the GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN` (step 8). If it is ever exposed, use **Reset token** on the same page and update the secret.

### 6b. Connect Application Insights

1. In the Static Web App, open **Settings** then **Application Insights** (it may sit under **Monitoring**), choose **Enabled**, select `appi-life-tracker`, **Save**.

### 6c. App settings

Settings live under **Settings**, then **Environment variables** (formerly **Configuration**), for the **Production** environment.

| Name | Value | When |
|---|---|---|
| `SQL_CONNECTION` | The **app** connection string (user `lt_app`) | Before the first API request that needs data |
| `OWNER_ID` | Your Static Web Apps `userId` (see 6e) | After your first sign-in. Until it is set, the API denies every request. That is intended. |

Do not use names that start with `APPSETTING_`, `AZURE_FUNCTION_`, `FUNCTIONS_`, `WEBSITE_`, or the other reserved prefixes.

### 6d. Invite yourself as the owner

1. In the Static Web App, open **Settings**, then **Role management**, then **Invite**.
2. Authorization provider: **GitHub**. Invitee details: **your GitHub username**. Domain: the app's host name. Role: `owner`. Choose an expiry (for example 24 hours), then **Generate**.
3. Open the generated link while signed in to GitHub as that account, and accept.

### 6e. Find your `userId` and set `OWNER_ID`

The ID Static Web Apps gives the API is **not** your GitHub numeric ID. It is a per-app, per-user value (ADR-0006).

1. After the site is deployed and you can sign in at `/.auth/login/github`, open `https://<your-site>/.auth/me`.
2. Copy `userId` from the JSON and save it as `OWNER_ID` (6c).
3. If you are ever removed from the `owner` role and invited again, the ID changes and access is denied until you update `OWNER_ID`.

The edge rules that keep everyone else out (the `owner` role on every route, and blocking the pre-configured Microsoft sign-in) are written in `staticwebapp.config.json` during story FND-02.

## 7. Let GitHub log in to Azure without a password (OIDC)

Needs the GitHub repo name from step 0.

1. Search **Microsoft Entra ID**, then **App registrations**, then **New registration**. Name: `life-tracker-release`. Accounts in this organizational directory only. **Register**.
2. On the app's **Overview**, note the **Application (client) ID** and **Directory (tenant) ID**. Also note your **Subscription ID** (from the **Subscriptions** page).
3. **Certificates & secrets**, then **Federated credentials**, then **Add credential**.
   - Scenario: **GitHub Actions deploying Azure resources**.
   - Organization: your GitHub username. Repository: `life-tracker` (or the name you chose).
   - Entity type: **Environment**. Environment name: `production`.
   - Name: `github-production`. **Add**.
4. Give the app permission to manage **only the SQL server's firewall**. Open the SQL **server** resource, then **Access control (IAM)**, then **Add role assignment**.
   - Role: **SQL Security Manager**. Assign to: the `life-tracker-release` app. **Review + assign**.
   - If the Release workflow later fails creating the firewall rule with an authorization error, use **SQL Server Contributor**, scoped to this server only. (Verified when FND-06 is built.)

The federated credential only works for runs in the `production` environment of your repo, which requires your approval. There is no password to leak.

## 8. GitHub `production` environment secrets

In the repo, open **Settings**, then **Environments**, then **production**, then **Environment secrets**. Add each name exactly:

| Secret | Value |
|---|---|
| `AZURE_CLIENT_ID` | Application (client) ID from step 7 |
| `AZURE_TENANT_ID` | Directory (tenant) ID from step 7 |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID |
| `AZURE_RESOURCE_GROUP` | `rg-life-tracker` |
| `AZURE_SQL_SERVER` | The server name without `.database.windows.net` |
| `SQL_ADMIN_CONNECTION` | The **admin** connection string (user `ltadmin`) |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | The deployment token from 6a |

These match the list at the top of `.github/workflows/release.yml`. Put them in the **environment**, not as repository secrets, so only an approved Release run can read them.

## Final checks

- [ ] Budget `monthly-5-usd` exists (AC-OPS-02.1).
- [ ] The database shows a free monthly vCore amount and the **auto-pause** behavior (AC-OPS-02.4).
- [ ] An alert exists on "Free amount remaining" (AC-OPS-02.5).
- [ ] The Log Analytics daily cap is on at 0.1 GB (AC-OPS-01.4).
- [ ] The Static Web App uses the **Free** plan and has **no** workflow file added to the repo.
- [ ] Your portal query-editor connection is closed, and the temporary client-IP firewall rule is removed when you are done.
- [ ] After a few days, **Cost analysis** shows about $0. If anything is non-zero, find out which resource before moving on.

Then record results in `docs/manual-checks.md` and continue with FND-06 (release pipeline).
