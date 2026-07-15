#!/usr/bin/env bash
# website.sh - website multi-tenant ops, consolidated into one CLI.
#
# Three subcommands (formerly scripts/publish-site.mjs + scripts/sync-website-hosts.mjs):
#
#   pnpm publish-site <host> [--reset] [-y]      -> website.sh publish ...
#   pnpm sync-website-hosts [-y]                 -> website.sh sync
#   pnpm pull-site [host] [-y]                    -> website.sh pull ...
#
# publish  Serializes a locally-seeded site's System + success stories +
#          highlights + product/service catalog out of the LOCAL database (via
#          `manage.py export_site`), then POSTs that payload to the production
#          `/api/publish-site/` endpoint, which upserts it. Image files are NOT
#          transported - the customer uploads real images in the production CMS;
#          existing images are never clobbered on re-publish. Pass `--reset` for
#          an exact replace of the System's prior content. Because it writes to
#          production, it confirms before POSTing (skip with -y).
#
# sync     Fetches all enabled System hosts from the website-api and rewrites the
#          ingress block of apps/website/helm/values.yaml (so nginx routes every
#          registered domain to the website app) plus CORS_ALLOWED_ORIGINS /
#          CSRF_TRUSTED_ORIGINS / ALLOWED_HOSTS in apps/website-api/helm/values.yaml.
#
# pull     The inverse of publish: pulls a production site's content DOWN into the
#          LOCAL database - System + success stories + highlights + product/service
#          catalog - INCLUDING images (downloaded into local media). Lists the
#          production sites, lets you pick one and check which sections to import
#          (all by default), then runs `manage.py import_site`, which reuses the
#          API's public read endpoints (no prod redeploy) and resets each selected
#          section so local mirrors prod. Requires the local venv (writes locally).
#
# UI/UX matches the other cli/ scripts: it prompts for language (en/es) at the
# start, then uses the shared interactive radio-button / checkbox widgets for
# selection.
#
# Credentials/URL resolve in this order for both subcommands:
#   1. env  WEBSITE_API_URL / WEBSITE_ADMIN_USER / WEBSITE_ADMIN_PASSWORD
#   2. apps/website-api/.env -> DJANGO_ADMIN_USER / DJANGO_ADMIN_PASSWORD
#   3. Interactive prompt (unless -y)
#
# NOTE: the /api/publish-site/ endpoint ships in the website-api image, so
# production must be redeployed with it before `publish` can reach prod.
#
# Requires: bash, curl, jq.

set -euo pipefail

# ── Colors / logging ──────────────────────────────────────────────────────────
RESET='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
GREEN='\033[32m'; RED='\033[31m'; CYAN='\033[36m'; YELLOW='\033[33m'
# %b so leading "\n" in messages expands; dynamic data is printed separately.
info()  { printf "${CYAN}%b${RESET}\n" "$*"; }
ok()    { printf "${GREEN}%b${RESET}\n" "$*"; }
warn()  { printf "${YELLOW}%b${RESET}\n" "$*"; }
err()   { printf "${RED}%b${RESET}\n" "$*" >&2; }

clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

# Portable case helper (macOS bash 3 does not support ${var,,}).
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

API_DIR="${repo_root}/apps/website-api"
API_ENV="${API_DIR}/.env"
DEFAULT_API_URL="https://website-api.iguzman.com.mx"
API_HOST="website-api.iguzman.com.mx"

AUTO_YES=0

# ── i18n ──────────────────────────────────────────────────────────────────────
# Call: setup_strings "en"  or  setup_strings "es". All strings become globals.

