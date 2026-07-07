#!/usr/bin/env bash
#
# Provision a PERSONAL Garage access key for connecting from your own PC with
# an S3 client (rclone, aws-cli, s3cmd, Cyberduck, …).
#
# Unlike provision-app-secret.sh — which wires an *app's* key into a Kubernetes
# Secret using the in-cluster endpoint — this mints a standalone key scoped to
# one bucket and prints ready-to-paste client config using an EXTERNALLY
# reachable endpoint. It writes nothing to Kubernetes Secrets.
#
# It is idempotent: re-running reuses the existing bucket/key and re-prints the
# config.
#
# Endpoint resolution (override with S3_ENDPOINT):
#   1. If a Garage Ingress is deployed, its host is used (https:// when the
#      Ingress has TLS, else http://).
#   2. Otherwise it falls back to http://localhost:3900 and prints the
#      `kubectl port-forward` command you need to run first.
#
#   Usage: ./provision-user-key.sh [KEY_NAME] [BUCKET]
#   Defaults:  $USER-laptop  <KEY_NAME>
#
# Env overrides:
#   GARAGE_RELEASE   (default: garage)   Helm release name of Garage
#   GARAGE_NS        (default: garage)   Namespace Garage runs in
#   S3_ENDPOINT      (default: auto-detected from Ingress, else localhost:3900)
#   S3_REGION        (default: garage)
set -euo pipefail

KEY_NAME="${1:-${USER:-user}-laptop}"
BUCKET="${2:-${KEY_NAME}}"

GARAGE_RELEASE="${GARAGE_RELEASE:-garage}"
GARAGE_NS="${GARAGE_NS:-garage}"
S3_REGION="${S3_REGION:-garage}"

POD="${GARAGE_RELEASE}-0"
CONF="/run/garage/garage.toml"

g() { kubectl exec -n "${GARAGE_NS}" "${POD}" -- /garage -c "${CONF}" "$@"; }

# ─── Resolve an externally reachable endpoint ───────────────────────────────
NEED_PORT_FORWARD=""
if [ -n "${S3_ENDPOINT:-}" ]; then
  : # caller supplied one; use it verbatim
elif HOST="$(kubectl get ingress "${GARAGE_RELEASE}" -n "${GARAGE_NS}" \
    -o jsonpath='{.spec.rules[0].host}' 2>/dev/null)" && [ -n "${HOST}" ]; then
  # An Ingress is deployed — prefer it. https when it terminates TLS.
  TLS="$(kubectl get ingress "${GARAGE_RELEASE}" -n "${GARAGE_NS}" \
    -o jsonpath='{.spec.tls[0].hosts[0]}' 2>/dev/null || true)"
  if [ -n "${TLS}" ]; then
    S3_ENDPOINT="https://${HOST}"
  else
    S3_ENDPOINT="http://${HOST}"
  fi
else
  # No Ingress: the -s3 Service is ClusterIP, so port-forward is required.
  S3_ENDPOINT="http://localhost:3900"
  NEED_PORT_FORWARD="yes"
fi

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

echo "==> Granting '${KEY_NAME}' read/write on '${BUCKET}'..."
g bucket allow --read --write "${BUCKET}" --key "${KEY_NAME}"

# ─── Print ready-to-paste client config ─────────────────────────────────────
cat <<DONE

✓ Done. Personal key '${KEY_NAME}' can read/write bucket '${BUCKET}'.

  Access Key ID:     ${ACCESS_KEY_ID}
  Secret Access Key: ${SECRET_ACCESS_KEY}
  Endpoint:          ${S3_ENDPOINT}   Region: ${S3_REGION}

  NOTE: Garage needs PATH-STYLE addressing unless you set up wildcard DNS + a
  wildcard TLS cert (see values.yaml -> ingress). The snippets below force it.
DONE

if [ -n "${NEED_PORT_FORWARD}" ]; then
  cat <<PF

  No Garage Ingress found, so the S3 API isn't exposed. In a SEPARATE terminal,
  keep this running while you use the client:

    kubectl port-forward -n ${GARAGE_NS} svc/${GARAGE_RELEASE}-s3 3900:3900

  (Or enable the Ingress in values.yaml and re-run this script for a permanent
  https:// endpoint.)
PF
fi

cat <<CFG

─── rclone (~/.config/rclone/rclone.conf) ──────────────────────────
[garage]
type = s3
provider = Other
access_key_id = ${ACCESS_KEY_ID}
secret_access_key = ${SECRET_ACCESS_KEY}
endpoint = ${S3_ENDPOINT}
region = ${S3_REGION}
force_path_style = true

  rclone ls garage:${BUCKET}
  rclone copy ./file.jpg garage:${BUCKET}

─── aws-cli ─────────────────────────────────────────────────────────
  export AWS_ACCESS_KEY_ID=${ACCESS_KEY_ID}
  export AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY}
  aws --endpoint-url ${S3_ENDPOINT} --region ${S3_REGION} s3 ls s3://${BUCKET}/
  aws --endpoint-url ${S3_ENDPOINT} --region ${S3_REGION} s3 cp ./file.jpg s3://${BUCKET}/

─── s3cmd (~/.s3cfg) ────────────────────────────────────────────────
[default]
access_key = ${ACCESS_KEY_ID}
secret_key = ${SECRET_ACCESS_KEY}
host_base = ${S3_ENDPOINT#*://}
host_bucket = ${S3_ENDPOINT#*://}
use_https = $([ "${S3_ENDPOINT%%://*}" = "https" ] && echo True || echo False)
signature_v2 = False

  s3cmd ls s3://${BUCKET}
CFG
