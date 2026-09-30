# TG News Reader — Azure Operations

> Operational reference for Azure Container Apps. Updated when configuration changes.  
> Resources: subscription `f7758f68-5127-4e40-b8bf-3bd367b448a9`, resource group `personal-apps-rg`, app `tg-news-reader`.

---

## Persistent storage (Azure Files)

Media files are stored in `/app/data` inside the container. This path is mounted to an Azure Files share so files survive redeployments and container restarts.

| Resource          | Value                                          |
| ----------------- | ---------------------------------------------- |
| Storage Account   | `personalapps` (shared)                        |
| File Share        | `tgr-media`                                    |
| Storage link name | `tgr-media` (registered in Container Apps Env) |
| Volume name       | `data-volume`                                  |
| Mount path        | `/app/data`                                    |

The volume and mount were set up once via `az containerapp update --yaml`. Subsequent `az containerapp update --image` calls (used in CI) **preserve** `volumeMounts` — confirmed empirically. No extra CI step needed.

### Low-space download protection

Downloads keep **1 GiB free** on the filesystem mounted at `data/` by default.
`DOWNLOAD_STORAGE_RESERVE_MB` can raise this reserve (minimum/default: `1024`).
Capacity is checked using `statfs(data/)`, not the container's root filesystem.
Manual downloads cannot bypass the reserve. Checks and chunk writes are serialized
across Telegram downloads, including Instant View images, to avoid concurrent
writers spending the same available space.

Insufficient space, `ENOSPC`, or `EDQUOT` pauses the entire download queue; affected
tasks return to `pending`. In-flight media downloads stop at their next write and
remove their temporary `.part` files. Only successfully closed files are renamed
to the final media path. Existing completed files are not deleted.

The website and health/readiness endpoints remain available. `/api/health` returns
HTTP 200 with `status: degraded` and `downloads.storage` describing the pause.
A warning and optional Telegram alert report the transition.

Free space is rechecked at most once per minute while paused. Free space must cover
the reserve plus the blocked write/download before the queue resumes. After a quota
error, the reported free space must also increase, preventing endless retries on
mounts that overstate available space. Free files or raise the Azure Files share
quota to recover. The preventive threshold depends on the mount's reported capacity;
an account-wide quota not reflected by the mount is handled by the write-error pause.

If the mount ever needs to be re-applied (e.g. after the Container App is recreated from scratch):

```bash
cat > /tmp/ca-volume.yaml <<'EOF'
properties:
  template:
    containers:
    - name: tg-news-reader
      image: <current-image-uri>
      volumeMounts:
      - mountPath: /app/data
        volumeName: data-volume
    volumes:
    - name: data-volume
      storageType: AzureFile
      storageName: tgr-media
EOF
az containerapp update \
  --name tg-news-reader \
  --resource-group personal-apps-rg \
  --yaml /tmp/ca-volume.yaml
```

---

## Current Container App configuration

| Parameter         | Value                 | Updated    |
| ----------------- | --------------------- | ---------- |
| `minReplicas`     | 0 (scale-to-zero)     | —          |
| `maxReplicas`     | 10                    | —          |
| `cooldownPeriod`  | **1800 sec (30 min)** | 2026-03-28 |
| `pollingInterval` | 30 sec                | —          |

---

## Environment variables

> ⚠️ **`az containerapp update --set-env-vars` replaces the ENTIRE variable list, it does NOT append.**  
> Safe approach: **Azure Portal** → Container App → Configuration → Environment variables → add individual variables.  
> If using CLI — always pass the full list at once (see below).

### Required (app will crash without these)

```
NODE_ENV=production
ALLOWED_ORIGIN=https://tg-news-reader.graycoast-407e8a98.westeurope.azurecontainerapps.io
TG_API_ID          → secretref:tg-api-id
TG_API_HASH        → secretref:tg-api-hash
TG_SESSION         → secretref:tg-session
DATABASE_URL       → secretref:database-url
TURSO_AUTH_TOKEN   → secretref:turso-auth-token
JWT_SECRET         → secretref:jwt-secret
```

### Optional (no-op when absent)

```
ALERT_BOT_TOKEN    → secretref:alert-bot-token
ALERT_CHAT_ID      → secretref:alert-chat-id
AZURE_OPENAI_ENDPOINT → secretref:azure-openai-endpoint
AZURE_OPENAI_KEY   → secretref:azure-openai-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
OPENAI_API_KEY     → secretref:openai-api-key
LOG_LEVEL=info
```

