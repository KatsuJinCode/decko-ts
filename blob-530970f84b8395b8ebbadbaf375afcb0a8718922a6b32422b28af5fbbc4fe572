#!/usr/bin/env bash
# Serves the Ruby oracle deck for one browser session (see ../lib/engines.mjs).
#
#   ruby-server.sh --link-mods   only create the oracle app's public/mod links
#                                (run-all does this once before any server starts)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if command -v cygpath >/dev/null 2>&1; then HERE="$(cygpath -m "$HERE")"; fi
ORACLE="$HERE/../../oracle"
# The application to serve. The default is the local oracle app beside this
# script (the legacy local target); the VM target sets HARNESS_ORACLE_APP_DIR
# to the stock oracle app it provisioned there (the same card 1.110.0 /
# decko 0.20.0 code the vm-ruby application carries, without the deployed
# application's custom mods and custom root route).
APP_DIR="${HARNESS_ORACLE_APP_DIR:-$ORACLE/app}"
cd "$APP_DIR"

# The oracle runtime is Ruby 3.3 (docs/parity-method.md), with the oracle
# gems installed in that Ruby's gem directory. The ambient `bundle` cannot
# be trusted with the dispatch: on a machine carrying several Rubies on PATH
# (this one puts Ruby 3.4 ahead of 3.3) bundler runs under the wrong
# interpreter and gem home and cannot find the oracle gems, and when only
# the child interpreter is switched, bundler's exported BUNDLER_SETUP still
# loads its own installation across the version boundary and fails the same
# way (can't find gem bundler (= 2.6.9) with executable bundle). Dispatch
# the way engines/ruby33.json does: pin the interpreter and the gem dir so
# no PATH order can cross the versions.
if command -v cygpath >/dev/null 2>&1; then
  ORACLE_RUBY="${HARNESS_ORACLE_RUBY:-C:/Ruby33-x64/bin/ruby.exe}"
  if [ ! -x "$ORACLE_RUBY" ]; then
    echo "no oracle Ruby executable at $ORACLE_RUBY; set HARNESS_ORACLE_RUBY to the Ruby 3.3 ruby.exe" >&2
    exit 2
  fi
  GEM_HOME="$("$ORACLE_RUBY" -e 'print Gem.default_dir')"
  GEM_PATH="$GEM_HOME"
  export GEM_HOME GEM_PATH
  # Inherited bundler variables would point the pinned dispatch back across
  # the version boundary; the oracle app's own Gemfile is the only one used.
  unset BUNDLE_BIN_PATH BUNDLE_GEMFILE BUNDLE_PATH BUNDLER_VERSION BUNDLER_SETUP RUBYOPT RUBYLIB
fi

# The installation directory of a gem the bundle activates, resolved by the
# bundle itself (bundler/setup activates the Gemfile.lock versions).
bundled_gem_dir() {
  if [ -n "${ORACLE_RUBY:-}" ]; then
    "$ORACLE_RUBY" -e 'require "bundler/setup"; print Gem.loaded_specs.fetch(ARGV.fetch(0)).full_gem_path' "$1"
  else
    bundle exec ruby -e 'print Gem.loaded_specs.fetch(ARGV.fetch(0)).full_gem_path' "$1"
  fi
}

# The editors' scripts are served from public/mod/<mod>, which decko setup
# creates (links to each mod's public directory). A missing link is created
# here the same way, pointing at the bundle's installed card-mod-<mod> gem.
link_mods() {
  mkdir -p public/mod
  local m gem_dir
  for m in ace_editor bootstrap style tinymce_editor; do
    [ -e "public/mod/$m" ] && continue
    gem_dir="$(bundled_gem_dir "card-mod-$m")"
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
if [ -n "${ORACLE_RUBY:-}" ]; then
  # Same dispatch for the server boot: the app binstub runs decko in-process
  # under the pinned Ruby (config/boot.rb requires bundler/setup against the
  # app's Gemfile), the shape engines/ruby33-server.rb proves on this
  # machine, instead of `bundle exec decko`, which trusts the ambient
  # bundler again.
  exec "$ORACLE_RUBY" script/decko runner "$HERE/ruby-server.rb"
fi
exec bundle exec decko runner "$HERE/ruby-server.rb"
