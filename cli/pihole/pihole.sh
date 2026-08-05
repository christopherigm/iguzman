#!/usr/bin/env bash
# pihole.sh
#
# Interactive operations for the Pi-hole Helm chart (packages/charts/pihole).
#
# Actions (menu loops until you pick Quit):
#   Status, Update chart repository, Set/change admin password,
#   Reveal password & endpoints, Redeploy (helm upgrade --install),
#   Restart / scale, Logs & diagnostics, Pi-hole maintenance, Uninstall
#
# The admin password lives in a Secret created OUTSIDE Helm (values.yaml only
# names it via pihole.admin.existingSecret), so it is never stored in the
# release values or in git - see packages/charts/pihole/README.md.
#
# Run: bash cli/pihole/pihole.sh   (or: pnpm pihole)

set -euo pipefail

# ── ANSI Colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
CYAN='\033[36m'
YELLOW='\033[33m'

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
    WELCOME="Pi-hole - Operaciones del chart"
    SUBTITLE="Estado, contraseña, redespliegue y mantenimiento."
    HELM_MISSING="helm no está instalado o no está en PATH."
    HELM_MISSING_HINT="Instálalo en: https://helm.sh/docs/intro/install/"
    KUBECTL_MISSING="kubectl no está instalado o no está en PATH."
    CHART_MISSING="No se encontró el chart en"
    RELEASE_PROMPT="Nombre del release"
    NS_PROMPT="Namespace de Kubernetes"
    NS_REQUIRED="El namespace es requerido."
    NS_MISSING="El namespace no existe todavía (se creará al desplegar)."
    ACTION_PROMPT="Selecciona una acción"
    ACTION_HINT="↑/↓ = mover  ·  enter = ejecutar"
    PRESS_ENTER="Presiona enter para volver al menú..."
    CANCELLED="Cancelado."
    BYE="Listo."

    OP_STATUS="Estado del despliegue"
    OP_REPO="Actualizar repo/dependencia del chart"
    OP_PASSWORD="Establecer / cambiar contraseña admin"
    OP_REVEAL="Mostrar contraseña y endpoints"
    OP_REDEPLOY="Redesplegar chart (helm upgrade)"
    OP_RESTART="Reiniciar / escalar"
    OP_LOGS="Logs y diagnóstico"
    OP_MAINT="Mantenimiento de Pi-hole"
    OP_UNINSTALL="Desinstalar Pi-hole"
    OP_QUIT="Salir"

    STATUS_RELEASE="Release de Helm"
    STATUS_WORKLOADS="Deployment y pods"
    STATUS_SERVICES="Servicios (LoadBalancer)"
    STATUS_STORAGE="Almacenamiento (PVC)"
    STATUS_SECRET="Secreto de la contraseña"
    STATUS_NO_RELEASE="(no hay release instalado en este namespace)"
    SECRET_OK="existe"
    SECRET_ABSENT="NO existe - créalo con \"${OP_PASSWORD}\""

    REPO_TITLE="Repositorio del chart upstream"
    REPO_ADDING="Agregando el repo de Helm"
    REPO_UPDATING="Actualizando índices del repo"
    REPO_CURRENT="Versión fijada en Chart.lock"
    REPO_LATEST="Última versión publicada"
    REPO_UPTODATE="Ya estás en la última versión."
    REPO_DEP_CONFIRM="¿Ejecutar helm dependency update? (reescribe Chart.lock y charts/)"
    REPO_DEP_OK="Dependencia actualizada. Revisa el diff de git y redespliega para aplicarla."
    REPO_DEP_FAILED="helm dependency update falló."

    PW_TITLE="Contraseña del panel web / API"
    PW_MODE_PROMPT="¿Cómo quieres definir la contraseña?"
    PW_MODE_RANDOM="Generar una aleatoria (28 caracteres)"
    PW_MODE_MANUAL="Escribirla yo"
    PW_PROMPT="Nueva contraseña"
    PW_CONFIRM_PROMPT="Confirma la contraseña"
    PW_MISMATCH="Las contraseñas no coinciden."
    PW_REQUIRED="La contraseña es requerida."
    PW_GENERATED="Contraseña generada"
    PW_APPLY_CONFIRM="¿Escribir el secreto %s en el namespace %s?"
    PW_APPLIED="Secreto actualizado."
    PW_APPLY_FAILED="No se pudo escribir el secreto."
    PW_RESTART_HINT="Pi-hole solo lee la contraseña al arrancar el pod."
    PW_RESTART_CONFIRM="¿Reiniciar el deployment ahora para aplicarla?"

    REVEAL_TITLE="Acceso al panel"
    REVEAL_PASSWORD="Contraseña"
    REVEAL_WEB="Panel web"
    REVEAL_DNS="DNS (apunta aquí tu router)"
    REVEAL_NO_SECRET="No se encontró el secreto de la contraseña."
    REVEAL_NO_IP="(sin IP externa asignada todavía)"

    DEPLOY_TITLE="Redesplegar el chart"
    DEPLOY_DEP_MISSING="Falta la dependencia del chart; ejecutando helm dependency build..."
    DEPLOY_SECRET_WARN="El secreto de la contraseña no existe. Sin él, el pod no arrancará correctamente."
    DEPLOY_ACTION="Acción"
    DEPLOY_INSTALL="Instalar"
    DEPLOY_UPGRADE="Actualizar"
    DEPLOY_COMMAND="Comando"
    DEPLOY_CONFIRM="¿Continuar?"
    DEPLOYING="Desplegando Pi-hole..."
    DEPLOY_OK="Pi-hole desplegado."
    DEPLOY_FAILED="El despliegue con Helm falló."
    ROLLOUT_WAIT="Esperando el rollout..."

    RESTART_PROMPT="Selecciona una operación"
    RESTART_ROLLOUT="Rollout restart (recrea el pod)"
    RESTART_SCALE_DOWN="Escalar a 0 (pausa, conserva los datos)"
    RESTART_SCALE_UP="Escalar a 1 (reanudar)"
    RESTART_BACK="Volver"
    RESTART_OK="Operación completada."
    RESTART_FAILED="La operación falló."

    LOGS_PROMPT="Selecciona un diagnóstico"
    LOGS_TAIL="Últimas 100 líneas del log"
    LOGS_FOLLOW="Seguir el log en vivo (ctrl-c para salir)"
    LOGS_DESCRIBE="Describir el pod"
    LOGS_EVENTS="Eventos recientes del namespace"
    LOGS_DNS="Prueba de resolución DNS"
    LOGS_BACK="Volver"
    DNS_RESOLVE="Dominio permitido (debe devolver una IP real)"
    DNS_BLOCKED="Dominio bloqueado (debe devolver 0.0.0.0)"
    DNS_FROM_LAN="Desde esta máquina contra la IP del LoadBalancer"
    DNS_NO_DIG="dig no está instalado localmente; se omite la prueba desde la LAN."

    MAINT_PROMPT="Selecciona una tarea"
    MAINT_GRAVITY="Actualizar gravity (recompilar blocklists)"
    MAINT_COUNTS="Ver conteo de dominios y listas"
    MAINT_STATUS="Estado de Pi-hole (pihole status)"
    MAINT_VERSION="Versiones (pihole -v)"
    MAINT_FLUSH="Vaciar el log de consultas"
    MAINT_BACK="Volver"
    MAINT_GRAVITY_CONFIRM="Gravity tarda varios minutos y satura el pod. ¿Continuar?"
    MAINT_FLUSH_CONFIRM="Esto borra el log de consultas. ¿Continuar?"
    MAINT_DOMAINS="Dominios bloqueados"
    MAINT_ADLISTS="Listas activas"
    MAINT_FAILED="El comando falló dentro del pod."
    NO_POD="No hay un pod de Pi-hole en ejecución."

    UNINSTALL_TITLE="Desinstalar"
    UNINSTALL_CONFIRM="¿Desinstalar el release %s del namespace %s?"
    UNINSTALL_OK="Release desinstalado."
    UNINSTALL_FAILED="La desinstalación falló."
    UNINSTALL_PVC="¿Borrar también el PVC %s? (se pierden consultas, listas y grupos)"
    UNINSTALL_SECRET="¿Borrar también el secreto %s?"
    UNINSTALL_NS="¿Borrar también el namespace %s?"
    UNINSTALL_KEPT="Conservado."
    DELETED="Borrado."
    DELETE_FAILED="No se pudo borrar."
    CONFIRM_YES_CHARS="sy"
  else
    WELCOME="Pi-hole - Chart Operations"
    SUBTITLE="Status, password, redeploy and maintenance."
    HELM_MISSING="helm is not installed or not in PATH."
    HELM_MISSING_HINT="Install it at: https://helm.sh/docs/intro/install/"
    KUBECTL_MISSING="kubectl is not installed or not in PATH."
    CHART_MISSING="Chart not found at"
    RELEASE_PROMPT="Release name"
    NS_PROMPT="Kubernetes namespace"
    NS_REQUIRED="Namespace is required."
    NS_MISSING="Namespace does not exist yet (it will be created on deploy)."
    ACTION_PROMPT="Select an action"
    ACTION_HINT="↑/↓ = move  ·  enter = run"
    PRESS_ENTER="Press enter to return to the menu..."
    CANCELLED="Cancelled."
    BYE="Done."

    OP_STATUS="Deployment status"
    OP_REPO="Update chart repo/dependency"
    OP_PASSWORD="Set / change admin password"
    OP_REVEAL="Reveal password & endpoints"
    OP_REDEPLOY="Redeploy chart (helm upgrade)"
    OP_RESTART="Restart / scale"
    OP_LOGS="Logs & diagnostics"
    OP_MAINT="Pi-hole maintenance"
    OP_UNINSTALL="Uninstall Pi-hole"
    OP_QUIT="Quit"

    STATUS_RELEASE="Helm release"
    STATUS_WORKLOADS="Deployment and pods"
    STATUS_SERVICES="Services (LoadBalancer)"
    STATUS_STORAGE="Storage (PVC)"
    STATUS_SECRET="Password secret"
    STATUS_NO_RELEASE="(no release installed in this namespace)"
    SECRET_OK="present"
    SECRET_ABSENT="MISSING - create it with \"${OP_PASSWORD}\""

    REPO_TITLE="Upstream chart repository"
    REPO_ADDING="Adding the Helm repo"
    REPO_UPDATING="Refreshing repo indexes"
    REPO_CURRENT="Version pinned in Chart.lock"
    REPO_LATEST="Latest published version"
    REPO_UPTODATE="Already on the latest version."
    REPO_DEP_CONFIRM="Run helm dependency update? (rewrites Chart.lock and charts/)"
    REPO_DEP_OK="Dependency updated. Review the git diff, then redeploy to apply it."
    REPO_DEP_FAILED="helm dependency update failed."

    PW_TITLE="Web UI / API password"
    PW_MODE_PROMPT="How do you want to set the password?"
    PW_MODE_RANDOM="Generate a random one (28 chars)"
    PW_MODE_MANUAL="Type it myself"
    PW_PROMPT="New password"
    PW_CONFIRM_PROMPT="Confirm password"
    PW_MISMATCH="Passwords do not match."
    PW_REQUIRED="Password is required."
    PW_GENERATED="Generated password"
    PW_APPLY_CONFIRM="Write secret %s in namespace %s?"
    PW_APPLIED="Secret updated."
    PW_APPLY_FAILED="Failed to write the secret."
    PW_RESTART_HINT="Pi-hole only reads the password when the pod starts."
    PW_RESTART_CONFIRM="Restart the deployment now to apply it?"

    REVEAL_TITLE="Admin access"
    REVEAL_PASSWORD="Password"
    REVEAL_WEB="Web UI"
    REVEAL_DNS="DNS (point your router here)"
    REVEAL_NO_SECRET="Password secret not found."
    REVEAL_NO_IP="(no external IP assigned yet)"

    DEPLOY_TITLE="Redeploy the chart"
    DEPLOY_DEP_MISSING="Chart dependency missing; running helm dependency build..."
    DEPLOY_SECRET_WARN="Password secret is missing. Without it the pod will not come up correctly."
    DEPLOY_ACTION="Action"
    DEPLOY_INSTALL="Install"
    DEPLOY_UPGRADE="Upgrade"
    DEPLOY_COMMAND="Command"
    DEPLOY_CONFIRM="Proceed?"
    DEPLOYING="Deploying Pi-hole..."
    DEPLOY_OK="Pi-hole deployed."
    DEPLOY_FAILED="Helm deployment failed."
    ROLLOUT_WAIT="Waiting for the rollout..."

    RESTART_PROMPT="Select an operation"
    RESTART_ROLLOUT="Rollout restart (recreate the pod)"
    RESTART_SCALE_DOWN="Scale to 0 (pause, keeps data)"
    RESTART_SCALE_UP="Scale to 1 (resume)"
    RESTART_BACK="Back"
    RESTART_OK="Operation completed."
    RESTART_FAILED="Operation failed."

    LOGS_PROMPT="Select a diagnostic"
    LOGS_TAIL="Last 100 log lines"
    LOGS_FOLLOW="Follow the log live (ctrl-c to stop)"
    LOGS_DESCRIBE="Describe the pod"
    LOGS_EVENTS="Recent namespace events"
    LOGS_DNS="DNS resolution test"
    LOGS_BACK="Back"
    DNS_RESOLVE="Allowed domain (should return a real IP)"
    DNS_BLOCKED="Blocked domain (should return 0.0.0.0)"
    DNS_FROM_LAN="From this machine against the LoadBalancer IP"
    DNS_NO_DIG="dig is not installed locally; skipping the LAN-side test."

    MAINT_PROMPT="Select a task"
    MAINT_GRAVITY="Update gravity (rebuild blocklists)"
    MAINT_COUNTS="Show domain and list counts"
    MAINT_STATUS="Pi-hole status (pihole status)"
    MAINT_VERSION="Versions (pihole -v)"
    MAINT_FLUSH="Flush the query log"
    MAINT_BACK="Back"
    MAINT_GRAVITY_CONFIRM="Gravity takes several minutes and loads the pod. Continue?"
    MAINT_FLUSH_CONFIRM="This erases the query log. Continue?"
    MAINT_DOMAINS="Blocked domains"
    MAINT_ADLISTS="Enabled adlists"
    MAINT_FAILED="The command failed inside the pod."
    NO_POD="No running Pi-hole pod found."

    UNINSTALL_TITLE="Uninstall"
    UNINSTALL_CONFIRM="Uninstall release %s from namespace %s?"
    UNINSTALL_OK="Release uninstalled."
    UNINSTALL_FAILED="Uninstall failed."
    UNINSTALL_PVC="Also delete PVC %s? (loses queries, lists and groups)"
    UNINSTALL_SECRET="Also delete secret %s?"
    UNINSTALL_NS="Also delete namespace %s?"
    UNINSTALL_KEPT="Kept."
    DELETED="Deleted."
    DELETE_FAILED="Delete failed."
    CONFIRM_YES_CHARS="y"
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

