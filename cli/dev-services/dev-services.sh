#!/usr/bin/env bash
# dev-services.sh
#
# Interactive local Docker service manager for dev environments.
# Spawns prod-like containers (Redis, Celery worker, Celery beat) per app so
# features that need a broker/worker can be tested locally without a cluster.
#
# Flow:
#   1. Pick an app (only apps that need a container are shown).
#   2. Pick a lifecycle action: Status, Start, Stop, Restart, Logs, Remove, Purge.
#
# Services are auto-detected from each app:
#   - redis : "redis" in requirements.txt (django-redis / celery[redis])
#   - worker: <project>/celery.py exists  (or a worker template in helm/)
#   - beat  : a beat template exists in helm/templates/
#
# When a Redis container is created, the app's .env REDIS_URL (and
# CELERY_BROKER_URL / CELERY_RESULT_BACKEND if present) is pointed at the
# local container; the original .env is backed up to .env.dev-services.bak.
#
# Run: bash cli/dev-services/dev-services.sh [app-name] [-y]

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
    WELCOME="Servicios de Desarrollo"
    SUBTITLE="Gestiona contenedores Docker locales tipo producción."
    DOCKER_MISSING="docker no está instalado o no está en PATH."
    DOCKER_DOWN="El demonio de Docker no está corriendo."
    APP_PROMPT="Selecciona la aplicación"
    APP_NOT_FOUND="No se encontraron apps que requieran contenedores."
    APP_INVALID="App no encontrada"
    SERVICES_LABEL="Servicios detectados"
    OP_PROMPT="Selecciona una acción"
    OP_STATUS="Estado"
    OP_STATUS_DESC="Muestra los contenedores de la app y su estado"
    OP_START="Crear / Iniciar"
    OP_START_DESC="Crea los contenedores faltantes e inicia los detenidos"
    OP_STOP="Detener"
    OP_STOP_DESC="Detiene los contenedores en ejecución (sin borrarlos)"
    OP_RESTART="Reiniciar"
    OP_RESTART_DESC="Reinicia los contenedores de la app"
    OP_LOGS="Ver logs"
    OP_LOGS_DESC="Sigue los logs de un servicio (Ctrl+C para salir)"
    OP_REMOVE="Eliminar"
    OP_REMOVE_DESC="Borra los contenedores y la red (conserva los volúmenes)"
    OP_PURGE="Purgar"
    OP_PURGE_DESC="Borra contenedores, red, volúmenes y restaura el .env"
    SUMMARY_TITLE="Resumen"
    SUMMARY_APP="Aplicación"
    SUMMARY_ACTION="Acción"
    SUMMARY_NETWORK="Red"
    SUMMARY_REDIS_PORT="Puerto Redis"
    CONFIRM_PROMPT="¿Continuar? [s/n]"
    CONFIRM_YES_CHARS="sy"
    CANCELLED="Cancelado."
    NO_CONTAINERS="No hay contenedores para esta app."
    NET_CREATED="Red creada"
    REDIS_CREATED="Redis creado"
    REDIS_STARTED="Redis iniciado"
    WORKER_CREATED="Worker de Celery creado"
    WORKER_STARTED="Worker de Celery iniciado"
    BEAT_CREATED="Beat de Celery creado"
    BEAT_STARTED="Beat de Celery iniciado"
    ALREADY_RUNNING="ya está en ejecución"
    STOPPED_MSG="detenido"
    RESTARTED_MSG="reiniciado"
    REMOVED_MSG="eliminado"
    ENV_WIRED="Se actualizó .env (REDIS_URL apunta al contenedor local)"
    ENV_BACKED_UP="Respaldo de .env creado"
    ENV_RESTORED="Se restauró .env desde el respaldo"
    LOGS_PICK="Selecciona el servicio para ver sus logs"
    LOGS_HINT="Ctrl+C para dejar de seguir los logs"
    PURGE_CONFIRM="Esto borrará TODO (contenedores, red, volúmenes) de \"%s\". ¿Continuar?"
    BUILD_HINT="La primera vez se instalan las dependencias de Celery; puede tardar."
    VENV_BUILDING="Instalando dependencias de Celery (una sola vez)…"
    VENV_READY="Dependencias de Celery listas"
    ALL_DONE="¡Todo listo!"
    SVC_REDIS="Redis"
    SVC_WORKER="Worker de Celery"
    SVC_BEAT="Beat de Celery"
  else
    WELCOME="Dev Services"
    SUBTITLE="Manage local production-like Docker containers per app."
    DOCKER_MISSING="docker is not installed or not in PATH."
    DOCKER_DOWN="The Docker daemon is not running."
    APP_PROMPT="Select application"
    APP_NOT_FOUND="No apps requiring containers were found."
    APP_INVALID="App not found"
    SERVICES_LABEL="Detected services"
    OP_PROMPT="Select an action"
    OP_STATUS="Status"
    OP_STATUS_DESC="Show the app's containers and their state"
    OP_START="Create / Start"
    OP_START_DESC="Create missing containers and start stopped ones"
    OP_STOP="Stop"
    OP_STOP_DESC="Stop running containers (without removing them)"
    OP_RESTART="Restart"
    OP_RESTART_DESC="Restart the app's containers"
    OP_LOGS="View logs"
    OP_LOGS_DESC="Follow a service's logs (Ctrl+C to exit)"
    OP_REMOVE="Remove"
    OP_REMOVE_DESC="Delete the containers and network (keeps volumes)"
    OP_PURGE="Purge"
    OP_PURGE_DESC="Delete containers, network, volumes and restore .env"
    SUMMARY_TITLE="Summary"
    SUMMARY_APP="App"
    SUMMARY_ACTION="Action"
    SUMMARY_NETWORK="Network"
    SUMMARY_REDIS_PORT="Redis port"
    CONFIRM_PROMPT="Proceed? [y/n]"
    CONFIRM_YES_CHARS="y"
    CANCELLED="Cancelled."
    NO_CONTAINERS="No containers exist for this app."
    NET_CREATED="Network created"
    REDIS_CREATED="Redis created"
    REDIS_STARTED="Redis started"
    WORKER_CREATED="Celery worker created"
    WORKER_STARTED="Celery worker started"
    BEAT_CREATED="Celery beat created"
    BEAT_STARTED="Celery beat started"
    ALREADY_RUNNING="already running"
    STOPPED_MSG="stopped"
    RESTARTED_MSG="restarted"
    REMOVED_MSG="removed"
    ENV_WIRED="Updated .env (REDIS_URL points at the local container)"
    ENV_BACKED_UP="Backed up .env"
    ENV_RESTORED="Restored .env from backup"
    LOGS_PICK="Select the service to view logs for"
    LOGS_HINT="Ctrl+C to stop following logs"
    PURGE_CONFIRM="This deletes EVERYTHING (containers, network, volumes) for \"%s\". Proceed?"
    BUILD_HINT="On first run the Celery dependencies are installed; this may take a while."
    VENV_BUILDING="Installing Celery dependencies (one-off)…"
    VENV_READY="Celery dependencies ready"
    ALL_DONE="All done!"
    SVC_REDIS="Redis"
    SVC_WORKER="Celery worker"
    SVC_BEAT="Celery beat"
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
# Input:  MENU_ITEMS[], optional MENU_DESCS[]
# Output: MENU_SELECTED (index)

