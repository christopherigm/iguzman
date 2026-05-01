#!/usr/bin/env bash
# setup-dev-env.sh
#
# Interactive development environment setup script.
# Checks and installs: git, Node.js, pnpm, Docker, kubectl, Helm,
# bash-git-prompt, Python, Django, and Claude Code CLI.
#
# Run: bash cli/setup-dev-env/setup-dev-env.sh

set -euo pipefail

# ── ANSI Colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
CYAN='\033[36m'

clr_green()      { printf "${GREEN}%s${RESET}" "$*"; }
clr_red()        { printf "${RED}%s${RESET}" "$*"; }
clr_yellow()     { printf "${YELLOW}%s${RESET}" "$*"; }
clr_cyan()       { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold()       { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()        { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()  { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green() { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow(){ printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"

  if [[ "${lang}" == "es" ]]; then
    WELCOME="Configuración del Entorno de Desarrollo"
    SUBTITLE="Este script verificará e instalará las herramientas necesarias para desarrollo."
    CHECKING="Verificando herramientas instaladas..."
    INSTALLED="instalado"
    NOT_INSTALLED="no instalado"
    SELECT_PROMPT="Usa las flechas para navegar, Espacio para seleccionar, Enter para confirmar."
    SELECT_PROMPT2="Las herramientas ya instaladas están preseleccionadas y no se pueden deseleccionar."
    CONFIRM_INSTALL="Se instalarán las siguientes herramientas:"
    CONFIRM_PROMPT="¿Continuar? [s/n]"
    INSTALLING="Instalando"
    INSTALL_DONE="Listo"
    INSTALL_FAIL="Error al instalar"
    NOTHING_TO_INSTALL="Nada que instalar — todas las herramientas seleccionadas ya están presentes."
    SKIPPED="Instalación omitida."
    SSH_CHECKING="Verificando llave SSH..."
    SSH_FOUND="Llave SSH encontrada"
    SSH_NOT_FOUND="No se encontró ninguna llave SSH."
    SSH_CREATE_PROMPT="¿Crear una nueva llave SSH? [s/n]"
    SSH_EMAIL="Correo electrónico para la llave SSH"
    SSH_KEY_TYPE="Tipo de llave [ed25519/rsa]"
    SSH_CREATING="Creando llave SSH..."
    SSH_CREATED="Llave SSH creada:"
    SSH_PUBLIC_KEY="Llave pública (agrégala a GitHub / GitLab):"
    DOCKER_LOGIN_PROMPT="Docker está instalado. ¿Deseas iniciar sesión ahora? [s/n]"
    CLAUDE_LOGIN_PROMPT="Claude Code está instalado. ¿Deseas iniciar sesión ahora? [s/n]"
    ALL_DONE="¡Configuración completada! Feliz codificación."
    TOOL_GIT="Sistema de control de versiones"
    TOOL_NODEJS="Entorno de ejecución de JavaScript"
    TOOL_PNPM="Gestor de paquetes rápido y eficiente"
    TOOL_DOCKER="Plataforma de contenedores"
    TOOL_KUBECTL="CLI de Kubernetes"
    TOOL_HELM="Gestor de paquetes para Kubernetes"
    TOOL_BASH_GIT_PROMPT="Estado de Git en el prompt del shell"
    TOOL_PYTHON="Lenguaje de programación (última versión)"
    TOOL_DJANGO="Framework web de Python"
    TOOL_CLAUDE="Asistente de código con IA"
    NOTE_BASH_GIT_PROMPT="Snippet de activación agregado automáticamente a ~/.bash_profile (macOS) o ~/.bashrc (Linux).\n  Reinicia tu shell o ejecuta: source ~/.bashrc"
    CONFIRM_YES_CHARS="sy"
  else
    WELCOME="Development Environment Setup"
    SUBTITLE="This script will check and install the required tools for development."
    CHECKING="Checking installed tools..."
    INSTALLED="installed"
    NOT_INSTALLED="not installed"
    SELECT_PROMPT="Use arrow keys to navigate, Space to toggle, Enter to confirm."
    SELECT_PROMPT2="Already-installed tools are pre-selected and cannot be deselected."
    CONFIRM_INSTALL="The following tools will be installed:"
    CONFIRM_PROMPT="Proceed? [y/n]"
    INSTALLING="Installing"
    INSTALL_DONE="Done"
    INSTALL_FAIL="Failed to install"
    NOTHING_TO_INSTALL="Nothing to install — all selected tools are already present."
    SKIPPED="Installation skipped."
    SSH_CHECKING="Checking for SSH key..."
    SSH_FOUND="SSH key found"
    SSH_NOT_FOUND="No SSH key found."
    SSH_CREATE_PROMPT="Create a new SSH key? [y/n]"
    SSH_EMAIL="Email address for the SSH key"
    SSH_KEY_TYPE="Key type [ed25519/rsa]"
    SSH_CREATING="Creating SSH key..."
    SSH_CREATED="SSH key created:"
    SSH_PUBLIC_KEY="Public key (add to GitHub / GitLab):"
    DOCKER_LOGIN_PROMPT="Docker is installed. Do you want to login now? [y/n]"
    CLAUDE_LOGIN_PROMPT="Claude Code is installed. Do you want to login now? [y/n]"
    ALL_DONE="Setup complete! Happy coding."
    TOOL_GIT="Version control system"
    TOOL_NODEJS="JavaScript runtime"
    TOOL_PNPM="Fast, disk-efficient package manager"
    TOOL_DOCKER="Container platform"
    TOOL_KUBECTL="Kubernetes CLI"
    TOOL_HELM="Kubernetes package manager"
    TOOL_BASH_GIT_PROMPT="Git status in your shell prompt"
    TOOL_PYTHON="Programming language (latest)"
    TOOL_DJANGO="Python web framework"
    TOOL_CLAUDE="AI coding assistant CLI"
    NOTE_BASH_GIT_PROMPT="Source snippet automatically added to ~/.bash_profile (macOS) or ~/.bashrc (Linux).\n  Restart your shell or run: source ~/.bashrc"
    CONFIRM_YES_CHARS="y"
  fi
}

# ── Platform helpers ──────────────────────────────────────────────────────────

is_linux() { [[ "$(uname -s)" == "Linux" ]]; }
is_mac()   { [[ "$(uname -s)" == "Darwin" ]]; }

has_brew() { command -v brew &>/dev/null; }
has_apt()  { command -v apt-get &>/dev/null; }
has_dnf()  { command -v dnf &>/dev/null; }
has_yum()  { command -v yum &>/dev/null; }

try_exec() {
  "$@" &>/dev/null && return 0 || return 1
}

get_version() {
  "$@" 2>/dev/null || true
}

# ── Install functions ─────────────────────────────────────────────────────────

install_git() {
  if is_mac && has_brew; then brew install git; return $?; fi
  if has_apt; then sudo apt-get update && sudo apt-get install -y git; return $?; fi
  if has_dnf; then sudo dnf install -y git; return $?; fi
  if has_yum; then sudo yum install -y git; return $?; fi
  echo "  $(clr_yellow 'Please install Git manually: https://git-scm.com/downloads')"
  return 1
}

install_nodejs() {
  echo "  $(clr_dim 'Installing Node.js via NodeSource (LTS)...')"
  if is_linux && has_apt; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs
    return $?
  fi
  if is_mac && has_brew; then brew install node; return $?; fi
  echo "  $(clr_yellow 'Please install Node.js manually: https://nodejs.org')"
  return 1
}

install_docker() {
  if is_linux; then
    curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER"
    return $?
  fi
  if is_mac && has_brew; then brew install --cask docker; return $?; fi
  echo "  $(clr_yellow 'Please install Docker manually: https://docs.docker.com/get-docker/')"
  return 1
}

install_kubectl() {
  if is_linux; then
    if command -v snap &>/dev/null; then
      sudo snap install kubectl --classic; return $?
    fi
    if has_apt; then
      curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key \
        | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
      echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' \
        | sudo tee /etc/apt/sources.list.d/kubernetes.list
      sudo apt-get update && sudo apt-get install -y kubectl
      return $?
    fi
  fi
  if is_mac && has_brew; then brew install kubectl; return $?; fi
  echo "  $(clr_yellow 'Please install kubectl manually: https://kubernetes.io/docs/tasks/tools/')"
  return 1
}

install_helm() {
  curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | sudo bash
}

install_bash_git_prompt() {
  local dest="${HOME}/.bash-git-prompt"
  if [[ ! -d "${dest}" ]]; then
    git clone https://github.com/magicmonty/bash-git-prompt.git "${dest}" --depth=1 || return 1
  fi

  local config_file snippet
  if is_mac; then
    config_file="${HOME}/.bash_profile"
    snippet='\n# bash-git-prompt\nif [ -f "$(brew --prefix)/opt/bash-git-prompt/share/gitprompt.sh" ]; then\n  __GIT_PROMPT_DIR=$(brew --prefix)/opt/bash-git-prompt/share\n  GIT_PROMPT_ONLY_IN_REPO=1\n  source "$(brew --prefix)/opt/bash-git-prompt/share/gitprompt.sh"\nfi\n'
  else
    config_file="${HOME}/.bashrc"
    snippet='\n# bash-git-prompt\nif [ -f "$HOME/.bash-git-prompt/gitprompt.sh" ]; then\n    GIT_PROMPT_ONLY_IN_REPO=1\n    source "$HOME/.bash-git-prompt/gitprompt.sh"\nfi\n'
  fi

  if ! grep -q 'bash-git-prompt' "${config_file}" 2>/dev/null; then
    printf '%b' "${snippet}" >> "${config_file}"
  fi
  return 0
}

install_python() {
  if is_mac && has_brew; then brew install python3; return $?; fi
  if has_apt; then sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-venv; return $?; fi
  if has_dnf; then sudo dnf install -y python3 python3-pip; return $?; fi
  if has_yum; then sudo yum install -y python3 python3-pip; return $?; fi
  echo "  $(clr_yellow 'Please install Python manually: https://www.python.org/downloads/')"
  return 1
}

install_django() {
  if ! command -v pip3 &>/dev/null; then
    echo "  $(clr_dim 'pip3 not found — installing...')"
    local ok=0
    if is_mac && has_brew; then brew install python3 && ok=1
    elif has_apt; then sudo apt-get update && sudo apt-get install -y python3-pip && ok=1
    elif has_dnf; then sudo dnf install -y python3-pip && ok=1
    elif has_yum; then sudo yum install -y python3-pip && ok=1
    fi
    if [[ "${ok}" -eq 0 ]] || ! command -v pip3 &>/dev/null; then
      echo "  $(clr_yellow 'pip3 could not be installed. Install Python first, then run: pip3 install django')"
      return 1
    fi
  fi
  python3 -m pip install Django --break-system-packages
}

install_pnpm() {
  if command -v npm &>/dev/null; then sudo npm install -g pnpm; return $?; fi
  if is_mac && has_brew; then brew install pnpm; return $?; fi
  if is_linux; then curl -fsSL https://get.pnpm.io/install.sh | sh -; return $?; fi
  echo "  $(clr_yellow 'Please install pnpm manually: https://pnpm.io/installation')"
  return 1
}

install_claude() {
  if command -v npm &>/dev/null; then sudo npm install -g @anthropic-ai/claude-code; return $?; fi
  echo "  $(clr_yellow 'npm not found. Install Node.js first, then run: npm install -g @anthropic-ai/claude-code')"
  return 1
}

# ── Tool definitions ──────────────────────────────────────────────────────────
# Each entry: ID|LABEL|DESCRIPTION|CHECK_CMD|VERSION_CMD|INSTALL_FN

build_tools() {
  TOOL_IDS=(git nodejs pnpm docker kubectl helm bash-git-prompt python django claude)
  TOOL_LABELS=(Git Node.js pnpm Docker kubectl Helm bash-git-prompt Python Django "Claude Code")
  TOOL_DESCS=(
    "${TOOL_GIT}"
    "${TOOL_NODEJS}"
    "${TOOL_PNPM}"
    "${TOOL_DOCKER}"
    "${TOOL_KUBECTL}"
    "${TOOL_HELM}"
    "${TOOL_BASH_GIT_PROMPT}"
    "${TOOL_PYTHON}"
    "${TOOL_DJANGO}"
    "${TOOL_CLAUDE}"
  )
  TOOL_INSTALLED=()
  TOOL_VERSIONS=()

  # git
  if command -v git &>/dev/null; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("$(git --version 2>/dev/null)");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi

  # nodejs
  if command -v node &>/dev/null; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("$(node --version 2>/dev/null)");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi

  # pnpm
  if command -v pnpm &>/dev/null; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("pnpm $(pnpm --version 2>/dev/null)");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi

  # docker
  if command -v docker &>/dev/null; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("$(docker --version 2>/dev/null)");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi

  # kubectl
  if command -v kubectl &>/dev/null; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("$(kubectl version --client 2>/dev/null | head -1)");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi

  # helm
  if command -v helm &>/dev/null; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("$(helm version --short 2>/dev/null)");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi

  # bash-git-prompt
  if [[ -d "${HOME}/.bash-git-prompt" ]]; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("${HOME}/.bash-git-prompt");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi

  # python
  if command -v python3 &>/dev/null; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("$(python3 --version 2>/dev/null)");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi

  # django
  if python3 -m django --version &>/dev/null 2>&1; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("Django $(python3 -m django --version 2>/dev/null)");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi

  # claude
  if command -v claude &>/dev/null; then TOOL_INSTALLED+=(1); TOOL_VERSIONS+=("$(claude --version 2>/dev/null)");
  else TOOL_INSTALLED+=(0); TOOL_VERSIONS+=(""); fi
}

# ── UI Helpers ────────────────────────────────────────────────────────────────

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

pad_right() {
  local str="$1" width="$2"
  printf "%-${width}s" "${str}"
}

print_tool_list() {
  local label_w=18 version_w=28
  echo "  $(clr_bold 'Tool Status')"
  printf "  %s\n" "$(printf '─%.0s' {1..62})"

  local i
  for i in "${!TOOL_IDS[@]}"; do
    local num label version desc checkbox
    num="$(printf '%2d' $((i+1)))"
    label="$(pad_right "${TOOL_LABELS[$i]}" "${label_w}")"
    desc="${TOOL_DESCS[$i]}"

    if [[ "${TOOL_INSTALLED[$i]}" -eq 1 ]]; then
      checkbox="$(clr_bold_green '[✓]')"
      version="$(clr_dim "$(pad_right "${TOOL_VERSIONS[$i]:0:$((version_w-1))}" "${version_w}")")"
    else
      checkbox="$(clr_dim '[ ]')"
      version="$(clr_red "$(pad_right "${NOT_INSTALLED}" "${version_w}")")"
    fi

    printf "  %s  %s %s %s  %s\n" \
      "$(clr_dim "${num}")" \
      "${checkbox}" \
      "$(clr_bold "${label}")" \
      "${version}" \
      "$(clr_dim "${desc}")"
  done

  printf "  %s\n\n" "$(printf '─%.0s' {1..62})"
}

# ── Interactive Checkbox Selector ─────────────────────────────────────────────
# Uses terminal raw mode via read -s -n1.
# SELECTED_IDS — associative array: id -> 1 (selected) or 0

interactive_select() {
  local num_tools=${#TOOL_IDS[@]}
  local label_w=18
  local cursor=0

  # Initialize selection: installed tools are locked+selected; uninstalled unselected
  declare -A selected
  local i
  for i in "${!TOOL_IDS[@]}"; do
    if [[ "${TOOL_INSTALLED[$i]}" -eq 1 ]]; then
      selected["${TOOL_IDS[$i]}"]=1
    else
      selected["${TOOL_IDS[$i]}"]=0
    fi
  done

  # Start cursor at first uninstalled tool
  for i in "${!TOOL_IDS[@]}"; do
    if [[ "${TOOL_INSTALLED[$i]}" -eq 0 ]]; then
      cursor=$i
      break
    fi
  done

  render_lines() {
    local j
    for j in "${!TOOL_IDS[@]}"; do
      local id="${TOOL_IDS[$j]}"
      local lbl
      lbl="$(pad_right "${TOOL_LABELS[$j]}" "${label_w}")"
      local is_locked="${TOOL_INSTALLED[$j]}"
      local is_selected="${selected[$id]}"
      local is_active=0
      [[ $j -eq $cursor ]] && is_active=1

      local checkbox pointer label_str
      if [[ "${is_locked}" -eq 1 ]]; then
        checkbox="$(clr_bold_green '[✓]')"
        pointer=" "
        label_str="$(clr_dim "${lbl}")"
      elif [[ "${is_selected}" -eq 1 ]]; then
        checkbox="$(clr_bold_cyan '[✓]')"
        if [[ "${is_active}" -eq 1 ]]; then
          pointer="$(clr_cyan '▶')"
          label_str="$(clr_bold_cyan "${lbl}")"
        else
          pointer=" "
          label_str="${lbl}"
        fi
      else
        checkbox="$(clr_dim '[ ]')"
        if [[ "${is_active}" -eq 1 ]]; then
          pointer="$(clr_cyan '▶')"
          label_str="$(clr_bold_cyan "${lbl}")"
        else
          pointer=" "
          label_str="${lbl}"
        fi
      fi

      printf "  %s %s %s\n" "${pointer}" "${checkbox}" "${label_str}"
    done
  }

  # Save cursor, render initial
  render_lines

  # Hide cursor
  printf '\033[?25l'

  # Raw mode input loop
  while true; do
    local key esc
    # Read one char
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    # Handle escape sequences (arrow keys)
    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n1 -t 0.05 esc 2>/dev/null || esc=""
      if [[ "${esc}" == '[' ]]; then
        IFS= read -r -s -n1 -t 0.05 key 2>/dev/null || key=""
        # Move up (A) or down (B)
        if [[ "${key}" == 'A' ]]; then
          cursor=$(( (cursor - 1 + num_tools) % num_tools ))
          printf "\033[%dA" "${num_tools}"
          render_lines
        elif [[ "${key}" == 'B' ]]; then
          cursor=$(( (cursor + 1) % num_tools ))
          printf "\033[%dA" "${num_tools}"
          render_lines
        fi
      fi
      continue
    fi

    # Enter
    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then
      break
    fi

    # Ctrl+C / Ctrl+D
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then
      printf '\033[?25h'
      echo ""
      exit 0
    fi

    # Space — toggle current (skip locked)
    if [[ "${key}" == ' ' ]]; then
      local id="${TOOL_IDS[$cursor]}"
      if [[ "${TOOL_INSTALLED[$cursor]}" -eq 0 ]]; then
        if [[ "${selected[$id]}" -eq 1 ]]; then
          selected["$id"]=0
        else
          selected["$id"]=1
        fi
        printf "\033[%dA" "${num_tools}"
        render_lines
      fi
      continue
    fi

    # 'a' — select all uninstalled
    if [[ "${key}" == 'a' || "${key}" == 'A' ]]; then
      for i in "${!TOOL_IDS[@]}"; do
        if [[ "${TOOL_INSTALLED[$i]}" -eq 0 ]]; then selected["${TOOL_IDS[$i]}"]=1; fi
      done
      printf "\033[%dA" "${num_tools}"
      render_lines
      continue
    fi

    # 'n' — deselect all uninstalled
    if [[ "${key}" == 'n' || "${key}" == 'N' ]]; then
      for i in "${!TOOL_IDS[@]}"; do
        if [[ "${TOOL_INSTALLED[$i]}" -eq 0 ]]; then selected["${TOOL_IDS[$i]}"]=0; fi
      done
      printf "\033[%dA" "${num_tools}"
      render_lines
      continue
    fi
  done

  # Show cursor
  printf '\033[?25h'
  echo ""

  # Export result: indices of tools to install (uninstalled + selected)
  TO_INSTALL_INDICES=()
  for i in "${!TOOL_IDS[@]}"; do
    local id="${TOOL_IDS[$i]}"
    if [[ "${TOOL_INSTALLED[$i]}" -eq 0 && "${selected[$id]}" -eq 1 ]]; then
      TO_INSTALL_INDICES+=("$i")
    fi
  done
}

# ── SSH helpers ───────────────────────────────────────────────────────────────

find_ssh_key() {
  local keys=("${HOME}/.ssh/id_ed25519" "${HOME}/.ssh/id_rsa" "${HOME}/.ssh/id_ecdsa")
  local k
  for k in "${keys[@]}"; do
    [[ -f "${k}" ]] && echo "${k}" && return 0
  done
  return 1
}

handle_ssh_key() {
  printf "  %s\n" "$(clr_bold "${SSH_CHECKING}")"
  local existing
  existing="$(find_ssh_key 2>/dev/null || true)"

  if [[ -n "${existing}" ]]; then
    printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${SSH_FOUND}" "$(clr_dim "${existing}")"
    if [[ -f "${existing}.pub" ]]; then
      printf "\n  %s\n" "$(clr_bold "${SSH_PUBLIC_KEY}")"
      printf "  %s\n" "$(clr_cyan "$(cat "${existing}.pub")")"
    fi
    echo ""
    return
  fi

  printf "  %s  %s\n" "$(clr_yellow '⚠')" "${SSH_NOT_FOUND}"
  printf "  %s: " "${SSH_CREATE_PROMPT}"
  local create; read -r create
  local first_char="${create:0:1}"
  if [[ "${CONFIRM_YES_CHARS}" != *"${first_char,,}"* ]]; then
    echo ""
    return
  fi

  printf "  %s: " "${SSH_EMAIL}"
  local email; read -r email

  printf "  %s (ed25519): " "${SSH_KEY_TYPE}"
  local key_type; read -r key_type
  key_type="${key_type:-ed25519}"

  local key_path="${HOME}/.ssh/id_${key_type}"
  printf "\n  %s\n\n" "${SSH_CREATING}"

  local email_arg=""
  [[ -n "${email}" ]] && email_arg="-C \"${email}\""

  if ssh-keygen -t "${key_type}" -f "${key_path}" ${email_arg}; then
    printf "\n  %s %s %s\n" "$(clr_bold_green '✓')" "${SSH_CREATED}" "$(clr_dim "${key_path}")"
    if [[ -f "${key_path}.pub" ]]; then
      printf "\n  %s\n" "$(clr_bold "${SSH_PUBLIC_KEY}")"
      printf "  %s\n" "$(clr_cyan "$(cat "${key_path}.pub")")"
    fi
  fi
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  # ── Step 1: Language ────────────────────────────────────────────────────────
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang
  local lang="en"
  [[ "${raw_lang,,}" == es* ]] && lang="es"

  setup_strings "${lang}"

  # ── Step 2: Header ──────────────────────────────────────────────────────────
  clear
  print_header

  # ── Step 3: Check tools ─────────────────────────────────────────────────────
  printf "  %s\n\n" "$(clr_dim "${CHECKING}")"
  build_tools
  print_tool_list

  # ── Step 4: Interactive selection ───────────────────────────────────────────
  local has_uninstalled=0
  local i
  for i in "${!TOOL_IDS[@]}"; do
    [[ "${TOOL_INSTALLED[$i]}" -eq 0 ]] && has_uninstalled=1 && break
  done

  if [[ "${has_uninstalled}" -eq 0 ]]; then
    printf "  %s %s\n\n" "$(clr_bold_green '✓')" "${NOTHING_TO_INSTALL}"
  else
    printf "  %s\n" "$(clr_bold 'Select tools to install:')"
    printf "  %s\n" "$(clr_dim "${SELECT_PROMPT}")"
    printf "  %s\n" "$(clr_dim "${SELECT_PROMPT2}")"
    printf "  %s\n\n" "$(clr_dim '(a = select all  ·  n = deselect all)')"

    # Initialize array before calling
    TO_INSTALL_INDICES=()
    interactive_select
    echo ""

    if [[ ${#TO_INSTALL_INDICES[@]} -eq 0 ]]; then
      printf "  %s\n\n" "${SKIPPED}"
    else
      printf "  %s\n" "$(clr_bold "${CONFIRM_INSTALL}")"
      for i in "${TO_INSTALL_INDICES[@]}"; do
        printf "    %s %s\n" "$(clr_cyan '•')" "${TOOL_LABELS[$i]}"
      done
      echo ""

      printf "  %s (y): " "${CONFIRM_PROMPT}"
      local confirm; read -r confirm
      confirm="${confirm:-y}"
      local first_char="${confirm:0:1}"

      if [[ "${CONFIRM_YES_CHARS}" == *"${first_char,,}"* ]]; then
        for i in "${TO_INSTALL_INDICES[@]}"; do
          printf "\n  %s %s %s...\n\n" \
            "$(clr_bold_yellow '→')" \
            "${INSTALLING}" \
            "$(clr_bold "${TOOL_LABELS[$i]}")"

          local ok=0
          case "${TOOL_IDS[$i]}" in
            git)             install_git             && ok=1 || true ;;
            nodejs)          install_nodejs          && ok=1 || true ;;
            pnpm)            install_pnpm            && ok=1 || true ;;
            docker)          install_docker          && ok=1 || true ;;
            kubectl)         install_kubectl         && ok=1 || true ;;
            helm)            install_helm            && ok=1 || true ;;
            bash-git-prompt) install_bash_git_prompt && ok=1 || true ;;
            python)          install_python          && ok=1 || true ;;
            django)          install_django          && ok=1 || true ;;
            claude)          install_claude          && ok=1 || true ;;
          esac

          if [[ "${ok}" -eq 1 ]]; then
            printf "\n  %s %s: %s\n" "$(clr_bold_green '✓')" "${INSTALL_DONE}" "${TOOL_LABELS[$i]}"
          else
            printf "\n  %s %s: %s\n" "$(clr_red '✗')" "${INSTALL_FAIL}" "${TOOL_LABELS[$i]}"
          fi

          # Post-install notes
          if [[ "${TOOL_IDS[$i]}" == "bash-git-prompt" ]]; then
            echo ""
            printf "  %s  %b\n" "$(clr_yellow 'ℹ')" "${NOTE_BASH_GIT_PROMPT}"
          fi
        done
        echo ""
      else
        printf "  %s\n\n" "${SKIPPED}"
      fi
    fi
  fi

  # ── Step 5: SSH Key ─────────────────────────────────────────────────────────
  handle_ssh_key

  # ── Step 6: Docker login ─────────────────────────────────────────────────────
  if command -v docker &>/dev/null; then
    printf "  %s: " "${DOCKER_LOGIN_PROMPT}"
    local do_login; read -r do_login
    do_login="${do_login:-n}"
    local first_char="${do_login:0:1}"
    if [[ "${CONFIRM_YES_CHARS}" == *"${first_char,,}"* ]]; then
      echo ""
      docker login
      echo ""
    fi
  fi

  # ── Step 7: Claude Code login ────────────────────────────────────────────────
  if command -v claude &>/dev/null; then
    printf "  %s: " "${CLAUDE_LOGIN_PROMPT}"
    local do_login; read -r do_login
    do_login="${do_login:-n}"
    local first_char="${do_login:0:1}"
    if [[ "${CONFIRM_YES_CHARS}" == *"${first_char,,}"* ]]; then
      echo ""
      claude login
      echo ""
    fi
  fi

  # ── Done ─────────────────────────────────────────────────────────────────────
  printf "  %s %s\n\n" "$(clr_bold_green '✓')" "${ALL_DONE}"
}

main "$@"
