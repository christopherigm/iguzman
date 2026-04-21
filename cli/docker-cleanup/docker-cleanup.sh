#!/usr/bin/env bash
# docker-cleanup.sh
#
# Scans Docker or MicroK8s containerd images and offers options to prune
# unused resources (images, stopped containers, build cache) to free disk space.
#
# Usage:
#   bash cli/docker-cleanup/docker-cleanup.sh
#   bash cli/docker-cleanup/docker-cleanup.sh --dry-run
#   bash cli/docker-cleanup/docker-cleanup.sh --no-color

# Do NOT set -e: probe commands may return non-zero intentionally.
set -uo pipefail

# ── Flags ──────────────────────────────────────────────────────────────────────

DRY_RUN=false
USE_COLOR=true
ASK_DRY_RUN=true

for _arg in "$@"; do
  case "${_arg}" in
    --dry-run)  DRY_RUN=true; ASK_DRY_RUN=false ;;
    --no-color) USE_COLOR=false ;;
  esac
done

# ── Colors ─────────────────────────────────────────────────────────────────────

if ${USE_COLOR}; then
  R='\033[0m'    B='\033[1m'    D='\033[2m'
  GRN='\033[0;32m'  RED='\033[0;31m'  YEL='\033[0;33m'  CYN='\033[0;36m'
  BGRN='\033[1;32m' BRED='\033[1;31m' BYEL='\033[1;33m' BCYN='\033[1;36m'
else
  R='' B='' D='' GRN='' RED='' YEL='' CYN='' BGRN='' BRED='' BYEL='' BCYN=''
fi

# ── Output helpers ─────────────────────────────────────────────────────────────

ok()   { printf "  ${BGRN}✓${R}  %s\n"  "$*"; }
fail() { printf "  ${BRED}✗${R}  %s\n"  "$*"; }
info() { printf "  ${CYN}→${R}  %s\n"  "$*"; }
warn() { printf "  ${BYEL}⚠${R}   %s\n" "$*"; }
note() { printf "  ${D}   %s${R}\n"    "$*"; }

step() {
  printf "\n${BCYN}▶ %s${R}\n" "$*"
  printf "${D}$(printf '─%.0s' {1..64})${R}\n"
}

hr() { printf "${D}$(printf '─%.0s' {1..64})${R}\n"; }

