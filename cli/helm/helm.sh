#!/usr/bin/env bash
# helm.sh
#
# Interactive Helm operations for apps in the monorepo.
# Presents an app selector then a multi-select operation menu.
#
# Operations (run in display order):
#   Status, Reveal secrets, Deploy, Force redeploy, Rollout restart,
#   Rollback, Uninstall
#
# Run: bash cli/helm/helm.sh [app-name] [-y]

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
    WELCOME="Operaciones de Helm"
    SUBTITLE="Gestiona releases de Helm en el clúster de Kubernetes."
    HELM_MISSING="helm no está instalado o no está en PATH."
    KUBECTL_MISSING="kubectl no está instalado o no está en PATH."
    APP_PROMPT="Selecciona la aplicación"
    APP_NOT_FOUND="No se encontraron apps con Helm chart (helm/) en apps/."
    APP_INVALID="App no encontrada"
    NS_PROMPT="Namespace de Kubernetes"
    NS_REQUIRED="El namespace es requerido."
    OP_PROMPT="Selecciona operaciones"
    OP_HINT="espacio = marcar/desmarcar  ·  enter = confirmar"
    OP_NONE_SELECTED="No se seleccionó ninguna operación."
    OP_STATUS="Estado (helm status)"
    OP_STATUS_DESC="Muestra el estado del release y los pods activos"
    OP_REVEAL_SECRETS="Revelar secretos"
    OP_REVEAL_SECRETS_DESC="Decodifica e imprime los valores del secreto de Kubernetes"
    OP_DEPLOY="Desplegar / Actualizar"
    OP_DEPLOY_DESC="helm upgrade --install — instala o aplica cambios del chart"
    OP_FORCE_REDEPLOY="Redesplegar forzado (--force)"
    OP_FORCE_REDEPLOY_DESC="Igual que actualizar pero reemplaza recursos si es necesario"
    OP_ROLLOUT_RESTART="Rollout restart"
    OP_ROLLOUT_RESTART_DESC="Reinicia pods con una actualización rolling sin cambiar el chart"
    OP_ROLLBACK="Rollback"
    OP_ROLLBACK_DESC="Revierte el release a una revisión anterior"
    OP_UNINSTALL="Desinstalar"
    OP_UNINSTALL_DESC="Elimina el release y todos sus recursos del clúster"
    IMAGE_TAG_PROMPT="Tag de imagen"
    REPLICAS_PROMPT="Número de réplicas (vacío = valor del chart)"
    ACTION_INSTALL="Instalar"
    ACTION_UPGRADE="Actualizar"
    SUMMARY_TITLE="Resumen del despliegue"
    SUMMARY_APP="Aplicación"
    SUMMARY_ACTION="Acción"
    SUMMARY_NAMESPACE="Namespace"
    SUMMARY_CHART="Chart"
    SUMMARY_TAG="Tag"
    SUMMARY_REPLICAS="Réplicas"
    SUMMARY_COMMAND="Comando"
    CONFIRM_PROMPT="¿Continuar? [s/n]"
    CONFIRM_YES_CHARS="sy"
    CANCELLED="Cancelado."
    DEPLOYING="Desplegando"
    DEPLOY_OK="Despliegue completado exitosamente."
    DEPLOY_FAILED="El despliegue con Helm falló."
    ROLLOUT_RESTART_OK="Rollout restart iniciado. Para ver el progreso:"
    ROLLOUT_RESTART_FAILED="El rollout restart falló."
    HISTORY_TITLE="Historial del release"
    ROLLBACK_REVISION_PROMPT="Revisión destino (vacío = anterior)"
    ROLLBACK_OK="Rollback completado."
    ROLLBACK_FAILED="El rollback falló."
    UNINSTALL_CONFIRM="¿Desinstalar \"%s\"? Esto no se puede deshacer"
    UNINSTALL_YES_CHARS="sy"
    UNINSTALL_OK="Desinstalado exitosamente."
    UNINSTALL_FAILED="La desinstalación falló."
    STATUS_RELEASE="Release"
    STATUS_PODS="Pods"
    SECRETS_TITLE="Secretos de Kubernetes"
    SECRET_NOT_FOUND="Secreto no encontrado."
    ALL_DONE="¡Todo listo!"
    NS_CREATED="Namespace creado."
    NS_CREATE_FAILED="Error al crear el namespace."
  else
    WELCOME="Helm Operations"
    SUBTITLE="Manage Helm releases on the Kubernetes cluster."
    HELM_MISSING="helm is not installed or not in PATH."
    KUBECTL_MISSING="kubectl is not installed or not in PATH."
    APP_PROMPT="Select application"
    APP_NOT_FOUND="No apps with Helm chart (helm/) found in apps/."
    APP_INVALID="App not found"
    NS_PROMPT="Kubernetes namespace"
    NS_REQUIRED="Namespace is required."
    OP_PROMPT="Select operations"
    OP_HINT="space = toggle  ·  enter = confirm"
    OP_NONE_SELECTED="No operations selected."
    OP_STATUS="Status (helm status)"
    OP_STATUS_DESC="Show release status and currently running pods"
    OP_REVEAL_SECRETS="Reveal secrets"
    OP_REVEAL_SECRETS_DESC="Decode and print Kubernetes secret values"
    OP_DEPLOY="Deploy / Upgrade"
    OP_DEPLOY_DESC="helm upgrade --install — install or apply chart changes"
    OP_FORCE_REDEPLOY="Force redeploy (--force)"
    OP_FORCE_REDEPLOY_DESC="Same as upgrade but replaces resources if needed"
    OP_ROLLOUT_RESTART="Rollout restart"
    OP_ROLLOUT_RESTART_DESC="Restart pods with a rolling update without changing the chart"
    OP_ROLLBACK="Rollback"
    OP_ROLLBACK_DESC="Revert the release to a previous revision"
    OP_UNINSTALL="Uninstall"
    OP_UNINSTALL_DESC="Remove the release and all its resources from the cluster"
    IMAGE_TAG_PROMPT="Image tag"
    REPLICAS_PROMPT="Replica count (empty = chart default)"
    ACTION_INSTALL="Install"
    ACTION_UPGRADE="Upgrade"
    SUMMARY_TITLE="Deployment Summary"
    SUMMARY_APP="App"
    SUMMARY_ACTION="Action"
    SUMMARY_NAMESPACE="Namespace"
    SUMMARY_CHART="Chart"
    SUMMARY_TAG="Tag"
    SUMMARY_REPLICAS="Replicas"
    SUMMARY_COMMAND="Command"
    CONFIRM_PROMPT="Proceed? [y/n]"
    CONFIRM_YES_CHARS="y"
    CANCELLED="Cancelled."
    DEPLOYING="Deploying"
    DEPLOY_OK="Deployment completed successfully."
    DEPLOY_FAILED="Helm deployment failed."
    ROLLOUT_RESTART_OK="Rollout restart triggered. To watch progress:"
    ROLLOUT_RESTART_FAILED="Rollout restart failed."
    HISTORY_TITLE="Release history"
    ROLLBACK_REVISION_PROMPT="Target revision (empty = previous)"
    ROLLBACK_OK="Rollback completed."
    ROLLBACK_FAILED="Rollback failed."
    UNINSTALL_CONFIRM="Uninstall \"%s\"? This cannot be undone"
    UNINSTALL_YES_CHARS="y"
    UNINSTALL_OK="Uninstalled successfully."
    UNINSTALL_FAILED="Uninstall failed."
    STATUS_RELEASE="Release"
    STATUS_PODS="Pods"
    SECRETS_TITLE="Kubernetes Secrets"
    SECRET_NOT_FOUND="Secret not found."
    ALL_DONE="All done!"
    NS_CREATED="Namespace created."
    NS_CREATE_FAILED="Failed to create namespace."
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

