#!/usr/bin/env bash
# deploy-redis.sh
#
# Interactive Helm deployment for the custom Redis chart.
# Auth mode "existing secret" references a k8s secret already in the namespace
# so the password is never stored in Helm release values.
#
# Run: bash cli/deploy-redis/deploy-redis.sh

set -euo pipefail

# ── ANSI Colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
CYAN='\033[36m'
YELLOW='\033[33m'

clr_red()         { printf "${RED}%s${RESET}" "$*"; }
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow() { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Redis - Despliegue con Helm"
    SUBTITLE="Instala o actualiza Redis en tu clúster de Kubernetes."
    HELM_MISSING="helm no está instalado o no está en PATH."
    HELM_MISSING_HINT="Instálalo en: https://helm.sh/docs/intro/install/"
    APP_PROMPT="Selecciona la aplicación"
    APP_NOT_FOUND="No se encontraron apps con env.example en apps/."
    NS_PROMPT="Namespace de Kubernetes"
    NS_REQUIRED="El namespace es requerido."
    AUTH_MODE_PROMPT="Modo de autenticación"
    AUTH_MODE_SECRET="Secreto existente (recomendado)"
    AUTH_MODE_DIRECT="Contraseña directa"
    SECRET_NAME_PROMPT="Nombre del secreto"
    SECRET_KEY_PROMPT="Clave en el secreto"
    SECRET_KEY_SELECT="Selecciona la clave de contraseña"
    SECRET_REQUIRED="El nombre y la clave del secreto son requeridos."
    SECRET_MISSING="El secreto no existe en el namespace. Ejecuta setup-k8s-secrets primero."
    KEY_MISSING="La clave no existe en el secreto. Verifica la salida de setup-k8s-secrets."
    PASSWORD_PROMPT="Contraseña de Redis"
    PASSWORD_REQUIRED="La contraseña es requerida."
    SIZE_PROMPT="persistence.size"
    ACTION_INSTALL="Instalar"
    ACTION_UPGRADE="Actualizar"
    SUMMARY_TITLE="Resumen del despliegue"
    SUMMARY_ACTION="Acción"
    SUMMARY_RELEASE="Release"
    SUMMARY_NAMESPACE="Namespace"
    SUMMARY_CHART="Chart"
    SUMMARY_AUTH="Auth"
    SUMMARY_SECRET="Secreto"
    SUMMARY_KEY="Clave"
    SUMMARY_PASSWORD="Contraseña"
    SUMMARY_SIZE="persistence.size"
    SUMMARY_COMMAND="Comando"
    CONFIRM_PROMPT="¿Continuar? [s/n]"
    CONFIRM_YES_CHARS="sy"
    CANCELLED="Cancelado."
    DEPLOYING="Desplegando Redis en el namespace"
    SUCCEEDED="Redis desplegado exitosamente en el namespace"
    FAILED="El despliegue con Helm falló."
  else
    WELCOME="Redis - Helm Deployment"
    SUBTITLE="Installs or upgrades Redis in your Kubernetes cluster."
    HELM_MISSING="helm is not installed or not in PATH."
    HELM_MISSING_HINT="Install it at: https://helm.sh/docs/intro/install/"
    APP_PROMPT="Select application"
    APP_NOT_FOUND="No apps with env.example found in apps/."
    NS_PROMPT="Kubernetes namespace"
    NS_REQUIRED="Namespace is required."
    AUTH_MODE_PROMPT="Authentication mode"
    AUTH_MODE_SECRET="Existing secret (recommended)"
    AUTH_MODE_DIRECT="Direct password"
    SECRET_NAME_PROMPT="Secret name"
    SECRET_KEY_PROMPT="Key in the secret"
    SECRET_KEY_SELECT="Select password key"
    SECRET_REQUIRED="Secret name and key are required."
    SECRET_MISSING="Secret not found in namespace. Run setup-k8s-secrets first."
    KEY_MISSING="Key not found in secret. Check setup-k8s-secrets output."
    PASSWORD_PROMPT="Redis password"
    PASSWORD_REQUIRED="Password is required."
    SIZE_PROMPT="persistence.size"
    ACTION_INSTALL="Install"
    ACTION_UPGRADE="Upgrade"
    SUMMARY_TITLE="Deployment Summary"
    SUMMARY_ACTION="Action"
    SUMMARY_RELEASE="Release"
    SUMMARY_NAMESPACE="Namespace"
    SUMMARY_CHART="Chart"
    SUMMARY_AUTH="Auth"
    SUMMARY_SECRET="Secret"
    SUMMARY_KEY="Key"
    SUMMARY_PASSWORD="Password"
    SUMMARY_SIZE="persistence.size"
    SUMMARY_COMMAND="Command"
    CONFIRM_PROMPT="Proceed? [y/n]"
    CONFIRM_YES_CHARS="y"
    CANCELLED="Cancelled."
    DEPLOYING="Deploying Redis to namespace"
    SUCCEEDED="Redis deployed successfully to namespace"
    FAILED="Helm deployment failed."
  fi
}

