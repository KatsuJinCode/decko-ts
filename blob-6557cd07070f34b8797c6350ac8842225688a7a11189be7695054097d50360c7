#!/usr/bin/env bash
# Captures the synthetic-v1 fixture's answers with the stock Ruby oracle on
# LINUX, into a scratch results directory. Nothing in the repository is
# written: the deck is built into a copy of the fixture under /root, and the
# answers land in a scratch directory the caller names.
#
#   bash capture-oracle-on-linux.sh <oracleSrcDir> <fixtureSrcDir> <workRoot> <outDir>
#
# The bundle lives at <workRoot>/app (installed by
# install-oracle-bundle-on-linux.sh); its Gemfile.lock is a COPY carrying the
# linux platform, so the repository's lockfile is untouched.
set -euo pipefail

ORACLE_SRC="$(cd "${1:?oracle dir}" && pwd)"
FIXTURE_SRC="$(cd "${2:?fixture dir}" && pwd)"
WORK_ROOT="$(cd "${3:?work root}" && pwd)"
OUT="$(cd "$(dirname "${4:?out dir}")" && pwd)/$(basename "${4}")"
APP="$WORK_ROOT/app"

export PATH="/usr/bin:$PATH"
FIXTURE="$WORK_ROOT/fixture"
rm -rf "$FIXTURE"
mkdir -p "$FIXTURE"
cp -r "$FIXTURE_SRC/." "$FIXTURE/"
# The deck is rebuilt here: a deck built on Windows is a Windows deck, and the
# question being answered is what stock LINUX Ruby renders.
rm -rf "$FIXTURE/deck" "$FIXTURE/expected"

echo "=== ruby: $(ruby3.3 --version) on $(ruby3.3 -e 'print RUBY_PLATFORM')"

export RAILS_ENV=development
export DECKO_CACHE_DIR="$WORK_ROOT/cache"
export DECKO_FILES_DIR="$WORK_ROOT/files"
export DATABASE_URL="sqlite3:$WORK_ROOT/build.sqlite3"
export RUBY_THREAD_VM_STACK_SIZE=67108864
export RUBY_THREAD_MACHINE_STACK_SIZE=268435456
rm -rf "$DECKO_CACHE_DIR" "$DECKO_FILES_DIR" "$WORK_ROOT/build.sqlite3"
mkdir -p "$DECKO_CACHE_DIR" "$DECKO_FILES_DIR"

cd "$APP"
echo "=== seeding a stock deck"
bundle exec decko setup > "$WORK_ROOT/setup.log" 2>&1 || { tail -20 "$WORK_ROOT/setup.log"; exit 1; }
echo "=== applying deck.json"
DECK_JSON="$FIXTURE/deck.json" bundle exec decko runner "$ORACLE_SRC/build-deck.rb" > "$WORK_ROOT/build.log" 2>&1 \
  || { grep -m5 -E "deck build failed|Error" "$WORK_ROOT/build.log"; exit 1; }
tail -1 "$WORK_ROOT/build.log"

rm -rf "$FIXTURE/deck"
mkdir -p "$FIXTURE/deck"
cp "$WORK_ROOT/build.sqlite3" "$FIXTURE/deck/deck.sqlite3"
cp -r "$DECKO_FILES_DIR" "$FIXTURE/deck/files"
echo "=== built the Linux deck at $FIXTURE/deck"
echo "CAPTURE_DECK_DONE"