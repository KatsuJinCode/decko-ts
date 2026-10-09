#!/usr/bin/env bash
# Serves the Ruby oracle deck for one browser session (see ../lib/engines.mjs).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if command -v cygpath >/dev/null 2>&1; then HERE="$(cygpath -m "$HERE")"; fi
ORACLE="$HERE/../../oracle"
export RAILS_ENV=development
export DATABASE_URL="sqlite3:${HARNESS_DECK:?}"
export DECKO_FILES_DIR="${HARNESS_FILES:?}"
export DECKO_CACHE_DIR="${HARNESS_WORK:?}/cache"
export RUBY_THREAD_VM_STACK_SIZE="${RUBY_THREAD_VM_STACK_SIZE:-67108864}"
export RUBY_THREAD_MACHINE_STACK_SIZE="${RUBY_THREAD_MACHINE_STACK_SIZE:-268435456}"
mkdir -p "$DECKO_CACHE_DIR"
cd "$ORACLE/app"
# The editors' scripts are served from public/mod/<mod>, which decko setup
# creates (links to each mod's public directory).
for m in ace_editor bootstrap style tinymce_editor; do
  [ -e "public/mod/$m" ] || { echo "oracle/app/public/mod/$m is missing: link it to the card-mod-$m gem's public directory" >&2; exit 2; }
done
exec bundle exec decko runner "$HERE/ruby-server.rb"
