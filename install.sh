#!/usr/bin/env sh
# Biblion Management: install, check and (optionally) preview.
#   ./install.sh             build, hygiene check and tests
#   ./install.sh --preview   the same, then start the app on this computer
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 or newer is needed. Get it from https://nodejs.org and run this again."
  exit 1
fi
exec node tools/install.mjs "$@"