setup_strings() {
  local lang="$1"

  if [[ "${lang}" == "es" ]]; then
    WELCOME="Operaciones Multi-Tenant del Sitio"
    SUBTITLE="Publica, sincroniza y descarga el contenido del sitio."
    CONFIRM_WORD="si"
    ERR_CURL_REQUIRED="Error: se requiere 'curl' pero no está instalado."
    ERR_JQ_REQUIRED="Error: se requiere 'jq' pero no está instalado."
    LBL_API_URL_PROD="URL de la API de producción"
    LBL_API_URL="URL de la API (website-api)"
    LBL_ADMIN_USER="Usuario administrador"
    LBL_ADMIN_PASS="Contraseña de administrador"
    CB_PROMPT="Usa ↑↓ para navegar · Espacio para seleccionar · Enter para confirmar"
    CB_HINT="(a = todos  ·  n = ninguno)"
    CB_MORE_ABOVE="más arriba"
    CB_MORE_BELOW="más abajo"
    RB_PROMPT="Usa ↑↓ para navegar · Enter para seleccionar"
    USAGE_TITLE="Uso:"
    USAGE_LINE_PUBLISH="pnpm publish-site <host> [--reset] [-y]   (website.sh publish ...)"
    USAGE_LINE_SYNC="pnpm sync-website-hosts [-y]              (website.sh sync)"
    USAGE_LINE_PULL="pnpm pull-site [host] [-y]                (website.sh pull ...)"
    EXPORTING="Exportando '%s' desde la base de datos local ..."
    ERR_EXPORT_FAILED="Error: export_site falló:"
    MSG_VENV_NOT_FOUND_USING="venv no encontrado; usando %s"
    ERR_NO_VENV_NO_EXPORT="Error: no hay venv en apps/website-api/venv ni exportación en seed_assets/exports/%s.json."
    HINT_RUN_EXPORT="Ejecuta: cd apps/website-api && python manage.py export_site %s --output seed_assets/exports/%s.json"
    ERR_PAYLOAD_INVALID_JSON="Error: la carga exportada no es JSON válido"
    ERR_CREDS_REQUIRED="Error: se requieren la URL de la API y las credenciales de administrador"
    MSG_PUBLISHING="Publicando '%s' en %s"
    SUMMARY_COUNTS="%s historias, %s destacados, %s cat. de productos, %s cat. de servicios."
    MSG_RESET_NOTE="--reset: reemplaza el contenido existente de este Sistema"
    CONFIRM_PUBLISH="Escribe '%s' para publicar: "
    MSG_ABORTED="Cancelado."
    ERR_REACH_API="Error: no se pudo conectar con la API"
    ERR_API_RETURNED="Error: la API devolvió %s"
    MSG_PUBLISHED="✓ Publicado '%s'"
    HINT_NEXT_SYNC="Siguiente: ejecuta \`pnpm sync-website-hosts\` para que el dominio apunte a la app website (ingress + CORS)."
    ERR_API_URL_REQUIRED="Error: se requiere la URL de la API"
    ERR_ADMIN_CREDS_REQUIRED="Error: se requieren credenciales de administrador"
    MSG_FETCHING_HOSTS="Obteniendo hosts del sistema desde %s ..."
    ERR_NO_SYSTEMS="Error: No se encontraron sistemas habilitados en la API"
    MSG_FOUND_HOSTS="Se encontraron %s host(s):"
    MSG_INGRESS_UP_TO_DATE="El ingress de apps/website/helm/values.yaml ya está actualizado."
    MSG_INGRESS_UPDATED="Se actualizaron los hosts de ingress en apps/website/helm/values.yaml"
    MSG_CORS_UP_TO_DATE="La configuración CORS de apps/website-api/helm/values.yaml ya está actualizada."
    MSG_CORS_UPDATED="Se actualizaron CORS_ALLOWED_ORIGINS, CSRF_TRUSTED_ORIGINS, ALLOWED_HOSTS en apps/website-api/helm/values.yaml"
    ERR_VENV_NOT_FOUND="Error: no se encontró el venv local en apps/website-api/venv."
    HINT_CREATE_VENV="Créalo (pnpm setup-venv) antes de descargar - la importación escribe en la BD local."
    MSG_FETCHING_SITES="Obteniendo sitios de producción desde %s ..."
    LBL_SELECT_SITE="Selecciona un sitio:"
    LBL_SECTIONS_TO_IMPORT="Secciones a importar:"
    MSG_NOTHING_SELECTED="Nada seleccionado. Cancelado."
    MSG_PULLING="Descargando '%s' desde %s a la base de datos LOCAL"
    MSG_SECTIONS="secciones: %s"
    MSG_PULL_NOTE="(cada sección seleccionada se reinicia localmente, las imágenes se descargan)"
    CONFIRM_IMPORT="Escribe '%s' para importar: "
    MSG_PULLED="✓ Descargado '%s' a la base de datos local"
    ERR_IMPORT_FAILED="Error: import_site falló"
    SEC_SYSTEM="Sistema"
    SEC_STORIES="Casos de éxito"
    SEC_HIGHLIGHTS="Destacados"
    SEC_PRODUCTS="Productos"
    SEC_SERVICES="Servicios"
  else
    WELCOME="Website Multi-Tenant Ops"
    SUBTITLE="Publish, sync and pull website content."
    CONFIRM_WORD="yes"
    ERR_CURL_REQUIRED="Error: 'curl' is required but not installed."
    ERR_JQ_REQUIRED="Error: 'jq' is required but not installed."
    LBL_API_URL_PROD="Production API URL"
    LBL_API_URL="API URL (website-api)"
    LBL_ADMIN_USER="Admin username"
    LBL_ADMIN_PASS="Admin password"
    CB_PROMPT="Use ↑↓ to navigate · Space to toggle · Enter to confirm"
    CB_HINT="(a = all  ·  n = none)"
    CB_MORE_ABOVE="more above"
    CB_MORE_BELOW="more below"
    RB_PROMPT="Use ↑↓ to navigate · Enter to select"
    USAGE_TITLE="Usage:"
    USAGE_LINE_PUBLISH="pnpm publish-site <host> [--reset] [-y]   (website.sh publish ...)"
    USAGE_LINE_SYNC="pnpm sync-website-hosts [-y]              (website.sh sync)"
    USAGE_LINE_PULL="pnpm pull-site [host] [-y]                (website.sh pull ...)"
    EXPORTING="Exporting '%s' from the local database ..."
    ERR_EXPORT_FAILED="Error: export_site failed:"
    MSG_VENV_NOT_FOUND_USING="venv not found; using %s"
    ERR_NO_VENV_NO_EXPORT="Error: no venv at apps/website-api/venv and no export at seed_assets/exports/%s.json."
    HINT_RUN_EXPORT="Run: cd apps/website-api && python manage.py export_site %s --output seed_assets/exports/%s.json"
    ERR_PAYLOAD_INVALID_JSON="Error: exported payload is not valid JSON"
    ERR_CREDS_REQUIRED="Error: API URL and admin credentials are required"
    MSG_PUBLISHING="Publishing '%s' to %s"
    SUMMARY_COUNTS="%s stories, %s highlights, %s product cat., %s service cat."
    MSG_RESET_NOTE="--reset: replaces this System's existing content"
    CONFIRM_PUBLISH="Type '%s' to publish: "
    MSG_ABORTED="Aborted."
    ERR_REACH_API="Error: failed to reach API"
    ERR_API_RETURNED="Error: API returned %s"
    MSG_PUBLISHED="✓ Published '%s'"
    HINT_NEXT_SYNC="Next: run \`pnpm sync-website-hosts\` so the domain routes to the website app (ingress + CORS)."
    ERR_API_URL_REQUIRED="Error: API URL is required"
    ERR_ADMIN_CREDS_REQUIRED="Error: Admin credentials are required"
    MSG_FETCHING_HOSTS="Fetching system hosts from %s ..."
    ERR_NO_SYSTEMS="Error: No enabled systems found in the API"
    MSG_FOUND_HOSTS="Found %s host(s):"
    MSG_INGRESS_UP_TO_DATE="apps/website/helm/values.yaml ingress is already up to date."
    MSG_INGRESS_UPDATED="Updated ingress hosts in apps/website/helm/values.yaml"
    MSG_CORS_UP_TO_DATE="apps/website-api/helm/values.yaml CORS settings are already up to date."
    MSG_CORS_UPDATED="Updated CORS_ALLOWED_ORIGINS, CSRF_TRUSTED_ORIGINS, ALLOWED_HOSTS in apps/website-api/helm/values.yaml"
    ERR_VENV_NOT_FOUND="Error: local venv not found at apps/website-api/venv."
    HINT_CREATE_VENV="Create it (pnpm setup-venv) before pulling - import writes to the local DB."
    MSG_FETCHING_SITES="Fetching production sites from %s ..."
    LBL_SELECT_SITE="Select a site:"
    LBL_SECTIONS_TO_IMPORT="Sections to import:"
    MSG_NOTHING_SELECTED="Nothing selected. Aborted."
    MSG_PULLING="Pulling '%s' from %s into the LOCAL database"
    MSG_SECTIONS="sections: %s"
    MSG_PULL_NOTE="(each selected section is reset locally, images downloaded)"
    CONFIRM_IMPORT="Type '%s' to import: "
    MSG_PULLED="✓ Pulled '%s' into the local database"
    ERR_IMPORT_FAILED="Error: import_site failed"
    SEC_SYSTEM="System"
    SEC_STORIES="Success stories"
    SEC_HIGHLIGHTS="Highlights"
    SEC_PRODUCTS="Products"
    SEC_SERVICES="Services"
  fi
}