# ── i18n ───────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"

  if [[ "${lang}" == "es" ]]; then
    WELCOME="Limpieza de Imágenes Docker / MicroK8s"
    SUBTITLE="Escanea y elimina imágenes no utilizadas para liberar espacio."
    DRY_RUN_NOTE="MODO SIMULACIÓN — no se eliminarán datos"
    RUNTIME_PROMPT="¿Qué motor de contenedores deseas gestionar? [docker/microk8s]"
    RUNTIME_NOT_FOUND="No se encontró Docker ni MicroK8s en el sistema."
    SCANNING_IMAGES="Escaneando imágenes..."
    SCANNING_CONTAINERS="Escaneando contenedores detenidos..."
    SCANNING_CACHE="Escaneando caché de construcción..."
    SCANNING_TIMESTAMPS="Obteniendo fechas de creación (puede tardar unos segundos)..."
    COL_IMAGE="IMAGEN"
    COL_TAG="TAG"
    COL_SIZE="TAMAÑO"
    COL_AGE="EDAD"
    COL_STATUS="ESTADO"
    STATUS_IN_USE="en uso"
    STATUS_UNUSED="sin usar"
    STATUS_DANGLING="huérfana"
    AGE_DAYS="d"
    AGE_UNKNOWN="?"
    DISK_USAGE_BEFORE="Uso de disco (antes)"
    DISK_USAGE_AFTER="Uso de disco (después)"
    NO_IMAGES="No se encontraron imágenes."
    PRUNE_TITLE="Selecciona operaciones de limpieza"
    PRUNE_HINT="Flechas para navegar, Espacio para seleccionar, Enter para confirmar."
    PRUNE_HINT2="(a = seleccionar todos  ·  n = deseleccionar todos)"
    OPT_DANGLING="Eliminar imágenes huérfanas (sin etiqueta)"
    OPT_OLD="Eliminar imágenes sin usar más antiguas que N días"
    OPT_ALL_UNUSED="Eliminar todas las imágenes sin usar"
    OPT_STOPPED="Eliminar contenedores detenidos"
    OPT_CACHE="Eliminar caché de construcción"
    OPT_SYSTEM_PRUNE="Limpieza total del sistema"
    AGE_THRESHOLD_PROMPT="Umbral de antigüedad en días"
    DRY_RUN_PROMPT="¿Ejecutar en modo simulación (sin eliminar)? [s/n]"
    CONFIRM_PROMPT="¿Confirmar y ejecutar la limpieza? [s/n]"
    CONFIRM_YES_CHARS="sy"
    NOTHING_SELECTED="No se seleccionó ninguna operación."
    WOULD_REMOVE="Se eliminaría"
    EXECUTING="Ejecutando limpieza..."
    DONE="¡Limpieza completada!"
    SKIPPED="Operación omitida."
    NONE_FOUND="Ninguno encontrado."
    STOPPED_CONTAINERS="Contenedores detenidos"
    BUILD_CACHE_LABEL="Caché de construcción"
    IMAGES_SUMMARY="Resumen de imágenes"
    TOTAL_LABEL="Total"
    IN_USE_LABEL="En uso"
    UNUSED_LABEL="Sin usar"
    DANGLING_LABEL="Huérfanas"
    UNKNOWN_AGE_WARN="Imágenes con fecha desconocida no se incluyen en el filtro de antigüedad."
  else
    WELCOME="Docker / MicroK8s Image Cleanup"
    SUBTITLE="Scan and remove unused images to free up disk space."
    DRY_RUN_NOTE="DRY-RUN MODE — no data will be deleted"
    RUNTIME_PROMPT="Which container runtime do you want to manage? [docker/microk8s]"
    RUNTIME_NOT_FOUND="Neither Docker nor MicroK8s was found on this system."
    SCANNING_IMAGES="Scanning images..."
    SCANNING_CONTAINERS="Scanning stopped containers..."
    SCANNING_CACHE="Scanning build cache..."
    SCANNING_TIMESTAMPS="Fetching image creation dates (this may take a moment)..."
    COL_IMAGE="IMAGE"
    COL_TAG="TAG"
    COL_SIZE="SIZE"
    COL_AGE="AGE"
    COL_STATUS="STATUS"
    STATUS_IN_USE="in use"
    STATUS_UNUSED="unused"
    STATUS_DANGLING="dangling"
    AGE_DAYS="d"
    AGE_UNKNOWN="?"
    DISK_USAGE_BEFORE="Disk usage (before)"
    DISK_USAGE_AFTER="Disk usage (after)"
    NO_IMAGES="No images found."
    PRUNE_TITLE="Select cleanup operations"
    PRUNE_HINT="Arrow keys to navigate, Space to toggle, Enter to confirm."
    PRUNE_HINT2="(a = select all  ·  n = deselect all)"
    OPT_DANGLING="Remove dangling (untagged) images"
    OPT_OLD="Remove unused images older than N days"
    OPT_ALL_UNUSED="Remove all unused images"
    OPT_STOPPED="Remove stopped containers"
    OPT_CACHE="Remove build cache"
    OPT_SYSTEM_PRUNE="Full system prune"
    AGE_THRESHOLD_PROMPT="Age threshold in days"
    DRY_RUN_PROMPT="Run in dry-run mode (no deletions)? [y/n]"
    CONFIRM_PROMPT="Confirm and run cleanup? [y/n]"
    CONFIRM_YES_CHARS="y"
    NOTHING_SELECTED="No operations selected."
    WOULD_REMOVE="Would remove"
    EXECUTING="Running cleanup..."
    DONE="Cleanup complete!"
    SKIPPED="Operation skipped."
    NONE_FOUND="None found."
    STOPPED_CONTAINERS="Stopped containers"
    BUILD_CACHE_LABEL="Build cache"
    IMAGES_SUMMARY="Image summary"
    TOTAL_LABEL="Total"
    IN_USE_LABEL="In use"
    UNUSED_LABEL="Unused"
    DANGLING_LABEL="Dangling"
    UNKNOWN_AGE_WARN="Images with unknown creation date are excluded from the age filter."
  fi
}

# ── Header ─────────────────────────────────────────────────────────────────────

print_header() {
  local line
  line="$(printf '─%.0s' {1..56})"
  echo ""
  printf "  ${BCYN}┌${line}┐${R}\n"
  printf "  ${BCYN}│${R}  ${B}%-54s${R}${BCYN}│${R}\n" "${WELCOME}"
  printf "  ${BCYN}│${R}  ${D}%-54s${R}${BCYN}│${R}\n" "${SUBTITLE}"
  if ${DRY_RUN}; then
    printf "  ${BCYN}│${R}  ${BYEL}⚠  %-52s${R}${BCYN}│${R}\n" "${DRY_RUN_NOTE}"
  fi
  printf "  ${BCYN}└${line}┘${R}\n\n"
}

# ── Age helpers ────────────────────────────────────────────────────────────────

