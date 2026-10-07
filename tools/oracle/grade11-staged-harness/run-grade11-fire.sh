#!/usr/bin/env bash
# run-grade11-fire.sh -- grade #11 full-canvas dual-lane measurement (staged harness).
#
# WHAT THIS IS
#   The grade-10 instrument (tools/oracle/dual-lane-direct-driver.mjs, the same
#   runner core, the same graded config: deployment asset-host seam only,
#   serializer era UNSET -- both properties OF the instrument's own code, not
#   flags this script sets), configured for grade #11 against the fold-14
#   union tip and the fresh 48-shard corpus re-capture.
#
#   TWO NAMED BLANKS, filled at fire time:
#     FRESH_CORPUS_PATH   the fresh re-capture's raw-ground-truth tree
#                         (digests of record: corpus-recapture-lane.md,
#                         brandonDojoTech tmp/wrong-goal-hunt/)
#     FOLD_TIP            the fold-14 union tip commit sha
#                         (tip of record: fold14exec-lane.md, same receipts dir)
#
#   This script does not fire itself on the full canvas. Firing is the
#   controller's decision (exclusive-window protocol). This script is the
#   staged, guarded harness the controller's single command invokes.
#
# USAGE
#   Grade #11 (full canvas, ~2.5 h at W=1):
#     FRESH_CORPUS_PATH=<tree> FOLD_TIP=<sha> \
#       bash tools/oracle/grade11-staged-harness/run-grade11-fire.sh fire
#   Pipeline-proof slice (1-2 shards, whatever is staged now):
#     bash tools/oracle/grade11-staged-harness/run-grade11-fire.sh slice
#
#   RUN_SUFFIX (optional, fire mode): appended to the artifacts dir name so a
#   re-fire with a different corpus binding never tramples a prior run of
#   record -- e.g. RUN_SUFFIX=-seamclean fires into
#   full-canvas-<FOLD_TIP>-w1-grade11-seamclean (Guard 5 then guards THAT dir).
#
#   Long run: fire DETACHED (Start-Process or equivalent) -- an attached run
#   gets reaped at a 600 s tool limit mid-render (grade-9 step-18 lesson).
#
# GUARDS (fire mode refuses unless all hold)
#   1. FRESH_CORPUS_PATH exists with expected-v2/{view-lane,page-lane} holding
#      48 .jsonl shards each, plus bench-corpus-raw.sqlite3.
#   2. FOLD_TIP is a commit that exists in this worktree's repo.
#   3. This worktree's HEAD == FOLD_TIP (the re-point has happened; the
#      re-point procedure lives in grade11-lane.md's fire-me card).
#   4. Staged corpus digests (computed from the staged copy AFTER staging,
#      the grade-10 pre-boot-gate discipline) equal the source tree's digests.
#   4b. Zero adjudicated-stale byte-forms in the STAGED copy (seamreanchor-apply
#       lane spec 2026-10-05, brandonDojoTech tmp/wrong-goal-hunt/
#       seamreanchor-work/corpus-gate-guard-spec-grade-refire-stale-seam-plus-asset-host.md):
#       denied-seam census staleOccurrences==0 AND contextGuardFailures==0, and
#       zero `http://s3.amazonaws.com//files/` carriers in both staged lanes
#       (the close-71 live-true form). A stale form can never silently
#       re-collapse a grade on a corpus swap.
#   4c. The corpus was captured on the deck the engine is seeded from
#       (tools/oracle/corpus-deck-pairing-gate.mjs): the capture provenance's
#       deck sha equals the staged bench sha, and every captured row holds the
#       input card's id. Needs CAPTURE_INPUT_SET and CAPTURE_PROVENANCE (and
#       CAPTURE_DECK when the capture ran on a Decko-schema deck built from the bench).
#   5. The artifacts directory is fresh (the driver's artifacts-reuse guard
#      would refuse a reused dir; this script checks first and says so).

set -euo pipefail

