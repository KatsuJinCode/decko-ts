#!/usr/bin/env bash
# run-ruby-steps.sh -- the Ruby oracle half of the persistence probe.
#
#   bash tools/persistence/run-ruby-steps.sh <oracleAppDir> <srcDeck> <outDir> [steps]
#
# A fresh copy of the source deck, then ONE `decko runner` process per step
# (one process = one request; see persist-write-probe.rb for why). The deck
# file carries state between steps exactly as a live deck would. The copy
# and a private, run-scoped file cache are removed on exit.
#
# The op runs on a Ruby Thread with large stacks: on Windows the main
# thread's stack is fixed by the executable and Decko's compound-name save
# recurses past it.
set -u
APP_DIR="${1:?oracle app dir}"
SRC="${2:?source deck}"
OUT="${3:?output dir}"
STEPS="${4:-32}"
# FIRST=<n>: start at step n instead of 1. The source deck must then be the
# deck the earlier steps left (a KEEP_DECK copy from a run that ended at
# step n-1); step files of earlier steps are not rewritten.
FIRST="${FIRST:-1}"
HERE="$(dirname "$(readlink -f "$0")")"
SCRIPT="$HERE/persist-write-probe.rb"
WORK="$(dirname "$OUT")"
DECK="$WORK/ruby-run-$$.sqlite3"
CACHE="$WORK/ruby-cache-$$"

if [ "$FIRST" = "1" ]; then rm -rf "$OUT"; fi
mkdir -p "$OUT" "$CACHE"
cp "$SRC" "$DECK" || { echo "COPY FAILED: $SRC"; exit 2; }
# Uploaded files (persist-write-probe.rb FILES_DIR): run-scoped unless the
# caller names a directory to keep (KEEP_FILES=<dir>, which it then owns).
export PERSIST_FILES_DIR="${KEEP_FILES:-$WORK/ruby-files-$$}"
trap 'rm -f "$DECK" "$DECK-shm" "$DECK-wal"; rm -rf "$CACHE"; [ -z "${KEEP_FILES:-}" ] && rm -rf "$PERSIST_FILES_DIR"' EXIT

# FRESH_CACHE_STEPS="<n> <m> ...": empty the card cache before these steps.
# Ruby's rename rewrites referer content with update_column and never
# expires the referer's cache entry, so a later request that fetches the
# referer from the shared cache reads its pre-rename content (a Ruby
# defect, recorded in recovery/parity-team/persistence.md). The probe resets
# the cache before a step that would otherwise read such a stale entry, so
# the oracle measures Ruby's logic over the stored rows, not the defect.
FRESH_CACHE_STEPS=" ${FRESH_CACHE_STEPS:-39} "

for i in $(seq "$FIRST" "$STEPS"); do
  case "$FRESH_CACHE_STEPS" in
    *" $i "*) rm -rf "$CACHE"; mkdir -p "$CACHE"; echo "=== fresh card cache before step $i" ;;
  esac
  log="$WORK/ruby-step-$$-$i.log"
  (
    cd "$APP_DIR" || exit 3
    RAILS_ENV=development \
    DECKO_CACHE_DIR="$CACHE" \
    DATABASE_URL="sqlite3:$DECK" \
    RUBY_THREAD_VM_STACK_SIZE="${VM_STACK:-67108864}" \
    RUBY_THREAD_MACHINE_STACK_SIZE="${MACHINE_STACK:-268435456}" \
      bundle exec decko runner "$SCRIPT" "$OUT" "$i" > "$log" 2>&1
  )
  grep -E "^\[persist\]" "$log"
  # A step that wrote no state file crashed outside the op's own rescue
  # (the process died); show why instead of moving on silently.
  if [ ! -f "$(printf '%s/step-%02d.json' "$OUT" "$i")" ]; then
    echo "!! step $i wrote no state file; process output tail:"
    tail -15 "$log"
  fi
  rm -f "$log"
done
# KEEP_DECK=<path>: keep a copy of the deck as the op list left it, for the
# whole-deck row comparison (tools/persistence/compare-decks.mjs). The caller
# owns that copy and removes it.
if [ -n "${KEEP_DECK:-}" ]; then
  cp "$DECK" "$KEEP_DECK" && echo "=== kept final deck: $KEEP_DECK"
fi
echo "=== done: $(ls "$OUT" | wc -l) step files"
