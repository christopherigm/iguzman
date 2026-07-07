#!/usr/bin/env bash
#
# One-time Garage cluster layout bootstrap.
#
# Assigns each node its capacity WEIGHT (so the 2 TB node holds far more than
# the 80 GB node) and applies the layout. Run this after the first deploy, once
# all pods are Running. The layout is persisted in Garage's own metadata, so you
# do NOT re-run it on every `helm upgrade`.
#
# Safe to re-run: after you edit layout.capacities in values.yaml, run this
# again to push the new weights — it auto-detects the next layout version to
# apply (Garage requires the version to increment), and is a no-op if nothing
# changed. There is no longer any need to bump `--version` by hand.
#
# It maps Garage node IDs -> pod IP -> Kubernetes node name -> capacity, so it
# works regardless of which pod landed on which node.
#
#   Usage: ./bootstrap-layout.sh [RELEASE] [NAMESPACE]
#
# The per-node capacity weights, the zone, and the pinned node list are read
# straight from the chart's values.yaml (layout.capacities / layout.zone /
# nodeAffinity.nodeNames) — that file is the single source of truth. Edit them
# there; this script has nothing to keep in sync. The nodeNames list is used to
# warn if a pinned node has no capacity weight (or vice versa).
#
# Environment:
#   VALUES_FILE=...     Override the values.yaml to read (default: the chart's
#                       own values.yaml, one dir up from this script).
#   PRINT_CAPACITIES=1  Print the capacity map and exit (no cluster changes).
#                       Used by cli/deploy-garage to preview the weights.
#   AUTO_APPROVE=1      Skip the interactive "apply these capacities?" prompt
#                       (the caller is responsible for confirming first).
set -euo pipefail

RELEASE="${1:-garage}"
NAMESPACE="${2:-garage}"
POD="${RELEASE}-0"
# The runtime config is assembled by the init container into this shared
# emptyDir (the garage image has no shell to build it in-place). This path
# must match statefulset.yaml's `-c` flag / the init container's $CONF.
CONF="/run/garage/garage.toml"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALUES_FILE="${VALUES_FILE:-${SCRIPT_DIR}/../values.yaml}"

# Read layout.zone, layout.capacities.<node>: <weight>, and the
# nodeAffinity.nodeNames list from values.yaml. Dependency-free (awk is
# universal; yq/PyYAML may not be on the deploy host). Scoped to the relevant
# top-level blocks so same-named keys elsewhere and commented-out entries
# (e.g. `# node5: 500Gi`, `# - node5`) are ignored.
#
# The awk emits one tagged record per line: `zone <v>`, `cap <node> <weight>`,
# or `name <node>`.
ZONE="default"
declare -A CAP=()
declare -a NODE_NAMES=()
if [ ! -f "$VALUES_FILE" ]; then
  echo "values.yaml not found at: $VALUES_FILE" >&2
  echo "Set VALUES_FILE=/path/to/values.yaml and re-run." >&2
  exit 1
fi
while read -r tag a b; do
  case "$tag" in
    zone) ZONE="$a" ;;
    cap)  [ -n "$a" ] && CAP["$a"]="$b" ;;
    name) [ -n "$a" ] && NODE_NAMES+=("$a") ;;
  esac