print_section() {
  printf "\n  %s\n\n" "$(clr_bold_cyan "── $1 ──")"
}

pad_right() { printf "%-${2}s" "${1}"; }

# ── Single-select list ────────────────────────────────────────────────────────
# Input:  MENU_ITEMS[]
# Output: MENU_SELECTED (index)

interactive_select() {
  local num="${#MENU_ITEMS[@]}"
  local cursor="${MENU_SELECTED:-0}"
  [[ "${cursor}" -ge "${num}" ]] && cursor=0

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
  local val=""
  IFS= read -r val </dev/tty || true
  if [[ -z "${val}" && -n "${default}" ]]; then val="${default}"; fi
  printf '%s' "${val}"
}

prompt_secret() {
  local label="$1"
  printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  local val=""
  IFS= read -r -s val </dev/tty || true
  echo "" >/dev/tty
  printf '%s' "${val}"
}

# Yes/no confirmation, defaulting to YES (enter = yes).
confirm_step() {
  printf "  %s [%s/n]: " "$1" "${CONFIRM_YES_CHARS:0:1}"
  local val=""; IFS= read -r val </dev/tty || true
  val="${val:-${CONFIRM_YES_CHARS:0:1}}"
  local char; char="$(lc "${val:0:1}")"
  [[ "${CONFIRM_YES_CHARS}" == *"${char}"* ]]
}

