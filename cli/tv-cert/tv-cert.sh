#!/usr/bin/env bash
# tv-cert.sh - create a Samsung Tizen author certificate + security profile.
#
# Scope: EMULATOR ONLY. This creates an author certificate and a Tizen security
# profile signed with the default Tizen distributor certificate, which is enough
# to package and run on the TV emulator. Running on a *physical* Samsung TV needs
# a Samsung-issued distributor certificate bound to the TV's DUID, which can only
# be obtained through the Certificate Manager GUI (Samsung account login). See
# apps/help ▸ Smart TV.
#
# Requires Tizen Studio (the `tizen` CLI). Run: bash cli/tv-cert/tv-cert.sh
# Append "es" for Spanish prompts: bash cli/tv-cert/tv-cert.sh es

set -euo pipefail

RESET='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
GREEN='\033[32m'; RED='\033[31m'; CYAN='\033[36m'; YELLOW='\033[33m'

clr_red()         { printf "${RED}%s${RESET}" "$*"; }
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow() { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Certificado Samsung Smart TV"
    SUBTITLE="Crea un certificado de autor + perfil de firma (solo emulador)."
    TIZEN_MISSING="No se encontró la herramienta 'tizen' de Tizen Studio."
    TIZEN_HINT="Instala Tizen Studio o exporta TIZEN_HOME apuntando a su carpeta."
    STEP_CONFIG="[1/3] Datos del certificado"
    STEP_CERT="[2/3] Generando certificado de autor"
    STEP_PROFILE="[3/3] Creando perfil de seguridad"
    ALIAS_PROMPT="Nombre del autor / alias"
    ALIAS_REQUIRED="El nombre del autor es requerido."
    PASSWORD_PROMPT="Contraseña del certificado"
    PASSWORD_REQUIRED="La contraseña es requerida."
    NAME_PROMPT="Nombre completo"
    EMAIL_PROMPT="Correo electrónico"
    COUNTRY_PROMPT="Código de país (2 letras)"
    STATE_PROMPT="Estado"
    CITY_PROMPT="Ciudad"
    ORG_PROMPT="Organización"
    UNIT_PROMPT="Unidad organizacional"
    PROFILE_PROMPT="Nombre del perfil de seguridad"
    SUMMARY_TITLE="Resumen"
    CONFIRM_PROMPT="¿Generar certificado y perfil?"
    ABORTED_MSG="Cancelado."
    CERT_FAILED="Falló la creación del certificado."
    CERT_NOT_FOUND="No se encontró el archivo .p12 generado."
    PROFILE_FAILED="Falló la creación del perfil de seguridad."
    DONE_MSG="¡Listo! Perfil de firma creado."
    NEXT_STEPS="Próximos pasos"
    NEXT_BUILD="pnpm tv-build   # empaqueta una app firmada con este perfil"
    DEVICE_NOTE="Para TVs físicas necesitas un certificado de distribuidor de Samsung (Certificate Manager, login de Samsung). Este perfil sirve para el emulador."
  else
    WELCOME="Samsung Smart TV Certificate"
    SUBTITLE="Create an author certificate + signing profile (emulator only)."
    TIZEN_MISSING="Tizen Studio's 'tizen' CLI was not found."
    TIZEN_HINT="Install Tizen Studio or export TIZEN_HOME pointing at its folder."
    STEP_CONFIG="[1/3] Certificate details"
    STEP_CERT="[2/3] Generating author certificate"
    STEP_PROFILE="[3/3] Creating security profile"
    ALIAS_PROMPT="Author name / alias"
    ALIAS_REQUIRED="Author name is required."
    PASSWORD_PROMPT="Certificate password"
    PASSWORD_REQUIRED="Password is required."
    NAME_PROMPT="Full name"
    EMAIL_PROMPT="Email"
    COUNTRY_PROMPT="Country code (2 letters)"
    STATE_PROMPT="State"
    CITY_PROMPT="City"
    ORG_PROMPT="Organization"
    UNIT_PROMPT="Organizational unit"
    PROFILE_PROMPT="Security profile name"
    SUMMARY_TITLE="Summary"
    CONFIRM_PROMPT="Generate certificate and profile?"
    ABORTED_MSG="Aborted."
    CERT_FAILED="Certificate creation failed."
    CERT_NOT_FOUND="Could not locate the generated .p12 file."
    PROFILE_FAILED="Security profile creation failed."
    DONE_MSG="Done! Signing profile created."
    NEXT_STEPS="Next steps"
    NEXT_BUILD="pnpm tv-build   # package a signed app with this profile"
    DEVICE_NOTE="Physical TVs need a Samsung distributor certificate (Certificate Manager, Samsung login). This profile is for the emulator."
  fi
}

