#!/usr/bin/env bash
# Runs tools/ruby-mods/oracle-run.rb in a private copy of the oracle app with
# the plan's mod installed under mod/, on a private copy of the plan's deck.
#
#   RUBY_GEMS_PATH=<bundle path> bash tools/ruby-mods/oracle-run.sh <plan.json> <out.json>
#
# RUBY_GEMS_PATH is the BUNDLE_PATH holding the oracle's pinned gems.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLAN="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUT="$2"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/decko-ruby-mod-oracle.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
if command -v cygpath >/dev/null 2>&1; then
  WORK="$(cygpath -m "$WORK")"; HERE="$(cygpath -m "$HERE")"; ROOT="$(cygpath -m "$ROOT")"; PLAN="$(cygpath -m "$PLAN")"
fi
MOD_DIR="$(node -e "console.log(require('$PLAN').modDir)")"
DECK="$(node -e "console.log(require('$PLAN').deck)")"
MOD_NAME="$(basename "$MOD_DIR")"

cp -r "$ROOT/reference-harness/oracle/app" "$WORK/app"
mkdir -p "$WORK/app/mod" "$WORK/cache" "$WORK/files"
cp -r "$ROOT/$MOD_DIR" "$WORK/app/mod/$MOD_NAME" 2>/dev/null || cp -r "$MOD_DIR" "$WORK/app/mod/$MOD_NAME"
cp "$DECK" "$WORK/deck.sqlite3"

export BUNDLE_PATH="${RUBY_GEMS_PATH:?set RUBY_GEMS_PATH to the oracle bundle path}"
export BUNDLE_GEMFILE="$WORK/app/Gemfile"
export RAILS_ENV=development
export DATABASE_URL="sqlite3:$WORK/deck.sqlite3"
export DECKO_FILES_DIR="$WORK/files"
export DECKO_CACHE_DIR="$WORK/cache"
export RUBY_THREAD_VM_STACK_SIZE="${RUBY_THREAD_VM_STACK_SIZE:-67108864}"
export RUBY_THREAD_MACHINE_STACK_SIZE="${RUBY_THREAD_MACHINE_STACK_SIZE:-268435456}"
cd "$WORK/app"
bundle exec decko runner "$HERE/oracle-run.rb" "$PLAN" "$OUT"
