#!/usr/bin/env bash
# Starts the Ruby oracle's adapter with the deck served from MySQL instead of
# the SQLite file. Stock Decko, unchanged: only the database adapter differs.
# The adapter gem (mysql2 0.5.7, built against MySQL 8.4's client library) lives
# in its own GEM path, GEM_PATH=$MYSQL_GEM_HOME first, so the shared bundle
# (app/Gemfile.lock and the Ruby install's gems) is not modified.
#
#   HARNESS_MYSQL_URL  mysql2://user@host:port/database (the database must
#                      already hold the deck; reference-harness/adapters/ts-mysql
#                      /mysql-mirror.ts loads it)
#   MYSQL_HOME         MySQL 8.4 distribution (bin/, lib/)
#   MYSQL_GEM_HOME     gem path holding the mysql2 0.5.7 build
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if command -v cygpath >/dev/null 2>&1; then HERE="$(cygpath -m "$HERE")"; fi
MYSQL_HOME="${MYSQL_HOME:-C:/localProjects/.mysql-test-cache/8.4.11/mysql-8.4.11-winx64}"
MYSQL_GEM_HOME="${MYSQL_GEM_HOME:-C:/localProjects/.mysql-test-cache/oracle-gems}"
# Ruby 3.3 holds card 1.110.0; its bin/ holds the ruby DLL that extensions import.
export PATH="C:/Ruby33-x64/bin:$MYSQL_HOME/bin:$MYSQL_HOME/lib:$PATH"
export MYSQL_HOME
export GEM_PATH="$MYSQL_GEM_HOME;C:/Ruby33-x64/lib/ruby/gems/3.3.0"
export RUBYOPT="-r$HERE/mysql-dll-preload.rb"
export RAILS_ENV=development
export DATABASE_URL="${HARNESS_MYSQL_URL:-mysql2://root@127.0.0.1:33091/oracle_ruby}"
export DECKO_FILES_DIR="${HARNESS_FILES:?}"
export DECKO_CACHE_DIR="${HARNESS_WORK:?}/cache"
export HARNESS_DECK_JSON="${HARNESS_DECK_JSON:?}"
export HARNESS_BIG_STACK="${HARNESS_BIG_STACK:-0}"
export RUBY_THREAD_VM_STACK_SIZE="${RUBY_THREAD_VM_STACK_SIZE:-67108864}"
export RUBY_THREAD_MACHINE_STACK_SIZE="${RUBY_THREAD_MACHINE_STACK_SIZE:-268435456}"
mkdir -p "$DECKO_CACHE_DIR"
export BUNDLE_GEMFILE="$HERE/app/Gemfile.mysql"
cd "$HERE/app"
# Ruby 3.3 is named explicitly: a Ruby 3.4 on PATH would resolve the bundle
# against the wrong gem home.
exec "C:/Ruby33-x64/bin/ruby.exe" "C:/Ruby33-x64/bin/bundle" exec decko runner "$HERE/adapter.rb"
