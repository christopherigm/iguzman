#!/usr/bin/env bash
# setup-k8s-secrets.sh
#
# Generic Kubernetes secrets setup.
# Scans apps/ for env.example files, presents an app selector, then
# creates or updates a single "<app>-secrets" secret in the target namespace.
#
# Keys ending in _FILE trigger a file-path prompt; the file content is
# embedded as the secret value (not the path).
#
# Run: bash cli/setup-k8s-secrets/setup-k8s-secrets.sh

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
    WELCOME="Configuración de Secretos de Kubernetes"
    SUBTITLE="Crea o actualiza secretos k8s a partir del env.example de la app."
    KUBECTL_MISSING="kubectl no está instalado o no está en PATH."
    KUBECTL_MISSING_HINT="Instálalo con: snap install kubectl --classic"
    APP_PROMPT="Selecciona la aplicación"
    APP_NOT_FOUND="No se encontraron apps con env.example en apps/."
    NS_PROMPT="Namespace de Kubernetes"
    SECRET_LABEL="Nombre del secreto"
    SELECT_TITLE="Selecciona las variables a configurar:"
    SELECT_PROMPT="Flechas para navegar · Espacio para seleccionar · Enter para confirmar"
    SELECT_HINT="(a = seleccionar todo  ·  n = deseleccionar todo)"
    NOTHING_SELECTED="Nada seleccionado — saliendo."
    CONFIRM_PROMPT="¿Continuar? [s/n]"
    CONFIRM_YES_CHARS="sy"
    CANCELLED="Cancelado."
    PROMPT_FILE_PATH="Ruta al archivo"
    FILE_NOT_FOUND="Archivo no encontrado"
    APPLYING="Aplicando"
    DONE="Listo"
    FAILED="Error al aplicar"
    SECRET_EXISTS="El secreto existe — parcheando solo las claves seleccionadas."
    SECRET_NEW="El secreto no existe — creando."
    SUMMARY_TITLE="Resumen de secretos aplicados:"
    ALL_DONE="¡Configuración completada!"
  else
    WELCOME="Kubernetes Secrets Setup"
    SUBTITLE="Creates or updates k8s secrets from an app's env.example."
    KUBECTL_MISSING="kubectl is not installed or not in PATH."
    KUBECTL_MISSING_HINT="Install it with: snap install kubectl --classic"
    APP_PROMPT="Select application"
    APP_NOT_FOUND="No apps with env.example found in apps/."
    NS_PROMPT="Kubernetes namespace"
    SECRET_LABEL="Secret name"
    SELECT_TITLE="Select variables to configure:"
    SELECT_PROMPT="Arrow keys to navigate · Space to toggle · Enter to confirm"
    SELECT_HINT="(a = select all  ·  n = deselect all)"
    NOTHING_SELECTED="Nothing selected — exiting."
    CONFIRM_PROMPT="Proceed? [y/n]"
    CONFIRM_YES_CHARS="y"
    CANCELLED="Cancelled."
    PROMPT_FILE_PATH="Path to file"
    FILE_NOT_FOUND="File not found"
    APPLYING="Applying"
    DONE="Done"
    FAILED="Failed to apply"
    SECRET_EXISTS="Secret exists — patching only the selected keys."
    SECRET_NEW="Secret does not exist — creating."
    SUMMARY_TITLE="Applied secrets summary:"
    ALL_DONE="Setup complete!"
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
# Input:  APP_NAMES[]
# Output: APP_SELECTED (index)

