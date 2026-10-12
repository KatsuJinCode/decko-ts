#!/usr/bin/env bash
# Runs the reference-harness runner on LINUX, with the stock Ruby oracle as the
# engine, over the deck capture-oracle-on-linux.sh built. The harness runner
# (node) and the oracle (ruby) both run inside WSL here, so the run's
# environment is Linux end to end and run-meta.json records that.
#
#   bash run-harness-on-linux.sh <harnessRepoDir> <workRoot>
set -euo pipefail

HARNESS_REPO="$(cd "${1:?harness repo dir}" && pwd)"
WORK_ROOT="$(cd "${2:?work root}" && pwd)"

export PATH="/usr/local/bin:/usr/bin:/bin"
FIXTURE="$WORK_ROOT/fixture"
OUT="$WORK_ROOT/runs/linux-ruby33"
LOG="$WORK_ROOT/run-harness.log"
rm -rf "$OUT"
mkdir -p "$OUT"

# Everything after this point is logged inside WSL: the caller's shell would
# otherwise redirect on the Windows side, where the path does not exist.
exec > >(tee "$LOG") 2>&1

echo "=== node: $(node --version)   ruby: $(ruby3.3 --version) on $(ruby3.3 -e 'print RUBY_PLATFORM')"
cd "$FIXTURE"
node "$HARNESS_REPO/reference-harness/runner/run.mjs" \
  --adapter "$HARNESS_REPO/reference-harness/adapters/ruby-linux/adapter.json" \
  --fixture "$FIXTURE" \
  --out "$OUT"
echo "RUN_DONE"