# ── Header ────────────────────────────────────────────────────────────────────

print_header() {
  local line
  line="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE:0:52}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

# ── Interactive checkbox ──────────────────────────────────────────────────────
# Set _CB_LABELS / _CB_SEL before calling; result written to SELECTED_INDICES.
# Lists taller than the terminal scroll inside a fixed viewport (see edit-videos).

_CB_LABELS=()
_CB_SEL=()
_CB_CURSOR=0
_CB_TOP=0
_CB_VIEW=0
_CB_LINES=0
SELECTED_INDICES=()

_cb_set_viewport() {
  local num="$1" avail
  avail="$(tput lines 2>/dev/null || echo 0)"
  [[ "${avail}" -le 0 ]] && avail="${LINES:-24}"
  avail=$(( avail - 8 ))
  [[ "${avail}" -lt 5 ]] && avail=5

  if [[ "${num}" -le "${avail}" ]]; then
    _CB_VIEW="${num}"
    _CB_LINES="${num}"
  else
    _CB_VIEW="${avail}"
    _CB_LINES=$(( avail + 1 ))   # + footer
  fi
  _CB_TOP=0
}

_cb_scroll_into_view() {
  local num="${#_CB_LABELS[@]}"
  if [[ "${num}" -le "${_CB_VIEW}" ]]; then _CB_TOP=0; return; fi
  [[ "${_CB_CURSOR}" -lt "${_CB_TOP}" ]] && _CB_TOP="${_CB_CURSOR}"
  [[ "${_CB_CURSOR}" -ge $(( _CB_TOP + _CB_VIEW )) ]] && _CB_TOP=$(( _CB_CURSOR - _CB_VIEW + 1 ))
  [[ "${_CB_TOP}" -gt $(( num - _CB_VIEW )) ]] && _CB_TOP=$(( num - _CB_VIEW ))
  [[ "${_CB_TOP}" -lt 0 ]] && _CB_TOP=0
  return 0
}

_cb_render_footer() {
  local num="${#_CB_LABELS[@]}"
  [[ "${num}" -le "${_CB_VIEW}" ]] && return 0
  local above="${_CB_TOP}"
  local below=$(( num - _CB_TOP - _CB_VIEW ))
  local parts=""
  [[ "${above}" -gt 0 ]] && parts="↑ ${above} ${CB_MORE_ABOVE}"
  [[ "${below}" -gt 0 ]] && parts="${parts:+${parts}  ·  }↓ ${below} ${CB_MORE_BELOW}"
  printf "  %s\033[K\n" "$(clr_dim "${parts}")"
}

_cb_render() {
  _cb_scroll_into_view
  local j end=$(( _CB_TOP + _CB_VIEW ))
  for ((j=_CB_TOP; j<end; j++)); do
    local lbl="${_CB_LABELS[$j]}"
    local is_sel="${_CB_SEL[$j]}"
    local checkbox pointer label_str

    if [[ "${is_sel}" -eq 1 ]]; then
      checkbox="$(clr_bold_cyan '[✓]')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "; label_str="${lbl}"
      fi
    else
      checkbox="$(clr_dim '[ ]')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "; label_str="${lbl}"
      fi
    fi

    printf "  %s %s %s\033[K\n" "${pointer}" "${checkbox}" "${label_str}"
  done
  _cb_render_footer
}

interactive_checkbox() {
  local num="${#_CB_LABELS[@]}"
  _CB_CURSOR=0
  _cb_set_viewport "${num}"

  local i
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 0 ]]; then _CB_CURSOR=$i; break; fi
  done

  _cb_render
  printf '\033[?25l'

  while true; do
    local key seq
    IFS= read -r -s -n1 key </dev/tty 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq </dev/tty 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        _CB_CURSOR=$(( (_CB_CURSOR - 1 + num) % num ))
        printf "\033[%dA" "${_CB_LINES}"; _cb_render
      elif [[ "${seq}" == '[B' ]]; then
        _CB_CURSOR=$(( (_CB_CURSOR + 1) % num ))
        printf "\033[%dA" "${_CB_LINES}"; _cb_render
      elif [[ "${seq}" == '[5' || "${seq}" == '[6' ]]; then
        local tilde; IFS= read -r -s -n1 -t 1 tilde </dev/tty 2>/dev/null || tilde=""
        if [[ "${seq}" == '[5' ]]; then
          _CB_CURSOR=$(( _CB_CURSOR - _CB_VIEW )); [[ "${_CB_CURSOR}" -lt 0 ]] && _CB_CURSOR=0
        else
          _CB_CURSOR=$(( _CB_CURSOR + _CB_VIEW )); [[ "${_CB_CURSOR}" -ge "${num}" ]] && _CB_CURSOR=$(( num - 1 ))
        fi
        printf "\033[%dA" "${_CB_LINES}"; _cb_render
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi

    if [[ "${key}" == ' ' ]]; then
      _CB_SEL[$_CB_CURSOR]=$(( 1 - _CB_SEL[$_CB_CURSOR] ))
      printf "\033[%dA" "${_CB_LINES}"; _cb_render; continue
    fi
    if [[ "${key}" == 'a' || "${key}" == 'A' ]]; then
      for ((i=0; i<num; i++)); do _CB_SEL[$i]=1; done
      printf "\033[%dA" "${_CB_LINES}"; _cb_render; continue
    fi
    if [[ "${key}" == 'n' || "${key}" == 'N' ]]; then
      for ((i=0; i<num; i++)); do _CB_SEL[$i]=0; done
      printf "\033[%dA" "${_CB_LINES}"; _cb_render; continue
    fi
  done

  printf '\033[?25h'; echo ""

  SELECTED_INDICES=()
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 1 ]]; then SELECTED_INDICES+=("$i"); fi
  done
}

