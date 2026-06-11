#!/usr/bin/env bash
# setup-venv.sh — create and populate a Python venv for a Django app
#
# Discovers Django apps (those with manage.py + requirements.txt) under apps/,
# lets the user pick one interactively, then:
#   1. Creates a venv at apps/<app>/venv/
#   2. Installs requirements.txt into it
#
# Run: bash cli/setup-venv/setup-venv.sh [app-name]
#
# NOTE: Any new tool added to the optional tools section MUST support both
#       Linux (apt / snap) and macOS (Homebrew). Do not add Linux-only tools.

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
    WELCOME="Configurar Entorno Virtual"
    SUBTITLE="Crea un venv e instala dependencias para una app Django."
    APP_PROMPT="Selecciona la aplicación"
    APP_NOT_FOUND="No se encontraron apps Django (manage.py + requirements.txt) en apps/."
    APP_INVALID="App no encontrada"
    PREREQ_CHECKING="Verificando requisitos previos..."
    PREREQ_MISSING_PYTHON="python3 no está instalado."
    PREREQ_MISSING_PIP="pip no está instalado."
    PREREQ_FIX="Instala las herramientas faltantes ejecutando:"
    PREREQ_CMD="bash cli/setup-dev-env/setup-dev-env.sh"
    STEP_VENV="[1/2] Entorno virtual"
    STEP_DEPS="[2/2] Instalando dependencias"
    VENV_EXISTS="El venv ya existe — recreando..."
    VENV_CREATING="Creando entorno virtual en"
    VENV_DONE="Entorno virtual creado."
    DEPS_INSTALLING="Instalando dependencias desde requirements.txt..."
    DEPS_DONE="Dependencias instaladas."
    DONE_MSG="¡Listo!"
    NEXT_STEPS="Próximos pasos"
    ACTIVATE_HINT="Para activar el entorno virtual:"
    TOOLS_SECTION="Herramientas opcionales de desarrollo"
    TOOLS_PROMPT="Selecciona herramientas a instalar"
    TOOLS_HINT="Espacio: activar/desactivar · Enter: confirmar"
    TOOLS_ALREADY="ya instalado — omitiendo"
    TOOLS_INSTALLING="Instalando"
    TOOLS_DONE="instalado."
    TOOLS_SKIPPED="Sin herramientas seleccionadas — omitiendo."
  else
    WELCOME="Setup Virtual Environment"
    SUBTITLE="Create a venv and install dependencies for a Django app."
    APP_PROMPT="Select application"
    APP_NOT_FOUND="No Django apps (manage.py + requirements.txt) found in apps/."
    APP_INVALID="App not found"
    PREREQ_CHECKING="Checking prerequisites..."
    PREREQ_MISSING_PYTHON="python3 is not installed."
    PREREQ_MISSING_PIP="pip is not installed."
    PREREQ_FIX="Install missing tools first by running:"
    PREREQ_CMD="bash cli/setup-dev-env/setup-dev-env.sh"
    STEP_VENV="[1/2] Virtual environment"
    STEP_DEPS="[2/2] Installing dependencies"
    VENV_EXISTS="venv already exists — recreating..."
    VENV_CREATING="Creating virtual environment at"
    VENV_DONE="Virtual environment created."
    DEPS_INSTALLING="Installing dependencies from requirements.txt..."
    DEPS_DONE="Dependencies installed."
    DONE_MSG="Done!"
    NEXT_STEPS="Next steps"
    ACTIVATE_HINT="To activate the virtual environment:"
    TOOLS_SECTION="Optional developer tools"
    TOOLS_PROMPT="Select tools to install"
    TOOLS_HINT="Space: toggle · Enter: confirm"
    TOOLS_ALREADY="already installed — skipping"
    TOOLS_INSTALLING="Installing"
    TOOLS_DONE="installed."
    TOOLS_SKIPPED="No tools selected — skipping."
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

# ── Multi-select (checkbox) list ─────────────────────────────────────────────
# Input:  MENU_ITEMS[], MENU_CHECKED[] (0/1 per item)
# Output: MENU_CHECKED[] (updated)

