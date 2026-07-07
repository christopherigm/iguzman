#!/usr/bin/env bash
# upload-s3.sh
#
# Interactive, resumable, CHUNKED uploader for the custom Garage (S3) store at
# https://s3.iguzman.com.mx (behind a CloudFlare proxy).
#
# Why chunked? CloudFlare caps a single request body at ~90 MB and the nginx
# Ingress in front of Garage is capped at 80 MB. A plain PUT of a large video
# therefore fails. This script drives rclone with a small multipart part size
# (default 50 MB, safely under both caps), so every over-the-wire request stays
# below the limits while the object itself can be any size.
#
# Features:
#   • Checks for rclone and offers to install it (apt, else the official
#     installer) before showing any menu — uses sudo, you supply the password.
#   • Credential profiles live in ./credentials/*.env next to this script and
#     are managed from the menu (add / edit / remove). Never committed to git.
#   • Lists buckets from the server; falls back to buckets remembered in the
#     profile (or manual entry) for bucket-scoped Garage keys.
#   • Upload to the bucket root or into a folder (prefix); recurses and mirrors
#     the local directory tree.
#   • Checkbox selection of top-level entries and an overall progress display.
#   • Sets the correct Content-Type on video files (mp4/mkv/mov/webm/avi/ts…) at
#     upload time so they stream / hand off to a native player instead of being
#     downloaded — independent of whether the host has an /etc/mime.types DB.
#
# Run: bash cli/upload-s3/upload-s3.sh   (or: pnpm upload-s3)

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
clr_green()       { printf "${GREEN}%s${RESET}" "$*"; }
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_yellow()      { printf "${YELLOW}%s${RESET}" "$*"; }
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow() { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

# ── Defaults ──────────────────────────────────────────────────────────────────
DEFAULT_ENDPOINT="https://s3.iguzman.com.mx"
DEFAULT_REGION="garage"
# Multipart part size in MB. Must stay below the 80 MB nginx cap AND the ~90 MB
# CloudFlare cap. rclone uploads any file larger than this as multipart, one
# part per request, so 50 MB gives comfortable headroom.
CHUNK_MB="${UPLOAD_S3_CHUNK_MB:-50}"
# Upload one file at a time. The Garage (S3) server is self-hosted, so parallel
# transfers can jam it — keep this at 1 unless the server can take more.
TRANSFERS="${UPLOAD_S3_TRANSFERS:-1}"

# rclone remote name used inside the generated temp config.
REMOTE="up"

# Video container Content-Types. rclone derives an object's Content-Type from the
# local file extension via the system MIME database (/etc/mime.types); on a host
# that lacks it (minimal containers, some macOS setups) videos upload as
# application/octet-stream, which makes browsers and Android *download* the file
# instead of streaming it or handing off to a native player. Our rclone can only
# set Content-Type at PUT time (server-side copy can't rewrite it) and
# --header-upload applies to a whole transfer, so uploads run one pass per
# container type (see upload_selection). Format: "<mime>:<ext,ext,…>" (lowercase
# extensions; both cases are matched at upload time).
VIDEO_GROUPS=(
  "video/mp4:mp4,m4v"
  "video/x-matroska:mkv"
  "video/quicktime:mov"
  "video/webm:webm"
  "video/x-msvideo:avi"
  "video/mp2t:ts,m2ts"
)

# ── i18n ──────────────────────────────────────────────────────────────────────
setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Subir a S3 (Garage) — carga por partes"
    SUBTITLE="Sube carpetas grandes evitando los límites de CloudFlare/nginx."
    RCLONE_MISSING="rclone no está instalado."
    RCLONE_INSTALL_PROMPT="¿Instalar rclone ahora? (se usará sudo) [s/n]"
    RCLONE_INSTALL_APT="Instalando rclone con apt…"
    RCLONE_INSTALL_OFFICIAL="Instalando rclone con el instalador oficial…"
    RCLONE_INSTALL_FAILED="No se pudo instalar rclone. Instálalo manualmente: https://rclone.org/install/"
    RCLONE_INSTALLED="rclone instalado correctamente."
    RCLONE_NEEDED="rclone es necesario para continuar."
    MENU_TITLE="¿Qué deseas hacer?"
    MENU_MANAGE="Gestionar credenciales"
    MENU_UPLOAD="Subir archivos"
    MENU_EXIT="Salir"
    NAV_HINT="Flechas para navegar · Enter para elegir"
    NAV_HINT_MULTI="Flechas navegar · Espacio marcar · a todos · n ninguno · Enter confirmar"
    CRED_TITLE="Gestión de credenciales"
    CRED_ADD="Agregar credencial"
    CRED_EDIT="Editar credencial"
    CRED_REMOVE="Eliminar credencial"
    CRED_BACK="Volver"
    CRED_NONE="No hay credenciales guardadas todavía."
    CRED_SELECT="Selecciona una credencial"
    CRED_NAME="Nombre del perfil (ej. garage-prod)"
    CRED_NAME_REQUIRED="El nombre del perfil es obligatorio."
    CRED_NAME_BAD="Usa solo letras, números, guiones y guiones bajos."
    CRED_ENDPOINT="Endpoint S3"
    CRED_REGION="Región"
    CRED_ACCESS="Access Key ID"
    CRED_SECRET="Secret Access Key"
    CRED_BUCKETS="Buckets conocidos (separados por comas, opcional)"
    CRED_SAVED="Credencial guardada en"
    CRED_ACCESS_REQUIRED="Access Key ID y Secret Access Key son obligatorios."
    CRED_REMOVE_CONFIRM="¿Eliminar este perfil? [s/n]"
    CRED_REMOVED="Perfil eliminado."
    CRED_EXISTS_KEEP="(dejar en blanco para conservar el valor actual)"
    UPLOAD_NO_CREDS="No hay credenciales. Agrega una primero desde «Gestionar credenciales»."
    UPLOAD_SELECT_CRED="Selecciona la credencial a usar"
    CONNECTING="Conectando a"
    CONN_OK="Conexión correcta."
    CONN_FAIL="No se pudo conectar o listar buckets con esta credencial."
    BUCKET_SELECT="Selecciona un bucket de destino"
    BUCKET_MANUAL="Escribir nombre de bucket manualmente…"
    BUCKET_PROMPT="Nombre del bucket"
    BUCKET_REQUIRED="El nombre del bucket es obligatorio."
    BUCKET_NONE_LISTED="No se pudieron listar buckets (la clave puede estar limitada a uno)."
    DEST_TITLE="¿Dónde colocar los archivos en «%s»?"
    DEST_ROOT="En la raíz del bucket"
    DEST_FOLDER="En una carpeta (prefijo)"
    PREFIX_PROMPT="Ruta de la carpeta en S3 (ej. videos/2026)"
    PREFIX_REQUIRED="La ruta de la carpeta es obligatoria."
    FOLDER_PROMPT="Ruta local de la carpeta a subir"
    FOLDER_NOT_FOUND="La carpeta no existe:"
    FOLDER_EMPTY="La carpeta no contiene archivos."
    SCANNING="Explorando"
    SELECT_ENTRIES="Selecciona qué subir"
    NOTHING_SELECTED="No seleccionaste nada. Cancelado."
    SUMMARY_TITLE="Resumen de la subida"
    SUMMARY_PROFILE="Perfil"
    SUMMARY_ENDPOINT="Endpoint"
    SUMMARY_BUCKET="Bucket"
    SUMMARY_DEST="Destino"
    SUMMARY_SOURCE="Origen"
    SUMMARY_ITEMS="Elementos"
    SUMMARY_FILES="Archivos"
    SUMMARY_SIZE="Tamaño total"
    SUMMARY_CHUNK="Tamaño de parte"
    SUMMARY_ROOT="(raíz del bucket)"
    CONFIRM_UPLOAD="¿Iniciar la subida? [s/n]"
    CANCELLED="Cancelado."
    UPLOADING="Subiendo… (Ctrl-C para abortar; puedes reanudar volviendo a ejecutar)"
    UPLOAD_DONE="Subida completada."
    UPLOAD_FAILED="La subida falló o se interrumpió. Vuelve a ejecutar para reanudar."
    YES_CHARS="sy"
  else
    WELCOME="Upload to S3 (Garage) — chunked upload"
    SUBTITLE="Upload large folders past the CloudFlare/nginx body-size caps."
    RCLONE_MISSING="rclone is not installed."
    RCLONE_INSTALL_PROMPT="Install rclone now? (sudo will be used) [y/n]"
    RCLONE_INSTALL_APT="Installing rclone with apt…"
    RCLONE_INSTALL_OFFICIAL="Installing rclone with the official installer…"
    RCLONE_INSTALL_FAILED="Could not install rclone. Install it manually: https://rclone.org/install/"
    RCLONE_INSTALLED="rclone installed successfully."
    RCLONE_NEEDED="rclone is required to continue."
    MENU_TITLE="What would you like to do?"
    MENU_MANAGE="Manage credentials"
    MENU_UPLOAD="Upload files"
    MENU_EXIT="Exit"
    NAV_HINT="Arrow keys to navigate · Enter to select"
    NAV_HINT_MULTI="Arrows move · Space toggle · a all · n none · Enter confirm"
    CRED_TITLE="Credential management"
    CRED_ADD="Add credential"
    CRED_EDIT="Edit credential"
    CRED_REMOVE="Remove credential"
    CRED_BACK="Back"
    CRED_NONE="No credentials saved yet."
    CRED_SELECT="Select a credential"
    CRED_NAME="Profile name (e.g. garage-prod)"
    CRED_NAME_REQUIRED="Profile name is required."
    CRED_NAME_BAD="Use only letters, numbers, dashes and underscores."
    CRED_ENDPOINT="S3 endpoint"
    CRED_REGION="Region"
    CRED_ACCESS="Access Key ID"
    CRED_SECRET="Secret Access Key"
    CRED_BUCKETS="Known buckets (comma-separated, optional)"
    CRED_SAVED="Credential saved to"
    CRED_ACCESS_REQUIRED="Access Key ID and Secret Access Key are required."
    CRED_REMOVE_CONFIRM="Remove this profile? [y/n]"
    CRED_REMOVED="Profile removed."
    CRED_EXISTS_KEEP="(leave blank to keep the current value)"
    UPLOAD_NO_CREDS="No credentials yet. Add one first from “Manage credentials”."
    UPLOAD_SELECT_CRED="Select the credential to use"
    CONNECTING="Connecting to"
    CONN_OK="Connection OK."
    CONN_FAIL="Could not connect or list buckets with this credential."
    BUCKET_SELECT="Select a destination bucket"
    BUCKET_MANUAL="Type a bucket name manually…"
    BUCKET_PROMPT="Bucket name"
    BUCKET_REQUIRED="Bucket name is required."
    BUCKET_NONE_LISTED="Could not list buckets (the key may be scoped to one)."
    DEST_TITLE="Where should files go in “%s”?"
    DEST_ROOT="At the bucket root"
    DEST_FOLDER="Into a folder (prefix)"
    PREFIX_PROMPT="S3 folder path (e.g. videos/2026)"
    PREFIX_REQUIRED="Folder path is required."
    FOLDER_PROMPT="Local folder path to upload"
    FOLDER_NOT_FOUND="Folder does not exist:"
    FOLDER_EMPTY="The folder contains no files."
    SCANNING="Scanning"
    SELECT_ENTRIES="Select what to upload"
    NOTHING_SELECTED="Nothing selected. Cancelled."
    SUMMARY_TITLE="Upload summary"
    SUMMARY_PROFILE="Profile"
    SUMMARY_ENDPOINT="Endpoint"
    SUMMARY_BUCKET="Bucket"
    SUMMARY_DEST="Destination"
    SUMMARY_SOURCE="Source"
    SUMMARY_ITEMS="Items"
    SUMMARY_FILES="Files"
    SUMMARY_SIZE="Total size"
    SUMMARY_CHUNK="Part size"
    SUMMARY_ROOT="(bucket root)"
    CONFIRM_UPLOAD="Start the upload? [y/n]"
    CANCELLED="Cancelled."
    UPLOADING="Uploading… (Ctrl-C to abort; re-run to resume)"
    UPLOAD_DONE="Upload complete."
    UPLOAD_FAILED="Upload failed or was interrupted. Re-run to resume."
    YES_CHARS="y"
  fi
}