# ── Interactive radio button ──────────────────────────────────────────────────
# Like interactive_checkbox but single-select. Set exactly one _CB_SEL entry to 1
# for the default; result: SELECTED_INDICES[0] holds the chosen index.

_rb_render() {
  local j num="${#_CB_LABELS[@]}"
  for ((j=0; j<num; j++)); do
    local lbl="${_CB_LABELS[$j]}"
    local is_sel="${_CB_SEL[$j]}"
    local radio pointer label_str
    if [[ "${is_sel}" -eq 1 ]]; then
      radio="$(clr_bold_cyan '(●)')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "; label_str="${lbl}"
      fi
    else
      radio="$(clr_dim '(○)')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "; label_str="$(clr_dim "${lbl}")"
      fi
    fi
    printf "  %s %s %s\n" "${pointer}" "${radio}" "${label_str}"
  done
}

interactive_radio() {
  local num="${#_CB_LABELS[@]}"
  _CB_CURSOR=0
  local i
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 1 ]]; then _CB_CURSOR=$i; break; fi
  done

  _rb_render
  printf '\033[?25l'

  while true; do
    local key seq
    IFS= read -r -s -n1 key </dev/tty 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq </dev/tty 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        _CB_CURSOR=$(( (_CB_CURSOR - 1 + num) % num ))
        printf "\033[%dA" "${num}"; _rb_render
      elif [[ "${seq}" == '[B' ]]; then
        _CB_CURSOR=$(( (_CB_CURSOR + 1) % num ))
        printf "\033[%dA" "${num}"; _rb_render
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi

    if [[ "${key}" == ' ' ]]; then
      for ((i=0; i<num; i++)); do _CB_SEL[$i]=0; done
      _CB_SEL[$_CB_CURSOR]=1
      printf "\033[%dA" "${num}"; _rb_render
      continue
    fi
  done

  printf '\033[?25h'; echo ""

  SELECTED_INDICES=()
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 1 ]]; then SELECTED_INDICES+=("$i"); break; fi
  done
}

