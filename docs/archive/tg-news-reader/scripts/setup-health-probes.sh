#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# One-time setup: configure health probes on Azure Container App.
#
# How AUTH_KEY_DUPLICATED is prevented during deploys:
#
#   1. New container starts → /api/ready returns 200 immediately
#   2. Azure sees readiness pass → switches traffic to new → sends SIGTERM to old
#   3. Old container receives SIGTERM → disconnectTelegramClient() → session freed
#   4. New container's TG_CONNECT_DELAY_SEC (default 30s) is still counting down
#      → getTelegramClient() blocks until delay expires
#   5. Delay expires (old is long dead by now) → new connects to Telegram → clean
#
# The readiness probe must pass QUICKLY so Azure kills the old container FAST.
# The Telegram startup delay ensures the new container doesn't connect until
# the old one has had time to disconnect via SIGTERM.
#
# Prerequisites:
#   az login
#   Set AZURE_RESOURCE_GROUP and AZURE_CONTAINER_APP below (or as env vars).
#
# Usage:
#   bash scripts/setup-health-probes.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RG="${AZURE_RESOURCE_GROUP:-personal-apps-rg}"
APP="${AZURE_CONTAINER_APP:-tg-news-reader}"

echo "Configuring health probes for Container App: $APP (resource group: $RG)"

# Export current config to YAML, patch probes, re-apply.
# This is the most reliable way to set probes on Azure Container Apps.

TMPFILE=$(mktemp /tmp/containerapp-XXXXXX.yaml)
trap 'rm -f "$TMPFILE"' EXIT

echo "Exporting current config..."
az containerapp show --name "$APP" --resource-group "$RG" -o yaml > "$TMPFILE"

# Use Python to patch probes into the YAML (available on all GitHub runners & Azure CLI installs)
python3 - "$TMPFILE" <<'PYEOF'
import sys, yaml

path = sys.argv[1]
with open(path) as f:
    doc = yaml.safe_load(f)

# ── Strip read-only / server-managed fields ──────────────────────────────────
# az containerapp show returns fields that can't be sent back in an update.
# If included, Azure may error or overwrite values unexpectedly.
for key in ["id", "name", "type", "systemData", "location", "resourceGroup",
            "managedBy", "kind", "extendedLocation", "identity"]:
    doc.pop(key, None)

props = doc.get("properties", {})
for key in ["provisioningState", "runningStatus", "managedEnvironmentId",
            "latestRevisionName", "latestReadyRevisionName", "latestRevisionFqdn",
            "customDomainVerificationId", "outboundIpAddresses", "eventStreamEndpoint"]:
    props.pop(key, None)

# ── Remove secrets section — Azure won't return plaintext values, ────────────
# so the YAML has nulls. Sending nulls back would wipe secrets.
# Omitting the section entirely tells Azure to keep existing secrets unchanged.
config = props.get("configuration", {})
config.pop("secrets", None)

# ── Patch probes ─────────────────────────────────────────────────────────────
containers = props["template"]["containers"]
container = containers[0]

container["probes"] = [
    {
        "type": "Startup",
        "httpGet": {"path": "/api/health", "port": 3173},
        "initialDelaySeconds": 5,
        "periodSeconds": 5,
        "failureThreshold": 12,   # 12 × 5s = 60s max startup time
        "timeoutSeconds": 3,
    },
    {
        "type": "Readiness",
        "httpGet": {"path": "/api/ready", "port": 3173},
        "initialDelaySeconds": 5,
        "periodSeconds": 5,
        "failureThreshold": 60,   # 60 × 5s = 5 min (margin for slow starts)
        "timeoutSeconds": 3,
    },
    {
        "type": "Liveness",
        "httpGet": {"path": "/api/health", "port": 3173},
        "initialDelaySeconds": 60,
        "periodSeconds": 30,
        "failureThreshold": 3,
        "timeoutSeconds": 5,
    },
]

with open(path, "w") as f:
    yaml.dump(doc, f, default_flow_style=False)

print("Probes patched into YAML (read-only fields stripped, secrets preserved)")
PYEOF

echo "Applying updated config..."
az containerapp update --name "$APP" --resource-group "$RG" --yaml "$TMPFILE"

echo ""
echo "✅ Health probes configured:"
echo "   Startup:   GET /api/health  (5s interval, 60s max)"
echo "   Readiness: GET /api/ready   (5s interval, returns 200 immediately)"
echo "   Liveness:  GET /api/health  (30s interval, restart on 3 failures)"
echo ""
echo "AUTH_KEY_DUPLICATED prevention:"
echo "   Readiness passes immediately → Azure kills old container fast"
echo "   TG_CONNECT_DELAY_SEC (30s) prevents new from connecting to Telegram"
echo "   until old has had time to disconnect via SIGTERM graceful shutdown."