# ── UI helpers ────────────────────────────────────────────────────────────────
print_header() {
  local line
  line="$(printf '─%.0s' {1..58})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-56s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-56s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

pad_right() { printf "%-${2}s" "${1}"; }
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
uc() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }

# Single-select list. Input: MENU_ITEMS[] ; Output: MENU_SELECTED (index).
interactive_select() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0

  render_select() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 54)"
      local ptr label_str
      if [[ $j -eq $cursor ]]; then
        ptr="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        ptr=" "; label_str="${lbl}"
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
        cursor=$(( (cursor - 1 + num) % num )); printf "\033[%dA" "${num}"; render_select
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num )); printf "\033[%dA" "${num}"; render_select
      fi
      continue
    fi
    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi
  done
  printf '\033[?25h'; echo ""
  MENU_SELECTED="${cursor}"
}

# Multi-select checklist. Input: MENU_ITEMS[] and MENU_CHECKED[] (0/1) ; toggles
# MENU_CHECKED[] in place.
interactive_multiselect() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0

  render_multiselect() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 52)"
      local ptr chk label_str
      if [[ $j -eq $cursor ]]; then ptr="$(clr_cyan '▶')"; else ptr=" "; fi
      if [[ "${MENU_CHECKED[$j]}" -eq 1 ]]; then
        chk="$(clr_bold_cyan '[✓]')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        chk="$(clr_dim '[ ]')"; label_str="${lbl}"
      fi
      printf "  %s  %s  %s\n" "${ptr}" "${chk}" "${label_str}"
    done
  }

  render_multiselect
  printf '\033[?25l'
  while true; do
    local key seq i
    IFS= read -r -s -n1 key 2>/dev/null || key=""
    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        cursor=$(( (cursor - 1 + num) % num )); printf "\033[%dA" "${num}"; render_multiselect
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num )); printf "\033[%dA" "${num}"; render_multiselect
      fi
      continue
    fi
    case "${key}" in
      ' ')
        MENU_CHECKED[$cursor]=$(( 1 - MENU_CHECKED[$cursor] ))
        printf "\033[%dA" "${num}"; render_multiselect ;;
      'a'|'A')
        for i in "${!MENU_ITEMS[@]}"; do MENU_CHECKED[$i]=1; done
        printf "\033[%dA" "${num}"; render_multiselect ;;
      'n'|'N')
        for i in "${!MENU_ITEMS[@]}"; do MENU_CHECKED[$i]=0; done
        printf "\033[%dA" "${num}"; render_multiselect ;;
      $'\r'|$'\n'|'') break ;;
      $'\x03'|$'\x04') printf '\033[?25h'; echo ""; exit 0 ;;
    esac
  done
  printf '\033[?25h'; echo ""
}

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
  local label="$1" hint="${2:-}"
  if [[ -n "${hint}" ]]; then
    printf "  %s %s: " "$(clr_bold "${label}")" "$(clr_dim "${hint}")" >/dev/tty
  else
    printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  fi
  local val
  IFS= read -r -s val </dev/tty || true
  echo "" >/dev/tty
  printf '%s' "${val}"
}