# ── UI helpers ────────────────────────────────────────────────────────────────

print_header() {
  local line; line="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

prompt_visible() {
  local label="$1" default="${2:-}"
  if [[ -n "${default}" ]]; then
    printf "  %s (%s): " "$(clr_bold "${label}")" "$(clr_dim "${default}")" >/dev/tty
  else
    printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  fi
  local val; IFS= read -r val </dev/tty || true
  if [[ -z "${val}" && -n "${default}" ]]; then val="${default}"; fi
  printf '%s' "${val}"
}

# Hidden input for the password (no echo).
prompt_secret() {
  local label="$1"
  printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  local val; IFS= read -r -s val </dev/tty || true
  echo "" >/dev/tty
  printf '%s' "${val}"
}

confirm_yn() {
  local label="$1" default="${2:-y}"
  local suffix default_upper; default_upper="$(printf '%s' "${default}" | tr '[:lower:]' '[:upper:]')"; suffix="[Y/N] (${default_upper})"
  printf "  %s %s: " "$(clr_bold "${label}")" "$(clr_dim "${suffix}")" >/dev/tty
  local val; IFS= read -r val </dev/tty || true
  val="${val:-${default}}"; local char="${val:0:1}"; char="$(lc "${char}")"
  [[ "${char}" == "y" || "${char}" == "s" ]]
}

# ── Tizen toolchain discovery ─────────────────────────────────────────────────
# tizen/sdb usually live under ~/tizen-studio/tools and are not on PATH.

TIZEN_BIN=""
resolve_tizen() {
  local base
  for base in "${TIZEN_HOME:-}" "$HOME/tizen-studio" "$HOME/TizenStudio" "/opt/tizen-studio"; do
    [[ -z "${base}" ]] && continue
    if [[ -x "${base}/tools/ide/bin/tizen" ]]; then
      TIZEN_HOME="${base}"
      TIZEN_BIN="${base}/tools/ide/bin/tizen"
      return 0
    fi
  done
  if command -v tizen &>/dev/null; then
    TIZEN_BIN="$(command -v tizen)"
    return 0
  fi
  return 1
}

# Locate the .p12 the `tizen certificate` step just wrote, newest match wins.
find_p12() {
  local name="$1" dir hit
  for dir in "$HOME/SamsungCertificate" "${TIZEN_DATA:-$HOME/tizen-studio-data}/keystore/author" "$HOME/tizen-studio-data/keystore/author" "$PWD"; do
    [[ -d "${dir}" ]] || continue
    hit="$(find "${dir}" -name "${name}.p12" -type f 2>/dev/null | head -n1)"
    [[ -n "${hit}" ]] && { printf '%s' "${hit}"; return 0; }
  done
  return 1
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  local lang="en"; [[ "${1:-}" == "es" ]] && lang="es"
  setup_strings "${lang}"
  print_header

  if ! resolve_tizen; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${TIZEN_MISSING}" >/dev/tty
    printf "  %s\n\n" "$(clr_dim "${TIZEN_HINT}")" >/dev/tty
    exit 1
  fi

  echo "  $(clr_bold "${STEP_CONFIG}")"
  echo ""

  local alias_name
  while true; do
    alias_name="$(prompt_visible "${ALIAS_PROMPT}")"
    [[ -n "${alias_name}" ]] && break
    printf "  %s\n" "$(clr_red "${ALIAS_REQUIRED}")" >/dev/tty
  done

  local password
  while true; do
    password="$(prompt_secret "${PASSWORD_PROMPT}")"
    [[ -n "${password}" ]] && break
    printf "  %s\n" "$(clr_red "${PASSWORD_REQUIRED}")" >/dev/tty
  done

  local full_name email country state city org unit profile
  full_name="$(prompt_visible "${NAME_PROMPT}" "${alias_name}")"
  email="$(prompt_visible "${EMAIL_PROMPT}" "")"
  country="$(prompt_visible "${COUNTRY_PROMPT}" "MX")"
  state="$(prompt_visible "${STATE_PROMPT}" "")"
  city="$(prompt_visible "${CITY_PROMPT}" "")"
  org="$(prompt_visible "${ORG_PROMPT}" "")"
  unit="$(prompt_visible "${UNIT_PROMPT}" "")"
  profile="$(prompt_visible "${PROFILE_PROMPT}" "${alias_name}")"

  # A filesystem-safe certificate filename derived from the alias.
  local cert_file; cert_file="$(printf '%s' "${alias_name}" | tr -c 'a-zA-Z0-9_-' '_')"

  # Summary.
  local sep; sep="$(printf '─%.0s' {1..53})"
  echo "" >/dev/tty
  printf "  %s\n" "$(clr_bold_cyan "── ${SUMMARY_TITLE} ${sep:${#SUMMARY_TITLE}}")" >/dev/tty
  printf "  %-14s %s\n" "Author:"  "$(clr_bold_cyan "${alias_name}")" >/dev/tty
  printf "  %-14s %s\n" "Name:"    "${full_name}" >/dev/tty
  printf "  %-14s %s\n" "Country:" "${country}" >/dev/tty
  printf "  %-14s %s\n" "Profile:" "$(clr_bold "${profile}")" >/dev/tty
  echo "" >/dev/tty

  if ! confirm_yn "${CONFIRM_PROMPT}" "y"; then
    printf "  %s\n" "$(clr_bold_red "${ABORTED_MSG}")" >/dev/tty
    exit 1
  fi

  # ── Generate the author certificate. ────────────────────────────────────────
  echo "" >/dev/tty
  echo "  $(clr_bold "${STEP_CERT}")" >/dev/tty

  # Optional DN fields are only passed when provided (empty flags upset the CLI).
  local -a cert_opts=(-a "${alias_name}" -p "${password}" -f "${cert_file}" -n "${full_name}")
  [[ -n "${email}" ]]   && cert_opts+=(-e "${email}")
  [[ -n "${country}" ]] && cert_opts+=(-c "${country}")
  [[ -n "${state}" ]]   && cert_opts+=(-s "${state}")
  [[ -n "${city}" ]]    && cert_opts+=(-ct "${city}")
  [[ -n "${org}" ]]     && cert_opts+=(-o "${org}")
  [[ -n "${unit}" ]]    && cert_opts+=(-u "${unit}")

  if ! "${TIZEN_BIN}" certificate "${cert_opts[@]}"; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${CERT_FAILED}" >/dev/tty
    exit 1
  fi

  local p12_path
  if ! p12_path="$(find_p12 "${cert_file}")"; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${CERT_NOT_FOUND}" >/dev/tty
    exit 1
  fi
  printf "  %s %s\n" "$(clr_bold_green '✓')" "$(clr_dim "${p12_path}")" >/dev/tty

  # ── Register the security profile. ──────────────────────────────────────────
  echo "" >/dev/tty
  echo "  $(clr_bold "${STEP_PROFILE}")" >/dev/tty

  if ! "${TIZEN_BIN}" security-profiles add -n "${profile}" -a "${p12_path}" -p "${password}"; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${PROFILE_FAILED}" >/dev/tty
    exit 1
  fi

  echo "" >/dev/tty
  printf "  %s %s\n" "$(clr_bold_green '✓')" "$(clr_bold "${DONE_MSG}")" >/dev/tty
  echo "" >/dev/tty
  printf "  %s %s\n" "$(clr_bold_yellow '!')" "$(clr_dim "${DEVICE_NOTE}")" >/dev/tty
  echo "" >/dev/tty
  printf "  %s\n" "$(clr_bold "${NEXT_STEPS}")" >/dev/tty
  printf "    %s\n" "$(clr_dim "${NEXT_BUILD}")" >/dev/tty
  echo "" >/dev/tty
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