# Yes/no confirmation, defaulting to NO (enter = no). Used for destructive steps.
confirm_danger() {
  printf "  %s [%s/N]: " "$1" "${CONFIRM_YES_CHARS:0:1}"
  local val=""; IFS= read -r val </dev/tty || true
  local char; char="$(lc "${val:0:1}")"
  [[ -n "${char}" && "${CONFIRM_YES_CHARS}" == *"${char}"* ]]
}

pause_menu() {
  printf "\n  %s" "$(clr_dim "${PRESS_ENTER}")"
  IFS= read -r _ </dev/tty || true
}

# Reads a top-level-ish scalar out of a YAML file, skipping comment lines.
read_yaml_scalar() {
  local file="$1" key="$2"
  grep -m1 -E "^[[:space:]]*${key}:[[:space:]]" "${file}" 2>/dev/null \
    | sed -E "s/^[^:]*:[[:space:]]*//; s/[[:space:]]*#.*\$//; s/^[\"']//; s/[\"']\$//" || true
}

release_exists() { helm status "$1" -n "$2" &>/dev/null; }

namespace_exists() { kubectl get namespace "$1" &>/dev/null; }

# Resolves a resource name by the chart's label, falling back to the release
# name (the chart's fullname when the release name contains "pihole").
resolve_name() {
  local kind="$1" ns="$2" fallback="$3" name
  name="$(kubectl get "${kind}" -n "${ns}" -l app.kubernetes.io/name=pihole \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)" || name=""
  printf '%s' "${name:-${fallback}}"
}