interactive_multiselect() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0

  render_multiselect() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 42)"
      local ptr check label_str
      if [[ $j -eq $cursor ]]; then
        ptr="$(clr_cyan '▶')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        ptr=" "
        label_str="${lbl}"
      fi
      if [[ "${MENU_CHECKED[$j]}" -eq 1 ]]; then
        check="$(clr_bold_green '[✓]')"
      else
        check="$(clr_dim '[ ]')"
      fi
      printf "  %s  %s  %s\n" "${ptr}" "${check}" "${label_str}"
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
        printf "\033[%dA" "${num}"; render_multiselect
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num ))
        printf "\033[%dA" "${num}"; render_multiselect
      fi
      continue
    fi

    if [[ "${key}" == ' ' ]]; then
      MENU_CHECKED[$cursor]=$(( 1 - MENU_CHECKED[$cursor] ))
      printf "\033[%dA" "${num}"; render_multiselect
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

lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

section() { printf "\n  %s\n\n" "$(clr_bold_yellow "$*")"; }

check_prerequisites() {
  printf "  %s\n" "$(clr_dim "${PREREQ_CHECKING}")"

  local ok=1

  if ! command -v python3 &>/dev/null; then
    printf "  %s  %s\n" "$(clr_bold_red '✗')" "${PREREQ_MISSING_PYTHON}"
    ok=0
  else
    if ! (command -v pip3 &>/dev/null || python3 -m pip --version &>/dev/null 2>&1); then
      printf "  %s  %s\n" "$(clr_bold_red '✗')" "${PREREQ_MISSING_PIP}"
      ok=0
    fi
  fi

  if [[ "${ok}" -eq 0 ]]; then
    echo ""
    printf "  %s\n" "${PREREQ_FIX}"
    printf "  %s\n\n" "$(clr_bold_cyan "${PREREQ_CMD}")"
    exit 1
  fi

  echo ""
}

# ── Tool installers ───────────────────────────────────────────────────────────

_brew_check() {
  if ! command -v brew &>/dev/null; then
    printf "  %s  Homebrew not found. Install it first:\n" "$(clr_bold_red '✗')"
    printf "  %s\n" "$(clr_dim 'https://brew.sh')"
    return 1
  fi
}

install_vscodium() {
  if command -v codium &>/dev/null; then
    printf "  $(clr_dim '·')  codium %s\n" "${TOOLS_ALREADY}"; return
  fi
  printf "  $(clr_dim "${TOOLS_INSTALLING}") codium (v1.121.03429)...\n"
  if [[ "${PLATFORM}" == "macos" ]]; then
    _brew_check || return 1
    brew install --cask vscodium
  else
    wget -qO - https://gitlab.com/paulcarroty/vscodium-deb-rpm-repo/raw/master/pub.gpg \
      | gpg --dearmor \
      | sudo dd of=/usr/share/keyrings/vscodium-archive-keyring.gpg 2>/dev/null
    echo 'deb [ signed-by=/usr/share/keyrings/vscodium-archive-keyring.gpg ] https://download.vscodium.com/debs vscodium main' \
      | sudo tee /etc/apt/sources.list.d/vscodium.list >/dev/null
    sudo apt-get update -qq
    sudo apt-get install -y codium
  fi
  printf "  %s  codium %s\n" "$(clr_bold_green '✓')" "${TOOLS_DONE}"
}

