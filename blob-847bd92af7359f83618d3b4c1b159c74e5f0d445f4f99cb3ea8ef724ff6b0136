#!/usr/bin/env bash
# run-pod-features.sh -- the Ruby half of the sow feature checks.
#
#   bash tools/persistence/run-pod-features.sh <oracleAppDir> <deck> <outDir>
#
# Sows, with Ruby, the pods tests/tools/pod-features.test.ts compares the TS
# sow against: --items only and --items (cards then items) for a list card,
# --url from a local pod file, and -m merging into an existing data file
# (tests/fixtures/pods/merge-target.yml). The deck is the Ruby deck the
# persistence op list left (run-ruby-steps.sh KEEP_DECK); a copy is used and
# removed on exit. One Ruby process at a time.
set -u
APP_DIR="${1:?oracle app dir}"
SRC="${2:?deck}"
OUT="${3:?out dir}"
HERE="$(dirname "$(readlink -f "$0")")"
REPO="$(dirname "$(dirname "$HERE")")"
RUN="$HERE/run-ruby.sh"
mkdir -p "$OUT"
DECK="$OUT/sow-features-$$.sqlite3"
cp "$SRC" "$DECK" || exit 2
trap 'rm -f "$DECK" "$DECK-shm" "$DECK-wal"' EXIT
sow() { bash "$RUN" "$APP_DIR" "$DECK" "$HERE/pod-sow.rb" "$OUT/$1" "" "" "$2" 2>&1 | grep -E "^\[pod\]|Error" || true; }
sow items-only.yml '{"name":"PersistProbe List","items":"only"}'
sow items-and-cards.yml '{"name":"PersistProbe List,PersistProbe Form2+PersistProbe Tags","items":true}'
sow from-url.yml "{\"url\":\"$REPO/tests/fixtures/pods/conflict-modes.yml\"}"
sow merged.yml "{\"name\":\"PersistProbe List\",\"items\":\"only\",\"merge_into\":\"$REPO/tests/fixtures/pods/merge-target.yml\"}"
echo "=== done"