confirm() {
  local prompt="$1"
  local ans
  printf "  %s " "$(clr_bold "${prompt}")" >/dev/tty
  IFS= read -r ans </dev/tty || true
  ans="$(lc "${ans}")"
  [[ -n "${ans}" && "${YES_CHARS}" == *"${ans:0:1}"* ]]
}

human_size() {
  # bytes -> human readable
  local b="${1:-0}" u=(B KB MB GB TB) i=0
  while (( b >= 1024 && i < 4 )); do b=$(( b / 1024 )); i=$(( i + 1 )); done
  printf "%s %s" "${b}" "${u[$i]}"
}

# ── rclone install / check ────────────────────────────────────────────────────
ensure_rclone() {
  if command -v rclone &>/dev/null; then return 0; fi

  printf "  %s %s\n" "$(clr_bold_yellow '!')" "${RCLONE_MISSING}"
  if ! confirm "${RCLONE_INSTALL_PROMPT}"; then
    printf "  %s\n\n" "$(clr_dim "${RCLONE_NEEDED}")"
    exit 1
  fi

  if command -v apt-get &>/dev/null; then
    printf "  %s\n" "$(clr_dim "${RCLONE_INSTALL_APT}")"
    sudo apt-get update -y && sudo apt-get install -y rclone || true
  fi

  if ! command -v rclone &>/dev/null; then
    printf "  %s\n" "$(clr_dim "${RCLONE_INSTALL_OFFICIAL}")"
    if command -v curl &>/dev/null; then
      curl -fsSL https://rclone.org/install.sh | sudo bash || true
    elif command -v wget &>/dev/null; then
      wget -qO- https://rclone.org/install.sh | sudo bash || true
    fi
  fi

  if ! command -v rclone &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${RCLONE_INSTALL_FAILED}"
    exit 1
  fi
  printf "  %s %s\n" "$(clr_bold_green '✓')" "${RCLONE_INSTALLED}"
}