# Parse an ISO 8601 or "YYYY-MM-DD HH:MM:SS ±HHMM TZ" string → epoch seconds.
date_to_epoch() {
  local s="$1"
  # Strip fractional seconds and trailing timezone name (e.g. "UTC")
  s="$(echo "${s}" | sed 's/\.[0-9]*Z*$/Z/' | sed 's/ [A-Z]\+$//')"
  date -d "${s}" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "${s}" +%s 2>/dev/null || return 1
}

age_days_from_epoch() {
  local epoch="$1"
  local now; now="$(date +%s)"
  echo $(( (now - epoch) / 86400 ))
}

format_age() {
  local days="$1"
  if [[ "${days}" -lt 1 ]]; then echo "<1${AGE_DAYS}"
  else echo "${days}${AGE_DAYS}"
  fi
}

# ── Interactive multi-select ───────────────────────────────────────────────────
# Inputs:  OPT_IDS[], OPT_LABELS[], OPT_ENABLED[]  (all pre-declared by caller)
# Output:  SELECTED_OPT_IDS[] (global)

interactive_select_options() {
  local num="${#OPT_IDS[@]}"
  local cursor=0

  declare -A _sel
  local i
  for i in "${!OPT_IDS[@]}"; do _sel["${OPT_IDS[$i]}"]=0; done

  # Position cursor on first enabled option
  for i in "${!OPT_IDS[@]}"; do
    if [[ "${OPT_ENABLED[$i]}" -eq 1 ]]; then cursor=$i; break; fi
  done

  _render() {
    local j
    for j in "${!OPT_IDS[@]}"; do
      local id="${OPT_IDS[$j]}" lbl="${OPT_LABELS[$j]}"
      local enabled="${OPT_ENABLED[$j]}" sel="${_sel[${OPT_IDS[$j]}]}"
      local active=0; [[ $j -eq $cursor ]] && active=1

      local box ptr lbl_str
      if [[ "${enabled}" -eq 0 ]]; then
        box="${D}[N/A]${R}"; ptr=" "; lbl_str="${D}${lbl}${R}"
      elif [[ "${sel}" -eq 1 ]]; then
        box="${B}${CYN}[✓]${R}"
        if [[ "${active}" -eq 1 ]]; then
          ptr="${CYN}▶${R}"; lbl_str="${B}${CYN}${lbl}${R}"
        else
          ptr=" "; lbl_str="${lbl}"
        fi
      else
        box="${D}[ ]${R}"
        if [[ "${active}" -eq 1 ]]; then
          ptr="${CYN}▶${R}"; lbl_str="${B}${CYN}${lbl}${R}"
        else
          ptr=" "; lbl_str="${lbl}"
        fi
      fi
      printf "  %b %b %b\n" "${ptr}" "${box}" "${lbl_str}"
    done
  }

  _render
  printf '\033[?25l'  # hide cursor

  while true; do
    local key esc
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n1 -t 0.05 esc 2>/dev/null || esc=""
      if [[ "${esc}" == '[' ]]; then
        IFS= read -r -s -n1 -t 0.05 key 2>/dev/null || key=""
        if [[ "${key}" == 'A' ]]; then
          cursor=$(( (cursor - 1 + num) % num ))
          printf "\033[%dA" "${num}"; _render
        elif [[ "${key}" == 'B' ]]; then
          cursor=$(( (cursor + 1) % num ))
          printf "\033[%dA" "${num}"; _render
        fi
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then
      printf '\033[?25h'; echo ""; exit 0
    fi

    if [[ "${key}" == ' ' ]]; then
      local id="${OPT_IDS[$cursor]}"
      if [[ "${OPT_ENABLED[$cursor]}" -eq 1 ]]; then
        [[ "${_sel[$id]}" -eq 1 ]] && _sel["$id"]=0 || _sel["$id"]=1
        printf "\033[%dA" "${num}"; _render
      fi
      continue
    fi

    if [[ "${key}" == 'a' || "${key}" == 'A' ]]; then
      for i in "${!OPT_IDS[@]}"; do
        [[ "${OPT_ENABLED[$i]}" -eq 1 ]] && _sel["${OPT_IDS[$i]}"]=1
      done
      printf "\033[%dA" "${num}"; _render; continue
    fi

    if [[ "${key}" == 'n' || "${key}" == 'N' ]]; then
      for i in "${!OPT_IDS[@]}"; do _sel["${OPT_IDS[$i]}"]=0; done
      printf "\033[%dA" "${num}"; _render; continue
    fi
  done

  printf '\033[?25h'  # show cursor
  echo ""

  SELECTED_OPT_IDS=()
  for i in "${!OPT_IDS[@]}"; do
    local id="${OPT_IDS[$i]}"
    [[ "${OPT_ENABLED[$i]}" -eq 1 && "${_sel[$id]}" -eq 1 ]] && SELECTED_OPT_IDS+=("${id}")
  done
}