# ── UI ────────────────────────────────────────────────────────────────────────

print_header() {
  local line
  line="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

pad_right() { printf "%-${2}s" "${1}"; }

# ── Single-select list ────────────────────────────────────────────────────────
# Input:  MENU_ITEMS[]
# Output: MENU_SELECTED (index)

interactive_select() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0

  render_select() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 46)"
      local ptr label_str
      if [[ $j -eq $cursor ]]; then
        ptr="$(clr_cyan '▶')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        ptr=" "
        label_str="${lbl}"
      fi
      printf "  %s  %s\n" "${ptr}" "${label_str}"
    done
  }

  render_select
  printf '\033[?25l'

  while true; do
    local key seq
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        cursor=$(( (cursor - 1 + num) % num ))
        printf "\033[%dA" "${num}"; render_select
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num ))
        printf "\033[%dA" "${num}"; render_select
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then
      printf '\033[?25h'; echo ""; exit 0
    fi
  done

  printf '\033[?25h'
  echo ""
  MENU_SELECTED="${cursor}"
}

# ── Helpers ───────────────────────────────────────────────────────────────────

# Portable case helper (macOS bash 3 does not support ${var,,})
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

prompt_visible() {
  local label="$1" default="${2:-}"
  if [[ -n "${default}" ]]; then
    printf "  %s (%s): " "$(clr_bold "${label}")" "$(clr_dim "${default}")" >/dev/tty
  else
    printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  fi
  local val
  IFS= read -r val </dev/tty || true
  if [[ -z "${val}" && -n "${default}" ]]; then val="${default}"; fi
  printf '%s' "${val}"
}

prompt_secret() {
  local label="$1"
  printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  local val
  IFS= read -r -s val </dev/tty || true
  echo "" >/dev/tty
  printf '%s' "${val}"
}

release_exists() {
  helm status "$1" -n "$2" &>/dev/null 2>&1
}

# ── Redis password key discovery ──────────────────────────────────────────────
# Reads an env.example and fills PASSWORD_KEYS[] with keys matching common
# Redis password patterns: REDIS_PASSWORD, CACHE_PASSWORD, etc.

