#!/usr/bin/env bash
# django-superuser.sh
#
# Create a Django superuser in a running Kubernetes pod.
# Discovers apps by manage.py presence, reads NAMESPACE from env.example.
#
# Run: bash cli/django-superuser/django-superuser.sh [app-name] [-y]

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
    WELCOME="Crear Superusuario de Django"
    SUBTITLE="Crea un superusuario en un pod de Kubernetes."
    KUBECTL_MISSING="kubectl no está instalado o no está en PATH."
    APP_PROMPT="Selecciona la aplicación Django"
    APP_NOT_FOUND="No se encontraron apps Django (manage.py) en apps/."
    APP_INVALID="App no encontrada"
    NS_PROMPT="Namespace de Kubernetes"
    NS_REQUIRED="El namespace es requerido."
    USERNAME_PROMPT="Nombre de usuario"
    USERNAME_REQUIRED="El nombre de usuario es requerido."
    EMAIL_PROMPT="Correo electrónico"
    PASSWORD_PROMPT="Contraseña"
    PASSWORD_CONFIRM_PROMPT="Confirmar contraseña"
    PASSWORD_REQUIRED="La contraseña es requerida."
    PASSWORD_MISMATCH="Las contraseñas no coinciden."
    SUMMARY_TITLE="Resumen"
    SUMMARY_APP="Aplicación"
    SUMMARY_NAMESPACE="Namespace"
    SUMMARY_USERNAME="Usuario"
    SUMMARY_EMAIL="Correo"
    CONFIRM_PROMPT="¿Continuar?"
    CONFIRM_YES_CHARS="sy"
    CANCELLED="Cancelado."
    CREATING="Creando superusuario en"
    CREATE_OK="Superusuario creado exitosamente."
    CREATE_FAILED="Error al crear el superusuario."
    POD_NOT_FOUND="No se encontró un pod en ejecución para"
    ALL_DONE="¡Todo listo!"
  else
    WELCOME="Create Django Superuser"
    SUBTITLE="Create a superuser in a running Kubernetes pod."
    KUBECTL_MISSING="kubectl is not installed or not in PATH."
    APP_PROMPT="Select Django application"
    APP_NOT_FOUND="No Django apps (manage.py) found in apps/."
    APP_INVALID="App not found"
    NS_PROMPT="Kubernetes namespace"
    NS_REQUIRED="Namespace is required."
    USERNAME_PROMPT="Username"
    USERNAME_REQUIRED="Username is required."
    EMAIL_PROMPT="Email"
    PASSWORD_PROMPT="Password"
    PASSWORD_CONFIRM_PROMPT="Confirm password"
    PASSWORD_REQUIRED="Password is required."
    PASSWORD_MISMATCH="Passwords do not match."
    SUMMARY_TITLE="Summary"
    SUMMARY_APP="App"
    SUMMARY_NAMESPACE="Namespace"
    SUMMARY_USERNAME="Username"
    SUMMARY_EMAIL="Email"
    CONFIRM_PROMPT="Proceed?"
    CONFIRM_YES_CHARS="y"
    CANCELLED="Cancelled."
    CREATING="Creating superuser in"
    CREATE_OK="Superuser created successfully."
    CREATE_FAILED="Failed to create superuser."
    POD_NOT_FOUND="No running pod found for"
    ALL_DONE="All done!"
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

# ── Single-select ─────────────────────────────────────────────────────────────
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
  printf '\n' >/dev/tty
  printf '%s' "${val}"
}

confirm_step() {
  local prompt_text="$1" yes_chars="$2"
  printf "  %s [%s/n]: " "${prompt_text}" "${yes_chars:0:1}"
  local val; IFS= read -r val </dev/tty || true
  val="${val:-${yes_chars:0:1}}"
  local char="${val:0:1}"; char="$(lc "${char}")"
  [[ "$(lc "${yes_chars}")" == *"${char}"* ]]
}