install_ghostty() {
  if command -v ghostty &>/dev/null; then
    printf "  $(clr_dim '·')  ghostty %s\n" "${TOOLS_ALREADY}"; return
  fi
  printf "  $(clr_dim "${TOOLS_INSTALLING}") ghostty (v1.3.0)...\n"
  if [[ "${PLATFORM}" == "macos" ]]; then
    _brew_check || return 1
    brew install ghostty
  elif command -v apt-get &>/dev/null; then
    sudo apt-get install -y ghostty 2>/dev/null && {
      printf "  %s  ghostty %s\n" "$(clr_bold_green '✓')" "${TOOLS_DONE}"; return
    }
    command -v snap &>/dev/null && sudo snap install ghostty --classic || {
      printf "  %s  ghostty: no supported package manager (apt/snap) found.\n" "$(clr_bold_red '✗')"
      printf "  %s\n" "$(clr_dim 'Download manually: https://ghostty.org/download')"
      return 1
    }
  elif command -v snap &>/dev/null; then
    sudo snap install ghostty --classic
  else
    printf "  %s  ghostty: no supported package manager (apt/snap) found.\n" "$(clr_bold_red '✗')"
    printf "  %s\n" "$(clr_dim 'Download manually: https://ghostty.org/download')"
    return 1
  fi
  printf "  %s  ghostty %s\n" "$(clr_bold_green '✓')" "${TOOLS_DONE}"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  local app_arg=""
  [[ $# -gt 0 ]] && app_arg="$1"

  # ── Language ──────────────────────────────────────────────────────────────────
  local lang="en"
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang </dev/tty || true
  [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  setup_strings "${lang}"

  # ── Platform ──────────────────────────────────────────────────────────────────
  local uname_s; uname_s="$(uname -s)"
  local PLATFORM
  case "${uname_s}" in
    Darwin) PLATFORM="macos" ;;
    *)      PLATFORM="linux" ;;
  esac

  clear
  print_header

  # ── Prerequisites ─────────────────────────────────────────────────────────────
  check_prerequisites

  # ── Repo root ─────────────────────────────────────────────────────────────────
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  local repo_root
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  # ── Discover Django apps ──────────────────────────────────────────────────────
  local -a APP_NAMES=()
  local -a APP_DIRS=()
  for d in "${repo_root}/apps"/*/; do
    if [[ -f "${d}manage.py" && -f "${d}requirements.txt" ]]; then
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

  # ── Optional tools ────────────────────────────────────────────────────────────
  section "${TOOLS_SECTION}"
  printf "  %s:\n" "$(clr_bold "${TOOLS_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${TOOLS_HINT}")"

  MENU_ITEMS=("VSCodium  (v1.121.03429 — open-source VS Code build)" "Ghostty   (v1.3.0 — GPU-accelerated terminal emulator)")
  MENU_CHECKED=(0 0)
  interactive_multiselect
  echo ""

  if [[ "${MENU_CHECKED[0]}" -eq 1 || "${MENU_CHECKED[1]}" -eq 1 ]]; then
    [[ "${MENU_CHECKED[0]}" -eq 1 ]] && install_vscodium
    [[ "${MENU_CHECKED[1]}" -eq 1 ]] && install_ghostty
    echo ""
  else
    printf "  %s\n\n" "$(clr_dim "${TOOLS_SKIPPED}")"
  fi

  local venv_dir="${app_dir}/venv"

  # ── Step 1: Virtual environment ───────────────────────────────────────────────
  section "${STEP_VENV}"

  if [[ -d "${venv_dir}" ]]; then
    printf "  %s  %s\n" "$(clr_bold_yellow '!')" "${VENV_EXISTS}"
    rm -rf "${venv_dir}"
  fi

  printf "  %s %s\n" "$(clr_dim "${VENV_CREATING}")" "$(clr_cyan "apps/${app_name}/venv")"
  python3 -m venv "${venv_dir}"
  printf "  %s  %s\n" "$(clr_bold_green '✓')" "${VENV_DONE}"

  # ── Step 2: Install dependencies ──────────────────────────────────────────────
  section "${STEP_DEPS}"

  printf "  %s\n\n" "$(clr_dim "${DEPS_INSTALLING}")"
  "${venv_dir}/bin/pip" install --upgrade pip --quiet
  "${venv_dir}/bin/pip" install -r "${app_dir}/requirements.txt"
  printf "\n  %s  %s\n" "$(clr_bold_green '✓')" "${DEPS_DONE}"

  # ── Done ──────────────────────────────────────────────────────────────────────
  echo ""
  printf "  %s\n" "$(clr_bold_green "${DONE_MSG}")"
  echo ""
  printf "  %s:\n" "$(clr_bold "${NEXT_STEPS}")"
  printf "  %s\n" "$(clr_dim "${ACTIVATE_HINT}")"
  printf "  %s\n\n" "$(clr_bold_cyan "source apps/${app_name}/venv/bin/activate")"
}

main "$@"