# ── Image table printer (shared by Docker & MicroK8s) ─────────────────────────

print_image_table() {
  local total="${#IMG_IDS[@]}"

  if [[ "${total}" -eq 0 ]]; then
    warn "${NO_IMAGES}"; return
  fi

  local repo_w=34 tag_w=16 size_w=10 age_w=7

  printf "\n  ${B}%-${repo_w}s %-${tag_w}s %-${size_w}s %-${age_w}s %s${R}\n" \
    "${COL_IMAGE}" "${COL_TAG}" "${COL_SIZE}" "${COL_AGE}" "${COL_STATUS}"
  printf "  ${D}%s${R}\n" "$(printf '─%.0s' {1..84})"

  local i cnt_inuse=0 cnt_unused=0 cnt_dangling=0
  for i in "${!IMG_IDS[@]}"; do
    local status="${IMG_STATUSES[$i]}"
    local clr="${R}"
    case "${status}" in
      "${STATUS_IN_USE}")   clr="${BGRN}"; (( cnt_inuse++ ))    || true ;;
      "${STATUS_DANGLING}") clr="${BRED}"; (( cnt_dangling++ )) || true ;;
      "${STATUS_UNUSED}")   clr="${YEL}";  (( cnt_unused++ ))   || true ;;
    esac

    local repo="${IMG_REPOS[$i]}" tag="${IMG_TAGS[$i]}"
    [[ "${#repo}" -gt $((repo_w-1)) ]] && repo="${repo:0:$((repo_w-4))}..."
    [[ "${#tag}"  -gt $((tag_w-1))  ]] && tag="${tag:0:$((tag_w-4))}..."

    printf "  %-${repo_w}s %-${tag_w}s %-${size_w}s %-${age_w}s ${clr}%s${R}\n" \
      "${repo}" "${tag}" "${IMG_SIZES[$i]}" "${IMG_AGES[$i]}" "${status}"
  done

  printf "\n"
  printf "  ${D}%s: ${B}%d${R}  " "${TOTAL_LABEL}"    "${total}"
  printf "${BGRN}%s: %d${R}  "    "${IN_USE_LABEL}"   "${cnt_inuse}"
  printf "${YEL}%s: %d${R}  "     "${UNUSED_LABEL}"   "${cnt_unused}"
  printf "${BRED}%s: %d${R}\n"    "${DANGLING_LABEL}" "${cnt_dangling}"
}

# ════════════════════════════════════════════════════════════════════════════
# DOCKER FUNCTIONS
# ════════════════════════════════════════════════════════════════════════════

docker_disk_usage() {
  docker system df 2>/dev/null || true
}

docker_scan() {
  step "${SCANNING_IMAGES}"

  declare -g -a IMG_IDS=() IMG_REPOS=() IMG_TAGS=() IMG_SIZES=() IMG_AGES=() IMG_STATUSES=()

  # Build set of image IDs used by any container (running or stopped)
  local in_use_set
  in_use_set="$(docker ps -a --format '{{.ImageID}}' 2>/dev/null | sort -u || true)"

  while IFS=$'\t' read -r id repo tag size created; do
    [[ -z "${id}" ]] && continue

    local age_str="${AGE_UNKNOWN}"
    local epoch
    if epoch="$(date_to_epoch "${created}" 2>/dev/null)"; then
      age_str="$(format_age "$(age_days_from_epoch "${epoch}")")"
    fi

    local status
    if [[ "${repo}" == "<none>" && "${tag}" == "<none>" ]]; then
      status="${STATUS_DANGLING}"
    elif echo "${in_use_set}" | grep -qF "${id}"; then
      status="${STATUS_IN_USE}"
    else
      status="${STATUS_UNUSED}"
    fi

    IMG_IDS+=("${id}")
    IMG_REPOS+=("${repo}")
    IMG_TAGS+=("${tag}")
    IMG_SIZES+=("${size}")
    IMG_AGES+=("${age_str}")
    IMG_STATUSES+=("${status}")
  done < <(docker image ls -a --format "{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" \
    2>/dev/null || true)

  print_image_table
}