# ── Multi-select ──────────────────────────────────────────────────────────────
# Input:  MENU_ITEMS[], MENU_CHECKED[]
# Output: MENU_CHECKED[] (modified in place)

interactive_multiselect() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0
  local lpi=2  # lines per item (label + description)

  render_multiselect() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 40)"
      local ptr chk label_str
      if [[ $j -eq $cursor ]]; then
        ptr="$(clr_cyan '▶')"
      else
        ptr=" "
      fi
      if [[ "${MENU_CHECKED[$j]}" -eq 1 ]]; then
        chk="$(clr_bold_cyan '[✓]')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        chk="$(clr_dim '[ ]')"
        label_str="${lbl}"
      fi
      printf "  %s  %s  %s\n" "${ptr}" "${chk}" "${label_str}"
      printf "          %s\n" "$(clr_dim "${MENU_DESCS[$j]:-}")"
    done
  }

  render_multiselect
  printf '\033[?25l'

  while true; do
    local key seq
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        cursor=$(( (cursor - 1 + num) % num ))
        printf "\033[%dA" $((num * lpi)); render_multiselect
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num ))
        printf "\033[%dA" $((num * lpi)); render_multiselect
      fi
      continue
    fi

    if [[ "${key}" == ' ' ]]; then
      if [[ "${MENU_CHECKED[$cursor]}" -eq 1 ]]; then
        MENU_CHECKED[$cursor]=0
      else
        MENU_CHECKED[$cursor]=1
      fi
      printf "\033[%dA" $((num * lpi)); render_multiselect
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then
      printf '\033[?25h'; echo ""; exit 0
    fi
  done

  printf '\033[?25h'
  echo ""
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

