#!/usr/bin/env bash
# run-ruby.sh -- run one decko runner script against a deck file.
#
#   bash tools/persistence/run-ruby.sh <oracleAppDir> <deck.sqlite3> <script.rb> [args...]
#
# One Ruby process, a private run-scoped file cache (removed on exit), the
# large thread stacks the persistence scripts need on Windows.
set -u
APP_DIR="${1:?oracle app dir}"
DECK="${2:?deck}"
SCRIPT="${3:?script}"
shift 3
CACHE="$(dirname "$DECK")/ruby-cache-$$"
mkdir -p "$CACHE"
trap 'rm -rf "$CACHE"' EXIT
cd "$APP_DIR" || exit 3
RAILS_ENV=development \
DECKO_CACHE_DIR="$CACHE" \
DATABASE_URL="sqlite3:$DECK" \
RUBY_THREAD_VM_STACK_SIZE="${VM_STACK:-67108864}" \
RUBY_THREAD_MACHINE_STACK_SIZE="${MACHINE_STACK:-268435456}" \
  bundle exec decko runner "$SCRIPT" "$@"