# ── Helpers ───────────────────────────────────────────────────────────────────

# env_get <file> <KEY> : echo the value of KEY from a .env file (quote-stripped),
# mirroring readEnvFile() in scripts/utils.mjs (^[A-Z_]+=.* , last match wins).
env_get() {
  local file="$1" key="$2" line val
  [[ -f "$file" ]] || return 0
  line="$(grep -E "^${key}=" "$file" | tail -n1 || true)"
  [[ -z "$line" ]] && return 0
  val="${line#*=}"
  val="$(printf '%s' "$val" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  val="${val#[\"\']}"; val="${val%[\"\']}"
  printf '%s' "$val"
}

# prompt <label> <default> : echo the answer (default when empty or -y).
prompt() {
  local label="$1" def="${2:-}" ans suffix=""
  if [[ "$AUTO_YES" == "1" ]]; then printf '%s' "$def"; return; fi
  [[ -n "$def" ]] && suffix=" (${def})"
  read -r -p "${label}${suffix}: " ans </dev/tty || true
  printf '%s' "${ans:-$def}"
}

# confirm_word <prompt_fmt> : read a typed confirmation; return 0 if it matches
# the localized CONFIRM_WORD (or "yes"). prompt_fmt takes one %s (the word).
confirm_word() {
  local fmt="$1" answer
  read -r -p "$(printf "\n  ${fmt}" "${CONFIRM_WORD}")" answer </dev/tty || true
  answer="$(lc "${answer}")"
  [[ "${answer}" == "${CONFIRM_WORD}" || "${answer}" == "yes" ]]
}

# resolve_creds <default_url> <url_label> : sets API_URL / ADMIN_USER / ADMIN_PASS.
API_URL="" ADMIN_USER="" ADMIN_PASS=""
resolve_creds() {
  local default_url="$1" url_label="$2" d_user d_pass
  API_URL="$(prompt "  ${url_label}" "${WEBSITE_API_URL:-$default_url}")"
  d_user="${WEBSITE_ADMIN_USER:-$(env_get "$API_ENV" DJANGO_ADMIN_USER)}"
  d_pass="${WEBSITE_ADMIN_PASSWORD:-$(env_get "$API_ENV" DJANGO_ADMIN_PASSWORD)}"
  ADMIN_USER="$(prompt "  ${LBL_ADMIN_USER}" "$d_user")"
  ADMIN_PASS="$(prompt "  ${LBL_ADMIN_PASS}" "$d_pass")"
}

# ── publish ───────────────────────────────────────────────────────────────────

cmd_publish() {
  local host="" reset=0 a
  for a in "$@"; do
    case "$a" in
      --reset) reset=1 ;;
      -*) ;;                                   # unknown flags ignored (as before)
      *) [[ -z "$host" ]] && host="$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')" ;;
    esac
  done
  if [[ -z "$host" ]]; then
    err "\n  ${USAGE_TITLE}"; err "    ${USAGE_LINE_PUBLISH}\n"; exit 1
  fi

  # 1. Build the payload from the LOCAL database.
  local python="${API_DIR}/venv/bin/python" payload="" errfile
  if [[ -x "$python" ]]; then
    info "\n  $(printf "${EXPORTING}" "$host")"
    errfile="$(mktemp)"
    if payload="$(cd "$API_DIR" && "$python" manage.py export_site "$host" 2>"$errfile")"; then
      rm -f "$errfile"
    else
      local msg; msg="$(cat "$errfile")"; rm -f "$errfile"
      err "\n  ${ERR_EXPORT_FAILED}"; printf '%s\n\n' "$msg" >&2; exit 1
    fi
  else
    local file="${API_DIR}/seed_assets/exports/${host}.json"
    if [[ -f "$file" ]]; then
      info "\n  $(printf "${MSG_VENV_NOT_FOUND_USING}" "$file")"
      payload="$(cat "$file")"
    else
      err "\n  $(printf "${ERR_NO_VENV_NO_EXPORT}" "$host")"
      err "  $(printf "${HINT_RUN_EXPORT}" "$host" "$host")\n"
      exit 1
    fi
  fi

  if ! printf '%s' "$payload" | jq empty >/dev/null 2>&1; then
    err "\n  ${ERR_PAYLOAD_INVALID_JSON}\n"; exit 1
  fi
  if [[ "$reset" == "1" ]]; then
    payload="$(printf '%s' "$payload" | jq -c '. + {reset: true}')"
  fi

  # 2. Resolve production API URL + admin credentials.
  resolve_creds "$DEFAULT_API_URL" "${LBL_API_URL_PROD}"
  if [[ -z "$API_URL" || -z "$ADMIN_USER" || -z "$ADMIN_PASS" ]]; then
    err "\n  ${ERR_CREDS_REQUIRED}\n"; exit 1
  fi

  # 3. Confirm (writes to production!).
  local stories highlights prodcat servcat
  stories="$(printf '%s' "$payload"    | jq -r '(.success_stories // [])    | length')"
  highlights="$(printf '%s' "$payload" | jq -r '(.highlights // [])         | length')"
  prodcat="$(printf '%s' "$payload"    | jq -r '(.product_categories // []) | length')"
  servcat="$(printf '%s' "$payload"    | jq -r '(.service_categories // []) | length')"

  info "\n  $(printf "${MSG_PUBLISHING}" "$host" "$API_URL")"
  info "    $(printf "${SUMMARY_COUNTS}" "$stories" "$highlights" "$prodcat" "$servcat")"
  [[ "$reset" == "1" ]] && info "    ${MSG_RESET_NOTE}"

  if [[ "$AUTO_YES" != "1" ]]; then
    if ! confirm_word "${CONFIRM_PUBLISH}"; then info "\n  ${MSG_ABORTED}\n"; exit 0; fi
  fi

  # 4. POST to the production endpoint.
  local resp code body detail
  if ! resp="$(printf '%s' "$payload" | curl -sS -w $'\n%{http_code}' \
      -X POST \
      -u "${ADMIN_USER}:${ADMIN_PASS}" \
      -H 'Content-Type: application/json' \
      --data-binary @- \
      "${API_URL}/api/publish-site/")"; then
    err "\n  ${ERR_REACH_API}\n"; exit 1
  fi
  code="${resp##*$'\n'}"
  body="${resp%$'\n'*}"

  if [[ "$code" -lt 200 || "$code" -ge 300 ]]; then
    detail="$(printf '%s' "$body" | jq -r '.detail // empty' 2>/dev/null || true)"
    err "\n  $(printf "${ERR_API_RETURNED}" "$code")${detail:+ - $detail}\n"; exit 1
  fi

  ok "\n  $(printf "${MSG_PUBLISHED}" "$host")"
  printf '    %s\n\n' "$body"
  info "  ${HINT_NEXT_SYNC}\n"
}

