#!/usr/bin/env bash
# deploy-app.sh
#
# Interactive app deployment: bumps version, builds Next.js (if applicable),
# builds & pushes Docker image, then deploys with Helm.
#
# Pre-flight: validates that every key in env.example (except NAMESPACE and
# DOCKER_REGISTRY) exists in the "<app>-secrets" k8s secret before building.
#
# If no app name is passed, presents an interactive selector of apps that have
# env.example + Dockerfile + helm/.
#
# Run: bash cli/deploy-app/deploy-app.sh [app-name] [-y]

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
    WELCOME="Despliegue de Aplicación"
    SUBTITLE="Construye y despliega una app al clúster de Kubernetes."
    DOCKER_MISSING="docker no está instalado o no está en PATH."
    HELM_MISSING="helm no está instalado o no está en PATH."
    KUBECTL_MISSING="kubectl no está instalado o no está en PATH."
    PNPM_MISSING="pnpm no está instalado o no está en PATH."
    APP_PROMPT="Selecciona la aplicación"
    APP_NOT_FOUND="No se encontraron apps deployables (env.example + Dockerfile + helm/) en apps/."
    APP_INVALID="App no encontrada"
    NS_PROMPT="Namespace de Kubernetes"
    NS_REQUIRED="El namespace es requerido."
    SECRET_CHECK_TITLE="Verificando secretos de Kubernetes"
    SECRET_MISSING="Secreto no encontrado. Ejecuta setup-k8s-secrets primero."
    SECRET_KEY_MISSING="La siguiente clave falta en el secreto"
    SECRET_KEYS_MISSING="Las siguientes claves faltan en el secreto"
    SECRET_KEYS_HINT="Ejecuta setup-k8s-secrets y agrega las claves faltantes."
    SECRET_OK="Todas las claves de entorno están configuradas en el secreto."
    STEP_VERSION="[1/4] Versión"
    STEP_BUILD="[2/4] Construyendo la aplicación"
    STEP_BUILD_SKIP="Sin package.json — omitiendo pnpm build."
    STEP_DOCKER="[3/4] Imagen Docker"
    STEP_HELM="[4/4] Despliegue con Helm"
    VERSION_CURRENT="Versión actual"
    VERSION_BUMP_PROMPT="¿Actualizar versión del patch? [s/n]"
    VERSION_BUMP_YES_CHARS="sy"
    VERSION_SKIPPED="Versión sin cambios"
    BUILD_OK="Build completado."
    BUILD_FAILED="El build falló."
    DOCKER_REGISTRY_MISSING="DOCKER_REGISTRY no encontrado en el archivo .env."
    TAG_PROMPT="Tag de la imagen Docker"
    PUBLISH_PROMPT="¿Publicar imagen? [s/n]"
    PUBLISH_YES_CHARS="sy"
    PUSHING="Publicando"
    PUBLISH_OK="Imagen publicada."
    PUBLISH_FAILED="El push de Docker falló."
    DOCKER_BUILD_FAILED="El build de Docker falló."
    IMAGE_TAG_PROMPT="Tag de imagen para Helm"
    REPLICAS_PROMPT="Número de réplicas (dejar vacío para usar el valor del chart)"
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
    ALL_DONE="¡Todo listo!"
  else
    WELCOME="App Deployment"
    SUBTITLE="Build and deploy an app to the Kubernetes cluster."
    DOCKER_MISSING="docker is not installed or not in PATH."
    HELM_MISSING="helm is not installed or not in PATH."
    KUBECTL_MISSING="kubectl is not installed or not in PATH."
    PNPM_MISSING="pnpm is not installed or not in PATH."
    APP_PROMPT="Select application"
    APP_NOT_FOUND="No deployable apps (env.example + Dockerfile + helm/) found in apps/."
    APP_INVALID="App not found"
    NS_PROMPT="Kubernetes namespace"
    NS_REQUIRED="Namespace is required."
    SECRET_CHECK_TITLE="Validating Kubernetes secrets"
    SECRET_MISSING="Secret not found. Run setup-k8s-secrets first."
    SECRET_KEY_MISSING="The following key is missing from the secret"
    SECRET_KEYS_MISSING="The following keys are missing from the secret"
    SECRET_KEYS_HINT="Run setup-k8s-secrets and add the missing keys to the secret."
    SECRET_OK="All env keys are configured in the secret."
    STEP_VERSION="[1/4] Version"
    STEP_BUILD="[2/4] Building the application"
    STEP_BUILD_SKIP="No package.json — skipping pnpm build."
    STEP_DOCKER="[3/4] Docker image"
    STEP_HELM="[4/4] Helm deployment"
    VERSION_CURRENT="Current version"
    VERSION_BUMP_PROMPT="Bump patch version? [y/n]"
    VERSION_BUMP_YES_CHARS="y"
    VERSION_SKIPPED="Version unchanged"
    BUILD_OK="Build completed."
    BUILD_FAILED="Build failed."
    DOCKER_REGISTRY_MISSING="DOCKER_REGISTRY not found in .env file."
    TAG_PROMPT="Docker image tag"
    PUBLISH_PROMPT="Publish image? [y/n]"
    PUBLISH_YES_CHARS="y"
    PUSHING="Pushing"
    PUBLISH_OK="Image published."
    PUBLISH_FAILED="Docker push failed."
    DOCKER_BUILD_FAILED="Docker build failed."
    IMAGE_TAG_PROMPT="Image tag for Helm"
    REPLICAS_PROMPT="Replica count (leave empty for chart default)"
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
  MENU_SELECTED="${cursor}"
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