confirm_step() {
  local prompt_text="$1" yes_chars="$2" auto_yes="${3:-0}"
  if [[ "${auto_yes}" -eq 1 ]]; then
    printf "  %s (%s): %s\n" "${prompt_text}" "${yes_chars:0:1}" "${yes_chars:0:1}"
    return 0
  fi
  printf "  %s [%s/n]: " "${prompt_text}" "${yes_chars:0:1}"
  local val; IFS= read -r val </dev/tty || true
  val="${val:-${yes_chars:0:1}}"
  local char="${val:0:1}"; char="$(lc "${char}")"
  [[ "$(lc "${yes_chars}")" == *"${char}"* ]]
}

release_exists() {
  helm status "$1" -n "$2" &>/dev/null 2>&1
}

ensure_namespace() {
  local ns="$1"
  if ! kubectl get namespace "${ns}" &>/dev/null 2>&1; then
    if kubectl create namespace "${ns}" &>/dev/null 2>&1; then
      printf "  %s %s \"%s\"\n\n" "$(clr_bold_green '✓')" "${NS_CREATED}" "${ns}"
    else
      printf "  %s %s \"%s\"\n\n" "$(clr_bold_red '✗')" "${NS_CREATE_FAILED}" "${ns}"
      exit 1
    fi
  fi
}

read_file_value() {
  local file="$1" key="$2"
  grep -m1 "^${key}=" "${file}" 2>/dev/null | cut -d= -f2- || true
}

read_package_version() {
  local pkg="$1"
  python3 -c "import json; print(json.load(open('${pkg}'))['version'])" 2>/dev/null \
    || grep -m1 '"version"' "${pkg}" | sed 's/.*"version": *"\([^"]*\)".*/\1/'
}

# ── Operations ────────────────────────────────────────────────────────────────

do_status() {
  local app_name="$1" namespace="$2"

  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_STATUS} ──")"

  printf "  %s\n\n" "$(clr_dim "${STATUS_RELEASE}:")"
  helm status "${app_name}" -n "${namespace}" 2>/dev/null \
    || printf "  %s\n" "$(clr_dim "(no active release found)")"

  echo ""
  printf "  %s\n\n" "$(clr_dim "${STATUS_PODS}:")"
  kubectl get pods -n "${namespace}" 2>/dev/null || true
}

