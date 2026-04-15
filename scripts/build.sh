#!/usr/bin/env bash
set -euo pipefail

YEAR=$(date +%Y)
PR="${NETLIFY_PULL_REQUEST:-${PULL_REQUEST:-${CI_PULL_REQUEST:-}}}"

if [ -z "$PR" ] || [ "$PR" = "false" ] || [ "$PR" = "0" ]; then
  # grep geeft exit code 1 als er geen match is — || true voorkomt dat set -e het script stopt
  PR=$(git log -1 --merges --pretty=format:'%s' | grep -oE '#[0-9]+' | head -1 | tr -d '#' || true)
fi

COMMITS=$(git rev-list --count HEAD 2>/dev/null || echo "0")

if [ -n "$PR" ]; then
  export API_VERSION="${YEAR}.${PR}.${COMMITS}"
else
  export API_VERSION="${YEAR}.${COMMITS}"
fi

echo "[build] API_VERSION=${API_VERSION}"
npm run build