# Returns 0 (yes) or 1 (no). Safe to use in `if` statements under set -e.
confirm_step() {
  local prompt_text="$1" yes_chars="$2" auto_yes="${3:-0}"
  if [[ "${auto_yes}" -eq 1 ]]; then
    printf "  %s (%s): %s\n" "${prompt_text}" "${yes_chars:0:1}" "${yes_chars:0:1}"
    return 0
  fi
  printf "  %s (%s): " "${prompt_text}" "${yes_chars:0:1}"
  local val; IFS= read -r val </dev/tty || true
  val="${val:-${yes_chars:0:1}}"
  local char="${val:0:1}"; char="${char,,}"
  [[ "${yes_chars,,}" == *"${char}"* ]]
}

release_exists() {
  helm status "$1" -n "$2" &>/dev/null 2>&1
}

# ── env.example parser ────────────────────────────────────────────────────────
# Fills ENV_KEYS[] with all variable names, skipping NAMESPACE and DOCKER_REGISTRY.

parse_env_keys() {
  local file="$1"
  ENV_KEYS=()
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    if [[ "${line}" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)= ]]; then
      local k="${BASH_REMATCH[1]}"
      [[ "${k}" == "NAMESPACE" || "${k}" == "DOCKER_REGISTRY" ]] && continue
      [[ "${k}" == NEXT_PUBLIC_* ]] && continue
      [[ "${k}" == *_FILE ]] && k="${k%_FILE}"
      ENV_KEYS+=("${k}")
    fi
  done < "${file}"
}

read_file_value() {
  local file="$1" key="$2"
  grep -m1 "^${key}=" "${file}" 2>/dev/null | cut -d= -f2- || true
}

bump_version() {
  local v="$1"
  local major minor patch
  IFS='.' read -r major minor patch <<< "${v}"
  echo "${major}.${minor}.$(( patch + 1 ))"
}

read_package_version() {
  local pkg="$1"
  python3 -c "import json; print(json.load(open('${pkg}'))['version'])" 2>/dev/null \
    || grep -m1 '"version"' "${pkg}" | sed 's/.*"version": *"\([^"]*\)".*/\1/'
}

