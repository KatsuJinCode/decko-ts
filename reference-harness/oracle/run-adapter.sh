#!/usr/bin/env bash
# Starts the Ruby oracle's adapter for one harness session. The runner sets
# HARNESS_DECK, HARNESS_FILES, HARNESS_DECK_JSON and HARNESS_WORK.
# With the argument "batched" the app runs with card-mod-batched-nests
# (app/Gemfile.batched); without it, stock Decko.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if command -v cygpath >/dev/null 2>&1; then HERE="$(cygpath -m "$HERE")"; fi
export RAILS_ENV=development
export DATABASE_URL="sqlite3:${HARNESS_DECK:?}"
export DECKO_FILES_DIR="${HARNESS_FILES:?}"
export DECKO_CACHE_DIR="${HARNESS_WORK:?}/cache"
export HARNESS_DECK_JSON="${HARNESS_DECK_JSON:?}"
export HARNESS_BIG_STACK="${HARNESS_BIG_STACK:-0}"
export RUBY_THREAD_VM_STACK_SIZE="${RUBY_THREAD_VM_STACK_SIZE:-67108864}"
export RUBY_THREAD_MACHINE_STACK_SIZE="${RUBY_THREAD_MACHINE_STACK_SIZE:-268435456}"
mkdir -p "$DECKO_CACHE_DIR"
if [ "${1:-}" = "batched" ]; then export BUNDLE_GEMFILE="$HERE/app/Gemfile.batched"; fi
cd "$HERE/app"
exec bundle exec decko runner "$HERE/adapter.rb"