discover_password_keys() {
  local file="$1"
  PASSWORD_KEYS=()
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)= ]]; then
      local k="${BASH_REMATCH[1]}"
      if [[ "${k}" =~ ^(REDIS|CACHE)_PASSWORD$ ]]; then
        PASSWORD_KEYS+=("${k}")
      fi
    fi
  done < "${file}"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  # Language
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  local lang="en"
  [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  # helm check
  if ! command -v helm &>/dev/null; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${HELM_MISSING}"
    printf "  %s\n\n" "$(clr_dim "${HELM_MISSING_HINT}")"
    exit 1
  fi

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  local repo_root
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  local release_name="redis"
  local chart_path="${repo_root}/packages/charts/redis"

  # ── App selection ─────────────────────────────────────────────────────────────

  local -a APP_NAMES=()
  local -a APP_PATHS=()
  for d in "${repo_root}/apps"/*/; do
    if [[ -f "${d}env.example" ]]; then
      APP_NAMES+=("$(basename "${d}")")
      APP_PATHS+=("${d}env.example")
    fi
  done

  if [[ ${#APP_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${APP_NOT_FOUND}")"
    exit 1
  fi

  printf "  %s:\n\n" "$(clr_bold "${APP_PROMPT}")"
  MENU_ITEMS=("${APP_NAMES[@]}")
  MENU_SELECTED=0
  interactive_select
  local app_name="${APP_NAMES[${MENU_SELECTED}]}"
  local app_env="${APP_PATHS[${MENU_SELECTED}]}"
  echo ""

  # ── Namespace ─────────────────────────────────────────────────────────────────

  local ns_default=""
  local ns_from_file
  ns_from_file="$(grep -m1 '^NAMESPACE=' "${app_env}" 2>/dev/null | cut -d= -f2-)" || true
  [[ -n "${ns_from_file}" ]] && ns_default="${ns_from_file}"

  local namespace
  namespace="$(prompt_visible "${NS_PROMPT}" "${ns_default}")"
  echo ""
  if [[ -z "${namespace}" ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${NS_REQUIRED}")"
    exit 1
  fi

  # ── Auth mode ────────────────────────────────────────────────────────────────

  echo ""
  printf "  %s:\n\n" "$(clr_bold "${AUTH_MODE_PROMPT}")"
  MENU_ITEMS=("${AUTH_MODE_SECRET}" "${AUTH_MODE_DIRECT}")
  MENU_SELECTED=0
  interactive_select
  local auth_mode="${MENU_SELECTED}"
  echo ""

  local -a set_args=()
  local summary_auth="" summary_secret="" summary_key="" summary_password=""
  local display_cmd_auth=""

  if [[ "${auth_mode}" -eq 0 ]]; then
    # ── Secret name (default: <app>-secrets, matching setup-k8s-secrets convention) ──

    local secret_name
    secret_name="$(prompt_visible "${SECRET_NAME_PROMPT}" "${app_name}-secrets")"
    echo ""

    # ── Secret key: auto-discover from env.example ────────────────────────────

    local -a PASSWORD_KEYS=()
    discover_password_keys "${app_env}"

    local secret_key default_key=""
    if [[ ${#PASSWORD_KEYS[@]} -gt 1 ]]; then
      printf "  %s:\n\n" "$(clr_bold "${SECRET_KEY_SELECT}")"
      MENU_ITEMS=("${PASSWORD_KEYS[@]}")
      MENU_SELECTED=0
      interactive_select
      default_key="${PASSWORD_KEYS[${MENU_SELECTED}]}"
      echo ""
    elif [[ ${#PASSWORD_KEYS[@]} -eq 1 ]]; then
      default_key="${PASSWORD_KEYS[0]}"
    fi

    secret_key="$(prompt_visible "${SECRET_KEY_PROMPT}" "${default_key}")"
    echo ""

    if [[ -z "${secret_name}" || -z "${secret_key}" ]]; then
      printf "  %s\n\n" "$(clr_bold_red "${SECRET_REQUIRED}")"
      exit 1
    fi

    # ── Validate secret + key exist if namespace is already present ───────────

    if kubectl get namespace "${namespace}" &>/dev/null 2>&1; then
      if ! kubectl get secret "${secret_name}" -n "${namespace}" &>/dev/null 2>&1; then
        printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${SECRET_MISSING}"
        exit 1
      fi
      if ! kubectl get secret "${secret_name}" -n "${namespace}" -o json 2>/dev/null \
             | grep -q "\"${secret_key}\":"; then
        printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${KEY_MISSING}"
        exit 1
      fi
    fi

    set_args+=(--set "auth.existingSecret=${secret_name}" --set "auth.existingSecretKey=${secret_key}")
    summary_auth="${AUTH_MODE_SECRET}"
    summary_secret="${secret_name}"
    summary_key="${secret_key}"
    display_cmd_auth="--set auth.existingSecret=${secret_name} --set auth.existingSecretKey=${secret_key}"
  else
    local password
    password="$(prompt_secret "${PASSWORD_PROMPT}")"
    if [[ -z "${password}" ]]; then
      printf "  %s\n\n" "$(clr_bold_red "${PASSWORD_REQUIRED}")"
      exit 1
    fi
    set_args+=(--set "auth.password=${password}")
    summary_auth="${AUTH_MODE_DIRECT}"
    summary_password="${password//?/*}"
    display_cmd_auth="--set auth.password=${summary_password}"
  fi

  # ── Persistence size ─────────────────────────────────────────────────────────

  local pvc_size
  pvc_size="$(prompt_visible "${SIZE_PROMPT}" "1Gi")"
  echo ""
  set_args+=(--set "persistence.size=${pvc_size}")

  # ── Build display command ────────────────────────────────────────────────────

  local display_cmd="helm upgrade --install ${release_name} ./packages/charts/redis --namespace ${namespace} --create-namespace ${display_cmd_auth} --set persistence.size=${pvc_size}"

  # ── Action ───────────────────────────────────────────────────────────────────

  local action
  if release_exists "${release_name}" "${namespace}"; then
    action="${ACTION_UPGRADE}"
  else
    action="${ACTION_INSTALL}"
  fi

  # ── Summary & confirmation ───────────────────────────────────────────────────

  local sep
  sep="$(printf '─%.0s' {1..53})"
  echo ""
  printf "  %s\n" "$(clr_bold_cyan "── ${SUMMARY_TITLE} ${sep:${#SUMMARY_TITLE}}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_ACTION}:")"    "$(clr_bold "${action}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_RELEASE}:")"   "${release_name}"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_NAMESPACE}:")" "${namespace}"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_CHART}:")"     "./packages/charts/redis"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_AUTH}:")"      "${summary_auth}"
  if [[ "${auth_mode}" -eq 0 ]]; then
    printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_SECRET}:")"  "${summary_secret}"
    printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_KEY}:")"     "${summary_key}"
  else
    printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_PASSWORD}:")" "${summary_password}"
  fi
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_SIZE}:")"      "${pvc_size}"
  printf "  %s\n" "$(clr_dim "${sep}")"
  printf "  %s\n    %s\n" "$(clr_dim "${SUMMARY_COMMAND}:")" "$(clr_dim "${display_cmd}")"
  echo ""

  printf "  %s (%s): " "${CONFIRM_PROMPT}" "${CONFIRM_YES_CHARS:0:1}"
  local confirm; read -r confirm || true
  confirm="${confirm:-${CONFIRM_YES_CHARS:0:1}}"
  local confirm_char="${confirm:0:1}"; confirm_char="$(lc "${confirm_char}")"
  if [[ "${CONFIRM_YES_CHARS}" != *"${confirm_char}"* ]]; then
    printf "  %s\n\n" "${CANCELLED}"; exit 0
  fi

  # ── Deploy ───────────────────────────────────────────────────────────────────

  echo ""
  printf "  %s %s \"%s\"...\n\n" "$(clr_bold_yellow '→')" "${DEPLOYING}" "${namespace}"

  if helm upgrade --install "${release_name}" "${chart_path}" \
       --namespace "${namespace}" --create-namespace \
       "${set_args[@]}"; then
    echo ""
    printf "  %s %s \"%s\".\n\n" "$(clr_bold_green '✓')" "${SUCCEEDED}" "${namespace}"
  else
    echo ""
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${FAILED}"
    exit 1
  fi
}

main "$@"