running_pod() {
  local ns="$1" name
  name="$(kubectl get pods -n "${ns}" -l app.kubernetes.io/name=pihole \
    --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)" || name=""
  printf '%s' "${name}"
}

service_ip() {
  local ns="$1" svc="$2" ip
  ip="$(kubectl get svc "${svc}" -n "${ns}" \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)" || ip=""
  printf '%s' "${ip}"
}

secret_password() {
  local ns="$1" secret="$2" key="$3"
  kubectl get secret "${secret}" -n "${ns}" \
    -o "jsonpath={.data.${key}}" 2>/dev/null | base64 -d 2>/dev/null || true
}

generate_password() {
  if command -v openssl &>/dev/null; then
    openssl rand -base64 24 | tr -d '/+=' | head -c 28
  else
    head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 28
  fi
}

# ── Operations ────────────────────────────────────────────────────────────────

do_status() {
  local release="$1" ns="$2" secret="$3"

  print_section "${OP_STATUS}"

  printf "  %s\n" "$(clr_dim "${STATUS_RELEASE}:")"
  if release_exists "${release}" "${ns}"; then
    helm list -n "${ns}" --filter "^${release}\$" 2>/dev/null || true
  else
    printf "  %s\n" "$(clr_dim "${STATUS_NO_RELEASE}")"
  fi

  if ! namespace_exists "${ns}"; then
    printf "\n  %s %s\n" "$(clr_bold_yellow '!')" "${NS_MISSING}"
    return 0
  fi

  echo ""
  printf "  %s\n" "$(clr_dim "${STATUS_WORKLOADS}:")"
  kubectl get deploy,pods -n "${ns}" -o wide 2>/dev/null || true

  echo ""
  printf "  %s\n" "$(clr_dim "${STATUS_SERVICES}:")"
  kubectl get svc -n "${ns}" 2>/dev/null || true

  echo ""
  printf "  %s\n" "$(clr_dim "${STATUS_STORAGE}:")"
  kubectl get pvc -n "${ns}" 2>/dev/null || true

  echo ""
  if kubectl get secret "${secret}" -n "${ns}" &>/dev/null; then
    printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${STATUS_SECRET} (${secret})" "${SECRET_OK}"
  else
    printf "  %s %s: %s\n" "$(clr_bold_red '✗')" "${STATUS_SECRET} (${secret})" "${SECRET_ABSENT}"
  fi
}

do_update_repo() {
  local chart_dir="$1"

  print_section "${OP_REPO}"

  local repo_url
  repo_url="$(read_yaml_scalar "${chart_dir}/Chart.yaml" "repository")"
  if [[ -z "${repo_url}" ]]; then
    repo_url="https://mojo2600.github.io/pihole-kubernetes/"
  fi

  # Reuse the repo alias already pointing at that URL, otherwise add one.
  local repo_alias=""
  repo_alias="$(helm repo list 2>/dev/null \
    | awk -v url="${repo_url%/}" '$2 == url || $2 == url"/" {print $1; exit}')" || true

  if [[ -z "${repo_alias}" ]]; then
    repo_alias="mojo2600"
    printf "  %s %s \"%s\"...\n" "$(clr_bold_yellow '→')" "${REPO_ADDING}" "${repo_alias}"
    helm repo add "${repo_alias}" "${repo_url}" >/dev/null
  fi

  printf "  %s %s (%s)...\n\n" "$(clr_bold_yellow '→')" "${REPO_UPDATING}" "${repo_alias}"
  helm repo update "${repo_alias}" >/dev/null

  local current latest
  current="$(read_yaml_scalar "${chart_dir}/Chart.lock" "version")"
  latest="$(helm search repo "${repo_alias}/pihole" --versions 2>/dev/null \
    | awk 'NR==2 {print $2}')" || latest=""

  printf "  %-32s %s\n" "$(clr_dim "${REPO_CURRENT}:")" "$(clr_bold "${current:-?}")"
  printf "  %-32s %s\n\n" "$(clr_dim "${REPO_LATEST}:")" "$(clr_bold "${latest:-?}")"

  if [[ -n "${current}" && "${current}" == "${latest}" ]]; then
    printf "  %s %s\n\n" "$(clr_bold_green '✓')" "${REPO_UPTODATE}"
  fi

  if ! confirm_danger "${REPO_DEP_CONFIRM}"; then
    printf "\n  %s\n" "$(clr_dim "${CANCELLED}")"
    return 0
  fi

  echo ""
  if helm dependency update "${chart_dir}"; then
    printf "\n  %s %s\n" "$(clr_bold_green '✓')" "${REPO_DEP_OK}"
  else
    printf "\n  %s %s\n" "$(clr_bold_red '✗')" "${REPO_DEP_FAILED}"
    return 1
  fi
}