# ── sync ──────────────────────────────────────────────────────────────────────

# Emit the ingress: YAML block for the given hosts, ending with a trailing blank
# line (mirrors buildIngressBlock() in scripts/sync-website-hosts.mjs).
build_ingress_block() {
  local h
  printf 'ingress:\n'
  printf '  enabled: true\n'
  printf "  className: 'nginx' # MicroK8s uses the nginx ingress class\n"
  printf '  annotations:\n'
  printf "    cert-manager.io/cluster-issuer: 'letsencrypt-prod'\n"
  printf '  hosts:\n'
  for h in "$@"; do
    printf '    - host: %s\n      paths:\n        - path: /\n          pathType: Prefix\n' "$h"
  done
  printf '  tls:\n'
  printf '    - secretName: website-tls\n'
  printf '      hosts:\n'
  for h in "$@"; do
    printf '        - %s\n' "$h"
  done
  printf '\n'
}

# update_env_value <file> <KEY> <value> : rewrite  KEY: 'old'  ->  KEY: 'value'
# in place, preserving indentation (mirrors updateEnvValue() in the .mjs).
update_env_value() {
  local file="$1" key="$2" value="$3" esc
  esc="$(printf '%s' "$value" | sed -e 's/[\\&|]/\\&/g')"
  sed -E -i "s|^([[:space:]]*${key}:[[:space:]]*)(['\"]?).*\2|\1'${esc}'|" "$file"
}

