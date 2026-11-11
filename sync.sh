#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Update the local checkout to the latest GitHub version.
# Untracked/ignored files (.env, tools/piper, voices) are never touched:
# git only rewrites tracked files, and a hard reset would still keep ignored paths.

git fetch origin

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Local edits to tracked files would block a fast-forward; park them in a stash
# (restorable with: git stash pop) so the sync can't destroy anything.
if ! git diff --quiet; then
  echo "Local edits detected - stashing them so nothing is lost..."
  git stash push -m "sync.sh auto-stash $(date '+%Y-%m-%d %H:%M:%S')"
fi

if ! git merge --ff-only "origin/$BRANCH"; then
  echo "Fast-forward failed - remote history changed or local commits conflict."
  echo "Your stashed edits, commits, .env and other ignored files are all still there."
  exit 1
fi

# Refresh dependencies to match any package.json/package-lock changes.
npm ci