docker_scan_containers() {
  step "${SCANNING_CONTAINERS}"
  STOPPED_COUNT=0

  local lines
  lines="$(docker ps -a --filter status=exited --filter status=dead \
    --format "{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}" 2>/dev/null || true)"

  if [[ -z "${lines}" ]]; then
    ok "${NONE_FOUND}"; return
  fi

  printf "\n  ${B}%-14s %-36s %-22s %s${R}\n" "CONTAINER ID" "${COL_IMAGE}" "STATUS" "NAME"
  printf "  ${D}%s${R}\n" "$(printf '─%.0s' {1..84})"
  while IFS=$'\t' read -r cid cimg cstat cname; do
    printf "  %-14s %-36s %-22s %s\n" \
      "${cid:0:12}" "${cimg:0:35}" "${cstat:0:21}" "${cname}"
    (( STOPPED_COUNT++ )) || true
  done <<< "${lines}"
  printf "\n  ${D}${STOPPED_CONTAINERS}: ${B}${STOPPED_COUNT}${R}\n"
}

docker_scan_cache() {
  step "${SCANNING_CACHE}"
  local line
  line="$(docker system df 2>/dev/null | grep "Build Cache" || true)"
  if [[ -n "${line}" ]]; then
    info "${BUILD_CACHE_LABEL}: ${line}"
  else
    ok "${NONE_FOUND}"
  fi
}

# Execute selected Docker prune operations.
# $1…: operation IDs from SELECTED_OPT_IDS
docker_execute() {
  local ops=("$@")
  local age_threshold="${AGE_THRESHOLD_VAL}"

  step "${EXECUTING}"

  for op in "${ops[@]}"; do
    case "${op}" in

      dangling)
        printf "\n  ${B}▸ ${OPT_DANGLING}${R}\n"
        local ids; ids="$(docker image ls -f dangling=true -q 2>/dev/null || true)"
        if [[ -z "${ids}" ]]; then
          note "${NONE_FOUND}"
        elif ${DRY_RUN}; then
          while IFS= read -r id; do note "${WOULD_REMOVE}: ${id}"; done <<< "${ids}"
        else
          docker image prune -f 2>&1 | grep -E "deleted|reclaimed|Total" | \
            while IFS= read -r l; do note "${l}"; done || true
        fi
        ;;

      old)
        printf "\n  ${B}▸ ${OPT_OLD} (>${age_threshold}${AGE_DAYS})${R}\n"
        local had_unknown=false count=0 i
        for i in "${!IMG_IDS[@]}"; do
          [[ "${IMG_STATUSES[$i]}" == "${STATUS_IN_USE}" ]] && continue
          local age_str="${IMG_AGES[$i]}"
          if [[ "${age_str}" == "${AGE_UNKNOWN}" ]]; then had_unknown=true; continue; fi
          local age_num="${age_str%${AGE_DAYS}}"
          if [[ "${age_num}" =~ ^[0-9]+$ ]] && (( age_num >= age_threshold )); then
            local ref="${IMG_REPOS[$i]}:${IMG_TAGS[$i]}"
            [[ "${IMG_REPOS[$i]}" == "<none>" ]] && ref="${IMG_IDS[$i]}"
            if ${DRY_RUN}; then
              note "${WOULD_REMOVE}: ${ref} (${age_str})"
            else
              if docker image rm "${ref}" 2>/dev/null; then
                ok "${ref}"
              else
                note "skipped ${ref} (may still be referenced)"
              fi
            fi
            (( count++ )) || true
          fi
        done
        [[ "${count}" -eq 0 ]] && note "${NONE_FOUND}"
        ${had_unknown} && warn "${UNKNOWN_AGE_WARN}"
        ;;

      all_unused)
        printf "\n  ${B}▸ ${OPT_ALL_UNUSED}${R}\n"
        if ${DRY_RUN}; then
          local i
          for i in "${!IMG_IDS[@]}"; do
            [[ "${IMG_STATUSES[$i]}" != "${STATUS_IN_USE}" ]] && \
              note "${WOULD_REMOVE}: ${IMG_REPOS[$i]}:${IMG_TAGS[$i]}"
          done
        else
          docker image prune -a -f 2>&1 | grep -E "deleted|reclaimed|Total" | \
            while IFS= read -r l; do note "${l}"; done || true
        fi
        ;;

      stopped)
        printf "\n  ${B}▸ ${OPT_STOPPED}${R}\n"
        if ${DRY_RUN}; then
          docker ps -a --filter status=exited --filter status=dead \
            --format "{{.Names}} ({{.Status}})" 2>/dev/null | \
            while IFS= read -r l; do [[ -n "${l}" ]] && note "${WOULD_REMOVE}: ${l}"; done || true
        else
          docker container prune -f 2>&1 | grep -E "deleted|Total" | \
            while IFS= read -r l; do note "${l}"; done || true
        fi
        ;;

      cache)
        printf "\n  ${B}▸ ${OPT_CACHE}${R}\n"
        if ${DRY_RUN}; then
          docker system df 2>/dev/null | grep "Build Cache" | \
            while IFS= read -r l; do note "${WOULD_REMOVE}: ${l}"; done || true
        else
          docker builder prune -f 2>&1 | grep -E "deleted|reclaimed|Total" | \
            while IFS= read -r l; do note "${l}"; done || true
        fi
        ;;

      system_prune)
        printf "\n  ${B}▸ ${OPT_SYSTEM_PRUNE}${R}\n"
        if ${DRY_RUN}; then
          note "${WOULD_REMOVE}: all stopped containers, dangling images, unused networks, build cache"
        else
          docker system prune -f 2>&1 | grep -E "deleted|reclaimed|Total" | \
            while IFS= read -r l; do note "${l}"; done || true
        fi
        ;;
    esac
  done
}