read_file_value() {
  local file="$1" key="$2"
  grep -m1 "^${key}=" "${file}" 2>/dev/null | cut -d= -f2- || true
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  local app_arg=""
  for arg in "$@"; do
    case "${arg}" in
      *) [[ -z "${app_arg}" ]] && app_arg="${arg}" ;;
    esac
  done

  # Language
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  local lang="en"
  [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  # Tool check
  if ! command -v kubectl &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${KUBECTL_MISSING}"; exit 1
  fi

  # Repo root
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  local repo_root
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  # Discover Django apps (have manage.py)
  local -a APP_NAMES=()
  local -a APP_DIRS=()
  for d in "${repo_root}/apps"/*/; do
    if [[ -f "${d}manage.py" ]]; then
      APP_NAMES+=("$(basename "${d}")")
      APP_DIRS+=("${d%/}")
    fi
  done

  if [[ ${#APP_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${APP_NOT_FOUND}")"; exit 1
  fi

  # App selection
  local app_name="" app_dir=""
  if [[ -n "${app_arg}" ]]; then
    for i in "${!APP_NAMES[@]}"; do
      if [[ "${APP_NAMES[$i]}" == "${app_arg}" ]]; then
        app_name="${APP_NAMES[$i]}"
        app_dir="${APP_DIRS[$i]}"
        break
      fi
    done
    if [[ -z "${app_name}" ]]; then
      printf "  %s: \"%s\"\n\n" "$(clr_bold_red "✗ ${APP_INVALID}")" "${app_arg}"; exit 1
    fi
  else
    printf "  %s:\n\n" "$(clr_bold "${APP_PROMPT}")"
    MENU_ITEMS=("${APP_NAMES[@]}")
    MENU_SELECTED=0
    interactive_select
    app_name="${APP_NAMES[${MENU_SELECTED}]}"
    app_dir="${APP_DIRS[${MENU_SELECTED}]}"
    echo ""
  fi

  # Namespace (default from env.example if present)
  local ns_default=""
  local env_example="${app_dir}/env.example"
  [[ -f "${env_example}" ]] && ns_default="$(read_file_value "${env_example}" "NAMESPACE")"

  local namespace
  namespace="$(prompt_visible "${NS_PROMPT}" "${ns_default}")"
  echo ""

  if [[ -z "${namespace}" ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${NS_REQUIRED}")"; exit 1
  fi

  # Superuser credentials
  local su_username su_email su_password su_password_confirm

  su_username="$(prompt_visible "${USERNAME_PROMPT}" "")"
  echo ""
  if [[ -z "${su_username}" ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${USERNAME_REQUIRED}")"; exit 1
  fi

  su_email="$(prompt_visible "${EMAIL_PROMPT}" "")"
  echo ""

  while true; do
    su_password="$(prompt_secret "${PASSWORD_PROMPT}")"
    if [[ -z "${su_password}" ]]; then
      printf "  %s\n\n" "$(clr_bold_red "${PASSWORD_REQUIRED}")"
      continue
    fi
    su_password_confirm="$(prompt_secret "${PASSWORD_CONFIRM_PROMPT}")"
    if [[ "${su_password}" != "${su_password_confirm}" ]]; then
      printf "\n  %s\n\n" "$(clr_bold_red "${PASSWORD_MISMATCH}")"
      continue
    fi
    break
  done

  echo ""

  # Summary
  local sep; sep="$(printf '─%.0s' {1..53})"
  printf "  %s\n" "$(clr_bold_cyan "── ${SUMMARY_TITLE} ${sep:${#SUMMARY_TITLE}}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_APP}:")"       "$(clr_bold "${app_name}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_NAMESPACE}:")" "${namespace}"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_USERNAME}:")"  "$(clr_bold "${su_username}")"
  [[ -n "${su_email}" ]] && \
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_EMAIL}:")"     "${su_email}"
  printf "  %s\n" "$(clr_dim "${sep}")"
  echo ""

  if ! confirm_step "${CONFIRM_PROMPT}" "${CONFIRM_YES_CHARS}"; then
    printf "\n  %s\n\n" "${CANCELLED}"; exit 0
  fi

  echo ""
  printf "  %s %s \"%s\"...\n\n" "$(clr_bold_yellow '→')" "${CREATING}" "${namespace}"

  # Find a running pod for the deployment
  local pod
  pod="$(kubectl get pods -n "${namespace}" \
    -l "app.kubernetes.io/name=${app_name}" \
    --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"

  # Fallback: match by app name prefix
  if [[ -z "${pod}" ]]; then
    pod="$(kubectl get pods -n "${namespace}" \
      --field-selector=status.phase=Running \
      -o jsonpath="{.items[?(@.metadata.name matches '^${app_name}')].metadata.name}" \
      2>/dev/null | awk '{print $1}' || true)"
  fi

  if [[ -z "${pod}" ]]; then
    printf "  %s %s \"%s\" %s \"%s\"\n\n" \
      "$(clr_bold_red '✗')" "${POD_NOT_FOUND}" "${app_name}" "in namespace" "${namespace}"
    exit 1
  fi

  printf "  %s pod: %s\n\n" "$(clr_dim '→')" "$(clr_cyan "${pod}")"

  local create_cmd
  printf -v create_cmd \
    'DJANGO_SUPERUSER_USERNAME=%q DJANGO_SUPERUSER_EMAIL=%q DJANGO_SUPERUSER_PASSWORD=%q python manage.py createsuperuser --noinput' \
    "${su_username}" "${su_email}" "${su_password}"

  if kubectl exec -n "${namespace}" "${pod}" -- bash -c "${create_cmd}"; then
    echo ""
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${CREATE_OK}"
  else
    echo ""
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${CREATE_FAILED}"; exit 1
  fi

  echo ""
  printf "  %s\n\n" "$(clr_bold_green "✓ ${ALL_DONE}")"
}

main "$@"