do_set_password() {
  local ns="$1" secret="$2" key="$3" deployment="$4"

  print_section "${PW_TITLE}"

  printf "  %s:\n\n" "$(clr_bold "${PW_MODE_PROMPT}")"
  MENU_ITEMS=("${PW_MODE_RANDOM}" "${PW_MODE_MANUAL}")
  MENU_SELECTED=0
  interactive_select
  local mode="${MENU_SELECTED}"
  echo ""

  local password=""
  if [[ "${mode}" -eq 0 ]]; then
    password="$(generate_password)"
    printf "  %-22s %s\n\n" "$(clr_dim "${PW_GENERATED}:")" "$(clr_bold_green "${password}")"
  else
    password="$(prompt_secret "${PW_PROMPT}")"
    if [[ -z "${password}" ]]; then
      printf "\n  %s %s\n" "$(clr_bold_red '✗')" "${PW_REQUIRED}"
      return 1
    fi
    local confirm_pw=""
    confirm_pw="$(prompt_secret "${PW_CONFIRM_PROMPT}")"
    if [[ "${password}" != "${confirm_pw}" ]]; then
      printf "\n  %s %s\n" "$(clr_bold_red '✗')" "${PW_MISMATCH}"
      return 1
    fi
    echo ""
  fi

  local prompt_text
  printf -v prompt_text "${PW_APPLY_CONFIRM}" "${secret}" "${ns}"
  if ! confirm_step "${prompt_text}"; then
    printf "\n  %s\n" "$(clr_dim "${CANCELLED}")"
    return 0
  fi

  if ! namespace_exists "${ns}"; then
    kubectl create namespace "${ns}" >/dev/null
  fi

  echo ""
  # Created outside Helm on purpose: `helm uninstall` must not take the
  # credential with it, and it must never land in the release values.
  if kubectl create secret generic "${secret}" -n "${ns}" \
       --from-literal="${key}=${password}" \
       --dry-run=client -o yaml | kubectl apply -f - >/dev/null; then
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${PW_APPLIED}"
  else
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${PW_APPLY_FAILED}"
    return 1
  fi

  echo ""
  printf "  %s\n" "$(clr_dim "${PW_RESTART_HINT}")"
  if ! kubectl get deploy "${deployment}" -n "${ns}" &>/dev/null; then
    return 0
  fi
  if confirm_step "${PW_RESTART_CONFIRM}"; then
    echo ""
    kubectl rollout restart "deployment/${deployment}" -n "${ns}"
    printf "\n  %s %s\n\n" "$(clr_bold_yellow '→')" "${ROLLOUT_WAIT}"
    kubectl rollout status "deployment/${deployment}" -n "${ns}" --timeout=180s || true
  fi
}

do_reveal() {
  local ns="$1" secret="$2" key="$3"

  print_section "${REVEAL_TITLE}"

  local password
  password="$(secret_password "${ns}" "${secret}" "${key}")"
  if [[ -n "${password}" ]]; then
    printf "  %-22s %s\n" "$(clr_dim "${REVEAL_PASSWORD}:")" "$(clr_bold_green "${password}")"
  else
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${REVEAL_NO_SECRET}"
  fi

  # The chart renders web/DNS as separate services; fall back to the first
  # labelled service if they were renamed.
  local web_svc dns_svc web_ip dns_ip
  web_svc="pihole-web"
  kubectl get svc "${web_svc}" -n "${ns}" &>/dev/null \
    || web_svc="$(resolve_name svc "${ns}" "${web_svc}")"
  dns_svc="pihole-dns-udp"
  kubectl get svc "${dns_svc}" -n "${ns}" &>/dev/null || dns_svc="pihole-dns"

  web_ip="$(service_ip "${ns}" "${web_svc}")"
  dns_ip="$(service_ip "${ns}" "${dns_svc}")"

  echo ""
  if [[ -n "${web_ip}" ]]; then
    printf "  %-22s %s\n" "$(clr_dim "${REVEAL_WEB}:")" "$(clr_cyan "http://${web_ip}/admin")"
  else
    printf "  %-22s %s\n" "$(clr_dim "${REVEAL_WEB}:")" "$(clr_dim "${REVEAL_NO_IP}")"
  fi
  if [[ -n "${dns_ip}" ]]; then
    printf "  %-22s %s\n" "$(clr_dim "${REVEAL_DNS}:")" "$(clr_cyan "${dns_ip}")"
  else
    printf "  %-22s %s\n" "$(clr_dim "${REVEAL_DNS}:")" "$(clr_dim "${REVEAL_NO_IP}")"
  fi
}

