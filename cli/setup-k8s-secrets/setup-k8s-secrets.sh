#!/usr/bin/env bash
# setup-k8s-secrets.sh
#
# Interactive Kubernetes secrets setup for the video-downloader app.
# Creates or updates secrets in the target namespace:
#
#   vd2-secrets                  — all sensitive env vars (API keys, R2, Stripe…)
#   vd2-cookies                  — yt-dlp Netscape cookies file
#   video-downloader-wireguard   — WireGuard VPN config
#
# Run: bash cli/setup-k8s-secrets/setup-k8s-secrets.sh

set -euo pipefail

# ── ANSI Colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
CYAN='\033[36m'

clr_green()       { printf "${GREEN}%s${RESET}" "$*"; }
clr_red()         { printf "${RED}%s${RESET}" "$*"; }
clr_yellow()      { printf "${YELLOW}%s${RESET}" "$*"; }
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
    SUBTITLE="Crea o actualiza los secretos de k8s para video-downloader."
    KUBECTL_MISSING="kubectl no está instalado o no está en PATH."
    KUBECTL_MISSING_HINT="Instálalo con: snap install kubectl --classic"
    NS_PROMPT="Namespace de Kubernetes"
    NS_DEFAULT="video-downloader-2"
    SELECT_TITLE="Selecciona los secretos a configurar:"
    SELECT_PROMPT="Flechas para navegar · Espacio para seleccionar · Enter para confirmar"
    SELECT_HINT="(a = seleccionar todo  ·  n = deseleccionar todo)"
    NOTHING_SELECTED="Nada seleccionado — saliendo."
    CONFIRM_PROMPT="¿Continuar? [s/n]"
    CONFIRM_YES_CHARS="sy"
    CANCELLED="Cancelado."
    PROMPT_SECRET="(oculto)"
    PROMPT_LEAVE_BLANK="(Enter para omitir)"
    APPLYING="Aplicando"
    DONE="Listo"
    FAILED="Error al aplicar"
    SECRET_EXISTS="El secreto existe — parcheando solo las claves seleccionadas."
    SECRET_NEW="El secreto no existe — creando."
    ALL_DONE="¡Configuración completada!"
    # Group labels
    GRP_R2="Almacenamiento R2 (Cloudflare)"
    GRP_GROQ="API Groq"
    GRP_SCRAPE="API ScrapeCreators"
    GRP_STRIPE="Stripe (pagos)"
    GRP_INTERNAL="Secreto Interno"
    GRP_MONGO="MongoDB"
    GRP_COOKIES="Archivo de Cookies (yt-dlp)"
    GRP_WIREGUARD="Configuración WireGuard VPN"
    # Prompts
    PROMPT_R2_ACCOUNT="R2 Account ID"
    PROMPT_R2_KEY="R2 Access Key ID"
    PROMPT_R2_SECRET="R2 Secret Access Key"
    PROMPT_R2_BUCKET="R2 Bucket Name"
    PROMPT_R2_PUBLIC_URL="R2 Public URL"
    PROMPT_GROQ="Groq API Key"
    PROMPT_SCRAPE="ScrapeCreators API Key"
    PROMPT_STRIPE_SK="Stripe Secret Key"
    PROMPT_STRIPE_WH="Stripe Webhook Secret"
    PROMPT_INTERNAL="Internal Secret"
    PROMPT_MONGO_URI="MongoDB URI"
    PROMPT_COOKIES_FILE="Ruta al archivo netscape-cookies.txt"
    PROMPT_WG_FILE="Ruta al archivo wg0.conf"
    FILE_NOT_FOUND="Archivo no encontrado"
  else
    WELCOME="Kubernetes Secrets Setup"
    SUBTITLE="Creates or updates k8s secrets for the video-downloader app."
    KUBECTL_MISSING="kubectl is not installed or not in PATH."
    KUBECTL_MISSING_HINT="Install it with: snap install kubectl --classic"
    NS_PROMPT="Kubernetes namespace"
    NS_DEFAULT="video-downloader-2"
    SELECT_TITLE="Select secrets to configure:"
    SELECT_PROMPT="Arrow keys to navigate · Space to toggle · Enter to confirm"
    SELECT_HINT="(a = select all  ·  n = deselect all)"
    NOTHING_SELECTED="Nothing selected — exiting."
    CONFIRM_PROMPT="Proceed? [y/n]"
    CONFIRM_YES_CHARS="y"
    CANCELLED="Cancelled."
    PROMPT_SECRET="(hidden)"
    PROMPT_LEAVE_BLANK="(Enter to skip)"
    APPLYING="Applying"
    DONE="Done"
    FAILED="Failed to apply"
    SECRET_EXISTS="Secret exists — patching only the selected keys."
    SECRET_NEW="Secret does not exist — creating."
    ALL_DONE="Setup complete!"
    # Group labels
    GRP_R2="R2 Object Storage (Cloudflare)"
    GRP_GROQ="Groq API"
    GRP_SCRAPE="ScrapeCreators API"
    GRP_STRIPE="Stripe (payments)"
    GRP_INTERNAL="Internal Secret"
    GRP_MONGO="MongoDB"
    GRP_COOKIES="Cookies File (yt-dlp)"
    GRP_WIREGUARD="WireGuard VPN Config"
    # Prompts
    PROMPT_R2_ACCOUNT="R2 Account ID"
    PROMPT_R2_KEY="R2 Access Key ID"
    PROMPT_R2_SECRET="R2 Secret Access Key"
    PROMPT_R2_BUCKET="R2 Bucket Name"
    PROMPT_R2_PUBLIC_URL="R2 Public URL"
    PROMPT_GROQ="Groq API Key"
    PROMPT_SCRAPE="ScrapeCreators API Key"
    PROMPT_STRIPE_SK="Stripe Secret Key"
    PROMPT_STRIPE_WH="Stripe Webhook Secret"
    PROMPT_INTERNAL="Internal Secret"
    PROMPT_MONGO_URI="MongoDB URI"
    PROMPT_COOKIES_FILE="Path to netscape-cookies.txt"
    PROMPT_WG_FILE="Path to wg0.conf"
    FILE_NOT_FOUND="File not found"
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

