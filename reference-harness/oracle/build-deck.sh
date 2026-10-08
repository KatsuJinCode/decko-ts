#!/usr/bin/env bash
# Builds a fixture's reference deck with the Ruby oracle.
#
#   bash reference-harness/oracle/build-deck.sh <fixtureDir>
#
# Seeds a stock deck (`decko setup`) in a private work directory, applies
# <fixtureDir>/deck.json to it (build-deck.rb), and writes the result to
# <fixtureDir>/deck/deck.sqlite3 plus the uploaded files under
# <fixtureDir>/deck/files/. The work directory is removed on exit.
set -euo pipefail
FIXTURE="$(cd "${1:?fixture dir}" && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/app"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/decko-deck-build.XXXXXX")"
trap '[ -n "${KEEP_WORK:-}" ] || rm -rf "$WORK"' EXIT
# Git Bash on Windows: hand native Ruby a Windows path.
if command -v cygpath >/dev/null 2>&1; then WORK="$(cygpath -m "$WORK")"; FIXTURE="$(cygpath -m "$FIXTURE")"; HERE="$(cygpath -m "$HERE")"; APP="$HERE/app"; fi

export RAILS_ENV=development
export DECKO_CACHE_DIR="$WORK/cache"
export DECKO_FILES_DIR="$WORK/files"
export DATABASE_URL="sqlite3:$WORK/deck.sqlite3"
export RUBY_THREAD_VM_STACK_SIZE="${RUBY_THREAD_VM_STACK_SIZE:-67108864}"
export RUBY_THREAD_MACHINE_STACK_SIZE="${RUBY_THREAD_MACHINE_STACK_SIZE:-268435456}"
mkdir -p "$DECKO_CACHE_DIR" "$DECKO_FILES_DIR"

cd "$APP"
echo "seeding stock deck in $WORK"
bundle exec decko setup > "$WORK/setup.log" 2>&1 || { tail -20 "$WORK/setup.log"; exit 1; }
echo "applying $FIXTURE/deck.json"
DECK_JSON="$FIXTURE/deck.json" bundle exec decko runner "$HERE/build-deck.rb" > "$WORK/build.log" 2>&1 \
  || { grep -m3 -E "deck build failed|Error" "$WORK/build.log"; exit 1; }
tail -1 "$WORK/build.log"

rm -rf "$FIXTURE/deck"
mkdir -p "$FIXTURE/deck"
cp "$WORK/deck.sqlite3" "$FIXTURE/deck/deck.sqlite3"
cp -r "$DECKO_FILES_DIR" "$FIXTURE/deck/files"
echo "wrote $FIXTURE/deck"