do_redeploy() {
  local release="$1" ns="$2" chart_dir="$3" repo_root="$4" secret="$5"
  local deployment=""

  print_section "${DEPLOY_TITLE}"

  # The wrapper chart is useless without the vendored subchart tarball.
  if ! compgen -G "${chart_dir}/charts/pihole-*.tgz" >/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_yellow '!')" "${DEPLOY_DEP_MISSING}"
    helm dependency build "${chart_dir}" || return 1
    echo ""
  fi

  if ! kubectl get secret "${secret}" -n "${ns}" &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_yellow '!')" "${DEPLOY_SECRET_WARN}"
  fi

  local action="${DEPLOY_INSTALL}"
  release_exists "${release}" "${ns}" && action="${DEPLOY_UPGRADE}"

  local display_cmd="helm upgrade --install ${release} ./packages/charts/pihole --namespace ${ns} --create-namespace"

  printf "  %-22s %s\n" "$(clr_dim "${DEPLOY_ACTION}:")" "$(clr_bold "${action}")"
  printf "  %s\n    %s\n\n" "$(clr_dim "${DEPLOY_COMMAND}:")" "$(clr_dim "${display_cmd}")"

  if ! confirm_step "${DEPLOY_CONFIRM}"; then
    printf "\n  %s\n" "$(clr_dim "${CANCELLED}")"
    return 0
  fi

  echo ""
  printf "  %s %s\n\n" "$(clr_bold_yellow '→')" "${DEPLOYING}"

  if (cd "${repo_root}" && helm upgrade --install "${release}" "packages/charts/pihole" \
        --namespace "${ns}" --create-namespace); then
    printf "\n  %s %s\n" "$(clr_bold_green '✓')" "${DEPLOY_OK}"
  else
    printf "\n  %s %s\n" "$(clr_bold_red '✗')" "${DEPLOY_FAILED}"
    return 1
  fi

  deployment="$(resolve_name deploy "${ns}" "${release}")"
  if kubectl get deploy "${deployment}" -n "${ns}" &>/dev/null; then
    printf "\n  %s %s\n\n" "$(clr_bold_yellow '→')" "${ROLLOUT_WAIT}"
    kubectl rollout status "deployment/${deployment}" -n "${ns}" --timeout=180s || true
  fi
}

do_restart_scale() {
  local ns="$1" deployment="$2"

  print_section "${OP_RESTART}"

  if ! kubectl get deploy "${deployment}" -n "${ns}" &>/dev/null; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${STATUS_NO_RELEASE}"
    return 1
  fi

  printf "  %s:\n\n" "$(clr_bold "${RESTART_PROMPT}")"
  MENU_ITEMS=("${RESTART_ROLLOUT}" "${RESTART_SCALE_DOWN}" "${RESTART_SCALE_UP}" "${RESTART_BACK}")
  MENU_SELECTED=0
  interactive_select
  local choice="${MENU_SELECTED}"
  echo ""

  local ok=0
  case "${choice}" in
    0)
      printf "  %s kubectl rollout restart deployment/%s -n %s\n\n" \
        "$(clr_bold_yellow '→')" "${deployment}" "${ns}"
      kubectl rollout restart "deployment/${deployment}" -n "${ns}" && ok=1
      if [[ "${ok}" -eq 1 ]]; then
        printf "\n  %s %s\n\n" "$(clr_bold_yellow '→')" "${ROLLOUT_WAIT}"
        kubectl rollout status "deployment/${deployment}" -n "${ns}" --timeout=180s || true
      fi
      ;;
    1)
      printf "  %s kubectl scale deployment/%s -n %s --replicas=0\n\n" \
        "$(clr_bold_yellow '→')" "${deployment}" "${ns}"
      kubectl scale "deployment/${deployment}" -n "${ns}" --replicas=0 && ok=1
      ;;
    2)
      printf "  %s kubectl scale deployment/%s -n %s --replicas=1\n\n" \
        "$(clr_bold_yellow '→')" "${deployment}" "${ns}"
      kubectl scale "deployment/${deployment}" -n "${ns}" --replicas=1 && ok=1
      ;;
    *)
      return 0
      ;;
  esac

  echo ""
  if [[ "${ok}" -eq 1 ]]; then
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${RESTART_OK}"
  else
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${RESTART_FAILED}"
    return 1
  fi
}

do_logs() {
  local ns="$1" deployment="$2"

  print_section "${OP_LOGS}"

  printf "  %s:\n\n" "$(clr_bold "${LOGS_PROMPT}")"
  MENU_ITEMS=("${LOGS_TAIL}" "${LOGS_FOLLOW}" "${LOGS_DESCRIBE}" "${LOGS_EVENTS}" "${LOGS_DNS}" "${LOGS_BACK}")
  MENU_SELECTED=0
  interactive_select
  local choice="${MENU_SELECTED}"
  echo ""

  local pod
  pod="$(running_pod "${ns}")"

  case "${choice}" in
    0)
      [[ -z "${pod}" ]] && { printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_POD}"; return 1; }
      kubectl logs -n "${ns}" "${pod}" --tail=100 2>&1 || true
      ;;
    1)
      [[ -z "${pod}" ]] && { printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_POD}"; return 1; }
      # ctrl-c ends the follow without killing this script.
      trap ':' INT
      kubectl logs -n "${ns}" "${pod}" -f --tail=50 2>&1 || true
      trap - INT
      ;;
    2)
      [[ -z "${pod}" ]] && { printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_POD}"; return 1; }
      kubectl describe pod -n "${ns}" "${pod}" 2>&1 | head -80 || true
      ;;
    3)
      kubectl get events -n "${ns}" --sort-by=.lastTimestamp 2>&1 | tail -25 || true
      ;;
    4)
      do_dns_test "${ns}" "${pod}"
      ;;
    *)
      return 0
      ;;
  esac
}

