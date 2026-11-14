#!/usr/bin/env bash
# Installs the oracle's bundle for Linux, in a copy of oracle/app under the
# WSL filesystem. The committed Gemfile.lock carries only x64-mingw-ucrt, so
# the Linux platform is added to a COPY — the repository's lockfile is never
# touched by this run. The Dockerfile does the same thing (`bundle lock
# --add-platform ...`) inside the image; here it happens on disk, so the
# working copy is disposable.
#
#   wsl -d Ubuntu-26.04 -- bash /mnt/c/.../install-oracle-bundle-on-linux.sh <oracleDir> <workDir>
set -euo pipefail

ORACLE_SRC="$(cd "${1:?oracle dir}" && pwd)"
WORK="$(cd "${2:?work dir}" && pwd)"
APP="$WORK/app"

export PATH="/usr/bin:$PATH"
mkdir -p "$APP"
cp "$ORACLE_SRC/app/Gemfile" "$ORACLE_SRC/app/Gemfile.lock" "$ORACLE_SRC/app/Rakefile" "$APP/"
cp -r "$ORACLE_SRC/app/config" "$APP/config"
cp -r "$ORACLE_SRC/app/script" "$APP/script"
cp "$ORACLE_SRC/app/config.ru" "$APP/"

cd "$APP"
echo "ruby: $(ruby3.3 --version)  platform: $(ruby3.3 -e 'print RUBY_PLATFORM')"
gem install bundler --no-document -v '~> 2.5' >/dev/null 2>&1 || true
bundle config set --local without "development test"
echo "adding the linux platform to the COPY of the lockfile"
bundle lock --add-platform x86_64-linux aarch64-linux
echo "installing the bundle (native extensions build here)"
bundle install --jobs 4
echo "BUNDLE_DONE"
bundle list 2>/dev/null | grep -E "decko |card |nokogiri |sqlite3 " || true