interactive_select() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0
  local has_desc=0
  [[ "${#MENU_DESCS[@]}" -gt 0 ]] && has_desc=1
  local lpi=1
  [[ "${has_desc}" -eq 1 ]] && lpi=2

  render_select() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 40)"
      local ptr label_str
      if [[ $j -eq $cursor ]]; then
        ptr="$(clr_cyan '▶')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        ptr=" "
        label_str="${lbl}"
      fi
      printf "  %s  %s\n" "${ptr}" "${label_str}"
      if [[ "${has_desc}" -eq 1 ]]; then printf "      %s\n" "$(clr_dim "${MENU_DESCS[$j]:-}")"; fi
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
        printf "\033[%dA" $((num * lpi)); render_select
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num ))
        printf "\033[%dA" $((num * lpi)); render_select
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

lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

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

read_file_value() {
  local file="$1" key="$2"
  grep -m1 "^${key}=" "${file}" 2>/dev/null | cut -d= -f2- || true
}

# Set (or append) KEY=VALUE in an env file, preserving the rest.
set_env_var() {
  local file="$1" key="$2" value="$3"
  [[ -f "${file}" ]] || : > "${file}"
  if grep -qE "^${key}=" "${file}" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    awk -v k="${key}" -v v="${value}" \
      'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' "${file}" > "${tmp}"
    mv "${tmp}" "${file}"
  else
    # Ensure the file ends with a newline before appending a new key.
    [[ -s "${file}" && -n "$(tail -c1 "${file}")" ]] && printf '\n' >> "${file}"
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

container_exists() { docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$1"; }
container_running() { docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$1"; }
network_exists() { docker network ls --format '{{.Name}}' 2>/dev/null | grep -qx "$1"; }
volume_exists() { docker volume ls --format '{{.Name}}' 2>/dev/null | grep -qx "$1"; }

ok()   { printf "  %s %s\n" "$(clr_bold_green '✓')" "$*"; }
warn() { printf "  %s %s\n" "$(clr_bold_yellow '→')" "$*"; }
err()  { printf "  %s %s\n" "$(clr_bold_red '✗')" "$*"; }

# ── Service detection ─────────────────────────────────────────────────────────
# Sets, for a given app dir, the globals:
#   SVC_HAS_REDIS, SVC_HAS_WORKER, SVC_HAS_BEAT  (0/1)
#   APP_PKG (django project package, e.g. edge_folio_api)

detect_services() {
  local app_dir="$1"
  SVC_HAS_REDIS=0; SVC_HAS_WORKER=0; SVC_HAS_BEAT=0; APP_PKG=""

  local req="${app_dir}/requirements.txt"
  [[ -f "${req}" ]] || return 0

  grep -qiE '(^|[^a-z])redis|celery\[redis\]|django-redis' "${req}" 2>/dev/null && SVC_HAS_REDIS=1

  # Celery worker: a celery.py in the project package, or a worker helm template.
  # (|| true keeps the pipeline from tripping `set -e`/pipefail on no match.)
  local celery_py
  celery_py="$(find "${app_dir}" -maxdepth 2 -name celery.py 2>/dev/null | grep -v '/venv/' | head -1 || true)"
  if [[ -n "${celery_py}" ]] || ls "${app_dir}/helm/templates" 2>/dev/null | grep -qiE 'worker'; then
    SVC_HAS_WORKER=1
  fi

  # Celery beat: a beat helm template.
  ls "${app_dir}/helm/templates" 2>/dev/null | grep -qiE 'beat' && SVC_HAS_BEAT=1

  # Django project package, from manage.py DJANGO_SETTINGS_MODULE.
  if [[ -f "${app_dir}/manage.py" ]]; then
    APP_PKG="$(grep -oE "DJANGO_SETTINGS_MODULE'[, ]*'[^']+'" "${app_dir}/manage.py" 2>/dev/null \
      | head -1 | grep -oE "'[^']+\.settings'" | tr -d "'" | sed 's/\.settings$//' || true)"
  fi
}

app_needs_container() {
  detect_services "$1"
  [[ "${SVC_HAS_REDIS}" -eq 1 || "${SVC_HAS_WORKER}" -eq 1 || "${SVC_HAS_BEAT}" -eq 1 ]]
}

# Deterministic Redis host port: 6379 + index among redis-needing apps (sorted).
redis_port_for() {
  local target="$1" repo_root="$2"
  local idx=0 i=0 d name
  for d in "${repo_root}/apps"/*/; do
    name="$(basename "${d}")"
    detect_services "${d%/}"
    [[ "${SVC_HAS_REDIS}" -eq 1 ]] || continue
    if [[ "${name}" == "${target}" ]]; then idx="${i}"; break; fi
    i=$((i + 1))
  done
  echo $((6379 + idx))
}

# ── Operations ────────────────────────────────────────────────────────────────

ensure_network() {
  local net="$1"
  if ! network_exists "${net}"; then
    docker network create "${net}" >/dev/null && ok "${NET_CREATED}: ${net}"
  fi
}

# Build the redis:// URL for a given host. Embeds password when set.
redis_url() {
  local host="$1" port="$2" pw="$3"
  if [[ -n "${pw}" ]]; then
    echo "redis://:${pw}@${host}:${port}/0"
  else
    echo "redis://${host}:${port}/0"
  fi
}

wire_env() {
  local app_dir="$1" url="$2"
  local env_file="${app_dir}/.env"
  local backup="${app_dir}/.env.dev-services.bak"

  [[ -f "${env_file}" ]] || cp "${app_dir}/env.example" "${env_file}" 2>/dev/null || : > "${env_file}"

  if [[ ! -f "${backup}" ]]; then
    cp "${env_file}" "${backup}" && ok "${ENV_BACKED_UP}: .env.dev-services.bak"
  fi

  set_env_var "${env_file}" "REDIS_URL" "${url}"
  grep -qE '^CELERY_BROKER_URL=' "${env_file}"  && set_env_var "${env_file}" "CELERY_BROKER_URL"  "${url}"
  grep -qE '^CELERY_RESULT_BACKEND=' "${env_file}" && set_env_var "${env_file}" "CELERY_RESULT_BACKEND" "${url}"
  ok "${ENV_WIRED}"
}

start_redis() {
  local app="$1" app_dir="$2" net="$3" port="$4" pw="$5"
  local name="${app}-redis"
  if container_exists "${name}"; then
    if container_running "${name}"; then
      warn "${SVC_REDIS} ${ALREADY_RUNNING} (${name})"
    else
      docker start "${name}" >/dev/null && ok "${REDIS_STARTED} (${name})"
    fi
  else
    local -a args=(redis:7-alpine)
    [[ -n "${pw}" ]] && args=(redis:7-alpine redis-server --requirepass "${pw}")
    docker run -d --name "${name}" --network "${net}" -p "${port}:6379" \
      --restart unless-stopped "${args[@]}" >/dev/null \
      && ok "${REDIS_CREATED} (${name}) → localhost:${port}"
  fi
  wire_env "${app_dir}" "$(redis_url localhost "${port}" "${pw}")"
}

# True when the shared venv volume already has Celery installed.
celery_venv_ready() {
  docker run --rm -v "${1}:/venv" python:3.12-slim test -x /venv/bin/celery 2>/dev/null
}

# Build the shared Celery venv once (serialized) so worker/beat boot instantly
# and never race to install into the same volume.
build_celery_venv() {
  local app_dir="$1" venv_vol="$2" pip_vol="$3"
  warn "${VENV_BUILDING}"
  # shellcheck disable=SC2016
  docker run --rm \
    -e DEBIAN_FRONTEND=noninteractive \
    -v "${app_dir}:/app:ro" -w /app \
    -v "${venv_vol}:/venv" -v "${pip_vol}:/root/.cache/pip" \
    python:3.12-slim \
    sh -c 'set -e
      apt-get update -qq >/dev/null 2>&1 \
        && apt-get install -y -qq --no-install-recommends build-essential libpq-dev >/dev/null 2>&1 || true
      python -m venv /venv
      /venv/bin/pip install -q --upgrade pip
      /venv/bin/pip install -q -r requirements.txt' \
    && ok "${VENV_READY}"
}

# Generic Celery container (worker | beat). Assumes the venv is already built.
start_celery() {
  local app="$1" app_dir="$2" net="$3" pkg="$4" mode="$5" pw="$6"
  local name="${app}-${mode}"
  local created_msg started_msg
  if [[ "${mode}" == "worker" ]]; then
    created_msg="${WORKER_CREATED}"; started_msg="${WORKER_STARTED}"
  else
    created_msg="${BEAT_CREATED}"; started_msg="${BEAT_STARTED}"
  fi

  if container_exists "${name}"; then
    if container_running "${name}"; then
      warn "${name} ${ALREADY_RUNNING}"
    else
      docker start "${name}" >/dev/null && ok "${started_msg} (${name})"
    fi
    return 0
  fi

  local cmd
  if [[ "${mode}" == "worker" ]]; then
    cmd="celery -A ${pkg} worker --loglevel=info --concurrency=2"
  else
    cmd="celery -A ${pkg} beat --loglevel=info --scheduler=celery.beat:PersistentScheduler"
  fi

  local venv_vol="${app}-venv" pip_vol="${app}-pip"
  local broker; broker="$(redis_url "${app}-redis" 6379 "${pw}")"

  docker run -d --name "${name}" --network "${net}" \
    --env-file "${app_dir}/.env" \
    -e "REDIS_URL=${broker}" \
    -e "CELERY_BROKER_URL=${broker}" \
    -e "CELERY_RESULT_BACKEND=${broker}" \
    -e "DJANGO_SETTINGS_MODULE=${pkg}.settings" \
    -v "${app_dir}:/app" -w /app \
    -v "${venv_vol}:/venv" -v "${pip_vol}:/root/.cache/pip" \
    --restart unless-stopped \
    python:3.12-slim \
    /venv/bin/${cmd} >/dev/null \
    && ok "${created_msg} (${name})"
}

do_status() {
  local app="$1"
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_STATUS} ──")"
  local rows
  rows="$(docker ps -a --filter "name=^${app}-" \
    --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null)"
  if [[ "$(printf '%s\n' "${rows}" | wc -l)" -le 1 ]]; then
    printf "  %s\n" "$(clr_dim "${NO_CONTAINERS}")"
  else
    printf '%s\n' "${rows}" | sed 's/^/  /'
  fi
  echo ""
}

do_start() {
  local app="$1" app_dir="$2" net="$3" port="$4" pw="$5" pkg="$6"
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_START} ──")"
  ensure_network "${net}"
  [[ "${SVC_HAS_REDIS}" -eq 1 ]]  && start_redis  "${app}" "${app_dir}" "${net}" "${port}" "${pw}"

  # Build the shared Celery venv once before starting worker/beat.
  if [[ "${SVC_HAS_WORKER}" -eq 1 || "${SVC_HAS_BEAT}" -eq 1 ]]; then
    local venv_vol="${app}-venv" pip_vol="${app}-pip"
    if ! celery_venv_ready "${venv_vol}"; then
      printf "  %s\n" "$(clr_dim "${BUILD_HINT}")"
      build_celery_venv "${app_dir}" "${venv_vol}" "${pip_vol}"
    fi
  fi

  [[ "${SVC_HAS_WORKER}" -eq 1 ]] && start_celery "${app}" "${app_dir}" "${net}" "${pkg}" worker "${pw}"
  [[ "${SVC_HAS_BEAT}" -eq 1 ]]   && start_celery "${app}" "${app_dir}" "${net}" "${pkg}" beat   "${pw}"
  return 0
}

do_stop() {
  local app="$1"
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_STOP} ──")"
  local names; names="$(docker ps --filter "name=^${app}-" --format '{{.Names}}' 2>/dev/null)"
  if [[ -z "${names}" ]]; then printf "  %s\n" "$(clr_dim "${NO_CONTAINERS}")"; return 0; fi
  local n
  for n in ${names}; do docker stop "${n}" >/dev/null && ok "${n} ${STOPPED_MSG}"; done
}

do_restart() {
  local app="$1"
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_RESTART} ──")"
  local names; names="$(docker ps -a --filter "name=^${app}-" --format '{{.Names}}' 2>/dev/null)"
  if [[ -z "${names}" ]]; then printf "  %s\n" "$(clr_dim "${NO_CONTAINERS}")"; return 0; fi
  local n
  for n in ${names}; do docker restart "${n}" >/dev/null && ok "${n} ${RESTARTED_MSG}"; done
}

do_logs() {
  local app="$1"
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_LOGS} ──")"
  local -a names=()
  while IFS= read -r n; do [[ -n "${n}" ]] && names+=("${n}"); done \
    < <(docker ps -a --filter "name=^${app}-" --format '{{.Names}}' 2>/dev/null | sort)
  if [[ "${#names[@]}" -eq 0 ]]; then printf "  %s\n" "$(clr_dim "${NO_CONTAINERS}")"; return 0; fi

  local target="${names[0]}"
  if [[ "${#names[@]}" -gt 1 ]]; then
    printf "  %s:\n\n" "$(clr_bold "${LOGS_PICK}")"
    MENU_ITEMS=("${names[@]}"); MENU_DESCS=(); MENU_SELECTED=0
    interactive_select
    target="${names[${MENU_SELECTED}]}"
    echo ""
  fi
  printf "  %s\n\n" "$(clr_dim "${LOGS_HINT}")"
  docker logs -f --tail 100 "${target}" || true
}

do_remove() {
  local app="$1" net="$2"
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_REMOVE} ──")"
  local names; names="$(docker ps -a --filter "name=^${app}-" --format '{{.Names}}' 2>/dev/null)"
  if [[ -z "${names}" ]]; then
    printf "  %s\n" "$(clr_dim "${NO_CONTAINERS}")"
  else
    local n
    for n in ${names}; do docker rm -f "${n}" >/dev/null && ok "${n} ${REMOVED_MSG}"; done
  fi
  if network_exists "${net}"; then
    docker network rm "${net}" >/dev/null 2>&1 && ok "${net} ${REMOVED_MSG}"
  fi
}

do_purge() {
  local app="$1" app_dir="$2" net="$3" auto_yes="$4"
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${OP_PURGE} ──")"

  local prompt_text; printf -v prompt_text "${PURGE_CONFIRM}" "${app}"
  if ! confirm_step "${prompt_text}" "${CONFIRM_YES_CHARS}" "${auto_yes}"; then
    printf "\n  %s\n" "${CANCELLED}"; return 0
  fi
  echo ""

  local names; names="$(docker ps -a --filter "name=^${app}-" --format '{{.Names}}' 2>/dev/null)"
  local n
  for n in ${names}; do docker rm -f "${n}" >/dev/null && ok "${n} ${REMOVED_MSG}"; done
  network_exists "${net}" && docker network rm "${net}" >/dev/null 2>&1 && ok "${net} ${REMOVED_MSG}"

  local v
  for v in "${app}-venv" "${app}-pip"; do
    volume_exists "${v}" && docker volume rm "${v}" >/dev/null 2>&1 && ok "${v} ${REMOVED_MSG}"
  done

  local backup="${app_dir}/.env.dev-services.bak"
  if [[ -f "${backup}" ]]; then
    mv "${backup}" "${app_dir}/.env" && ok "${ENV_RESTORED}"
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

  local lang="en"
  if [[ "${auto_yes}" -eq 0 ]]; then
    printf "  Select language / Selecciona idioma [en/es] (en): "
    local raw_lang; read -r raw_lang || true
    [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  fi
  setup_strings "${lang}"

  clear
  print_header

  if ! command -v docker &>/dev/null; then
    err "${DOCKER_MISSING}"; echo ""; exit 1
  fi
  if ! docker info &>/dev/null; then
    err "${DOCKER_DOWN}"; echo ""; exit 1
  fi

  local script_dir repo_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  # Discover apps that need a container.
  local -a APP_NAMES=() APP_DIRS=()
  local d
  for d in "${repo_root}/apps"/*/; do
    [[ -d "${d}" ]] || continue
    if app_needs_container "${d%/}"; then
      APP_NAMES+=("$(basename "${d}")")
      APP_DIRS+=("${d%/}")
    fi
  done

  if [[ ${#APP_NAMES[@]} -eq 0 ]]; then
    err "${APP_NOT_FOUND}"; echo ""; exit 1
  fi

  # App selection.
  local app_name="" app_dir=""
  if [[ -n "${app_arg}" ]]; then
    local i
    for i in "${!APP_NAMES[@]}"; do
      if [[ "${APP_NAMES[$i]}" == "${app_arg}" ]]; then
        app_name="${APP_NAMES[$i]}"; app_dir="${APP_DIRS[$i]}"; break
      fi
    done
    if [[ -z "${app_name}" ]]; then
      err "${APP_INVALID}: \"${app_arg}\""; echo ""; exit 1
    fi
  else
    printf "  %s:\n\n" "$(clr_bold "${APP_PROMPT}")"
    MENU_ITEMS=("${APP_NAMES[@]}"); MENU_DESCS=(); MENU_SELECTED=0
    interactive_select
    app_name="${APP_NAMES[${MENU_SELECTED}]}"
    app_dir="${APP_DIRS[${MENU_SELECTED}]}"
    echo ""
  fi

  detect_services "${app_dir}"
  local net="${app_name}-dev"
  local port; port="$(redis_port_for "${app_name}" "${repo_root}")"
  local pw; pw="$(read_file_value "${app_dir}/.env" "REDIS_PASSWORD")"
  [[ -z "${pw}" ]] && pw="$(read_file_value "${app_dir}/env.example" "REDIS_PASSWORD")"

  # Show detected services.
  local -a svc_list=()
  [[ "${SVC_HAS_REDIS}" -eq 1 ]]  && svc_list+=("${SVC_REDIS}")
  [[ "${SVC_HAS_WORKER}" -eq 1 ]] && svc_list+=("${SVC_WORKER}")
  [[ "${SVC_HAS_BEAT}" -eq 1 ]]   && svc_list+=("${SVC_BEAT}")
  printf "  %-18s %s\n" "$(clr_dim "${SERVICES_LABEL}:")" "$(clr_bold "$(IFS=', '; echo "${svc_list[*]}")")"
  [[ "${SVC_HAS_REDIS}" -eq 1 ]] && \
    printf "  %-18s %s\n" "$(clr_dim "${SUMMARY_REDIS_PORT}:")" "localhost:${port}"
  printf "  %-18s %s\n\n" "$(clr_dim "${SUMMARY_NETWORK}:")" "${net}"

  # Action selection.
  printf "  %s:\n\n" "$(clr_bold "${OP_PROMPT}")"
  MENU_ITEMS=(
    "${OP_STATUS}" "${OP_START}" "${OP_STOP}"
    "${OP_RESTART}" "${OP_LOGS}" "${OP_REMOVE}" "${OP_PURGE}"
  )
  MENU_DESCS=(
    "${OP_STATUS_DESC}" "${OP_START_DESC}" "${OP_STOP_DESC}"
    "${OP_RESTART_DESC}" "${OP_LOGS_DESC}" "${OP_REMOVE_DESC}" "${OP_PURGE_DESC}"
  )
  MENU_SELECTED=0
  interactive_select
  echo ""

  case "${MENU_SELECTED}" in
    0) do_status  "${app_name}" ;;
    1) do_start   "${app_name}" "${app_dir}" "${net}" "${port}" "${pw}" "${APP_PKG}" ;;
    2) do_stop    "${app_name}" ;;
    3) do_restart "${app_name}" ;;
    4) do_logs    "${app_name}" ;;
    5) do_remove  "${app_name}" "${net}" ;;
    6) do_purge   "${app_name}" "${app_dir}" "${net}" "${auto_yes}" ;;
  esac

  echo ""
  printf "  %s\n\n" "$(clr_bold_green "✓ ${ALL_DONE}")"
}

main "$@"