# ── Multi-select checkbox ─────────────────────────────────────────────────────
# CB_LABELS   — display labels (array)
# CB_SELECTED — indices of items selected on exit

interactive_checkbox() {
  local num="${#CB_LABELS[@]}"
  local cursor=0
  declare -a selected
  local i
  for i in "${!CB_LABELS[@]}"; do selected[$i]=0; done

  render() {
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

  render
  printf '\033[?25l'

  while true; do
    local key esc
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n1 -t 0.05 esc 2>/dev/null || esc=""
      if [[ "${esc}" == '[' ]]; then
        IFS= read -r -s -n1 -t 0.05 key 2>/dev/null || key=""
        if [[ "${key}" == 'A' ]]; then
          cursor=$(( (cursor - 1 + num) % num ))
          printf "\033[%dA" "${num}"; render
        elif [[ "${key}" == 'B' ]]; then
          cursor=$(( (cursor + 1) % num ))
          printf "\033[%dA" "${num}"; render
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
      printf "\033[%dA" "${num}"; render
      continue
    fi

    if [[ "${key}" == 'a' || "${key}" == 'A' ]]; then
      for i in "${!CB_LABELS[@]}"; do selected[$i]=1; done
      printf "\033[%dA" "${num}"; render; continue
    fi

    if [[ "${key}" == 'n' || "${key}" == 'N' ]]; then
      for i in "${!CB_LABELS[@]}"; do selected[$i]=0; done
      printf "\033[%dA" "${num}"; render; continue
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

# Read a visible value (file paths, bucket names)
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

# Read a secret value (hidden input)
prompt_secret() {
  local label="$1"
  printf "  %s %s: " "$(clr_bold "${label}")" "$(clr_dim "${PROMPT_SECRET}")"
  local val
  IFS= read -r -s val || true
  echo ""
  printf '%s' "${val}"
}

# base64 encode (portable: Linux uses -w0, macOS uses no -w flag)
b64enc() {
  printf '%s' "$1" | base64 -w0 2>/dev/null || printf '%s' "$1" | base64
}

# Patch existing k8s secret with only the provided key=value pairs.
# Usage: patch_secret SECRET_NAME NAMESPACE key=value [key=value …]
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

# Create a brand-new generic secret from key=value literals.
# Usage: create_secret SECRET_NAME NAMESPACE key=value [key=value …]
create_secret() {
  local name="$1" ns="$2"; shift 2
  local args=()
  for item in "$@"; do args+=(--from-literal="${item}"); done
  kubectl create secret generic "${name}" "${args[@]}" -n "${ns}"
}

# Create or update a file-based secret (single key).
# Usage: apply_file_secret SECRET_NAME NAMESPACE FILE_KEY FILE_PATH
apply_file_secret() {
  local name="$1" ns="$2" file_key="$3" file_path="$4"
  kubectl create secret generic "${name}" \
    --from-file="${file_key}=${file_path}" \
    -n "${ns}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

# Apply a list of key=value items to vd2-secrets (patch if exists, create if not).
apply_vd2_secrets() {
  local ns="$1"; shift
  if [[ $# -eq 0 ]]; then return; fi

  printf "\n  %s %s...\n" "$(clr_bold_yellow '→')" "${APPLYING} vd2-secrets"

  if kubectl get secret vd2-secrets -n "${ns}" &>/dev/null 2>&1; then
    printf "  %s\n" "$(clr_dim "${SECRET_EXISTS}")"
    if patch_secret vd2-secrets "${ns}" "$@"; then
      printf "  %s vd2-secrets\n" "$(clr_bold_green "✓ ${DONE}:")"
    else
      printf "  %s vd2-secrets\n" "$(clr_red "✗ ${FAILED}:")"
    fi
  else
    printf "  %s\n" "$(clr_dim "${SECRET_NEW}")"
    if create_secret vd2-secrets "${ns}" "$@"; then
      printf "  %s vd2-secrets\n" "$(clr_bold_green "✓ ${DONE}:")"
    else
      printf "  %s vd2-secrets\n" "$(clr_red "✗ ${FAILED}:")"
    fi
  fi
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

  # Check kubectl
  if ! command -v kubectl &>/dev/null; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${KUBECTL_MISSING}"
    printf "  %s\n\n" "$(clr_dim "${KUBECTL_MISSING_HINT}")"
    exit 1
  fi

  # Namespace
  printf "  %s (%s): " "$(clr_bold "${NS_PROMPT}")" "$(clr_dim "${NS_DEFAULT}")"
  local ns_input; read -r ns_input || true
  local NAMESPACE="${ns_input:-${NS_DEFAULT}}"
  echo ""

  # Secret group checklist
  printf "  %s\n" "$(clr_bold "${SELECT_TITLE}")"
  printf "  %s\n" "$(clr_dim "${SELECT_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${SELECT_HINT}")"

  CB_LABELS=(
    "${PROMPT_R2_ACCOUNT}"    # 0
    "${PROMPT_R2_KEY}"        # 1
    "${PROMPT_R2_SECRET}"     # 2
    "${PROMPT_R2_BUCKET}"     # 3
    "${PROMPT_R2_PUBLIC_URL}" # 4
    "${GRP_GROQ}"             # 5
    "${GRP_SCRAPE}"           # 6
    "${GRP_STRIPE}"           # 7
    "${GRP_INTERNAL}"         # 8
    "${GRP_MONGO}"            # 9
    "${GRP_COOKIES}"          # 10
    "${GRP_WIREGUARD}"        # 11
  )
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
    printf "    %s %s\n" "$(clr_cyan '•')" "${CB_LABELS[$idx]}"
  done
  echo ""

  printf "  %s (${CONFIRM_YES_CHARS:0:1}): " "${CONFIRM_PROMPT}"
  local confirm; read -r confirm || true; confirm="${confirm:-${CONFIRM_YES_CHARS:0:1}}"
  local confirm_char="${confirm:0:1}"; confirm_char="${confirm_char,,}"
  if [[ "${CONFIRM_YES_CHARS}" != *"${confirm_char}"* ]]; then
    printf "  %s\n\n" "${CANCELLED}"; exit 0
  fi
  echo ""

  # ── Collect values ───────────────────────────────────────────────────────────

  local vd2_items=()
  local do_cookies=0 cookies_file=""
  local do_wireguard=0 wg_file=""

  # Find the repo root (two levels up from this script's dir)
  _SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  _REPO_ROOT="$(cd "${_SCRIPT_DIR}/../.." 2>/dev/null && pwd)"

  for idx in "${CB_SELECTED[@]}"; do
    case "${idx}" in

      # ── R2 Account ID ─────────────────────────────────────────────────────
      0)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_R2}: ${PROMPT_R2_ACCOUNT} ──")"
        local r2_acct; r2_acct="$(prompt_visible "${PROMPT_R2_ACCOUNT}")"
        echo ""
        [[ -n "${r2_acct}" ]] && vd2_items+=("r2-account-id=${r2_acct}")
        ;;

      # ── R2 Access Key ID ──────────────────────────────────────────────────
      1)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_R2}: ${PROMPT_R2_KEY} ──")"
        local r2_key; r2_key="$(prompt_visible "${PROMPT_R2_KEY}")"
        echo ""
        [[ -n "${r2_key}" ]] && vd2_items+=("r2-access-key-id=${r2_key}")
        ;;

      # ── R2 Secret Access Key ──────────────────────────────────────────────
      2)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_R2}: ${PROMPT_R2_SECRET} ──")"
        local r2_sec; r2_sec="$(prompt_visible "${PROMPT_R2_SECRET}")"
        echo ""
        [[ -n "${r2_sec}" ]] && vd2_items+=("r2-secret-access-key=${r2_sec}")
        ;;

      # ── R2 Bucket Name ────────────────────────────────────────────────────
      3)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_R2}: ${PROMPT_R2_BUCKET} ──")"
        local r2_bkt
        printf "  %s: " "$(clr_bold "${PROMPT_R2_BUCKET}")"
        IFS= read -r r2_bkt || true
        echo ""
        [[ -n "${r2_bkt}" ]] && vd2_items+=("r2-bucket-name=${r2_bkt}")
        ;;

      # ── R2 Public URL ─────────────────────────────────────────────────────
      4)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_R2}: ${PROMPT_R2_PUBLIC_URL} ──")"
        local r2_url
        printf "  %s: " "$(clr_bold "${PROMPT_R2_PUBLIC_URL}")"
        IFS= read -r r2_url || true
        echo ""
        [[ -n "${r2_url}" ]] && vd2_items+=("r2-public-url=${r2_url}")
        ;;

      # ── Groq API ──────────────────────────────────────────────────────────
      5)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_GROQ} ──")"
        local groq; groq="$(prompt_visible "${PROMPT_GROQ}")"
        echo ""
        [[ -n "${groq}" ]] && vd2_items+=("groq-api-key=${groq}")
        ;;

      # ── ScrapeCreators ────────────────────────────────────────────────────
      6)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_SCRAPE} ──")"
        local scrape; scrape="$(prompt_visible "${PROMPT_SCRAPE}")"
        echo ""
        [[ -n "${scrape}" ]] && vd2_items+=("scrapecreators-api-key=${scrape}")
        ;;

      # ── Stripe ────────────────────────────────────────────────────────────
      7)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_STRIPE} ──")"
        local stripe_sk; stripe_sk="$(prompt_visible "${PROMPT_STRIPE_SK}")"
        local stripe_wh; stripe_wh="$(prompt_visible "${PROMPT_STRIPE_WH}")"
        echo ""
        [[ -n "${stripe_sk}" ]] && vd2_items+=("stripe-secret-key=${stripe_sk}")
        [[ -n "${stripe_wh}" ]] && vd2_items+=("stripe-webhook-secret=${stripe_wh}")
        ;;

      # ── Internal Secret ───────────────────────────────────────────────────
      8)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_INTERNAL} ──")"
        local internal; internal="$(prompt_visible "${PROMPT_INTERNAL}")"
        echo ""
        [[ -n "${internal}" ]] && vd2_items+=("internal-secret=${internal}")
        ;;

      # ── MongoDB URI ───────────────────────────────────────────────────────
      9)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_MONGO} ──")"
        local mongo_uri; mongo_uri="$(prompt_visible "${PROMPT_MONGO_URI}")"
        echo ""
        [[ -n "${mongo_uri}" ]] && vd2_items+=("mongo-uri=${mongo_uri}")
        ;;

      # ── Cookies File ──────────────────────────────────────────────────────
      10)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_COOKIES} ──")"
        local default_cookies="${_REPO_ROOT}/apps/video-downloader/netscape-cookies.txt"
        cookies_file="$(prompt_visible "${PROMPT_COOKIES_FILE}" "${default_cookies}")"
        echo ""
        do_cookies=1
        ;;

      # ── WireGuard Config ──────────────────────────────────────────────────
      11)
        printf "  %s\n" "$(clr_bold_cyan "── ${GRP_WIREGUARD} ──")"
        local default_wg="${_REPO_ROOT}/apps/video-downloader/us-den.conf"
        wg_file="$(prompt_visible "${PROMPT_WG_FILE}" "${default_wg}")"
        echo ""
        do_wireguard=1
        ;;

    esac
    :
  done

  # ── Apply secrets ────────────────────────────────────────────────────────────

  # vd2-secrets (API keys / R2 / Stripe / Internal)
  if [[ ${#vd2_items[@]} -gt 0 ]]; then
    apply_vd2_secrets "${NAMESPACE}" "${vd2_items[@]}"
  fi

  # vd2-cookies
  if [[ "${do_cookies}" -eq 1 ]]; then
    printf "\n  %s %s...\n" "$(clr_bold_yellow '→')" "${APPLYING} vd2-cookies"
    if [[ ! -f "${cookies_file}" ]]; then
      printf "  %s: %s\n" "$(clr_red "✗ ${FILE_NOT_FOUND}")" "$(clr_dim "${cookies_file}")"
    elif apply_file_secret vd2-cookies "${NAMESPACE}" netscape-cookies.txt "${cookies_file}"; then
      printf "  %s vd2-cookies\n" "$(clr_bold_green "✓ ${DONE}:")"
    else
      printf "  %s vd2-cookies\n" "$(clr_red "✗ ${FAILED}:")"
    fi
  fi

  # video-downloader-wireguard
  if [[ "${do_wireguard}" -eq 1 ]]; then
    printf "\n  %s %s...\n" "$(clr_bold_yellow '→')" "${APPLYING} video-downloader-wireguard"
    if [[ ! -f "${wg_file}" ]]; then
      printf "  %s: %s\n" "$(clr_red "✗ ${FILE_NOT_FOUND}")" "$(clr_dim "${wg_file}")"
    elif apply_file_secret video-downloader-wireguard "${NAMESPACE}" wg0.conf "${wg_file}"; then
      printf "  %s video-downloader-wireguard\n" "$(clr_bold_green "✓ ${DONE}:")"
    else
      printf "  %s video-downloader-wireguard\n" "$(clr_red "✗ ${FAILED}:")"
    fi
  fi

  echo ""
  printf "  %s %s\n\n" "$(clr_bold_green '✓')" "${ALL_DONE}"
}

main "$@"