# ════════════════════════════════════════════════════════════════════════════
# MICROK8S FUNCTIONS
# ════════════════════════════════════════════════════════════════════════════

# Returns newline-separated refs of images currently used by any k8s pod.
mk8s_used_images() {
  microk8s kubectl get pods --all-namespaces -o jsonpath=\
'{range .items[*]}{range .spec.containers[*]}{.image}{"\n"}{end}{range .spec.initContainers[*]}{.image}{"\n"}{end}{end}' \
    2>/dev/null | grep -v '^$' | sort -u || true
}

# Attempt to read the OCI image creation timestamp from containerd metadata.
# Prints an ISO 8601 string on success; returns non-zero on failure.
mk8s_image_created() {
  local ref="$1"
  # containerd ctr images inspect outputs the image descriptor JSON which
  # includes a top-level "createdAt" field.
  if command -v python3 &>/dev/null; then
    microk8s ctr images inspect "${ref}" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('createdAt',''); print(t) if t else exit(1)" \
      2>/dev/null
  else
    # Fallback: grep for the field
    microk8s ctr images inspect "${ref}" 2>/dev/null | \
      grep -oP '"createdAt"\s*:\s*"\K[^"]+' 2>/dev/null | head -1
  fi
}

mk8s_scan() {
  step "${SCANNING_IMAGES}"

  declare -g -a IMG_IDS=() IMG_REPOS=() IMG_TAGS=() IMG_SIZES=() IMG_AGES=() IMG_STATUSES=()

  local used_images
  used_images="$(mk8s_used_images)"

  # Parse: microk8s ctr images ls
  # Columns: REF  TYPE  DIGEST  SIZE  PLATFORMS  LABELS  [SNAPSHOTTER]
  while IFS= read -r line; do
    [[ "${line}" == REF* || -z "${line}" ]] && continue

    local ref size
    ref="$(awk '{print $1}' <<< "${line}")"
    size="$(awk '{print $4}' <<< "${line}")"
    [[ -z "${ref}" ]] && continue

    # Parse repo and tag
    local repo tag
    if [[ "${ref}" == *"@sha256:"* && "${ref}" != *":"[^@]* ]]; then
      repo="${ref%%@*}"; tag="<digest>"
    elif [[ "${ref}" == *":"* ]]; then
      repo="${ref%:*}"; tag="${ref##*:}"
    else
      repo="${ref}"; tag="latest"
    fi

    # Shorten well-known prefixes for display
    repo="${repo#docker.io/library/}"
    repo="${repo#docker.io/}"

    IMG_IDS+=("${ref}")
    IMG_REPOS+=("${repo}")
    IMG_TAGS+=("${tag}")
    IMG_SIZES+=("${size}")
    IMG_AGES+=("${AGE_UNKNOWN}")  # filled below

    local status="${STATUS_UNUSED}"
    if echo "${used_images}" | grep -qxF "${ref}" || \
       echo "${used_images}" | grep -qxF "${repo}:${tag}"; then
      status="${STATUS_IN_USE}"
    fi
    [[ "${tag}" == "<digest>" ]] && status="${STATUS_DANGLING}"
    IMG_STATUSES+=("${status}")
  done < <(microk8s ctr images ls 2>/dev/null || true)

  if [[ "${#IMG_IDS[@]}" -gt 0 ]]; then
    printf "  ${D}%s${R}\n" "${SCANNING_TIMESTAMPS}"
    local i
    for i in "${!IMG_IDS[@]}"; do
      local ref="${IMG_IDS[$i]}"
      local created epoch
      if created="$(mk8s_image_created "${ref}" 2>/dev/null)" && [[ -n "${created}" ]]; then
        if epoch="$(date_to_epoch "${created}" 2>/dev/null)"; then
          IMG_AGES[$i]="$(format_age "$(age_days_from_epoch "${epoch}")")"
        fi
      fi
    done
  fi

  print_image_table
}