do_dns_test() {
  local ns="$1" pod="$2"

  if [[ -z "${pod}" ]]; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_POD}"
    return 1
  fi

  printf "  %s\n" "$(clr_dim "${DNS_RESOLVE}: pi-hole.net")"
  kubectl exec -n "${ns}" "${pod}" -- dig @127.0.0.1 +short +time=3 pi-hole.net 2>&1 | head -5 || true

  echo ""
  printf "  %s\n" "$(clr_dim "${DNS_BLOCKED}: doubleclick.net")"
  kubectl exec -n "${ns}" "${pod}" -- dig @127.0.0.1 +short +time=3 doubleclick.net 2>&1 | head -5 || true

  local dns_svc="pihole-dns-udp"
  kubectl get svc "${dns_svc}" -n "${ns}" &>/dev/null || dns_svc="pihole-dns"
  local dns_ip
  dns_ip="$(service_ip "${ns}" "${dns_svc}")"

  echo ""
  if [[ -z "${dns_ip}" ]]; then
    printf "  %s\n" "$(clr_dim "${REVEAL_NO_IP}")"
  elif command -v dig &>/dev/null; then
    printf "  %s\n" "$(clr_dim "${DNS_FROM_LAN}: ${dns_ip}")"
    dig "@${dns_ip}" +short +time=3 pi-hole.net 2>&1 | head -5 || true
  else
    printf "  %s\n" "$(clr_dim "${DNS_NO_DIG}")"
  fi
}

do_maintenance() {
  local ns="$1"

  print_section "${OP_MAINT}"

  printf "  %s:\n\n" "$(clr_bold "${MAINT_PROMPT}")"
  MENU_ITEMS=("${MAINT_GRAVITY}" "${MAINT_COUNTS}" "${MAINT_STATUS}" "${MAINT_VERSION}" "${MAINT_FLUSH}" "${MAINT_BACK}")
  MENU_SELECTED=0
  interactive_select
  local choice="${MENU_SELECTED}"
  echo ""

  [[ "${choice}" -eq 5 ]] && return 0

  local pod
  pod="$(running_pod "${ns}")"
  if [[ -z "${pod}" ]]; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_POD}"
    return 1
  fi

  local ok=0
  case "${choice}" in
    0)
      if ! confirm_danger "${MAINT_GRAVITY_CONFIRM}"; then
        printf "\n  %s\n" "$(clr_dim "${CANCELLED}")"; return 0
      fi
      echo ""
      kubectl exec -n "${ns}" "${pod}" -- pihole -g 2>&1 && ok=1
      ;;
    1)
      local domains adlists
      domains="$(kubectl exec -n "${ns}" "${pod}" -- pihole-FTL sqlite3 /etc/pihole/gravity.db \
        "SELECT COUNT(*) FROM gravity;" 2>/dev/null | tr -d '\r')" || domains=""
      adlists="$(kubectl exec -n "${ns}" "${pod}" -- pihole-FTL sqlite3 /etc/pihole/gravity.db \
        "SELECT COUNT(*) FROM adlist WHERE enabled = 1;" 2>/dev/null | tr -d '\r')" || adlists=""
      if [[ -n "${domains}" || -n "${adlists}" ]]; then
        printf "  %-22s %s\n" "$(clr_dim "${MAINT_DOMAINS}:")" "$(clr_bold "${domains:-?}")"
        printf "  %-22s %s\n" "$(clr_dim "${MAINT_ADLISTS}:")" "$(clr_bold "${adlists:-?}")"
        ok=1
      fi
      ;;
    2)
      kubectl exec -n "${ns}" "${pod}" -- pihole status 2>&1 && ok=1
      ;;
    3)
      kubectl exec -n "${ns}" "${pod}" -- pihole -v 2>&1 && ok=1
      ;;
    4)
      if ! confirm_danger "${MAINT_FLUSH_CONFIRM}"; then
        printf "\n  %s\n" "$(clr_dim "${CANCELLED}")"; return 0
      fi
      echo ""
      kubectl exec -n "${ns}" "${pod}" -- pihole -f 2>&1 && ok=1
      ;;
  esac

  if [[ "${ok}" -ne 1 ]]; then
    echo ""
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${MAINT_FAILED}"
    return 1
  fi
}