MODE="${1:-fire}"
# GRADE_REPO: which worktree fires. Defaults to this script's own repo (the
# three levels up from tools/oracle/grade11-staged-harness/), so a worktree that
# carries the harness fires in itself with no edit. The grade-11 worktree's copy
# hardcoded its own path; naming it here is what lets the R-24 grade fire from a
# worktree whose HEAD IS the grade tip -- Guard 3 wants HEAD == FOLD_TIP or a
# zero src/tests/benchmarks diff, and the grade-11 worktree's HEAD (8ae91993) is
# neither of those against 7bc63c1c.
REPO="${GRADE_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
HARNESS="$REPO/tools/oracle/grade11-staged-harness"
# WORKERS: the driver worker count. Defaults to 1, the only count MEASURED at the
# grade tip (grade-11 seam-clean: WALL 6950.4s at W=1). Any other value is an
# UNMEASURED point: w8-scaling-probe-lane.md records the divide-by-W projection
# 31% optimistic at W=8 on this machine, so a W=6 figure quoted by division is a
# projection and must never be reported as a measurement.
WORKERS="${WORKERS:-1}"
FRESH_CORPUS_PATH="${FRESH_CORPUS_PATH:-}"
FOLD_TIP="${FOLD_TIP:-}"
RUN_SUFFIX="${RUN_SUFFIX:-}"
# Coverage assertions of record. 16,738 = the fresh corpus's true denominators
# (view 10,150 + page 6,588; the grade-11 run of record's coverage), retained
# by the seam-clean binding (the denied-seam re-anchor splices bytes within
# lines; shard line counts are unchanged). The old default 16,862 was the OLD
# corpus's denominator -- it false-FAILed a clean operator (A2 GAP 8).
EXPECT_TOTAL="${EXPECT_TOTAL:-16738}"
EXPECT_MALFORMED="${EXPECT_MALFORMED:-0}"

die() { echo "RUN-GRADE11-REFUSE: $*" >&2; exit 2; }

