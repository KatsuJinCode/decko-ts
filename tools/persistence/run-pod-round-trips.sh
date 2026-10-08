#!/usr/bin/env bash
# run-pod-round-trips.sh -- the Ruby half of the import/export round trips.
#
#   bash tools/persistence/run-pod-round-trips.sh sow <oracleAppDir> <srcDeck> <dir>
#   bash tools/persistence/run-pod-round-trips.sh eat <oracleAppDir> <baseDeck> <dir>
#
# sow: copy the source deck to <dir>/src.sqlite3 and sow it with Ruby
#      (`decko sow -c '{}'`, every live card) into <dir>/ruby-src.yml.
#      tests/tools/pod-round-trip.test.ts then sows the same deck with the TS
#      engine (<dir>/ts-src.yml) and runs the Ruby -> TS and TS -> TS trips.
# eat: Ruby -> Ruby and TS -> Ruby: each pod eaten by Ruby into a fresh copy
#      of the base deck, the result sown again by Ruby (<dir>/<trip>.yml) with
#      the eat report beside it (<dir>/<trip>.eat.json). Deck copies are
#      removed on exit. One Ruby process at a time.
set -u
MODE="${1:?sow|eat}"
APP_DIR="${2:?oracle app dir}"
DECK="${3:?deck}"
DIR="${4:?dir}"
HERE="$(dirname "$(readlink -f "$0")")"
RUN="$HERE/run-ruby.sh"
mkdir -p "$DIR"

if [ "$MODE" = "sow" ]; then
  cp "$DECK" "$DIR/src.sqlite3" || exit 2
  bash "$RUN" "$APP_DIR" "$DIR/src.sqlite3" "$HERE/pod-sow.rb" "$DIR/ruby-src.yml" '{}' 2>&1 | grep -E "^\[pod\]|Error" || true
  exit 0
fi

TARGETS=()
# KEEP_DECKS=1 keeps the eaten decks for tools/persistence/compare-decks.mjs
# (the caller removes them).
[ -n "${KEEP_DECKS:-}" ] || trap 'for t in "${TARGETS[@]}"; do rm -f "$t" "$t-shm" "$t-wal"; done' EXIT
for trip in ruby-to-ruby ts-to-ruby; do
  case "$trip" in
    ruby-to-ruby) pod="$DIR/ruby-src.yml" ;;
    ts-to-ruby)   pod="$DIR/ts-src.yml" ;;
  esac
  [ -f "$pod" ] || { echo "!! missing pod: $pod"; continue; }
  target="$DIR/$trip.sqlite3"
  TARGETS+=("$target")
  cp "$DECK" "$target" || exit 2
  bash "$RUN" "$APP_DIR" "$target" "$HERE/pod-eat.rb" "$pod" "$DIR/$trip.eat.json" 2>&1 | grep -E "^\[pod\]|Error" || true
  bash "$RUN" "$APP_DIR" "$target" "$HERE/pod-sow.rb" "$DIR/$trip.yml" '{}' 2>&1 | grep -E "^\[pod\]|Error" || true
done
echo "=== done"