do_uninstall() {
  local release="$1" ns="$2" secret="$3"

  print_section "${UNINSTALL_TITLE}"

  local prompt_text
  printf -v prompt_text "${UNINSTALL_CONFIRM}" "${release}" "${ns}"
  if ! confirm_danger "${prompt_text}"; then
    printf "\n  %s\n" "$(clr_dim "${CANCELLED}")"
    return 0
  fi

  # Resolved before the release goes away - afterwards the labels are gone too.
  local pvc
  pvc="$(resolve_name pvc "${ns}" "${release}")"

  echo ""
  printf "  %s helm uninstall %s -n %s\n\n" "$(clr_bold_yellow '→')" "${release}" "${ns}"
  if helm uninstall "${release}" -n "${ns}"; then
    printf "\n  %s %s\n" "$(clr_bold_green '✓')" "${UNINSTALL_OK}"
  else
    printf "\n  %s %s\n" "$(clr_bold_red '✗')" "${UNINSTALL_FAILED}"
    return 1
  fi

  # Everything below outlives `helm uninstall`, so each one is opt-in.
  echo ""
  if kubectl get pvc "${pvc}" -n "${ns}" &>/dev/null; then
    printf -v prompt_text "${UNINSTALL_PVC}" "${pvc}"
    if confirm_danger "${prompt_text}"; then
      kubectl delete pvc "${pvc}" -n "${ns}" >/dev/null \
        && printf "  %s %s\n" "$(clr_bold_green '✓')" "${DELETED}" \
        || printf "  %s %s\n" "$(clr_bold_red '✗')" "${DELETE_FAILED}"
    else
      printf "  %s\n" "$(clr_dim "${UNINSTALL_KEPT}")"
    fi
  fi

  if kubectl get secret "${secret}" -n "${ns}" &>/dev/null; then
    printf -v prompt_text "${UNINSTALL_SECRET}" "${secret}"
    if confirm_danger "${prompt_text}"; then
      kubectl delete secret "${secret}" -n "${ns}" >/dev/null \
        && printf "  %s %s\n" "$(clr_bold_green '✓')" "${DELETED}" \
        || printf "  %s %s\n" "$(clr_bold_red '✗')" "${DELETE_FAILED}"
    else
      printf "  %s\n" "$(clr_dim "${UNINSTALL_KEPT}")"
    fi
  fi

  if namespace_exists "${ns}"; then
    printf -v prompt_text "${UNINSTALL_NS}" "${ns}"
    if confirm_danger "${prompt_text}"; then
      kubectl delete namespace "${ns}" >/dev/null \
        && printf "  %s %s\n" "$(clr_bold_green '✓')" "${DELETED}" \
        || printf "  %s %s\n" "$(clr_bold_red '✗')" "${DELETE_FAILED}"
    else
      printf "  %s\n" "$(clr_dim "${UNINSTALL_KEPT}")"
    fi
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  # Language
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  local lang="en"
  [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  # Tool checks
  if ! command -v helm &>/dev/null; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${HELM_MISSING}"
    printf "  %s\n\n" "$(clr_dim "${HELM_MISSING_HINT}")"
    exit 1
  fi
  if ! command -v kubectl &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${KUBECTL_MISSING}"
    exit 1
  fi

  local script_dir repo_root chart_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"
  chart_dir="${repo_root}/packages/charts/pihole"

  if [[ ! -f "${chart_dir}/Chart.yaml" ]]; then
    printf "  %s %s %s\n\n" "$(clr_bold_red '✗')" "${CHART_MISSING}" "${chart_dir}"
    exit 1
  fi

  # Release / namespace
  local release namespace
  release="$(prompt_visible "${RELEASE_PROMPT}" "pihole")"
  echo ""
  namespace="$(prompt_visible "${NS_PROMPT}" "pihole")"
  echo ""
  if [[ -z "${namespace}" ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${NS_REQUIRED}")"
    exit 1
  fi

  # The password Secret is named by the chart, not by this script - read it back
  # from values.yaml so both stay in sync.
  local secret_name secret_key
  secret_name="$(read_yaml_scalar "${chart_dir}/values.yaml" "existingSecret")"
  secret_key="$(read_yaml_scalar "${chart_dir}/values.yaml" "passwordKey")"
  secret_name="${secret_name:-pihole-admin}"
  secret_key="${secret_key:-password}"

  local action_cursor=0
  while true; do
    clear
    print_header

    printf "  %-14s %s   %-14s %s\n" \
      "$(clr_dim "${RELEASE_PROMPT}:")" "$(clr_bold "${release}")" \
      "$(clr_dim "${NS_PROMPT}:")"      "$(clr_bold "${namespace}")"
    echo ""
    printf "  %s:\n" "$(clr_bold "${ACTION_PROMPT}")"
    printf "  %s\n\n" "$(clr_dim "${ACTION_HINT}")"

    MENU_ITEMS=(
      "${OP_STATUS}"
      "${OP_REPO}"
      "${OP_PASSWORD}"
      "${OP_REVEAL}"
      "${OP_REDEPLOY}"
      "${OP_RESTART}"
      "${OP_LOGS}"
      "${OP_MAINT}"
      "${OP_UNINSTALL}"
      "${OP_QUIT}"
    )
    MENU_SELECTED="${action_cursor}"
    interactive_select
    action_cursor="${MENU_SELECTED}"

    # Resolved fresh each round: a redeploy or uninstall changes what exists.
    local deployment
    deployment="$(resolve_name deploy "${namespace}" "${release}")"

    case "${action_cursor}" in
      0) do_status         "${release}" "${namespace}" "${secret_name}" || true ;;
      1) do_update_repo    "${chart_dir}" || true ;;
      2) do_set_password   "${namespace}" "${secret_name}" "${secret_key}" "${deployment}" || true ;;
      3) do_reveal         "${namespace}" "${secret_name}" "${secret_key}" || true ;;
      4) do_redeploy       "${release}" "${namespace}" "${chart_dir}" "${repo_root}" "${secret_name}" || true ;;
      5) do_restart_scale  "${namespace}" "${deployment}" || true ;;
      6) do_logs           "${namespace}" "${deployment}" || true ;;
      7) do_maintenance    "${namespace}" || true ;;
      8) do_uninstall      "${release}" "${namespace}" "${secret_name}" || true ;;
      9) echo ""; printf "  %s\n\n" "$(clr_bold_green "✓ ${BYE}")"; exit 0 ;;
    esac

    pause_menu
  done
}

main "$@"
