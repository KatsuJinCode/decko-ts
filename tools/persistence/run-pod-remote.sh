#!/usr/bin/env bash
# run-pod-remote.sh -- the Ruby oracle half of the `sow --remote` check.
#
#   bash tools/persistence/run-pod-remote.sh <oracleAppDir> <probeDeck> <fixturesDir> <outDir>
#
# Serves a pod tree over 127.0.0.1 (a Node one-liner; the only listener),
# sows with Ruby's real `--remote` machinery against it (RemoteSource:
# URI.join("<remote>", "/<name.url_key>/", "pod.yml"), URI.open), and
# commits what Ruby fetched:
#   <fixturesDir>/remote-tree/<url key>/pod.yml   the served pod
#   <fixturesDir>/sow-features/from-remote.ruby.yml   Ruby's output
#   <outDir>/remote-requests.log                  the paths Ruby asked for
# The served pod is the committed items-only pod (the same deck's `--items
# only` output), so the check isolates the REMOTE machinery. The deck is the
# Ruby deck the persistence op list left; a copy is used, removed on exit.
# One Ruby process at a time.
set -u
APP_DIR="${1:?oracle app dir}"
SRC="${2:?probe deck}"
FIXTURES="${3:?tests/fixtures/pods dir}"
OUT="${4:?out dir}"
HERE="$(dirname "$(readlink -f "$0")")"
REPO="$(dirname "$(dirname "$HERE")")"
RUN="$HERE/run-ruby.sh"
mkdir -p "$OUT"
DECK="$OUT/remote-$$.sqlite3"
cp "$SRC" "$DECK" || exit 2
LOG="$OUT/remote-requests.log"
PORT=$(( (RANDOM % 20000) + 40000 ))

node -e '
const http = require("node:http");
const fs = require("node:fs");
const pod = fs.readFileSync(process.argv[2]);
const log = fs.createWriteStream(process.argv[4]);
const server = http.createServer((req, res) => {
  log.write(req.url + "\n");
  res.writeHead(200, { "content-type": "text/yaml" });
  res.end(pod);
});
server.listen(Number(process.argv[3]), "127.0.0.1");
' "$FIXTURES/sow-features/items-only.ruby.yml" "$PORT" "$LOG" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; rm -f "$DECK" "$DECK-shm" "$DECK-wal"' EXIT
sleep 1

bash "$RUN" "$APP_DIR" "$DECK" "$HERE/pod-sow.rb" \
  "$FIXTURES/sow-features/from-remote.ruby.yml" "" "" \
  "{\"remote\": \"http://127.0.0.1:$PORT\", \"name\": \"PersistProbe List\"}" 2>&1 |
  grep -E "^\[pod\]|Error" || true

# The served tree, under the url key Ruby actually asked for.
KEY="$(head -1 "$LOG" | sed -E 's#^/([^/]+)/pod\.yml.*$#\1#')"
if [ -n "$KEY" ] && [ "$KEY" != "$(head -1 "$LOG")" ]; then
  mkdir -p "$FIXTURES/remote-tree/$KEY"
  cp "$FIXTURES/sow-features/items-only.ruby.yml" "$FIXTURES/remote-tree/$KEY/pod.yml"
  echo "=== served tree key: $KEY"
else
  echo "!! no remote request logged; Ruby output:"
  cat "$FIXTURES/sow-features/from-remote.ruby.yml" 2>/dev/null | head -5
  exit 3
fi
echo "=== done"