shard_count() { ls "$1"/*.jsonl 2>/dev/null | wc -l; }

if [ "$MODE" = "slice" ]; then
  # ---- SLICE MODE: pipeline proof against the CURRENTLY STAGED corpus. ----
  ARTIFACTS="$REPO/tmp/grade11/slice-proof-w1-grade11"
  LOG="$ARTIFACTS.log"
  ERRLOG="$ARTIFACTS.err.log"
  EXPECTED_V2="$REPO/tmp/raw-ground-truth/expected-v2"
  [ "$(shard_count "$EXPECTED_V2/view-lane")" -ge 1 ] || die "slice: no staged view-lane shards under $EXPECTED_V2"
  [ "$(shard_count "$EXPECTED_V2/page-lane")" -ge 1 ] || die "slice: no staged page-lane shards under $EXPECTED_V2"
  SLICE_FILES="recapture-raw-shard-000004.jsonl,recapture-raw-shard-000023.jsonl"
  mkdir -p "$ARTIFACTS"
  echo "SLICE-FIRE repo=$REPO files=$SLICE_FILES artifacts=$ARTIFACTS"
  cd "$REPO"
  # The runner's zero-tolerance gate exits 1 when any lane has fails — its
  # OWN designed verdict, thrown AFTER the aggregates are written (grade-10
  # receipt, core :724/:940-962). That exit must not abort this script before
  # the coverage parse: capture it, report it, judge on coverage.
  set +e
  node tools/oracle/dual-lane-direct-driver.mjs \
    --repo "$REPO" \
    --workers 1 \
    --artifacts "$ARTIFACTS" \
    --heap-mb 3072 \
    --files "$SLICE_FILES" \
    >"$LOG" 2>"$ERRLOG"
  DRIVER_EXIT=$?
  set -euo pipefail
  echo "SLICE-DONE driver_exit=$DRIVER_EXIT log=$LOG"
  node "$HARNESS/parse-grade11-coverage.mjs" "$LOG"
  exit 0
fi

[ "$MODE" = "fire" ] || die "unknown mode '$MODE' (use 'fire' or 'slice')"

# ---- FIRE MODE: grade #11 proper. ----

# Guard 1: fresh corpus shape.
[ -n "$FRESH_CORPUS_PATH" ] || die "FRESH_CORPUS_PATH is blank -- fill it at fire time (the re-capture lane's fresh raw-ground-truth tree)"
[ -d "$FRESH_CORPUS_PATH/expected-v2/view-lane" ] || die "FRESH_CORPUS_PATH has no expected-v2/view-lane: $FRESH_CORPUS_PATH"
[ -d "$FRESH_CORPUS_PATH/expected-v2/page-lane" ] || die "FRESH_CORPUS_PATH has no expected-v2/page-lane: $FRESH_CORPUS_PATH"
VIEW_N=$(shard_count "$FRESH_CORPUS_PATH/expected-v2/view-lane")
PAGE_N=$(shard_count "$FRESH_CORPUS_PATH/expected-v2/page-lane")
[ "$VIEW_N" -eq 48 ] || die "fresh view-lane holds $VIEW_N shards, expected 48"
[ "$PAGE_N" -eq 48 ] || die "fresh page-lane holds $PAGE_N shards, expected 48"
[ -f "$FRESH_CORPUS_PATH/bench-corpus-raw.sqlite3" ] || die "fresh corpus has no bench-corpus-raw.sqlite3"

# Guard 2+3: the engine code IS the tip's engine code. Satisfied by either
# HEAD == FOLD_TIP exactly, or FOLD_TIP being an ancestor of HEAD with a ZERO
# code diff (src/tests/benchmarks) between them -- the lane's own harness
# commit sits on top of the tip, so the merged HEAD differs from the tip by
# tools/oracle/grade11-staged-harness/ only, and the diff check proves it.
[ -n "$FOLD_TIP" ] || die "FOLD_TIP is blank -- fill it at fire time (the fold-14 union tip from fold14exec-lane.md)"
git -C "$REPO" cat-file -e "$FOLD_TIP^{commit}" 2>/dev/null || die "FOLD_TIP $FOLD_TIP is not a commit in this repo"
HEAD_SHA=$(git -C "$REPO" rev-parse HEAD)
if [ "$HEAD_SHA" != "$FOLD_TIP" ]; then
  git -C "$REPO" merge-base --is-ancestor "$FOLD_TIP" "$HEAD_SHA" ||
    die "worktree HEAD $HEAD_SHA does not descend from FOLD_TIP $FOLD_TIP -- re-point first (see grade11-lane.md fire-me card)"
  CODE_DIFF=$(git -C "$REPO" diff --name-only "$FOLD_TIP" "$HEAD_SHA" -- src tests benchmarks)
  [ -z "$CODE_DIFF" ] || die "HEAD differs from FOLD_TIP in engine code paths -- re-point is stale:
$CODE_DIFF"
fi

# Stage: overwrite-merge the fresh tree into the worktree's staging (no
# deletions; the digest gate below catches any residue).
mkdir -p "$REPO/tmp/raw-ground-truth"
cp -r "$FRESH_CORPUS_PATH/." "$REPO/tmp/raw-ground-truth/"

# Guard 4: digest gate, computed FROM THE STAGED COPY (grade-10 discipline).
DIGEST_DIR="$REPO/tmp/grade11/pre-boot-digests-$FOLD_TIP"
mkdir -p "$DIGEST_DIR"
node "$HARNESS/compute-corpus-lane-digests.mjs" --corpus "$FRESH_CORPUS_PATH" --json "$DIGEST_DIR/source-digests.json" >"$DIGEST_DIR/source-digests.txt"
node "$HARNESS/compute-corpus-lane-digests.mjs" --corpus "$REPO/tmp/raw-ground-truth" --json "$DIGEST_DIR/staged-digests.json" >"$DIGEST_DIR/staged-digests.txt"
if ! diff -q "$DIGEST_DIR/source-digests.txt" "$DIGEST_DIR/staged-digests.txt" >/dev/null; then
  diff "$DIGEST_DIR/source-digests.txt" "$DIGEST_DIR/staged-digests.txt" >&2 || true
  die "staged-copy digests differ from source digests (residue or copy fault) -- see $DIGEST_DIR"
fi
echo "CORPUS-VERIFY OK (staged copy == fresh source; compare these digests to corpus-recapture-lane.md's records):"
cat "$DIGEST_DIR/staged-digests.txt"

# Guard 4b: corpus shape gate -- zero adjudicated-stale byte-forms in the
# STAGED copy (seamreanchor-apply lane spec 2026-10-05:
# brandonDojoTech tmp/wrong-goal-hunt/seamreanchor-work/
# corpus-gate-guard-spec-grade-refire-stale-seam-plus-asset-host.md).
# Assert 1: denied-seam stale form (census is read-only).
CENSUS_OUT=$(node "$REPO/tools/oracle/denied-seam-reanchor-page-lane-expectations.mjs" --repo "$REPO" --mode census)
echo "$CENSUS_OUT" | grep -q '"staleOccurrences": 0' \
  || die "stale denied-seam occurrences in staged page shards -- replay the denied-seam re-anchor before firing (seamreanchor-apply-lane.md)"
echo "$CENSUS_OUT" | grep -q '"contextGuardFailures": 0' \
  || die "denied-seam context-guard failures in staged page shards -- corpus shape fault"
# Assert 2: stale s3 asset-host form (close-71's from-literal must be absent).
if grep -rlF 'http://s3.amazonaws.com//files/' \
     "$REPO/tmp/raw-ground-truth/expected-v2/page-lane" \
     "$REPO/tmp/raw-ground-truth/expected-v2/view-lane" >/dev/null 2>&1; then
  die "stale s3.amazonaws.com asset-host carriers in staged corpus -- replay the close-71 transform before firing"
fi
echo "CORPUS-SHAPE OK (0 stale denied-seam occurrences; 0 s3 asset-host carriers)"

# Guard 4c: corpus/deck pairing -- the corpus must have been captured on the
# deck the engine is seeded from. Grade-11 seam-clean graded a corpus captured
# on a 21,676-card snapshot (provenance sha ab2d762b) against the 49,829-card
# bench (6a44dfdc); 2,669 page rows were not-found placeholders or fetch-nil
# rows for cards the bench holds, and all of them were scored as engine
# failures. CAPTURE_INPUT_SET is the capture rig's input set
# (disputed-set-resolved.json); CAPTURE_PROVENANCE is the capture's
# provenance manifest (its deck sha is compared with the staged bench sha).
# CAPTURE_DECK (optional): the Decko-schema deck the capture ran on, when it was
# built from the bench (Ruby needs the Decko schema and derived names/keys);
# the gate then proves the provenance names that file and that its card and
# reference rows equal the bench's.
CAPTURE_INPUT_SET="${CAPTURE_INPUT_SET:-}"
CAPTURE_PROVENANCE="${CAPTURE_PROVENANCE:-}"
CAPTURE_DECK="${CAPTURE_DECK:-}"
CAPTURE_DECK_ARGS=()
[ -z "$CAPTURE_DECK" ] || CAPTURE_DECK_ARGS=(--capture-deck "$CAPTURE_DECK")
[ -n "$CAPTURE_INPUT_SET" ] || die "CAPTURE_INPUT_SET is blank -- name the capture rig's disputed-set-resolved.json so the corpus/deck pairing can be checked"
[ -n "$CAPTURE_PROVENANCE" ] || die "CAPTURE_PROVENANCE is blank -- name the corpus's capture-provenance manifest so the capture deck sha can be compared with the graded bench"
PAIRING_JSON="$DIGEST_DIR/corpus-deck-pairing.json"
node "$REPO/tools/oracle/corpus-deck-pairing-gate.mjs" \
  --corpus "$REPO/tmp/raw-ground-truth" \
  --input-set "$CAPTURE_INPUT_SET" \
  --provenance "$CAPTURE_PROVENANCE" \
  "${CAPTURE_DECK_ARGS[@]}" \
  --mode gate --json "$PAIRING_JSON" \
  || die "corpus was not captured on the graded deck (see $PAIRING_JSON) -- re-capture on the bench deck, or seed the engine from the capture deck"

# Guard 5: fresh artifacts dir.
ARTIFACTS="$REPO/tmp/grade11/full-canvas-$FOLD_TIP-w${WORKERS}-grade11${RUN_SUFFIX}"
LOG="$ARTIFACTS.log"
ERRLOG="$ARTIFACTS.err.log"
if [ -d "$ARTIFACTS" ] && [ -n "$(ls -A "$ARTIFACTS" 2>/dev/null)" ]; then
  die "artifacts dir $ARTIFACTS already holds files (driver reuse guard would refuse) -- clear it or rename this run"
fi
mkdir -p "$ARTIFACTS"

echo "GRADE11-FIRE repo=$REPO tip=$FOLD_TIP workers=$WORKERS heap_mb=3072 artifacts=$ARTIFACTS"
if [ "$WORKERS" = "1" ]; then
  echo "Expected duration ~115.8 min at W=1 -- MEASURED, this exact run shape (grade-11 seam-clean WALL 6950.4s). Fire DETACHED."
else
  echo "W=$WORKERS is UNMEASURED at this tip. The only same-canvas points on record are W=1 6950.4s (grade-11, 16738 entries) and W=8 1497.7s (w8-scaling-probe, 16862 entries, older tip 814b3bd), and that receipt records divide-by-W as 31% optimistic at W=8. Quote a projection, never a measurement."
fi
cd "$REPO"
# Same zero-tolerance discipline as slice mode: the driver's exit 1 is its own
# designed verdict (fails present), thrown after artifacts are written — the
# coverage parse below is the gate this script reports on.
set +e
node tools/oracle/dual-lane-direct-driver.mjs \
  --repo "$REPO" \
  --workers "$WORKERS" \
  --artifacts "$ARTIFACTS" \
  --heap-mb 3072 \
  >"$LOG" 2>"$ERRLOG"
DRIVER_EXIT=$?
set -euo pipefail

echo "GRADE11-DONE driver_exit=$DRIVER_EXIT log=$LOG"
# Coverage assertions: 16,738 entries / malformed 0 (the fresh corpus's
# denominators of record; see the EXPECT_* overrides note above).
node "$HARNESS/parse-grade11-coverage.mjs" "$LOG" --expect-total "$EXPECT_TOTAL" --expect-malformed "$EXPECT_MALFORMED"