# ── Credential profiles (./credentials/*.env) ─────────────────────────────────
# Populated by list_profiles(): PROFILE_NAMES[] and PROFILE_FILES[].
list_profiles() {
  PROFILE_NAMES=(); PROFILE_FILES=()
  local f base
  shopt -s nullglob
  for f in "${CRED_DIR}"/*.env; do
    base="$(basename "${f}" .env)"
    PROFILE_NAMES+=("${base}"); PROFILE_FILES+=("${f}")
  done
  shopt -u nullglob
}

# Loads a profile file into S3_* vars.
load_profile() {
  S3_ENDPOINT=""; S3_REGION=""; S3_ACCESS_KEY_ID=""; S3_SECRET_ACCESS_KEY=""; S3_BUCKETS=""
  # shellcheck disable=SC1090
  source "$1"
}

write_profile() {
  local file="$1"
  umask 077
  cat > "${file}" <<EOF
# Garage S3 credential profile — managed by upload-s3.sh. Do NOT commit.
S3_ENDPOINT="${S3_ENDPOINT}"
S3_REGION="${S3_REGION}"
S3_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}"
S3_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}"
S3_BUCKETS="${S3_BUCKETS}"
EOF
  chmod 600 "${file}"
}

add_credential() {
  local name
  name="$(prompt_visible "${CRED_NAME}")"
  if [[ -z "${name}" ]]; then printf "  %s\n" "$(clr_red "${CRED_NAME_REQUIRED}")"; return; fi
  if [[ ! "${name}" =~ ^[A-Za-z0-9_-]+$ ]]; then printf "  %s\n" "$(clr_red "${CRED_NAME_BAD}")"; return; fi

  S3_ENDPOINT="$(prompt_visible "${CRED_ENDPOINT}" "${DEFAULT_ENDPOINT}")"
  S3_REGION="$(prompt_visible "${CRED_REGION}" "${DEFAULT_REGION}")"
  S3_ACCESS_KEY_ID="$(prompt_visible "${CRED_ACCESS}")"
  S3_SECRET_ACCESS_KEY="$(prompt_secret "${CRED_SECRET}")"
  if [[ -z "${S3_ACCESS_KEY_ID}" || -z "${S3_SECRET_ACCESS_KEY}" ]]; then
    printf "  %s\n" "$(clr_red "${CRED_ACCESS_REQUIRED}")"; return
  fi
  S3_BUCKETS="$(prompt_visible "${CRED_BUCKETS}")"

  write_profile "${CRED_DIR}/${name}.env"
  printf "  %s %s %s\n" "$(clr_bold_green '✓')" "${CRED_SAVED}" "$(clr_dim "${CRED_DIR}/${name}.env")"
}

edit_credential() {
  list_profiles
  if [[ ${#PROFILE_NAMES[@]} -eq 0 ]]; then printf "  %s\n" "$(clr_dim "${CRED_NONE}")"; return; fi
  MENU_ITEMS=("${PROFILE_NAMES[@]}")
  printf "  %s\n\n" "$(clr_dim "${CRED_SELECT} · ${NAV_HINT}")"
  interactive_select
  local file="${PROFILE_FILES[$MENU_SELECTED]}"
  load_profile "${file}"

  S3_ENDPOINT="$(prompt_visible "${CRED_ENDPOINT}" "${S3_ENDPOINT:-$DEFAULT_ENDPOINT}")"
  S3_REGION="$(prompt_visible "${CRED_REGION}" "${S3_REGION:-$DEFAULT_REGION}")"
  S3_ACCESS_KEY_ID="$(prompt_visible "${CRED_ACCESS}" "${S3_ACCESS_KEY_ID}")"
  local newsecret
  newsecret="$(prompt_secret "${CRED_SECRET}" "${CRED_EXISTS_KEEP}")"
  [[ -n "${newsecret}" ]] && S3_SECRET_ACCESS_KEY="${newsecret}"
  S3_BUCKETS="$(prompt_visible "${CRED_BUCKETS}" "${S3_BUCKETS}")"

  write_profile "${file}"
  printf "  %s %s %s\n" "$(clr_bold_green '✓')" "${CRED_SAVED}" "$(clr_dim "${file}")"
}

remove_credential() {
  list_profiles
  if [[ ${#PROFILE_NAMES[@]} -eq 0 ]]; then printf "  %s\n" "$(clr_dim "${CRED_NONE}")"; return; fi
  MENU_ITEMS=("${PROFILE_NAMES[@]}")
  printf "  %s\n\n" "$(clr_dim "${CRED_SELECT} · ${NAV_HINT}")"
  interactive_select
  local file="${PROFILE_FILES[$MENU_SELECTED]}"
  if confirm "${CRED_REMOVE_CONFIRM}"; then
    rm -f "${file}"
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${CRED_REMOVED}"
  fi
}

manage_credentials() {
  while true; do
    echo ""
    printf "  %s\n\n" "$(clr_bold_cyan "${CRED_TITLE}")"
    list_profiles
    if [[ ${#PROFILE_NAMES[@]} -gt 0 ]]; then
      local p
      for p in "${PROFILE_NAMES[@]}"; do printf "    %s %s\n" "$(clr_dim '•')" "${p}"; done
      echo ""
    else
      printf "  %s\n\n" "$(clr_dim "${CRED_NONE}")"
    fi
    MENU_ITEMS=("${CRED_ADD}" "${CRED_EDIT}" "${CRED_REMOVE}" "${CRED_BACK}")
    printf "  %s\n\n" "$(clr_dim "${NAV_HINT}")"
    interactive_select
    case "${MENU_SELECTED}" in
      0) add_credential ;;
      1) edit_credential ;;
      2) remove_credential ;;
      3) return ;;
    esac
  done
}

# ── rclone config + bucket listing ────────────────────────────────────────────
# Writes a mode-600 temp rclone config for the loaded S3_* profile so secrets
# never appear in the process argument list. Cleaned up by the EXIT trap.
RCLONE_CFG=""
cleanup() { [[ -n "${RCLONE_CFG}" && -f "${RCLONE_CFG}" ]] && rm -f "${RCLONE_CFG}"; }
trap cleanup EXIT

make_rclone_config() {
  RCLONE_CFG="$(mktemp "${TMPDIR:-/tmp}/upload-s3.XXXXXX.conf")"
  chmod 600 "${RCLONE_CFG}"
  cat > "${RCLONE_CFG}" <<EOF
[${REMOTE}]
type = s3
provider = Other
access_key_id = ${S3_ACCESS_KEY_ID}
secret_access_key = ${S3_SECRET_ACCESS_KEY}
endpoint = ${S3_ENDPOINT}
region = ${S3_REGION:-$DEFAULT_REGION}
force_path_style = true
upload_cutoff = ${CHUNK_MB}M
chunk_size = ${CHUNK_MB}M
no_check_bucket = true
EOF
}

rc() { rclone --config "${RCLONE_CFG}" "$@"; }

# Fills BUCKET_LIST[] by listing server-side; falls back to the profile's
# remembered S3_BUCKETS. Returns 0 if any buckets were found.
discover_buckets() {
  BUCKET_LIST=()
  local out
  if out="$(rc lsd "${REMOTE}:" 2>/dev/null)"; then
    local name
    while IFS= read -r line; do
      # rclone lsd columns: <perms?> <size> <date> <time> <name>
      name="$(awk '{ $1=$2=$3=$4=""; sub(/^ +/, ""); print }' <<<"${line}")"
      [[ -n "${name}" ]] && BUCKET_LIST+=("${name}")
    done <<<"${out}"
  fi
  if [[ ${#BUCKET_LIST[@]} -eq 0 && -n "${S3_BUCKETS:-}" ]]; then
    IFS=',' read -r -a BUCKET_LIST <<<"${S3_BUCKETS}"
    local i; for i in "${!BUCKET_LIST[@]}"; do
      BUCKET_LIST[$i]="$(echo "${BUCKET_LIST[$i]}" | xargs)"
    done
  fi
  [[ ${#BUCKET_LIST[@]} -gt 0 ]]
}

# ── Upload flow ───────────────────────────────────────────────────────────────
do_upload() {
  list_profiles
  if [[ ${#PROFILE_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n" "$(clr_yellow "${UPLOAD_NO_CREDS}")"; return
  fi

  # 1. Pick credential
  MENU_ITEMS=("${PROFILE_NAMES[@]}")
  printf "\n  %s\n\n" "$(clr_bold_cyan "${UPLOAD_SELECT_CRED}") $(clr_dim "· ${NAV_HINT}")"
  interactive_select
  local profile_name="${PROFILE_NAMES[$MENU_SELECTED]}"
  local profile_file="${PROFILE_FILES[$MENU_SELECTED]}"
  load_profile "${profile_file}"
  make_rclone_config

  # 2. Discover buckets
  printf "\n  %s %s …\n" "$(clr_dim "${CONNECTING}")" "$(clr_dim "${S3_ENDPOINT}")"
  local bucket=""
  if discover_buckets; then
    MENU_ITEMS=("${BUCKET_LIST[@]}" "${BUCKET_MANUAL}")
    printf "  %s\n\n" "$(clr_bold_cyan "${BUCKET_SELECT}") $(clr_dim "· ${NAV_HINT}")"
    interactive_select
    if [[ ${MENU_SELECTED} -eq $(( ${#BUCKET_LIST[@]} )) ]]; then
      bucket="$(prompt_visible "${BUCKET_PROMPT}")"
    else
      bucket="${BUCKET_LIST[$MENU_SELECTED]}"
    fi
  else
    printf "  %s\n" "$(clr_yellow "${BUCKET_NONE_LISTED}")"
    bucket="$(prompt_visible "${BUCKET_PROMPT}")"
  fi
  if [[ -z "${bucket}" ]]; then printf "  %s\n" "$(clr_red "${BUCKET_REQUIRED}")"; return; fi

  # Remember the bucket in the profile if it's new.
  remember_bucket "${profile_file}" "${bucket}" || true

  # 3. Root or folder prefix
  local prefix=""
  MENU_ITEMS=("${DEST_ROOT}" "${DEST_FOLDER}")
  printf "\n  "; printf "$(clr_bold_cyan "${DEST_TITLE}")" "${bucket}"; printf " $(clr_dim "· ${NAV_HINT}")\n\n"
  interactive_select
  if [[ ${MENU_SELECTED} -eq 1 ]]; then
    prefix="$(prompt_visible "${PREFIX_PROMPT}")"
    prefix="${prefix#/}"; prefix="${prefix%/}"
    if [[ -z "${prefix}" ]]; then printf "  %s\n" "$(clr_red "${PREFIX_REQUIRED}")"; return; fi
  fi

  # 4. Local folder
  echo ""
  local src
  src="$(prompt_visible "${FOLDER_PROMPT}")"
  src="${src/#\~/$HOME}"
  if [[ ! -d "${src}" ]]; then printf "  %s %s\n" "$(clr_red "${FOLDER_NOT_FOUND}")" "${src}"; return; fi
  src="${src%/}"

  # 5. Checkbox selection of top-level entries
  printf "\n  %s %s …\n" "$(clr_dim "${SCANNING}")" "$(clr_dim "${src}")"
  local entries=()
  while IFS= read -r -d '' e; do entries+=("$(basename "${e}")"); done \
    < <(find "${src}" -mindepth 1 -maxdepth 1 -print0 | sort -z)
  if [[ ${#entries[@]} -eq 0 ]]; then printf "  %s\n" "$(clr_yellow "${FOLDER_EMPTY}")"; return; fi

  MENU_ITEMS=(); MENU_CHECKED=()
  local e label
  for e in "${entries[@]}"; do
    if [[ -d "${src}/${e}" ]]; then label="${e}/"; else label="${e}"; fi
    MENU_ITEMS+=("${label}"); MENU_CHECKED+=(1)
  done
  printf "\n  %s\n  %s\n\n" "$(clr_bold_cyan "${SELECT_ENTRIES}")" "$(clr_dim "${NAV_HINT_MULTI}")"
  interactive_multiselect

  # Tally size/count from the selection (the actual include filters are built
  # per content-type pass in upload_selection).
  local selected=0 total_bytes=0 total_files=0 i sz nf
  for i in "${!entries[@]}"; do
    [[ "${MENU_CHECKED[$i]}" -eq 1 ]] || continue
    selected=$(( selected + 1 ))
    e="${entries[$i]}"
    if [[ -d "${src}/${e}" ]]; then
      sz=$(du -sb "${src}/${e}" 2>/dev/null | awk '{print $1}'); total_bytes=$(( total_bytes + ${sz:-0} ))
      nf=$(find "${src}/${e}" -type f | wc -l); total_files=$(( total_files + nf ))
    else
      sz=$(stat -c '%s' "${src}/${e}" 2>/dev/null || echo 0); total_bytes=$(( total_bytes + sz ))
      total_files=$(( total_files + 1 ))
    fi
  done
  if [[ ${selected} -eq 0 ]]; then printf "  %s\n" "$(clr_yellow "${NOTHING_SELECTED}")"; return; fi

  # 6. Summary + confirm
  local dest_label; [[ -n "${prefix}" ]] && dest_label="${prefix}/" || dest_label="${SUMMARY_ROOT}"
  echo ""
  printf "  %s\n" "$(clr_bold_cyan "${SUMMARY_TITLE}")"
  printf "    %-14s %s\n" "${SUMMARY_PROFILE}:"  "${profile_name}"
  printf "    %-14s %s\n" "${SUMMARY_ENDPOINT}:" "${S3_ENDPOINT}"
  printf "    %-14s %s\n" "${SUMMARY_BUCKET}:"   "${bucket}"
  printf "    %-14s %s\n" "${SUMMARY_DEST}:"     "${dest_label}"
  printf "    %-14s %s\n" "${SUMMARY_SOURCE}:"   "${src}"
  printf "    %-14s %s\n" "${SUMMARY_ITEMS}:"    "${selected}"
  printf "    %-14s %s\n" "${SUMMARY_FILES}:"    "${total_files}"
  printf "    %-14s %s\n" "${SUMMARY_SIZE}:"     "$(human_size "${total_bytes}")"
  printf "    %-14s %s\n" "${SUMMARY_CHUNK}:"    "${CHUNK_MB} MB"
  echo ""
  if ! confirm "${CONFIRM_UPLOAD}"; then printf "  %s\n" "$(clr_dim "${CANCELLED}")"; return; fi

  # 7. Upload — one pass per video container type so every video object gets the
  #    right Content-Type at PUT time (via --header-upload), then a final
  #    catch-all pass that lets rclone MIME-detect everything else. Each selected
  #    file matches exactly one pass, so nothing uploads twice, and every pass is
  #    scoped to the same selection and independently resumable. See VIDEO_GROUPS
  #    for why per-type passes are necessary.
  local dest="${REMOTE}:${bucket}"
  [[ -n "${prefix}" ]] && dest="${dest}/${prefix}"
  echo ""
  printf "  %s\n\n" "$(clr_dim "${UPLOADING}")"

  local upload_ok=1 group ctype x ext_lc brace is_video
  local extarr=() all_globs=() ginc=()

  # Flat list of every video extension in both cases — used by the final pass's
  # excludes and to classify single-file selections.
  for group in "${VIDEO_GROUPS[@]}"; do
    IFS=',' read -r -a extarr <<<"${group#*:}"
    for x in "${extarr[@]}"; do all_globs+=("${x}" "$(uc "${x}")"); done
  done

  # One pass per container type: include only this type's files (scoped to the
  # selection) and stamp them with the matching Content-Type.
  for group in "${VIDEO_GROUPS[@]}"; do
    ctype="${group%%:*}"
    IFS=',' read -r -a extarr <<<"${group#*:}"
    brace=""
    for x in "${extarr[@]}"; do brace="${brace:+${brace},}${x},$(uc "${x}")"; done
    ginc=()
    for i in "${!entries[@]}"; do
      [[ "${MENU_CHECKED[$i]}" -eq 1 ]] || continue
      e="${entries[$i]}"
      if [[ -d "${src}/${e}" ]]; then
        ginc+=(--include "/${e}/**.{${brace}}")
      else
        ext_lc="$(lc "${e##*.}")"
        for x in "${extarr[@]}"; do
          [[ "${ext_lc}" == "${x}" ]] && ginc+=(--include "/${e}")
        done
      fi
    done
    [[ ${#ginc[@]} -eq 0 ]] && continue
    if ! rc copy "${src}" "${dest}" "${ginc[@]}" \
        --header-upload "Content-Type: ${ctype}" \
        --transfers "${TRANSFERS}" --checkers 1 \
        --progress --stats 1s --stats-one-line=false; then
      upload_ok=0
    fi
  done

  # Final pass: everything that is not a video container, MIME auto-detected by
  # rclone. Use --filter (first matching rule wins, deterministic order) rather
  # than mixing --include/--exclude, whose precedence rclone warns is
  # indeterminate. Order: drop every video extension first (already uploaded
  # above with their Content-Type), then include the selection, then drop the
  # rest.
  local all_brace="" rest_filter=() rest_count=0
  for x in "${all_globs[@]}"; do all_brace="${all_brace:+${all_brace},}${x}"; done
  rest_filter+=(--filter "- *.{${all_brace}}")
  for i in "${!entries[@]}"; do
    [[ "${MENU_CHECKED[$i]}" -eq 1 ]] || continue
    e="${entries[$i]}"
    if [[ -d "${src}/${e}" ]]; then
      rest_filter+=(--filter "+ /${e}/**"); rest_count=$(( rest_count + 1 ))
    else
      ext_lc="$(lc "${e##*.}")"; is_video=0
      for x in "${all_globs[@]}"; do [[ "${ext_lc}" == "$(lc "${x}")" ]] && is_video=1; done
      if [[ "${is_video}" -eq 0 ]]; then
        rest_filter+=(--filter "+ /${e}"); rest_count=$(( rest_count + 1 ))
      fi
    fi
  done
  rest_filter+=(--filter "- **")
  if [[ ${rest_count} -gt 0 ]]; then
    if ! rc copy "${src}" "${dest}" "${rest_filter[@]}" \
        --transfers "${TRANSFERS}" --checkers 1 \
        --progress --stats 1s --stats-one-line=false; then
      upload_ok=0
    fi
  fi

  echo ""
  if [[ "${upload_ok}" -eq 1 ]]; then
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${UPLOAD_DONE}"
  else
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${UPLOAD_FAILED}"
  fi
}

# Append a bucket to a profile's S3_BUCKETS list if not already present. Runs in
# a subshell so it can reuse load_profile/write_profile without clobbering the
# caller's S3_* vars.
remember_bucket() {
  local file="$1" bucket="$2"
  [[ -f "${file}" ]] || return 0
  (
    load_profile "${file}"
    case ",${S3_BUCKETS}," in *",${bucket},"*) exit 0 ;; esac
    S3_BUCKETS="${S3_BUCKETS:+${S3_BUCKETS},}${bucket}"
    write_profile "${file}"
  )
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  printf "  %s" "Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  local lang="en"
  [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  setup_strings "${lang}"

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  CRED_DIR="${script_dir}/credentials"
  mkdir -p "${CRED_DIR}"; chmod 700 "${CRED_DIR}"

  clear
  print_header
  ensure_rclone

  while true; do
    echo ""
    printf "  %s\n\n" "$(clr_bold_cyan "${MENU_TITLE}")"
    MENU_ITEMS=("${MENU_MANAGE}" "${MENU_UPLOAD}" "${MENU_EXIT}")
    printf "  %s\n\n" "$(clr_dim "${NAV_HINT}")"
    interactive_select
    case "${MENU_SELECTED}" in
      0) manage_credentials ;;
      1) do_upload ;;
      2) printf "  %s\n\n" "$(clr_dim "👋")"; exit 0 ;;
    esac
  done
}

main "$@"