### Full CLI list (use with caution)

```bash
az containerapp update --name tg-news-reader --resource-group personal-apps-rg \
  --set-env-vars \
    NODE_ENV=production \
    ALLOWED_ORIGIN=https://tg-news-reader.graycoast-407e8a98.westeurope.azurecontainerapps.io \
    TG_API_ID=secretref:tg-api-id \
    TG_API_HASH=secretref:tg-api-hash \
    TG_SESSION=secretref:tg-session \
    DATABASE_URL=secretref:database-url \
    TURSO_AUTH_TOKEN=secretref:turso-auth-token \
    JWT_SECRET=secretref:jwt-secret \
    ALERT_BOT_TOKEN=secretref:alert-bot-token \
    ALERT_CHAT_ID=secretref:alert-chat-id \
    AZURE_OPENAI_ENDPOINT=secretref:azure-openai-endpoint \
    AZURE_OPENAI_KEY=secretref:azure-openai-key \
    AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini \
    OPENAI_API_KEY=secretref:openai-api-key \
    LOG_LEVEL=info
```

---

## Managing secrets

```bash
# Add a new secret
az containerapp secret set \
  --name tg-news-reader \
  --resource-group personal-apps-rg \
  --secrets my-secret-name=<value>

# Then in Portal: add env var MY_VAR = secretref:my-secret-name
```

---

## Scale-down cooldown

```bash
# Check current scale config
az containerapp show \
  --name tg-news-reader \
  --resource-group personal-apps-rg \
  --query "properties.template.scale"

# Update cooldownPeriod (requires preview API — stable API rejects it as writable)
az rest --method PATCH \
  --url "https://management.azure.com/subscriptions/f7758f68-5127-4e40-b8bf-3bd367b448a9/resourceGroups/personal-apps-rg/providers/Microsoft.App/containerApps/tg-news-reader?api-version=2024-10-02-preview" \
  --body '{"properties":{"template":{"scale":{"cooldownPeriod":1800,"maxReplicas":10,"minReplicas":null,"pollingInterval":30}}}}'
```

---

## Azure Monitor Alerts

Deployed in `personal-apps-rg`. Action Group: `tg-reader-alerts` → email `sceletron@gmail.com`.

| Rule                   | Metric / KQL           | Threshold | Window     | Updated    |
| ---------------------- | ---------------------- | --------- | ---------- | ---------- |
| `tg-reader-restart`    | `RestartCount`         | **> 1**   | **15 min** | 2026-03-28 |
| `tg-reader-error-logs` | KQL: `log.level >= 50` | > 0       | 5 min      | —          |

### Update an alert rule

```bash
# PATCH via REST API (2018-03-01)
az rest --method PATCH \
  --url "https://management.azure.com/subscriptions/f7758f68-5127-4e40-b8bf-3bd367b448a9/resourceGroups/personal-apps-rg/providers/Microsoft.Insights/metricAlerts/tg-reader-restart?api-version=2018-03-01" \
  --body @alert-patch.json
```

Recreate everything from scratch: `scripts/setup-monitoring.sh`.  
Reference KQL rule body: `C:\Users\dshilov\alert-kql-rule.json`.

---

## Useful commands

```bash
# Logs (last 50 lines of system events)
az containerapp logs show \
  --name tg-news-reader \
  --resource-group personal-apps-rg \
  --type system --tail 50

# Revision status
az containerapp revision list \
  --name tg-news-reader \
  --resource-group personal-apps-rg \
  --output table

# Health check
curl https://tg-news-reader.graycoast-407e8a98.westeurope.azurecontainerapps.io/api/health
```

---

## GitHub Actions secrets

| Secret                              | Purpose                                                |
| ----------------------------------- | ------------------------------------------------------ |
| `ACR_LOGIN_SERVER`                  | Azure Container Registry URL                           |
| `ACR_USERNAME` / `ACR_PASSWORD`     | ACR credentials                                        |
| `AZURE_CREDENTIALS`                 | Service principal JSON for az login                    |
| `AZURE_RESOURCE_GROUP`              | `personal-apps-rg`                                     |
| `AZURE_CONTAINER_APP`               | `tg-news-reader`                                       |
| `PAT_TOKEN`                         | Fine-grained PAT (Contents+PRs write) — for auto-merge |
| `ALERT_BOT_TOKEN` / `ALERT_CHAT_ID` | Telegram deploy-failure alerts (optional)              |
