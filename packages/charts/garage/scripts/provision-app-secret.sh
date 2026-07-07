#!/usr/bin/env bash
#
# Provision a Garage bucket + access key for an app, and wire the credentials
# into that app's `<app>-secrets` Kubernetes Secret (the same secret that
# `pnpm helm` → "Reveal secrets" reads and `pnpm secrets` manages).
#
# It is idempotent: re-running reuses the existing bucket/key and re-syncs the
# secret. Only the S3_* keys are patched — other keys in <app>-secrets are kept.
#
#   Usage: ./provision-app-secret.sh [APP] [APP_NAMESPACE] [BUCKET] [KEY_NAME]
#   Defaults:  video-downloader  video-downloader-2  video-downloader  video-downloader
#
# Env overrides:
#   GARAGE_RELEASE   (default: garage)   Helm release name of Garage
#   GARAGE_NS        (default: garage)   Namespace Garage runs in
#   S3_ENDPOINT      (default: http://garage-s3.<GARAGE_NS>.svc.cluster.local:3900)
#   S3_REGION        (default: garage)
set -euo pipefail

APP="${1:-video-downloader}"
APP_NS="${2:-video-downloader-2}"
BUCKET="${3:-video-downloader}"
KEY_NAME="${4:-video-downloader}"

GARAGE_RELEASE="${GARAGE_RELEASE:-garage}"
GARAGE_NS="${GARAGE_NS:-garage}"
S3_ENDPOINT="${S3_ENDPOINT:-http://${GARAGE_RELEASE}-s3.${GARAGE_NS}.svc.cluster.local:3900}"
S3_REGION="${S3_REGION:-garage}"

SECRET_NAME="${APP}-secrets"
POD="${GARAGE_RELEASE}-0"
CONF="/run/garage/garage.toml"

g() { kubectl exec -n "${GARAGE_NS}" "${POD}" -- /garage -c "${CONF}" "$@"; }

echo "==> Ensuring bucket '${BUCKET}' exists..."
g bucket create "${BUCKET}" 2>/dev/null || true

echo "==> Ensuring access key '${KEY_NAME}' exists..."
if ! g key info "${KEY_NAME}" >/dev/null 2>&1; then
  g key create "${KEY_NAME}" >/dev/null
fi

echo "==> Fetching key credentials..."
INFO="$(g key info --show-secret "${KEY_NAME}")"
# Garage prints "Key ID: GK..." and "Secret key: ..." (one per line).
ACCESS_KEY_ID="$(printf '%s\n' "${INFO}" | sed -n 's/^Key ID:[[:space:]]*//p' | head -1)"
SECRET_ACCESS_KEY="$(printf '%s\n' "${INFO}" | sed -n 's/^Secret key:[[:space:]]*//p' | head -1)"

if [ -z "${ACCESS_KEY_ID}" ] || [ -z "${SECRET_ACCESS_KEY}" ]; then
  echo "  ! Could not parse credentials from 'garage key info'. Raw output:" >&2
  printf '%s\n' "${INFO}" >&2
  exit 1
fi

echo "==> Granting '${KEY_NAME}' read/write/owner on '${BUCKET}'..."
g bucket allow --read --write --owner "${BUCKET}" --key "${KEY_NAME}"

echo "==> Writing credentials into secret '${SECRET_NAME}' (namespace '${APP_NS}')..."
kubectl get namespace "${APP_NS}" >/dev/null 2>&1 || kubectl create namespace "${APP_NS}"

# Merge-patch (stringData) so we only touch the S3_* keys and preserve the rest.
PATCH="$(cat <<JSON
{"stringData":{
  "S3_ENDPOINT":"${S3_ENDPOINT}",
  "S3_REGION":"${S3_REGION}",
  "S3_ACCESS_KEY_ID":"${ACCESS_KEY_ID}",
  "S3_SECRET_ACCESS_KEY":"${SECRET_ACCESS_KEY}",
  "S3_BUCKET":"${BUCKET}"
}}
JSON
)"

if kubectl get secret "${SECRET_NAME}" -n "${APP_NS}" >/dev/null 2>&1; then
  kubectl patch secret "${SECRET_NAME}" -n "${APP_NS}" --type=merge -p "${PATCH}"
else
  kubectl create secret generic "${SECRET_NAME}" -n "${APP_NS}" \
    --from-literal=S3_ENDPOINT="${S3_ENDPOINT}" \
    --from-literal=S3_REGION="${S3_REGION}" \
    --from-literal=S3_ACCESS_KEY_ID="${ACCESS_KEY_ID}" \
    --from-literal=S3_SECRET_ACCESS_KEY="${SECRET_ACCESS_KEY}" \
    --from-literal=S3_BUCKET="${BUCKET}"
fi

cat <<DONE

✓ Done. Bucket '${BUCKET}' and key '${KEY_NAME}' are wired into ${SECRET_NAME}.

  Access Key ID: ${ACCESS_KEY_ID}
  Endpoint:      ${S3_ENDPOINT}   Region: ${S3_REGION}

Read it back anytime with either tool:
  pnpm helm ${APP}       # choose "Reveal secrets"
  pnpm secrets           # choose ${APP} to view/manage its keys
DONE
