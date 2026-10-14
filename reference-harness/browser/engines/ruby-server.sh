#!/usr/bin/env bash
# Serves the Ruby oracle deck for one browser session (see ../lib/engines.mjs).
#
#   ruby-server.sh --link-mods   only create the oracle app's public/mod links
#                                (run-all does this once before any server starts)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if command -v cygpath >/dev/null 2>&1; then HERE="$(cygpath -m "$HERE")"; fi
ORACLE="$HERE/../../oracle"
cd "$ORACLE/app"

# The editors' scripts are served from public/mod/<mod>, which decko setup
# creates (links to each mod's public directory). A missing link is created
# here the same way, pointing at the bundle's installed card-mod-<mod> gem.
link_mods() {
  mkdir -p public/mod
  local m gem_dir
  for m in ace_editor bootstrap style tinymce_editor; do
    [ -e "public/mod/$m" ] && continue
    gem_dir="$(bundle exec ruby -e "print Gem.loaded_specs.fetch('card-mod-$m').full_gem_path")"
    [ -d "$gem_dir/public" ] || { echo "card-mod-$m has no public directory at $gem_dir" >&2; exit 2; }
    if command -v cygpath >/dev/null 2>&1; then
      MSYS_NO_PATHCONV=1 cmd /c mklink /J "$(cygpath -w "public/mod/$m")" "$(cygpath -w "$gem_dir/public")" >/dev/null
    else
      ln -s "$gem_dir/public" "public/mod/$m"
    fi
    [ -e "public/mod/$m" ] || { echo "could not link oracle/app/public/mod/$m to $gem_dir/public" >&2; exit 2; }
  done
}

if [ "${1:-}" = "--link-mods" ]; then
  link_mods
  exit 0
fi
link_mods

export RAILS_ENV=development
export DATABASE_URL="sqlite3:${HARNESS_DECK:?}"
export DECKO_FILES_DIR="${HARNESS_FILES:?}"
export DECKO_CACHE_DIR="${HARNESS_WORK:?}/cache"
export RUBY_THREAD_VM_STACK_SIZE="${RUBY_THREAD_VM_STACK_SIZE:-67108864}"
export RUBY_THREAD_MACHINE_STACK_SIZE="${RUBY_THREAD_MACHINE_STACK_SIZE:-268435456}"
mkdir -p "$DECKO_CACHE_DIR"
exec bundle exec decko runner "$HERE/ruby-server.rb"