done < <(awk '
  function indent(s,   n) { match(s, /^ */); return RLENGTH }
  function unquote(s) { gsub(/["'\'']/, "", s); return s }
  { sub(/\r$/, "") }
  /^[[:space:]]*$/ { next }              # blank
  /^[[:space:]]*#/ { next }              # comment
  {
    ind = indent($0)
    key = $0; sub(/^[[:space:]]*/, "", key)
  }
  ind == 0 {                             # top-level key selects the section
    section = (key ~ /^layout:/) ? "layout" : (key ~ /^nodeAffinity:/) ? "nodeaff" : ""
    incap = 0; innames = 0
    next
  }
  section == "" { next }
  section == "layout" && ind == 2 {
    if (key ~ /^zone:/)            { v = key; sub(/^zone:[[:space:]]*/, "", v)
                                     print "zone " unquote(v); incap = 0 }
    else if (key ~ /^capacities:/) { incap = 1 }
    else                          { incap = 0 }
    next
  }
  section == "layout" && incap && ind >= 4 {
    node = key; sub(/:.*/, "", node)
    val  = key; sub(/^[^:]*:[[:space:]]*/, "", val); val = unquote(val)
    if (node != "" && val != "") print "cap " node " " val
    next
  }
  section == "nodeaff" && ind == 2 { innames = (key ~ /^nodeNames:/); next }
  section == "nodeaff" && innames && ind >= 4 && key ~ /^-/ {
    name = key; sub(/^-[[:space:]]*/, "", name); name = unquote(name)
    if (name != "") print "name " name
  }
' "$VALUES_FILE")

if [ "${#CAP[@]}" -eq 0 ]; then
  echo "No layout.capacities found in $VALUES_FILE — nothing to assign." >&2
  exit 1
fi

# Consistency guard: every pinned node should have a capacity weight and every
# weighted node should be pinned (values.yaml requires the two lists to match).
# Warn but continue — a transient mismatch mid-edit shouldn't block a re-run.
check_node_consistency() {
  local n found
  for n in "${NODE_NAMES[@]}"; do
    [ -n "${CAP[$n]:-}" ] || \
      echo "  ! WARNING: node '$n' is pinned (nodeAffinity.nodeNames) but has no layout.capacities weight" >&2
  done
  for n in "${!CAP[@]}"; do
    found=0
    for pinned in "${NODE_NAMES[@]}"; do [ "$pinned" = "$n" ] && { found=1; break; }; done
    [ "$found" = "1" ] || \
      echo "  ! WARNING: node '$n' has a layout.capacities weight but is not in nodeAffinity.nodeNames" >&2
  done
}

# Print the per-node capacity weights, one "node<TAB>weight" per line, sorted,
# then flag any divergence from nodeAffinity.nodeNames.
print_capacities() {
  local n
  for n in $(printf '%s\n' "${!CAP[@]}" | sort); do
    printf "  %-8s %s\n" "$n" "${CAP[$n]}"
  done
  [ "${#NODE_NAMES[@]}" -gt 0 ] && check_node_consistency
}

# Preview mode: show what would be applied and exit without touching kubectl.
if [ "${PRINT_CAPACITIES:-0}" = "1" ]; then
  print_capacities
  exit 0
fi

g() { kubectl exec -n "$NAMESPACE" "$POD" -- /garage -c "$CONF" "$@"; }

echo "==> Current cluster status (all nodes should be listed):"
g status

# ── Confirm the capacity weights before mutating the layout ──────────────────
echo "==> Capacity weights to apply (from values.yaml -> layout.capacities):"
print_capacities
if [ "${AUTO_APPROVE:-0}" != "1" ]; then
  if [ -t 0 ]; then
    read -r -p "Apply these capacity weights to the cluster layout? [y/N]: " ok
    [[ "${ok}" =~ ^[Yy]$ ]] || { echo "Aborted — layout not modified."; exit 0; }
  else
    echo "Refusing to apply unconfirmed capacities in a non-interactive shell." >&2
    echo "Re-run in a terminal, or pass AUTO_APPROVE=1 after verifying the weights." >&2
    exit 1
  fi
fi

echo "==> Mapping pod IPs to Kubernetes nodes..."
declare -A IP2NODE
while read -r ip node; do
  [ -n "$ip" ] && IP2NODE["$ip"]="$node"
done < <(kubectl get pods -n "$NAMESPACE" \
  -l "app.kubernetes.io/instance=${RELEASE}" \
  -o jsonpath='{range .items[*]}{.status.podIP}{" "}{.spec.nodeName}{"\n"}{end}')

echo "==> Assigning capacities..."
# `garage status` columns: ID  Hostname  Address(IP:port)  Tags  Zone  Capacity
# Take the ID (col 1) and the IP from the Address (col 3). Adjust the awk
# columns if a future Garage version changes the table layout.
#
# Match the node-ID rows by "all lowercase hex, >= 8 chars" using length()
# rather than a /{8,}/ interval regex — the default awk on many hosts is
# mawk, which silently ignores brace intervals and would match nothing.
g status | awk 'NF>=3 && $1 ~ /^[0-9a-f]+$/ && length($1) >= 8 {print $1" "$3}' \
  | while read -r id addr; do
      ip="${addr%%:*}"
      node="${IP2NODE[$ip]:-}"
      cap="${CAP[$node]:-}"
      if [ -z "$cap" ]; then
        echo "  ! no capacity mapped for node '$node' (id $id) — skipping"
        continue
      fi
      echo "  - $node ($id) -> $cap"
      g layout assign "$id" -z "$ZONE" -c "$cap"
    done

echo "==> Staged layout:"
LAYOUT_SHOW="$(g layout show)"
printf '%s\n' "$LAYOUT_SHOW"

# Garage refuses `layout apply` unless you pass the NEXT layout version — a
# concurrency guard — so a hardcoded `--version 1` only ever works on the very
# first bootstrap and fails on every re-run. Instead, read the version from
# Garage itself: whenever there are staged changes, `garage layout show` prints
# the exact command to run ("... layout apply --version N"), so we lift N
# straight from that line. This makes re-runs (changing capacities on a live
# cluster) bump the version automatically.
APPLY_VERSION="$(printf '%s\n' "$LAYOUT_SHOW" \
  | grep -iE 'layout apply .*--version' | grep -oE '[0-9]+' | tail -1)"

if [ -z "$APPLY_VERSION" ]; then
  # No "apply --version N" hint means Garage sees no staged changes: the
  # assignments above already match the live layout. Re-running with unchanged
  # capacities is a harmless no-op.
  echo "==> No staged layout changes — cluster already matches values.yaml. Nothing to apply."
  echo "==> Done. Verify with: kubectl exec -n $NAMESPACE $POD -- /garage -c $CONF status"
  exit 0
fi

echo "==> Applying layout (version ${APPLY_VERSION})..."
g layout apply --version "$APPLY_VERSION"

echo "==> Done. Verify with: kubectl exec -n $NAMESPACE $POD -- /garage -c $CONF status"
