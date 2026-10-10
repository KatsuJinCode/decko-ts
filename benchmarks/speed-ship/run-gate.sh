#!/usr/bin/env bash
# Run the byte gate over the whole page set in slices (each slice one
# command well under two minutes), split over LANES parallel lanes.
#   benchmarks/speed-ship/run-gate.sh <bundle> <mode> <ref-dir> <out-dir> <results.jsonl> [lanes] [slice] [extra...]
set -u
BUNDLE=$1; MODE=$2; REF=$3; OUT=$4; RES=$5; LANES=${6:-2}; SLICE=${7:-5}; shift 7 2>/dev/null || shift $#
EXTRA="$*"
N=$(python benchmarks/speed-ship/gate.py pages | wc -l)
: > "$RES"
lane() {
  local start=$1
  while [ "$start" -lt "$N" ]; do
    python benchmarks/speed-ship/gate.py check --bundle "$BUNDLE" --mode "$MODE" --ref-dir "$REF" --out-dir "$OUT" \
      --start "$start" --count "$SLICE" --extra "$EXTRA" ${GATE_DB:+--db "$GATE_DB"} | grep -v '"not_identical"' >> "$RES"
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