mk8s_disk_usage() {
  local total_size=0
  local i
  printf "\n  ${B}%s${R}\n" "${IMAGES_SUMMARY}"
  printf "  ${D}%s${R}\n" "$(printf '─%.0s' {1..40})"
  for i in "${!IMG_IDS[@]}"; do
    printf "  %-40s %s\n" "${IMG_REPOS[$i]:0:38}:${IMG_TAGS[$i]:0:12}" "${IMG_SIZES[$i]}"
  done
  printf "  ${D}%s${R}\n\n" "$(printf '─%.0s' {1..40})"
  info "${TOTAL_LABEL}: ${#IMG_IDS[@]} images"
}

mk8s_execute() {
  local ops=("$@")
  local age_threshold="${AGE_THRESHOLD_VAL}"

  step "${EXECUTING}"

  _mk8s_rm() {
    local ref="$1" dry="$2" label="$3"
    if ${dry}; then
      note "${WOULD_REMOVE}: ${label}"
    else
      if microk8s ctr images rm "${ref}" 2>/dev/null; then
        ok "${label}"
      else
        note "skipped ${label} (may still be in use)"
      fi
    fi
  }

  for op in "${ops[@]}"; do
    case "${op}" in

      dangling)
        printf "\n  ${B}▸ ${OPT_DANGLING}${R}\n"
        local count=0 i
        for i in "${!IMG_IDS[@]}"; do
          [[ "${IMG_STATUSES[$i]}" != "${STATUS_DANGLING}" ]] && continue
          _mk8s_rm "${IMG_IDS[$i]}" "${DRY_RUN}" "${IMG_IDS[$i]}"
          (( count++ )) || true
        done
        [[ "${count}" -eq 0 ]] && note "${NONE_FOUND}"
        ;;

      old)
        printf "\n  ${B}▸ ${OPT_OLD} (>${age_threshold}${AGE_DAYS})${R}\n"
        local had_unknown=false count=0 i
        for i in "${!IMG_IDS[@]}"; do
          [[ "${IMG_STATUSES[$i]}" == "${STATUS_IN_USE}" ]] && continue
          local age_str="${IMG_AGES[$i]}"
          if [[ "${age_str}" == "${AGE_UNKNOWN}" ]]; then had_unknown=true; continue; fi
          local age_num="${age_str%${AGE_DAYS}}"
          if [[ "${age_num}" =~ ^[0-9]+$ ]] && (( age_num >= age_threshold )); then
            _mk8s_rm "${IMG_IDS[$i]}" "${DRY_RUN}" "${IMG_REPOS[$i]}:${IMG_TAGS[$i]} (${age_str})"
            (( count++ )) || true
          fi
        done
        [[ "${count}" -eq 0 ]] && note "${NONE_FOUND}"
        ${had_unknown} && warn "${UNKNOWN_AGE_WARN}"
        ;;

      all_unused)
        printf "\n  ${B}▸ ${OPT_ALL_UNUSED}${R}\n"
        local count=0 i
        for i in "${!IMG_IDS[@]}"; do
          [[ "${IMG_STATUSES[$i]}" == "${STATUS_IN_USE}" ]] && continue
          _mk8s_rm "${IMG_IDS[$i]}" "${DRY_RUN}" "${IMG_REPOS[$i]}:${IMG_TAGS[$i]}"
          (( count++ )) || true
        done
        [[ "${count}" -eq 0 ]] && note "${NONE_FOUND}"
        ;;
    esac
  done
}

# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════

