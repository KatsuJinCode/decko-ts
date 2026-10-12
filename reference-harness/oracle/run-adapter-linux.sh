#!/usr/bin/env bash
# The Ruby oracle's adapter, for a LINUX capture.
#
# Identical to oracle/run-adapter.sh except that it runs under a bundle
# installed for Linux, because the committed Gemfile.lock carries only the
# x64-mingw-ucrt platform. The repository's own adapter recipe is untouched:
# this exists only so a capture can name the environment it ran in, and the
# environment now says so.
#
# ORACLE_LINUX_BUNDLE names the directory holding that bundle's `app/` — the
# same shape the Dockerfile builds inside the image, laid out on disk instead.
# There is no default: a capture that cannot say which bundle it ran under is
# not a capture.
#
#   HARNESS_DECK=... HARNESS_FILES=... HARNESS_DECK_JSON=... HARNESS_WORK=... \
#   ORACLE_LINUX_BUNDLE=<dir> bash run-adapter-linux.sh
set -euo pipefail

ORACLE_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${ORACLE_LINUX_BUNDLE:?set ORACLE_LINUX_BUNDLE to the directory holding the Linux bundle app directory}"
WORK_ROOT="$(cd "$ORACLE_LINUX_BUNDLE" && pwd)"

# /usr/local/bin holds a RubyInstaller's bundler; a Windows PATH that reaches
# the session must not leak in, or bash would exec a Windows bundle.
export PATH="/usr/local/bin:/usr/bin:/bin"

export RAILS_ENV=development
export DATABASE_URL="sqlite3:${HARNESS_DECK:?}"
export DECKO_FILES_DIR="${HARNESS_FILES:?}"
export DECKO_CACHE_DIR="${HARNESS_WORK:?}/cache"
export HARNESS_DECK_JSON="${HARNESS_DECK_JSON:?}"
export HARNESS_BIG_STACK="${HARNESS_BIG_STACK:-0}"
export RUBY_THREAD_VM_STACK_SIZE="${RUBY_THREAD_VM_STACK_SIZE:-67108864}"
export RUBY_THREAD_MACHINE_STACK_SIZE="${RUBY_THREAD_MACHINE_STACK_SIZE:-268435456}"
mkdir -p "$DECKO_CACHE_DIR"

cd "$WORK_ROOT/app"
exec bundle exec decko runner "$ORACLE_SRC/adapter.rb"