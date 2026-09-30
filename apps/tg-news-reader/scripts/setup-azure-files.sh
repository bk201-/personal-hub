#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-time setup: Azure Files volume mount for persistent media storage.
# Run this locally after `az login`.
#
# Usage:
#   chmod +x scripts/setup-azure-files.sh
#   ./scripts/setup-azure-files.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Fill these in ─────────────────────────────────────────────────────────────
RESOURCE_GROUP=""          # e.g. "tg-reader-rg"
CONTAINER_APP=""           # e.g. "tg-news-reader"         (the app, not the env)
CONTAINER_APP_ENV=""       # e.g. "tg-news-reader-env"     (the Container Apps Environment)
LOCATION=""                # e.g. "westeurope" or "eastus" — must match existing resources
STORAGE_ACCOUNT=""         # new name, globally unique, only a-z0-9, 3-24 chars, e.g. "tgnewsreaderstor"
SHARE_NAME="tgr-media"     # Azure Files share name (can keep as-is)
STORAGE_LINK="tgr-media"   # name used inside Container Apps Env (can keep as-is)
MOUNT_PATH="/app/data"     # must match where Node writes files (process.cwd()/data)
# ─────────────────────────────────────────────────────────────────────────────

# Validate that all required vars are filled
for var in RESOURCE_GROUP CONTAINER_APP CONTAINER_APP_ENV LOCATION STORAGE_ACCOUNT; do
  if [[ -z "${!var}" ]]; then
    echo "❌ Please fill in: $var"
    exit 1
  fi
done

echo "📦 1/5 — Creating Storage Account '$STORAGE_ACCOUNT'..."
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --output none

echo "📁 2/5 — Creating File Share '$SHARE_NAME' (50 GB quota)..."
az storage share create \
  --name "$SHARE_NAME" \
  --account-name "$STORAGE_ACCOUNT" \
  --quota 50 \
  --output none

echo "🔑 3/5 — Retrieving storage key..."
STORAGE_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "$STORAGE_ACCOUNT" \
  --query '[0].value' -o tsv)

echo "🔗 4/5 — Registering storage in Container Apps Environment '$CONTAINER_APP_ENV'..."
az containerapp env storage set \
  --name "$CONTAINER_APP_ENV" \
  --resource-group "$RESOURCE_GROUP" \
  --storage-name "$STORAGE_LINK" \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$SHARE_NAME" \
  --access-mode ReadWrite \
  --output none

echo "💾 5/5 — Mounting volume in Container App '$CONTAINER_APP' at '$MOUNT_PATH'..."
az containerapp update \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --volume "name=data-volume,storageType=AzureFile,storageName=${STORAGE_LINK}" \
  --mount-path "${MOUNT_PATH}" \
  --output none

echo ""
echo "✅ Done! Verifying volume mount..."
az containerapp show \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.template.volumes" \
  --output table

echo ""
echo "✅ Azure Files is now mounted at $MOUNT_PATH inside the container."
echo "   Files downloaded by the app will persist across restarts and redeployments."