main() {
  # ── Step 1: Language ────────────────────────────────────────────────────────
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang
  local lang="en"
  [[ "${raw_lang,,}" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  # ── Step 2: Dry-run mode ────────────────────────────────────────────────────
  if ${ASK_DRY_RUN}; then
    printf "  ${B}%s${R} (n): " "${DRY_RUN_PROMPT}"
    local dry_ans; read -r dry_ans
    dry_ans="${dry_ans:-n}"
    local fc="${dry_ans:0:1}"
    [[ "${CONFIRM_YES_CHARS}" == *"${fc,,}"* ]] && DRY_RUN=true
    echo ""
    if ${DRY_RUN}; then
      printf "  ${BYEL}⚠  %s${R}\n\n" "${DRY_RUN_NOTE}"
    fi
  fi

  # ── Step 3: Runtime selection ───────────────────────────────────────────────
  local has_docker=false has_mk8s=false
  command -v docker   &>/dev/null && has_docker=true
  command -v microk8s &>/dev/null && has_mk8s=true

  local RUNTIME=""
  if ${has_docker} && ${has_mk8s}; then
    printf "  ${B}%s${R} (docker): " "${RUNTIME_PROMPT}"
    local raw_rt; read -r raw_rt
    raw_rt="${raw_rt:-docker}"
    [[ "${raw_rt,,}" == mk* || "${raw_rt,,}" == micro* ]] && RUNTIME="microk8s" || RUNTIME="docker"
    echo ""
  elif ${has_docker}; then
    RUNTIME="docker"
  elif ${has_mk8s}; then
    RUNTIME="microk8s"
  else
    fail "${RUNTIME_NOT_FOUND}"
    exit 1
  fi

  info "Runtime: ${B}${RUNTIME}${R}"

  # ── Step 4: Scan ────────────────────────────────────────────────────────────
  if [[ "${RUNTIME}" == "docker" ]]; then
    step "${DISK_USAGE_BEFORE}"
    docker_disk_usage
    docker_scan
    docker_scan_containers
    docker_scan_cache
  else
    mk8s_scan
    mk8s_disk_usage
  fi

  # ── Step 5: Operations menu ─────────────────────────────────────────────────
  echo ""
  printf "  ${B}%s${R}\n" "${PRUNE_TITLE}"
  printf "  ${D}%s${R}\n"   "${PRUNE_HINT}"
  printf "  ${D}%s${R}\n\n" "${PRUNE_HINT2}"

  if [[ "${RUNTIME}" == "docker" ]]; then
    OPT_IDS=(dangling old all_unused stopped cache system_prune)
    OPT_LABELS=(
      "${OPT_DANGLING}"
      "${OPT_OLD}"
      "${OPT_ALL_UNUSED}"
      "${OPT_STOPPED}"
      "${OPT_CACHE}"
      "${OPT_SYSTEM_PRUNE}"
    )
    OPT_ENABLED=(1 1 1 1 1 1)
  else
    OPT_IDS=(dangling old all_unused)
    OPT_LABELS=(
      "${OPT_DANGLING}"
      "${OPT_OLD}"
      "${OPT_ALL_UNUSED}"
    )
    OPT_ENABLED=(1 1 1)
  fi

  SELECTED_OPT_IDS=()
  interactive_select_options
  echo ""

  if [[ "${#SELECTED_OPT_IDS[@]}" -eq 0 ]]; then
    warn "${NOTHING_SELECTED}"; exit 0
  fi

  # ── Step 6: Age threshold ───────────────────────────────────────────────────
  AGE_THRESHOLD_VAL=10
  local selected_str=" ${SELECTED_OPT_IDS[*]} "
  if [[ "${selected_str}" == *" old "* ]]; then
    printf "  ${B}%s${R} (10): " "${AGE_THRESHOLD_PROMPT}"
    local raw_age; read -r raw_age
    raw_age="${raw_age:-10}"
    [[ "${raw_age}" =~ ^[0-9]+$ ]] && AGE_THRESHOLD_VAL="${raw_age}"
    echo ""
  fi

  # ── Step 7: Confirmation ────────────────────────────────────────────────────
  if ! ${DRY_RUN}; then
    printf "  ${BYEL}%s${R} (n): " "${CONFIRM_PROMPT}"
    local confirm; read -r confirm
    confirm="${confirm:-n}"
    local fc="${confirm:0:1}"
    if [[ "${CONFIRM_YES_CHARS}" != *"${fc,,}"* ]]; then
      echo ""
      printf "  %s\n\n" "${SKIPPED}"
      exit 0
    fi
  fi

  # ── Step 8: Execute ─────────────────────────────────────────────────────────
  if [[ "${RUNTIME}" == "docker" ]]; then
    docker_execute "${SELECTED_OPT_IDS[@]}"
  else
    mk8s_execute "${SELECTED_OPT_IDS[@]}"
  fi

  # ── Step 9: After summary ───────────────────────────────────────────────────
  if ! ${DRY_RUN}; then
    if [[ "${RUNTIME}" == "docker" ]]; then
      step "${DISK_USAGE_AFTER}"
      docker_disk_usage
    else
      info "${SCANNING_IMAGES} (${DISK_USAGE_AFTER})"
      mk8s_scan 2>/dev/null || true
      mk8s_disk_usage
    fi
  fi

  # ── Done ────────────────────────────────────────────────────────────────────
  echo ""
  hr
  if ${DRY_RUN}; then
    printf "\n  ${BYEL}⚠  %s${R}\n\n" "${DRY_RUN_NOTE}"
  else
    printf "\n  ${BGRN}✓  %s${R}\n\n" "${DONE}"
  fi
}

main "$@"
