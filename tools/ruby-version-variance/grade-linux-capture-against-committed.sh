#!/usr/bin/env bash
# Grades the LINUX oracle capture against the committed (Windows-captured)
# expected outputs, with N3 on and with N3 off, and records both reports.
#
#   bash grade-linux-capture-on-linux.sh <harnessRepoDir> <workRoot>
set -euo pipefail

HARNESS_REPO="$(cd "${1:?harness repo dir}" && pwd)"
WORK_ROOT="$(cd "${2:?work root}" && pwd)"
export PATH="/usr/local/bin:/usr/bin:/bin"

FIXTURE="$WORK_ROOT/fixture"
ACTUAL="$WORK_ROOT/runs/linux-ruby33"
EXPECTED="$HARNESS_REPO/reference-harness/fixtures/synthetic-v1/expected"
OUTDIR="$WORK_ROOT/compare"
mkdir -p "$OUTDIR"

echo "===== N3 ON (harness default) ====="
node "$HARNESS_REPO/reference-harness/runner/grade.mjs" \
  --fixture "$FIXTURE" --actual "$ACTUAL" --expected "$EXPECTED" \
  --report "$OUTDIR/grade-linux-vs-committed-n3-ON.json" || echo "GRADE_EXIT=$?"

echo
echo "===== N3 OFF (--no-class-token-order) ====="
node "$HARNESS_REPO/reference-harness/runner/grade.mjs" \
  --fixture "$FIXTURE" --actual "$ACTUAL" --expected "$EXPECTED" --no-class-token-order \
  --report "$OUTDIR/grade-linux-vs-committed-n3-OFF.json" | grep -E "normalization|^rendering|^semantics|^persistence|^side_effects|^read writes|^other tables|^verdict" || echo "GRADE_EXIT=$?"