cmd_sync() {
  local values_yaml="${repo_root}/apps/website/helm/values.yaml"
  local api_values_yaml="${API_DIR}/helm/values.yaml"

  resolve_creds "$DEFAULT_API_URL" "${LBL_API_URL}"
  if [[ -z "$API_URL" ]]; then err "\n  ${ERR_API_URL_REQUIRED}\n"; exit 1; fi
  if [[ -z "$ADMIN_USER" || -z "$ADMIN_PASS" ]]; then
    err "\n  ${ERR_ADMIN_CREDS_REQUIRED}\n"; exit 1
  fi

  # Fetch hosts.
  info "\n  $(printf "${MSG_FETCHING_HOSTS}" "${API_URL}/api/systems/")\n"
  local resp code body
  if ! resp="$(curl -sS -w $'\n%{http_code}' \
      -u "${ADMIN_USER}:${ADMIN_PASS}" \
      "${API_URL}/api/systems/")"; then
    err "\n  ${ERR_REACH_API}\n"; exit 1
  fi
  code="${resp##*$'\n'}"
  body="${resp%$'\n'*}"
  if [[ "$code" -lt 200 || "$code" -ge 300 ]]; then
    err "\n  $(printf "${ERR_API_RETURNED}" "$code")\n"; exit 1
  fi

  local hosts=()
  mapfile -t hosts < <(printf '%s' "$body" | jq -r '.[].host')
  if [[ "${#hosts[@]}" -eq 0 ]]; then
    err "\n  ${ERR_NO_SYSTEMS}\n"; exit 1
  fi

  info "  $(printf "${MSG_FOUND_HOSTS}" "${#hosts[@]}")"
  local h
  for h in "${hosts[@]}"; do info "    • ${h}"; done

  # Update website values.yaml (ingress) - only if it actually changes.
  local blockfile tmp
  blockfile="$(mktemp)"
  build_ingress_block "${hosts[@]}" > "$blockfile"
  tmp="$(mktemp)"
  awk -v bf="$blockfile" '
    function emit_block(  line){ while((getline line < bf) > 0) print line; close(bf) }
    inb==1 { if ($0 ~ /^# ─── /) { inb=0; print; next } next }
    /^# ─── Ingress/ { print; emit_block(); inb=1; next }
    { print }
  ' "$values_yaml" > "$tmp"
  rm -f "$blockfile"

  if cmp -s "$tmp" "$values_yaml"; then
    rm -f "$tmp"
    info "\n  ${MSG_INGRESS_UP_TO_DATE}\n"
  else
    mv "$tmp" "$values_yaml"
    ok "\n  ${MSG_INGRESS_UPDATED}\n"
  fi

  # Update website-api values.yaml (CORS / CSRF / ALLOWED_HOSTS).
  local cors csrf allowed
  cors=""; for h in "${hosts[@]}"; do cors="${cors:+$cors,}https://${h}"; done
  csrf="https://${API_HOST}"; for h in "${hosts[@]}"; do csrf="${csrf},https://${h}"; done
  allowed="${API_HOST}"; for h in "${hosts[@]}"; do allowed="${allowed},${h}"; done
  allowed="${allowed},localhost,127.0.0.1"

  local api_tmp
  api_tmp="$(mktemp)"
  cp "$api_values_yaml" "$api_tmp"
  update_env_value "$api_tmp" CORS_ALLOWED_ORIGINS "$cors"
  update_env_value "$api_tmp" CSRF_TRUSTED_ORIGINS "$csrf"
  update_env_value "$api_tmp" ALLOWED_HOSTS "$allowed"

  if cmp -s "$api_tmp" "$api_values_yaml"; then
    rm -f "$api_tmp"
    info "  ${MSG_CORS_UP_TO_DATE}\n"
  else
    mv "$api_tmp" "$api_values_yaml"
    ok "  ${MSG_CORS_UPDATED}\n"
  fi
}

# ── pull ──────────────────────────────────────────────────────────────────────

PULL_SECTIONS=(system stories highlights products services)

# select_sections : interactive checklist (all checked by default). Sets the
# global CHOSEN to a comma-joined list of the checked section keys.
CHOSEN=""
select_sections() {
  if [[ "$AUTO_YES" == "1" ]]; then
    CHOSEN="$(IFS=,; echo "${PULL_SECTIONS[*]}")"; return
  fi

  _CB_LABELS=("${SEC_SYSTEM}" "${SEC_STORIES}" "${SEC_HIGHLIGHTS}" "${SEC_PRODUCTS}" "${SEC_SERVICES}")
  _CB_SEL=(1 1 1 1 1)

  info "\n  ${LBL_SECTIONS_TO_IMPORT}"
  printf "  %s\n" "$(clr_dim "${CB_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${CB_HINT}")"
  interactive_checkbox

  CHOSEN=""
  local i
  if [[ "${#SELECTED_INDICES[@]}" -gt 0 ]]; then
    for i in "${SELECTED_INDICES[@]}"; do
      CHOSEN="${CHOSEN:+$CHOSEN,}${PULL_SECTIONS[$i]}"
    done
  fi
}

cmd_pull() {
  local host="" a
  for a in "$@"; do
    case "$a" in
      -*) ;;                                    # unknown flags ignored
      *) [[ -z "$host" ]] && host="$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')" ;;
    esac
  done

  # Applying happens locally via manage.py, so the local venv is required.
  local python="${API_DIR}/venv/bin/python"
  if [[ ! -x "$python" ]]; then
    err "\n  ${ERR_VENV_NOT_FOUND}"
    err "  ${HINT_CREATE_VENV}\n"
    exit 1
  fi

  # 1. Resolve production API URL + admin credentials.
  resolve_creds "$DEFAULT_API_URL" "${LBL_API_URL_PROD}"
  if [[ -z "$API_URL" || -z "$ADMIN_USER" || -z "$ADMIN_PASS" ]]; then
    err "\n  ${ERR_CREDS_REQUIRED}\n"; exit 1
  fi

  # 2. List production sites; pick one (unless a host was passed as an argument).
  if [[ -z "$host" ]]; then
    info "\n  $(printf "${MSG_FETCHING_SITES}" "${API_URL}/api/systems/")\n"
    local resp code body
    if ! resp="$(curl -sS -w $'\n%{http_code}' -u "${ADMIN_USER}:${ADMIN_PASS}" "${API_URL}/api/systems/")"; then
      err "\n  ${ERR_REACH_API}\n"; exit 1
    fi
    code="${resp##*$'\n'}"; body="${resp%$'\n'*}"
    if [[ "$code" -lt 200 || "$code" -ge 300 ]]; then
      err "\n  $(printf "${ERR_API_RETURNED}" "$code")\n"; exit 1
    fi

    local rows=()
    mapfile -t rows < <(printf '%s' "$body" | jq -r '.[] | "\(.host)\t\(.site_name)"')
    if [[ "${#rows[@]}" -eq 0 ]]; then
      err "\n  ${ERR_NO_SYSTEMS}\n"; exit 1
    fi

    local i
    _CB_LABELS=(); _CB_SEL=()
    for i in "${!rows[@]}"; do
      _CB_LABELS+=("$(printf '%s' "${rows[$i]}" | sed 's/\t/  —  /')")
      _CB_SEL+=(0)
    done
    _CB_SEL[0]=1

    info "\n  ${LBL_SELECT_SITE}"
    printf "  %s\n\n" "$(clr_dim "${RB_PROMPT}")"
    interactive_radio
    host="$(printf '%s' "${rows[${SELECTED_INDICES[0]}]}" | cut -f1)"
  fi

  # 3. Choose which sections to import (all checked by default).
  select_sections
  if [[ -z "$CHOSEN" ]]; then info "\n  ${MSG_NOTHING_SELECTED}\n"; exit 0; fi

  # 4. Confirm (this resets the selected sections in the LOCAL database).
  info "\n  $(printf "${MSG_PULLING}" "$host" "$API_URL")"
  info "    $(printf "${MSG_SECTIONS}" "$CHOSEN")"
  info "    ${MSG_PULL_NOTE}"
  if [[ "$AUTO_YES" != "1" ]]; then
    if ! confirm_word "${CONFIRM_IMPORT}"; then info "\n  ${MSG_ABORTED}\n"; exit 0; fi
  fi

  # 5. Apply locally.
  if ( cd "$API_DIR" && "$python" manage.py import_site "$host" \
        --api-url "$API_URL" --user "$ADMIN_USER" --password "$ADMIN_PASS" \
        --sections "$CHOSEN" ); then
    ok "\n  $(printf "${MSG_PULLED}" "$host")\n"
  else
    err "\n  ${ERR_IMPORT_FAILED}\n"; exit 1
  fi
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

main() {
  local args=() a
  for a in "$@"; do
    case "$a" in
      -y) AUTO_YES=1 ;;
      *)  args+=("$a") ;;
    esac
  done
  set -- ${args[@]+"${args[@]}"}

  # Language (skipped under -y, which defaults to English for automation).
  local lang="en"
  if [[ "$AUTO_YES" != "1" ]]; then
    printf "  Select language / Selecciona idioma [en/es] (en): "
    local raw_lang=""; read -r raw_lang </dev/tty 2>/dev/null || true
    [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  fi
  setup_strings "${lang}"

  command -v curl >/dev/null 2>&1 || { err "\n  ${ERR_CURL_REQUIRED}\n"; exit 1; }
  command -v jq   >/dev/null 2>&1 || { err "\n  ${ERR_JQ_REQUIRED}\n"; exit 1; }

  [[ "$AUTO_YES" != "1" ]] && print_header

  local sub="${1:-}"
  shift || true
  case "$sub" in
    publish|publish-site)       cmd_publish "$@" ;;
    sync|sync-website-hosts)    cmd_sync "$@" ;;
    pull|pull-site)             cmd_pull "$@" ;;
    *)
      err "\n  ${USAGE_TITLE}"
      err "    ${USAGE_LINE_PUBLISH}"
      err "    ${USAGE_LINE_SYNC}"
      err "    ${USAGE_LINE_PULL}\n"
      exit 1 ;;
  esac
}

main "$@"