interactive_select() {
  local num="${#APP_NAMES[@]}"
  local cursor=0

  render_select() {
    local j
    for j in "${!APP_NAMES[@]}"; do
      local lbl; lbl="$(pad_right "${APP_NAMES[$j]}" 46)"
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
    local key esc
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n1 -t 0.05 esc 2>/dev/null || esc=""
      if [[ "${esc}" == '[' ]]; then
        IFS= read -r -s -n1 -t 0.05 key 2>/dev/null || key=""
        if   [[ "${key}" == 'A' ]]; then
          cursor=$(( (cursor - 1 + num) % num ))
          printf "\033[%dA" "${num}"; render_select
        elif [[ "${key}" == 'B' ]]; then
          cursor=$(( (cursor + 1) % num ))
          printf "\033[%dA" "${num}"; render_select
        fi
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
  APP_SELECTED="${cursor}"
}

# ── Multi-select checkbox ─────────────────────────────────────────────────────
# Input:  CB_LABELS[]
# Output: CB_SELECTED[] (selected indices)

interactive_checkbox() {
  local num="${#CB_LABELS[@]}"
  local cursor=0
  declare -a selected
  local i
  for i in "${!CB_LABELS[@]}"; do selected[$i]=0; done

  render_checkbox() {
    local j
    for j in "${!CB_LABELS[@]}"; do
      local lbl; lbl="$(pad_right "${CB_LABELS[$j]}" 44)"
      local box ptr label_str
      if [[ "${selected[$j]}" -eq 1 ]]; then
        box="$(clr_bold_cyan '[✓]')"
      else
        box="$(clr_dim '[ ]')"
      fi
      if [[ $j -eq $cursor ]]; then
        ptr="$(clr_cyan '▶')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        ptr=" "
        label_str="${lbl}"
      fi
      printf "  %s %s %s\n" "${ptr}" "${box}" "${label_str}"
    done
  }

  render_checkbox
  printf '\033[?25l'

  while true; do
    local key esc
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n1 -t 0.05 esc 2>/dev/null || esc=""
      if [[ "${esc}" == '[' ]]; then
        IFS= read -r -s -n1 -t 0.05 key 2>/dev/null || key=""
        if   [[ "${key}" == 'A' ]]; then
          cursor=$(( (cursor - 1 + num) % num ))
          printf "\033[%dA" "${num}"; render_checkbox
        elif [[ "${key}" == 'B' ]]; then
          cursor=$(( (cursor + 1) % num ))
          printf "\033[%dA" "${num}"; render_checkbox
        fi
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then
      printf '\033[?25h'; echo ""; exit 0
    fi

    if [[ "${key}" == ' ' ]]; then
      selected[$cursor]=$(( 1 - selected[$cursor] ))
      printf "\033[%dA" "${num}"; render_checkbox; continue
    fi
    if [[ "${key}" == 'a' || "${key}" == 'A' ]]; then
      for i in "${!CB_LABELS[@]}"; do selected[$i]=1; done
      printf "\033[%dA" "${num}"; render_checkbox; continue
    fi
    if [[ "${key}" == 'n' || "${key}" == 'N' ]]; then
      for i in "${!CB_LABELS[@]}"; do selected[$i]=0; done
      printf "\033[%dA" "${num}"; render_checkbox; continue
    fi
  done

  printf '\033[?25h'
  echo ""

  CB_SELECTED=()
  for i in "${!CB_LABELS[@]}"; do
    if [[ "${selected[$i]}" -eq 1 ]]; then CB_SELECTED+=("$i"); fi
  done
}

# ── Helpers ───────────────────────────────────────────────────────────────────

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

b64enc() {
  printf '%s' "$1" | base64 -w0 2>/dev/null || printf '%s' "$1" | base64
}

patch_secret() {
  local name="$1" ns="$2"; shift 2
  local json='{"data":{'
  local sep=""
  for item in "$@"; do
    local key="${item%%=*}"
    local val="${item#*=}"
    json+="${sep}\"${key}\":\"$(b64enc "${val}")\""
    sep=","
  done
  json+='}}'
  kubectl patch secret "${name}" -n "${ns}" --type=merge -p "${json}"
}

create_secret() {
  local name="$1" ns="$2"; shift 2
  local args=()
  for item in "$@"; do args+=(--from-literal="${item}"); done
  kubectl create secret generic "${name}" "${args[@]}" -n "${ns}"
}

apply_secret() {
  local name="$1" ns="$2"; shift 2
  if [[ $# -eq 0 ]]; then return; fi

  printf "\n  %s %s...\n" "$(clr_bold_yellow '→')" "${APPLYING} ${name}"

  if kubectl get secret "${name}" -n "${ns}" &>/dev/null 2>&1; then
    printf "  %s\n" "$(clr_dim "${SECRET_EXISTS}")"
    if patch_secret "${name}" "${ns}" "$@"; then
      printf "  %s %s\n" "$(clr_bold_green "✓ ${DONE}:")" "${name}"
    else
      printf "  %s %s\n" "$(clr_red "✗ ${FAILED}:")" "${name}"
    fi
  else
    printf "  %s\n" "$(clr_dim "${SECRET_NEW}")"
    if create_secret "${name}" "${ns}" "$@"; then
      printf "  %s %s\n" "$(clr_bold_green "✓ ${DONE}:")" "${name}"
    else
      printf "  %s %s\n" "$(clr_red "✗ ${FAILED}:")" "${name}"
    fi
  fi
}

# ── env.example parser ────────────────────────────────────────────────────────
# Fills ENV_KEYS[], ENV_DEFAULTS[], ENV_SECTIONS[].
# Each key carries the most recent section comment above it.
# NAMESPACE and DOCKER_REGISTRY are skipped (build/deploy meta vars).

parse_env_example() {
  local file="$1"
  ENV_KEYS=()
  ENV_DEFAULTS=()
  ENV_SECTIONS=()
  local current_section=""

  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line//[[:space:]]/}" ]] && continue

    if [[ "${line}" =~ ^[[:space:]]*#[[:space:]]*(.*) ]]; then
      local cmt="${BASH_REMATCH[1]}"
      [[ -n "${cmt}" ]] && current_section="${cmt}"
      continue
    fi

    if [[ "${line}" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local k="${BASH_REMATCH[1]}"
      local v="${BASH_REMATCH[2]}"
      [[ "${k}" == "NAMESPACE" || "${k}" == "DOCKER_REGISTRY" ]] && continue
      ENV_KEYS+=("${k}")
      ENV_DEFAULTS+=("${v}")
      ENV_SECTIONS+=("${current_section}")
    fi
  done < "${file}"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  # Language
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  local lang="en"
  [[ "${raw_lang,,}" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  # kubectl check
  if ! command -v kubectl &>/dev/null; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${KUBECTL_MISSING}"
    printf "  %s\n\n" "$(clr_dim "${KUBECTL_MISSING_HINT}")"
    exit 1
  fi

  # Repo root
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  local repo_root
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  # Discover apps with env.example
  APP_NAMES=()
  APP_PATHS=()
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

  # App selection
  printf "  %s:\n\n" "$(clr_bold "${APP_PROMPT}")"
  APP_SELECTED=0
  interactive_select
  local app_name="${APP_NAMES[${APP_SELECTED}]}"
  local env_file="${APP_PATHS[${APP_SELECTED}]}"
  echo ""

  # Parse env.example
  ENV_KEYS=(); ENV_DEFAULTS=(); ENV_SECTIONS=()
  parse_env_example "${env_file}"

  if [[ ${#ENV_KEYS[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_bold_red "No variables found in ${env_file}.")"
    exit 1
  fi

  # Namespace — use NAMESPACE= from env.example as default if present
  local ns_default="default"
  local ns_from_file
  ns_from_file="$(grep -m1 '^NAMESPACE=' "${env_file}" 2>/dev/null | cut -d= -f2-)" || true
  [[ -n "${ns_from_file}" ]] && ns_default="${ns_from_file}"

  printf "  %s (%s): " "$(clr_bold "${NS_PROMPT}")" "$(clr_dim "${ns_default}")"
  local ns_input; read -r ns_input || true
  local NAMESPACE="${ns_input:-${ns_default}}"

  # Secret name
  local secret_name="${app_name}-secrets"
  printf "  %s: %s\n\n" "$(clr_dim "${SECRET_LABEL}")" "$(clr_cyan "${secret_name}")"

  # Checklist
  CB_LABELS=("${ENV_KEYS[@]}")

  printf "  %s\n" "$(clr_bold "${SELECT_TITLE}")"
  printf "  %s\n" "$(clr_dim "${SELECT_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${SELECT_HINT}")"

  CB_SELECTED=()
  interactive_checkbox
  echo ""

  if [[ ${#CB_SELECTED[@]} -eq 0 ]]; then
    printf "  %s\n\n" "${NOTHING_SELECTED}"
    exit 0
  fi

  # Summary
  printf "  %s\n" "$(clr_bold "Selected:")"
  for idx in "${CB_SELECTED[@]}"; do
    printf "    %s %s\n" "$(clr_cyan '•')" "${ENV_KEYS[$idx]}"
  done
  echo ""

  printf "  %s (%s): " "${CONFIRM_PROMPT}" "${CONFIRM_YES_CHARS:0:1}"
  local confirm; read -r confirm || true
  confirm="${confirm:-${CONFIRM_YES_CHARS:0:1}}"
  local confirm_char="${confirm:0:1}"; confirm_char="${confirm_char,,}"
  if [[ "${CONFIRM_YES_CHARS}" != *"${confirm_char}"* ]]; then
    printf "  %s\n\n" "${CANCELLED}"; exit 0
  fi
  echo ""

  # ── Collect values ───────────────────────────────────────────────────────────

  local secret_items=()
  local last_section=""

  for idx in "${CB_SELECTED[@]}"; do
    local key="${ENV_KEYS[$idx]}"
    local default="${ENV_DEFAULTS[$idx]}"
    local section="${ENV_SECTIONS[$idx]}"

    if [[ -n "${section}" && "${section}" != "${last_section}" ]]; then
      printf "  %s\n" "$(clr_bold_cyan "── ${section} ──")"
      last_section="${section}"
    fi

    if [[ "${key}" == *_FILE ]]; then
      local file_path
      file_path="$(prompt_visible "${key} — ${PROMPT_FILE_PATH}" "${default}")"
      echo ""
      if [[ -z "${file_path}" ]]; then continue; fi
      if [[ ! -f "${file_path}" ]]; then
        printf "  %s: %s\n" "$(clr_bold_red "✗ ${FILE_NOT_FOUND}")" "$(clr_dim "${file_path}")"
        continue
      fi
      local file_content
      file_content="$(< "${file_path}")"
      secret_items+=("${key}=${file_content}")
    else
      local val
      val="$(prompt_visible "${key}" "${default}")"
      echo ""
      [[ -n "${val}" ]] && secret_items+=("${key}=${val}")
    fi
  done

  # ── Apply ────────────────────────────────────────────────────────────────────

  if [[ ${#secret_items[@]} -gt 0 ]]; then
    apply_secret "${secret_name}" "${NAMESPACE}" "${secret_items[@]}"

    echo ""
    printf "  %s\n" "$(clr_bold "${SUMMARY_TITLE}")"
    for item in "${secret_items[@]}"; do
      local key="${item%%=*}"
      local val="${item#*=}"
      printf "    %s %-40s %s\n" "$(clr_cyan '•')" "$(clr_bold "${key}")" "${val}"
    done
  fi

  echo ""
  printf "  %s %s\n\n" "$(clr_bold_green '✓')" "${ALL_DONE}"
}

main "$@"
