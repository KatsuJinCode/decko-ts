#!/usr/bin/env bash
# Starts the Ruby oracle's adapter inside the oracle image, for one harness
# session: the session directory (deck copy, files, adapter scratch) and the
# fixture directory are mounted, and the HARNESS_* paths are rewritten to
# their in-container locations.
set -euo pipefail
IMAGE="${DECKO_ORACLE_IMAGE:-decko-reference-oracle:0.20.0}"
SESSION="$(dirname "${HARNESS_DECK:?}")"
FIXTURE="$(dirname "${HARNESS_DECK_JSON:?}")"
exec docker run --rm -i \
  -v "$SESSION:/session" \
  -v "$FIXTURE:/fixture:ro" \
  -e HARNESS_DECK=/session/deck.sqlite3 \
  -e HARNESS_FILES=/session/files \
  -e HARNESS_WORK=/session/adapter \
  -e HARNESS_DECK_JSON=/fixture/deck.json \
  "$IMAGE" bash /oracle/run-adapter.sh
