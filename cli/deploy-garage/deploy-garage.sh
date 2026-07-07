#!/usr/bin/env bash
# deploy-garage.sh
#
# Interactive Helm deployment for the custom Garage (S3) chart.
# After the release is up, Garage needs a ONE-TIME cluster-layout bootstrap
# (per-node capacity weights) before it will serve reads/writes — this script
# offers to run scripts/bootstrap-layout.sh for you.
#
# Run: bash cli/deploy-garage/deploy-garage.sh
#
# Note: kept lean on purpose. It can be extended with the 5-language i18n +
# per-node capacity prompts used by the sibling deploy-* scripts if desired.

set -euo pipefail

# ── ANSI Colors ───────────────────────────────────────────────────────────────
RESET='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
GREEN='\033[32m'; RED='\033[31m'; CYAN='\033[36m'; YELLOW='\033[33m'
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

# ── Locate repo + chart ───────────────────────────────────────────────────────
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
chart_path="${repo_root}/packages/charts/garage"
bootstrap_script="${chart_path}/scripts/bootstrap-layout.sh"

printf "\n%s\n" "$(clr_bold_cyan "Garage (S3) — Helm Deployment")"
printf "%s\n\n" "$(clr_dim "Distributed S3-compatible object storage over node-local disks.")"

# ── Preconditions ─────────────────────────────────────────────────────────────
if ! command -v helm >/dev/null 2>&1; then
  printf "%s\n" "$(clr_bold_red "helm is not installed or not on PATH.")"
  printf "%s\n" "$(clr_dim "Install it: https://helm.sh/docs/intro/install/")"
  exit 1
fi

# ── Prompts ───────────────────────────────────────────────────────────────────
read -r -p "$(clr_cyan "Release name") [garage]: " release_name
release_name="${release_name:-garage}"

read -r -p "$(clr_cyan "Kubernetes namespace") [garage]: " namespace
namespace="${namespace:-garage}"

# ── Confirm ───────────────────────────────────────────────────────────────────
cmd=(helm upgrade --install "${release_name}" "${chart_path}"
  --namespace "${namespace}" --create-namespace)

printf "\n%s\n" "$(clr_bold_cyan "About to run:")"
printf "  %s\n\n" "$(clr_dim "helm upgrade --install ${release_name} ./packages/charts/garage --namespace ${namespace} --create-namespace")"
read -r -p "$(clr_cyan "Proceed?") [y/N]: " confirm
[[ "${confirm}" =~ ^[Yy]$ ]] || { printf "%s\n" "$(clr_dim "Aborted.")"; exit 0; }

"${cmd[@]}"

printf "\n%s\n" "$(clr_bold_green "Release deployed.")"

# ── Layout bootstrap (Garage-specific, one-time) ──────────────────────────────
printf "\n%s\n" "$(clr_bold_cyan "Next step — apply the cluster layout (required, one-time):")"
printf "  %s\n" "$(clr_dim "Pods stay NotReady until per-node capacities are assigned.")"
printf "  %s\n\n" "$(clr_dim "Ensure all pods are Running first: kubectl get pods -n ${namespace} -o wide")"

read -r -p "$(clr_cyan "Run the layout bootstrap now?") [y/N]: " run_layout
if [[ "${run_layout}" =~ ^[Yy]$ ]]; then
  # Preview the per-node capacity weights (single source of truth lives in
  # values.yaml -> layout.capacities) and confirm before any layout is applied.
  printf "\n%s\n" "$(clr_bold_cyan "Per-node capacity weights to be applied:")"
  PRINT_CAPACITIES=1 bash "${bootstrap_script}"
  printf "\n"
  read -r -p "$(clr_cyan "Apply these capacities?") [y/N]: " confirm_cap
  if [[ "${confirm_cap}" =~ ^[Yy]$ ]]; then
    # Already confirmed here, so skip the bootstrap's own prompt.
    AUTO_APPROVE=1 bash "${bootstrap_script}" "${release_name}" "${namespace}"
  else
    printf "%s\n" "$(clr_dim "Layout not applied. Edit capacities in packages/charts/garage/values.yaml (layout.capacities), then re-run.")"
  fi
else
  printf "%s\n" "$(clr_dim "Later: bash packages/charts/garage/scripts/bootstrap-layout.sh ${release_name} ${namespace}")"
fi
