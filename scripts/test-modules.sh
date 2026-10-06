#!/usr/bin/env bash
#
# Run unit tests for local native modules and display per-module results.
#
# Usage:
#   scripts/test-modules.sh                    # test all modules, both platforms
#   scripts/test-modules.sh expo-gzip          # test a single module
#   scripts/test-modules.sh --platform ios     # test all modules, iOS only
#   scripts/test-modules.sh --platform android expo-ssl-trust
#   scripts/test-modules.sh --coverage         # include coverage report
#
# Module list is discovered dynamically by `scripts/discover-modules.js`
# (any `modules/<name>/src/__tests__/` qualifies). Adding a new tested
# module no longer requires updating this script.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Single source of truth — see scripts/discover-modules.js
MODULES=()
while IFS= read -r module; do
  [[ -n "$module" ]] && MODULES+=("$module")
done < <(node "$REPO_ROOT/scripts/discover-modules.js")

if [[ ${#MODULES[@]} -eq 0 ]]; then
  echo "No modules with tests discovered under modules/*/src/__tests__/" >&2
  exit 1
fi

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
DIM='\033[2m'
RESET='\033[0m'

platform=""
coverage=""
declare -a filter=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      platform="$2"
      shift 2
      ;;
    --coverage)
      coverage="--coverage"
      shift
      ;;
    --help|-h)
      head -16 "$0" | tail -14 | sed 's/^# \?//'
      exit 0
      ;;
    *)
      filter+=("$1")
      shift
      ;;
  esac
done

# Validate filters
if [[ ${#filter[@]} -gt 0 ]]; then
  for f in "${filter[@]}"; do
    found=false
    for m in "${MODULES[@]}"; do
      if [[ "$m" == "$f" ]]; then found=true; break; fi
    done
    if ! $found; then
      echo -e "${RED}Unknown module: $f${RESET}"
      echo "Available modules: ${MODULES[*]}"
      exit 1
    fi
  done
  targets=("${filter[@]}")
else
  targets=("${MODULES[@]}")
fi

declare -a jest_extra_args=()
if [[ -n "$platform" ]]; then
  jest_extra_args+=(--selectProjects "$platform")
fi
if [[ -n "$coverage" ]]; then
  jest_extra_args+=(--coverage)
fi

declare -a passed=()
declare -a failed=()

separator() {
  echo -e "${DIM}$(printf '%.0s─' {1..60})${RESET}"
}

echo ""
echo -e "${BOLD}Module Unit Tests${RESET}"
if [[ -n "$platform" ]]; then
  echo -e "Platform: ${YELLOW}${platform}${RESET}"
else
  echo -e "Platforms: ${YELLOW}ios${RESET}, ${YELLOW}android${RESET}"
fi
echo ""

for module in "${targets[@]}"; do
  separator
  echo -e "${BOLD}${module}${RESET}"
  separator

  if npx jest "modules/${module}" ${jest_extra_args[@]+"${jest_extra_args[@]}"} --verbose 2>&1; then
    passed+=("$module")
  else
    failed+=("$module")
  fi

  echo ""
done

# Summary
separator
echo -e "${BOLD}Summary${RESET}"
separator

num_passed=${#passed[@]}
num_failed=${#failed[@]}

if [[ $num_passed -gt 0 ]]; then
  for m in "${passed[@]}"; do
    echo -e "  ${GREEN}✓${RESET} ${m}"
  done
fi
if [[ $num_failed -gt 0 ]]; then
  for m in "${failed[@]}"; do
    echo -e "  ${RED}✗${RESET} ${m}"
  done
fi

total=$(( num_passed + num_failed ))
echo ""
echo -e "  ${GREEN}${num_passed} passed${RESET}, ${RED}${num_failed} failed${RESET}, ${total} total"
echo ""

if [[ $num_failed -gt 0 ]]; then
  exit 1
fi