write_json_version() {
  local file="$1" version="$2"
  python3 - "${file}" "${version}" <<'PYEOF'
import json, sys
path, version = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
data['version'] = version
with open(path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
PYEOF
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  # ── CLI args ──────────────────────────────────────────────────────────────────
  local auto_yes=0 app_arg=""
  for arg in "$@"; do
    case "${arg}" in
      -y) auto_yes=1 ;;
      *)  [[ -z "${app_arg}" ]] && app_arg="${arg}" ;;
    esac
  done

  # ── Language ──────────────────────────────────────────────────────────────────
  local lang="en"
  if [[ "${auto_yes}" -eq 0 ]]; then
    printf "  Select language / Selecciona idioma [en/es] (en): "
    local raw_lang; read -r raw_lang || true
    [[ "${raw_lang,,}" == es* ]] && lang="es"
  fi
  setup_strings "${lang}"

  clear
  print_header

  # ── Tool checks ───────────────────────────────────────────────────────────────
  if ! command -v docker &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${DOCKER_MISSING}"; exit 1
  fi
  if ! command -v helm &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${HELM_MISSING}"; exit 1
  fi
  if ! command -v kubectl &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${KUBECTL_MISSING}"; exit 1
  fi
  if ! command -v pnpm &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${PNPM_MISSING}"; exit 1
  fi

  # ── Repo root ─────────────────────────────────────────────────────────────────
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  local repo_root
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  # ── Discover deployable apps ──────────────────────────────────────────────────
  local -a APP_NAMES=()
  local -a APP_DIRS=()
  for d in "${repo_root}/apps"/*/; do
    if [[ -f "${d}env.example" && -f "${d}Dockerfile" && -d "${d}helm" ]]; then
      APP_NAMES+=("$(basename "${d}")")
      APP_DIRS+=("${d%/}")
    fi
  done

  if [[ ${#APP_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${APP_NOT_FOUND}")"; exit 1
  fi

  # ── App selection ─────────────────────────────────────────────────────────────
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

  local env_example="${app_dir}/env.example"
  local env_file="${app_dir}/.env"
  local pkg_json="${app_dir}/package.json"
  local manifest_json="${app_dir}/public/manifest.json"

  # ── Namespace ─────────────────────────────────────────────────────────────────
  local ns_default
  ns_default="$(read_file_value "${env_example}" "NAMESPACE")"

  local namespace
  namespace="$(prompt_visible "${NS_PROMPT}" "${ns_default}")"
  echo ""

  if [[ -z "${namespace}" ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${NS_REQUIRED}")"; exit 1
  fi

  # ── [pre] Secret pre-flight check ─────────────────────────────────────────────
  local secret_name="${app_name}-secrets"

  echo ""
  printf "  %s\n" "$(clr_bold_cyan "── ${SECRET_CHECK_TITLE} ──")"
  printf "  %-14s %s\n\n" "$(clr_dim 'Secret:')" "$(clr_cyan "${secret_name}")"

  if ! kubectl get secret "${secret_name}" -n "${namespace}" &>/dev/null 2>&1; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${SECRET_MISSING}"; exit 1
  fi

  parse_env_keys "${env_example}"

  local -a secret_keys=()
  while IFS= read -r k; do
    [[ -n "${k}" ]] && secret_keys+=("${k}")
  done < <(kubectl get secret "${secret_name}" -n "${namespace}" \
    -o go-template='{{range $k,$v := .data}}{{$k}}{{"\n"}}{{end}}' 2>/dev/null)

  local -a missing_keys=()
  for k in "${ENV_KEYS[@]}"; do
    local found=0
    for sk in "${secret_keys[@]}"; do
      [[ "${sk}" == "${k}" ]] && found=1 && break
    done
    [[ "${found}" -eq 0 ]] && missing_keys+=("${k}")
  done

  if [[ ${#missing_keys[@]} -gt 0 ]]; then
    if [[ ${#missing_keys[@]} -eq 1 ]]; then
      printf "  %s %s: %s\n" "$(clr_bold_red '✗')" "${SECRET_KEY_MISSING}" "$(clr_bold "${missing_keys[0]}")"
    else
      printf "  %s %s:\n" "$(clr_bold_red '✗')" "${SECRET_KEYS_MISSING}"
      for mk in "${missing_keys[@]}"; do
        printf "      %s %s\n" "$(clr_red '•')" "${mk}"
      done
    fi
    printf "\n  %s\n\n" "$(clr_dim "${SECRET_KEYS_HINT}")"; exit 1
  fi

  printf "  %s %s\n" "$(clr_bold_green '✓')" "${SECRET_OK}"

  # ── [1/4] Version bump ────────────────────────────────────────────────────────
  local current_version="" new_version=""

  echo ""
  printf "\n  %s\n" "$(clr_bold_cyan "── ${STEP_VERSION} ──")"

  if [[ -f "${pkg_json}" ]]; then
    current_version="$(read_package_version "${pkg_json}")"
    printf "  %-14s %s\n\n" "$(clr_dim "${VERSION_CURRENT}:")" "$(clr_cyan "${current_version}")"

    if confirm_step "${VERSION_BUMP_PROMPT}" "${VERSION_BUMP_YES_CHARS}" "${auto_yes}"; then
      new_version="$(bump_version "${current_version}")"
      write_json_version "${pkg_json}" "${new_version}"
      [[ -f "${manifest_json}" ]] && write_json_version "${manifest_json}" "${new_version}"
      printf "  %s %s → %s\n" "$(clr_bold_green '✓')" "$(clr_dim "${current_version}")" "$(clr_bold "${new_version}")"
    else
      new_version="${current_version}"
      printf "  %s (%s)\n" "$(clr_dim "${VERSION_SKIPPED}")" "${new_version}"
    fi
  else
    printf "  %s\n" "$(clr_dim "${STEP_BUILD_SKIP}")"
    new_version="latest"
  fi

  # ── [2/4] pnpm build ──────────────────────────────────────────────────────────
  echo ""
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${STEP_BUILD} ──")"

  if [[ -f "${pkg_json}" ]]; then
    if ! (cd "${repo_root}" && pnpm build --filter="${app_name}"); then
      printf "\n  %s %s\n\n" "$(clr_bold_red '✗')" "${BUILD_FAILED}"; exit 1
    fi
    printf "\n  %s %s\n" "$(clr_bold_green '✓')" "${BUILD_OK}"
  else
    printf "  %s\n" "$(clr_dim "${STEP_BUILD_SKIP}")"
  fi

  # ── [3/4] Docker build + tag + push ──────────────────────────────────────────
  echo ""
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${STEP_DOCKER} ──")"

  local docker_registry=""
  if [[ -f "${env_file}" ]]; then
    docker_registry="$(read_file_value "${env_file}" "DOCKER_REGISTRY")"
  fi

  printf "  %s docker build -f apps/%s/Dockerfile -t %s:latest .\n\n" \
    "$(clr_bold_yellow '→')" "${app_name}" "${app_name}"

  if ! (cd "${repo_root}" && docker build -f "apps/${app_name}/Dockerfile" -t "${app_name}:latest" .); then
    printf "\n  %s %s\n\n" "$(clr_bold_red '✗')" "${DOCKER_BUILD_FAILED}"; exit 1
  fi

  local default_tag="${new_version}"
  local image_tag
  if [[ "${auto_yes}" -eq 1 ]]; then
    image_tag="${default_tag}"
    printf "\n  %s (%s): %s\n" "$(clr_bold "${TAG_PROMPT}")" "$(clr_dim "${default_tag}")" "${image_tag}"
  else
    echo ""
    image_tag="$(prompt_visible "${TAG_PROMPT}" "${default_tag}")"
    echo ""
  fi

  docker tag "${app_name}:latest" "${app_name}:${image_tag}"
  printf "  %s Tagged %s:%s\n" "$(clr_bold_green '✓')" "${app_name}" "${image_tag}"

  echo ""
  if confirm_step "${PUBLISH_PROMPT}" "${PUBLISH_YES_CHARS}" "${auto_yes}"; then
    if [[ -z "${docker_registry}" ]]; then
      printf "\n  %s %s\n\n" "$(clr_bold_red '✗')" "${DOCKER_REGISTRY_MISSING}"; exit 1
    fi
    local remote_image="${docker_registry}/${app_name}:${image_tag}"
    docker tag "${app_name}:${image_tag}" "${remote_image}"
    printf "\n  %s %s %s...\n\n" "$(clr_bold_yellow '→')" "${PUSHING}" "${remote_image}"
    if ! docker push "${remote_image}"; then
      printf "\n  %s %s\n\n" "$(clr_bold_red '✗')" "${PUBLISH_FAILED}"; exit 1
    fi
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${PUBLISH_OK}"
  fi

  # ── [4/4] Helm deploy ────────────────────────────────────────────────────────
  echo ""
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${STEP_HELM} ──")"

  local helm_image_tag replica_count=""
  if [[ "${auto_yes}" -eq 1 ]]; then
    helm_image_tag="${image_tag}"
    printf "  %s (%s): %s\n" "$(clr_bold "${IMAGE_TAG_PROMPT}")" "$(clr_dim "${image_tag}")" "${helm_image_tag}"
  else
    helm_image_tag="$(prompt_visible "${IMAGE_TAG_PROMPT}" "${image_tag}")"
    echo ""
    replica_count="$(prompt_visible "${REPLICAS_PROMPT}" "")"
    echo ""
  fi

  local -a set_args=()
  [[ -n "${helm_image_tag}" ]] && set_args+=(--set "image.tag=${helm_image_tag}")
  [[ -n "${replica_count}" ]]  && set_args+=(--set "replicaCount=${replica_count}")

  local helm_chart="./apps/${app_name}/helm"
  local action
  if release_exists "${app_name}" "${namespace}"; then
    action="${ACTION_UPGRADE}"
  else
    action="${ACTION_INSTALL}"
  fi

  local display_cmd="helm upgrade --install ${app_name} ${helm_chart} --namespace ${namespace} --create-namespace"
  [[ -n "${helm_image_tag}" ]] && display_cmd+=" --set image.tag=${helm_image_tag}"
  [[ -n "${replica_count}" ]]  && display_cmd+=" --set replicaCount=${replica_count}"

  local sep
  sep="$(printf '─%.0s' {1..53})"
  printf "  %s\n" "$(clr_bold_cyan "── ${SUMMARY_TITLE} ${sep:${#SUMMARY_TITLE}}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_APP}:")"       "$(clr_bold "${app_name}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_ACTION}:")"    "$(clr_bold "${action}")"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_NAMESPACE}:")" "${namespace}"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_CHART}:")"     "${helm_chart}"
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_TAG}:")"       "${helm_image_tag:-chart default}"
  [[ -n "${replica_count}" ]] && \
  printf "  %-22s %s\n" "$(clr_dim "${SUMMARY_REPLICAS}:")"  "${replica_count}"
  printf "  %s\n" "$(clr_dim "${sep}")"
  printf "  %s\n    %s\n" "$(clr_dim "${SUMMARY_COMMAND}:")" "$(clr_dim "${display_cmd}")"
  echo ""

  if ! confirm_step "${CONFIRM_PROMPT}" "${CONFIRM_YES_CHARS}" "${auto_yes}"; then
    printf "\n  %s\n\n" "${CANCELLED}"; exit 0
  fi

  echo ""
  printf "  %s %s \"%s\"...\n\n" "$(clr_bold_yellow '→')" "${DEPLOYING}" "${namespace}"

  if (cd "${repo_root}" && helm upgrade --install "${app_name}" "apps/${app_name}/helm" \
       --namespace "${namespace}" --create-namespace "${set_args[@]}"); then
    echo ""
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${DEPLOY_OK}"
    echo ""
    printf "  %s\n\n" "$(clr_bold_green "✓ ${ALL_DONE}")"
  else
    echo ""
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${DEPLOY_FAILED}"; exit 1
  fi
}

main "$@"
