#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -d .git ]]; then
  echo "Git hooks were not installed because this is not a Git worktree."
  exit 0
fi

git config core.hooksPath .githooks
echo "Git hooks installed from .githooks."