do_reveal_secrets() {
  local app_name="$1" namespace="$2"
  local secret_name="${app_name}-secrets"

  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${SECRETS_TITLE} ──")"
  printf "  %-14s %s\n\n" "$(clr_dim 'Secret:')" "$(clr_cyan "${secret_name}")"

  if ! kubectl get secret "${secret_name}" -n "${namespace}" &>/dev/null; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${SECRET_NOT_FOUND}"; return 1
  fi

  local -a pairs=()
  while IFS= read -r line; do
    [[ -n "${line}" ]] && pairs+=("${line}")
  done < <(kubectl get secret "${secret_name}" -n "${namespace}" \
    -o go-template='{{range $k,$v := .data}}{{$k}}={{$v}}{{"\n"}}{{end}}' 2>/dev/null)

  if [[ ${#pairs[@]} -eq 0 ]]; then
    printf "  %s\n" "$(clr_dim "(secret is empty)")"; return 0
  fi

  for pair in "${pairs[@]}"; do
    local key="${pair%%=*}"
    local val_b64="${pair#*=}"
    local val
    val="$(printf '%s' "${val_b64}" | base64 -d 2>/dev/null)" || val="$(clr_dim "(decode error)")"
    printf "  %-35s %s\n" "$(clr_bold "${key}")" "${val}"
  done
  echo ""
}

do_deploy() {
  local app_name="$1" namespace="$2" auto_yes="$3" force="$4" repo_root="$5"

  local title="${OP_DEPLOY}"
  [[ "${force}" -eq 1 ]] && title="${OP_FORCE_REDEPLOY}"
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${title} ──")"

  local pkg_json="${repo_root}/apps/${app_name}/package.json"
  local default_tag="latest"
  [[ -f "${pkg_json}" ]] && default_tag="$(read_package_version "${pkg_json}")" || true

  local image_tag replica_count=""
  if [[ "${auto_yes}" -eq 1 ]]; then
    image_tag="${default_tag}"
    printf "  %s (%s): %s\n" "$(clr_bold "${IMAGE_TAG_PROMPT}")" "$(clr_dim "${default_tag}")" "${image_tag}"
  else
    image_tag="$(prompt_visible "${IMAGE_TAG_PROMPT}" "${default_tag}")"
    echo ""
    replica_count="$(prompt_visible "${REPLICAS_PROMPT}" "")"
    echo ""
  fi

  local -a set_args=()
  [[ -n "${image_tag}" ]]     && set_args+=(--set "image.tag=${image_tag}")
  [[ -n "${replica_count}" ]] && set_args+=(--set "replicaCount=${replica_count}")
  [[ "${force}" -eq 1 ]]      && set_args+=(--force)

  local helm_chart="./apps/${app_name}/helm"
  local action
  if release_exists "${app_name}" "${namespace}"; then
    action="${ACTION_UPGRADE}"
  else
    action="${ACTION_INSTALL}"
  fi

  local display_cmd="helm upgrade --install ${app_name} ${helm_chart} --namespace ${namespace} --create-namespace"
  [[ "${force}" -eq 1 ]]      && display_cmd+=" --force"
  [[ -n "${image_tag}" ]]     && display_cmd+=" --set image.tag=${image_tag}"
  [[ -n "${replica_count}" ]] && display_cmd+=" --set replicaCount=${replica_count}"

  local sep; sep="$(printf '─%.0s' {1..53})"
  printf "  %s\n" "$(clr_bold_cyan "── ${SUMMARY_TITLE} ${sep:${#SUMMARY_TITLE}}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_APP}:")"       "$(clr_bold "${app_name}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_ACTION}:")"    "$(clr_bold "${action}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_NAMESPACE}:")" "${namespace}"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_CHART}:")"     "${helm_chart}"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_TAG}:")"       "${image_tag:-chart default}"
  [[ -n "${replica_count}" ]] && \
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_REPLICAS}:")"  "${replica_count}"
  printf "  %s\n" "$(clr_dim "${sep}")"
  printf "  %s\n    %s\n" "$(clr_dim "${SUMMARY_COMMAND}:")" "$(clr_dim "${display_cmd}")"
  echo ""

  if ! confirm_step "${CONFIRM_PROMPT}" "${CONFIRM_YES_CHARS}" "${auto_yes}"; then
    printf "\n  %s\n" "${CANCELLED}"; return 0
  fi

  echo ""
  printf "  %s %s \"%s\"...\n\n" "$(clr_bold_yellow '→')" "${DEPLOYING}" "${namespace}"

  if (cd "${repo_root}" && helm upgrade --install "${app_name}" "apps/${app_name}/helm" \
      --namespace "${namespace}" --create-namespace "${set_args[@]}"); then
    echo ""
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${DEPLOY_OK}"
  else
    echo ""
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${DEPLOY_FAILED}"; return 1
  fi
}

do_rollout_restart() {
  local app_name="$1" namespace="$2"

  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_ROLLOUT_RESTART} ──")"

  printf "  %s kubectl rollout restart deployment/%s -n %s\n\n" \
    "$(clr_bold_yellow '→')" "${app_name}" "${namespace}"

  if kubectl rollout restart "deployment/${app_name}" -n "${namespace}"; then
    echo ""
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${ROLLOUT_RESTART_OK}"
    printf "      %s\n" "$(clr_dim "kubectl rollout status deployment/${app_name} -n ${namespace}")"
  else
    echo ""
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${ROLLOUT_RESTART_FAILED}"; return 1
  fi
}

do_rollback() {
  local app_name="$1" namespace="$2" auto_yes="$3"

  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_ROLLBACK} ──")"

  printf "  %s\n\n" "$(clr_dim "${HISTORY_TITLE}:")"
  helm history "${app_name}" -n "${namespace}" 2>/dev/null \
    || printf "  %s\n" "$(clr_dim "(no history found)")"
  echo ""

  local revision
  revision="$(prompt_visible "${ROLLBACK_REVISION_PROMPT}" "")"
  echo ""

  local display_cmd="helm rollback ${app_name}"
  [[ -n "${revision}" ]] && display_cmd+=" ${revision}"
  display_cmd+=" -n ${namespace}"

  printf "  %s %s\n\n" "$(clr_bold_yellow '→')" "$(clr_dim "${display_cmd}")"

  local ok=0
  if [[ -n "${revision}" ]]; then
    helm rollback "${app_name}" "${revision}" -n "${namespace}" && ok=1 || ok=0
  else
    helm rollback "${app_name}" -n "${namespace}" && ok=1 || ok=0
  fi

  if [[ "${ok}" -eq 1 ]]; then
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${ROLLBACK_OK}"
  else
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${ROLLBACK_FAILED}"; return 1
  fi
}

do_uninstall() {
  local app_name="$1" namespace="$2" auto_yes="$3"

  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_UNINSTALL} ──")"

  local prompt_text
  printf -v prompt_text "${UNINSTALL_CONFIRM}" "${app_name}"

  if ! confirm_step "${prompt_text}" "${UNINSTALL_YES_CHARS}" "${auto_yes}"; then
    printf "\n  %s\n" "${CANCELLED}"; return 0
  fi

  echo ""
  printf "  %s helm uninstall %s -n %s\n\n" \
    "$(clr_bold_yellow '→')" "${app_name}" "${namespace}"

  if helm uninstall "${app_name}" -n "${namespace}"; then
    echo ""
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${UNINSTALL_OK}"
  else
    echo ""
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${UNINSTALL_FAILED}"; return 1
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  local auto_yes=0 app_arg=""
  for arg in "$@"; do
    case "${arg}" in
      -y) auto_yes=1 ;;
      *)  [[ -z "${app_arg}" ]] && app_arg="${arg}" ;;
    esac
  done

  # Language
  local lang="en"
  if [[ "${auto_yes}" -eq 0 ]]; then
    printf "  Select language / Selecciona idioma [en/es] (en): "
    local raw_lang; read -r raw_lang || true
    [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  fi
  setup_strings "${lang}"

  clear
  print_header

  # Tool checks
  if ! command -v helm &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${HELM_MISSING}"; exit 1
  fi
  if ! command -v kubectl &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${KUBECTL_MISSING}"; exit 1
  fi

  # Repo root
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  local repo_root
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  # Discover apps that have a helm/ chart
  local -a APP_NAMES=()
  local -a APP_DIRS=()
  for d in "${repo_root}/apps"/*/; do
    if [[ -d "${d}helm" ]]; then
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
  ensure_namespace "${namespace}"

  # Operation multi-select
  # Display order == execution order:
  #   0: Status          4: Rollout restart
  #   1: Reveal secrets  5: Rollback
  #   2: Deploy          6: Uninstall
  #   3: Force redeploy
  MENU_ITEMS=(
    "${OP_STATUS}"
    "${OP_REVEAL_SECRETS}"
    "${OP_DEPLOY}"
    "${OP_FORCE_REDEPLOY}"
    "${OP_ROLLOUT_RESTART}"
    "${OP_ROLLBACK}"
    "${OP_UNINSTALL}"
  )
  MENU_DESCS=(
    "${OP_STATUS_DESC}"
    "${OP_REVEAL_SECRETS_DESC}"
    "${OP_DEPLOY_DESC}"
    "${OP_FORCE_REDEPLOY_DESC}"
    "${OP_ROLLOUT_RESTART_DESC}"
    "${OP_ROLLBACK_DESC}"
    "${OP_UNINSTALL_DESC}"
  )
  MENU_CHECKED=(0 0 1 0 0 0 0)

  printf "  %s:\n" "$(clr_bold "${OP_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${OP_HINT}")"
  interactive_multiselect
  echo ""

  local any_selected=0
  for c in "${MENU_CHECKED[@]}"; do
    [[ "${c}" -eq 1 ]] && { any_selected=1; break; }
  done
  if [[ "${any_selected}" -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_dim "${OP_NONE_SELECTED}")"; exit 0
  fi

  # Execute selected operations in display order
  [[ "${MENU_CHECKED[0]}" -eq 1 ]] && do_status          "${app_name}" "${namespace}"
  [[ "${MENU_CHECKED[1]}" -eq 1 ]] && do_reveal_secrets  "${app_name}" "${namespace}"
  [[ "${MENU_CHECKED[2]}" -eq 1 ]] && do_deploy          "${app_name}" "${namespace}" "${auto_yes}" 0 "${repo_root}"
  [[ "${MENU_CHECKED[3]}" -eq 1 ]] && do_deploy          "${app_name}" "${namespace}" "${auto_yes}" 1 "${repo_root}"
  [[ "${MENU_CHECKED[4]}" -eq 1 ]] && do_rollout_restart "${app_name}" "${namespace}"
  [[ "${MENU_CHECKED[5]}" -eq 1 ]] && do_rollback        "${app_name}" "${namespace}" "${auto_yes}"
  [[ "${MENU_CHECKED[6]}" -eq 1 ]] && do_uninstall       "${app_name}" "${namespace}" "${auto_yes}"

  echo ""
  printf "  %s\n\n" "$(clr_bold_green "✓ ${ALL_DONE}")"
}

main "$@"
