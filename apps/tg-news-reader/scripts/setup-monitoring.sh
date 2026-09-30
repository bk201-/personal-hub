#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-time setup: Azure Monitor Alerts for TG News Reader.
# Creates an email Action Group + two alert rules:
#   1. Scheduled Query Alert — pino errors (level >= 50) from Log Analytics
#   2. Metric Alert          — Container App restart count > 0
#
# Prerequisites:
#   az login                        (interactive login)
#   az extension add -n application-insights  (if not already installed)
#
# Usage:
#   chmod +x scripts/setup-monitoring.sh
#   ./scripts/setup-monitoring.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Fill these in ─────────────────────────────────────────────────────────────
RESOURCE_GROUP=""          # e.g. "tg-reader-rg"
CONTAINER_APP=""           # e.g. "tg-news-reader"
CONTAINER_APP_ENV=""       # e.g. "tg-news-reader-env"
ALERT_EMAIL=""             # e.g. "you@gmail.com"

# Optional — set ALERT_BOT_TOKEN + ALERT_CHAT_ID on the Container App too.
# Leave empty to skip this step.
ALERT_BOT_TOKEN=""         # Telegram bot token from BotFather (123456:ABCdef…)
ALERT_CHAT_ID=""           # Numeric chat/user ID (send a msg to the bot, then GET /getUpdates)
# ─────────────────────────────────────────────────────────────────────────────

# Validate required vars
for var in RESOURCE_GROUP CONTAINER_APP CONTAINER_APP_ENV ALERT_EMAIL; do
  if [[ -z "${!var}" ]]; then
    echo "❌ Please fill in: $var"
    exit 1
  fi
done

echo "🔍 1/5 — Looking up Azure resources..."

CONTAINER_APP_ID=$(az containerapp show \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --query id -o tsv)
echo "   Container App: $CONTAINER_APP_ID"

# The Log Analytics workspace is linked to the Container Apps Environment.
# We find it by the customer ID (workspace GUID) stored on the Env resource.
LA_CUSTOMER_ID=$(az containerapp env show \
  --name "$CONTAINER_APP_ENV" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.appLogsConfiguration.logAnalyticsConfiguration.customerId" -o tsv)

# Resolve the workspace resource ID (needed for scheduled-query scopes)
LA_WORKSPACE_ID=$(az monitor log-analytics workspace list \
  --resource-group "$RESOURCE_GROUP" \
  --query "[?customerId=='$LA_CUSTOMER_ID'].id | [0]" -o tsv)

if [[ -z "$LA_WORKSPACE_ID" ]]; then
  echo ""
  echo "⚠️  Could not auto-find the Log Analytics workspace in resource group '$RESOURCE_GROUP'."
  echo "   The workspace may be in a different resource group (e.g. the Environment's own RG)."
  echo "   Run this to find it:"
  echo "     az monitor log-analytics workspace list --query \"[?customerId=='$LA_CUSTOMER_ID'].id\""
  echo "   Then paste the ID below and re-run, or set LA_WORKSPACE_ID manually at the top of this script."
  exit 1
fi
echo "   Log Analytics:  $LA_WORKSPACE_ID"

echo ""
echo "📢 2/5 — Creating Action Group (email → $ALERT_EMAIL)..."
ACTION_GROUP_ID=$(az monitor action-group create \
  --name "tg-reader-alerts" \
  --resource-group "$RESOURCE_GROUP" \
  --short-name "tgralerts" \
  --action email "email-main" "$ALERT_EMAIL" \
  --query id -o tsv)
echo "   Action Group: $ACTION_GROUP_ID"

echo ""
echo "📊 3/5 — Creating Scheduled Query Alert (pino level >= 50 = error/fatal)..."
# Fires when at least one error-level log line appears in a 5-minute window.
# pino level 50 = error, 60 = fatal.
az monitor scheduled-query create \
  --name "tg-reader-error-logs" \
  --resource-group "$RESOURCE_GROUP" \
  --scopes "$LA_WORKSPACE_ID" \
  --condition "count() > 0" \
  --condition-query "ContainerAppConsoleLogs_CL | extend log = parse_json(Log_s) | where log.level >= 50" \
  --window-size 5m \
  --evaluation-frequency 5m \
  --severity 2 \
  --action-groups "$ACTION_GROUP_ID" \
  --description "Fires when TG Reader emits a pino error or fatal (level >= 50)" \
  --output none
echo "   ✅ KQL alert created: tg-reader-error-logs"

echo ""
echo "🔄 4/5 — Creating Metric Alert (container restart > 0)..."
# Fires when the Container App restarts at least once in a 5-minute window.
# Covers OOM kills, startup crashes, uncaught panics that kill the process.
az monitor metrics alert create \
  --name "tg-reader-restart" \
  --resource-group "$RESOURCE_GROUP" \
  --scopes "$CONTAINER_APP_ID" \
  --condition "total RestartCount > 0" \
  --window-size 5m \
  --evaluation-frequency 5m \
  --severity 1 \
  --action "$ACTION_GROUP_ID" \
  --description "Fires when the TG Reader container restarts (OOM, startup crash, etc.)" \
  --output none
echo "   ✅ Metric alert created: tg-reader-restart"

echo ""
# ── Optional: set alertBot env vars on the Container App ─────────────────────
if [[ -n "$ALERT_BOT_TOKEN" && -n "$ALERT_CHAT_ID" ]]; then
  echo "🤖 5/5 — Setting alertBot env vars on Container App..."
  az containerapp update \
    --name "$CONTAINER_APP" \
    --resource-group "$RESOURCE_GROUP" \
    --set-env-vars \
      "ALERT_BOT_TOKEN=$ALERT_BOT_TOKEN" \
      "ALERT_CHAT_ID=$ALERT_CHAT_ID" \
    --output none
  echo "   ✅ ALERT_BOT_TOKEN and ALERT_CHAT_ID set"
else
  echo "5/5 — Skipping alertBot env vars (ALERT_BOT_TOKEN / ALERT_CHAT_ID not set)."
  echo "   To enable instant Telegram alerts, run manually:"
  echo ""
  echo "   az containerapp update \\"
  echo "     --name $CONTAINER_APP \\"
  echo "     --resource-group $RESOURCE_GROUP \\"
  echo "     --set-env-vars ALERT_BOT_TOKEN=<token> ALERT_CHAT_ID=<chat_id>"
  echo ""
  echo "   How to create a bot and get IDs:"
  echo "   1. Open @BotFather in Telegram → /newbot → copy the token"
  echo "   2. Send any message to your new bot"
  echo "   3. curl https://api.telegram.org/bot<TOKEN>/getUpdates"
  echo "      → read result[0].message.chat.id"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Azure Monitor setup complete!"
echo ""
echo "Alert coverage:"
echo "  📧 tg-reader-error-logs   → email when logger.error/fatal fires  (1–5 min delay)"
echo "  📧 tg-reader-restart      → email on any container restart        (1–5 min delay)"
echo "  🤖 alertBot (in-process)  → Telegram on AUTH_KEY_UNREGISTERED,"
echo "                               circuit-open, worker crash,uncaughtException (instant)"
echo ""
echo "Still to configure manually:"
echo "  🌐 UptimeRobot (https://uptimerobot.com) — external HTTP monitor:"
echo "     Monitor type:     HTTP(s)"
echo "     URL:              https://<your-fqdn>/api/health"
echo "     Check interval:   5 minutes"
echo "     Alert contact:    your email / Telegram"
echo ""
echo "  The FQDN of your Container App:"
az containerapp show \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" -o tsv | sed 's/^/     /'
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

