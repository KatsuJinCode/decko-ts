#!/usr/bin/env bash
# run-pod-coded.sh -- the Ruby oracle half of the CODED-storage eat check.
#
#   bash tools/persistence/run-pod-coded.sh <oracleAppDir> <baseDeck> <fixturesDir> <outDir>
#
# Eats tests/fixtures/pods/coded-storage.yml into a fresh copy of the base
# deck with pod-eat.rb (POD_MOD_NAME/POD_MOD_DIR registered, so coded.rb's
# coded_dir resolves inside the run's scratch tree), then records what Ruby
# left for tests/tools/pod-features.test.ts to hold the TS port to:
#   <outDir>/coded-storage.eat.json        the eat report
#   <fixturesDir>/coded-storage.ruby-delta.json   every table's delta
#   <fixturesDir>/coded-storage.ruby-files.json   the mod files' names + sha1
# Deck copies and the scratch tree are removed on exit. One Ruby process.
set -u
APP_DIR="${1:?oracle app dir}"
BASE="${2:?base deck}"
FIXTURES="${3:?tests/fixtures/pods dir}"
OUT="${4:?out dir}"
HERE="$(dirname "$(readlink -f "$0")")"
REPO="$(dirname "$(dirname "$HERE")")"
RUN="$HERE/run-ruby.sh"
mkdir -p "$OUT"
DECK="$OUT/coded-$$.sqlite3"
WORK="$OUT/coded-work-$$"
mkdir -p "$WORK"
trap 'rm -rf "$DECK" "$DECK-shm" "$DECK-wal" "$WORK"' EXIT
cp "$BASE" "$DECK" || exit 2

export POD_FILES_DIR="$REPO/tests/fixtures/pods/files"
export POD_MOD_NAME="parity_pod_mod"
export POD_MOD_DIR="$WORK/mod"
export PERSIST_FILES_DIR="$WORK/store"
mkdir -p "$POD_MOD_DIR" "$PERSIST_FILES_DIR"

bash "$RUN" "$APP_DIR" "$DECK" "$HERE/pod-eat.rb" \
  "$REPO/tests/fixtures/pods/coded-storage.yml" "$OUT/coded-storage.eat.json" 2>&1 |
  grep -E "^\[pod\]|Error" || true
# The report is committed evidence: the item outcomes and the exact error
# wordings the TS port's eat report must repeat.
cp "$OUT/coded-storage.eat.json" "$FIXTURES/coded-storage.ruby-eat.json"

# The stored coded files: <POD_MOD_DIR>/data/files tree, name + sha1 (image
# versions by name only, their bytes are the encoder's).
node -e '
const { readdirSync, readFileSync, createHash } = require("node:fs");
const { join } = require("node:path");
const root = join(process.argv[1], "mod", "data", "files");
const out = [];
for (const dir of readdirSync(root).sort()) {
  for (const name of readdirSync(join(root, dir)).sort()) {
    const version = /-(icon|small|medium|large)\./.test(name);
    out.push({ file: `${dir}/${name}`,
               sha1: version ? null : createHash("sha1").update(readFileSync(join(root, dir, name))).digest("hex") });
  }
}
require("node:fs").writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + "\n");
' "$WORK" "$FIXTURES/coded-storage.ruby-files.json"

# Every table's delta against the base deck (the Ruby deck compared with
# itself: the comparison is trivially exact, and the fifth argument saves the
# delta the committed test holds the TS port to).
node "$REPO/tools/persistence/compare-decks.mjs" "$BASE" "$DECK" "$DECK" \
  "$WORK/report.json" "$FIXTURES/coded-storage.ruby-delta.json" &&
  echo "=== ruby delta saved" || { echo "!! delta failed"; exit 3; }
echo "=== done"
