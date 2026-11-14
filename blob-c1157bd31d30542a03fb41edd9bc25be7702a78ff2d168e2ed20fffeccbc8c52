#!/usr/bin/env bash
# RETIRED AS THE STANDARD GATE (2026-10-09): the per-change byte gate is the
# corpus grade (reference-harness/runner/grade.mjs over fixtures/synthetic-v2). This
# script still drives gate.py over an explicit page set for real-deck bundle
# measurements, but gate.py refuses the retired 40-page default, so pass the
# pages via GATE_PAGES (semicolon-separated).
#   GATE_PAGES="About;Home" benchmarks/speed-ship/run-gate.sh <bundle> <mode> <ref-dir> <out-dir> <results.jsonl> [lanes] [slice] [extra...]
set -u
BUNDLE=$1; MODE=$2; REF=$3; OUT=$4; RES=$5; LANES=${6:-2}; SLICE=${7:-5}; shift 7 2>/dev/null || shift $#
EXTRA="$*"
PAGES_ARG="${GATE_PAGES:-}"
if [ -z "$PAGES_ARG" ]; then
  echo "run-gate.sh: the 40-page gate list is retired; set GATE_PAGES (the standard gate is reference-harness/runner/grade.mjs over fixtures/synthetic-v2)" >&2
  exit 2
fi
N=$(python benchmarks/speed-ship/gate.py pages --pages "$PAGES_ARG" | wc -l)
: > "$RES"
lane() {
  local start=$1
  while [ "$start" -lt "$N" ]; do
    python benchmarks/speed-ship/gate.py check --bundle "$BUNDLE" --mode "$MODE" --ref-dir "$REF" --out-dir "$OUT" \
      --start "$start" --count "$SLICE" --pages "$PAGES_ARG" --extra "$EXTRA" ${GATE_DB:+--db "$GATE_DB"} | grep -v '"not_identical"' >> "$RES"
    start=$((start + SLICE * LANES))
  done
}
for ((l = 0; l < LANES; l++)); do lane $((l * SLICE)) & done
wait
python - "$RES" <<'EOF'
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1], encoding="utf8") if l.strip()]
bad = [r["page"] for r in rows if not r["same"]]
print(json.dumps({"pages": len(rows), "not_identical": len(bad), "which": bad}))
EOF
