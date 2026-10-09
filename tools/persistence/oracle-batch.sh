#!/usr/bin/env bash
# oracle-batch.sh -- the persistence-leftovers lane's remaining oracle work,
# serialized into ONE lane-job launch (machine RAM budget: one heavy slot):
#
#   1. run-pod-coded.sh   (Ruby) -> coded-storage oracle fixtures   (item 44)
#   2. run-pod-remote.sh  (Ruby) -> sow --remote oracle fixtures    (item 45)
#   3. image-version-probe.rb (Ruby) -> image versions oracle json  (item 43)
#   4. vitest persist-leftover-probe.test.ts  (items 46, 47, 48)
#   5. vitest pod-features.test.ts            (items 44, 45, 48)
#   6. vitest image-version-bytes.test.ts     (item 43)
#   7. vitest pod-round-trip.test.ts          (item 48)
#
# One Ruby process at a time (rule 9); the vitest files run one by one.
# Exit status: nonzero when any step failed; the log names each verdict.
set -u
HERE="$(dirname "$(readlink -f "$0")")"
REPO="$(dirname "$(dirname "$HERE")")"
APP=/c/localProjects/decko-oracle-app-parity-fix
DECK="C:/localProjects/decko-oracle-app-parity-fix/db/development.sqlite3"
FIXTURES="$REPO/tests/fixtures/pods"
ORACLE_FIXTURES="$REPO/tests/fixtures/persistence-leftover-oracle"
SCRATCH="$REPO/tmp/persist-left/oracle-batch"
VITEST="$REPO/node_modules/vitest/vitest.mjs"
rc=0

mkdir -p "$SCRATCH"

echo "=== [1/7] Ruby: coded-storage eat oracle (run-pod-coded.sh)"
rm -f "$FIXTURES/coded-storage.ruby-eat.json" "$FIXTURES/coded-storage.ruby-delta.json" "$FIXTURES/coded-storage.ruby-files.json"
if bash "$HERE/run-pod-coded.sh" "$APP" "$DECK" "$FIXTURES" "$SCRATCH" > "$SCRATCH/coded.log" 2>&1; then
  echo "    ok: $(ls "$FIXTURES" | grep coded-storage | tr '\n' ' ')"
else
  echo "    FAILED:"; tail -8 "$SCRATCH/coded.log"; rc=1
fi

echo "=== [2/7] Ruby: sow --remote oracle (run-pod-remote.sh)"
if bash "$HERE/run-pod-remote.sh" "$APP" "$DECK" "$FIXTURES" "$SCRATCH" > "$SCRATCH/remote.log" 2>&1; then
  echo "    ok: $(ls "$FIXTURES/sow-features" | grep remote) + $(ls "$FIXTURES/remote-tree" 2>/dev/null)"
else
  echo "    FAILED:"; tail -8 "$SCRATCH/remote.log"; rc=1
fi

echo "=== [3/7] Ruby: image versions oracle (image-version-probe.rb)"
IMG_OUT="$ORACLE_FIXTURES/image-versions.ruby.json"
if bash "$HERE/run-ruby.sh" "$APP" "$DECK" "$HERE/image-version-probe.rb" \
     "$REPO/tools/parity-side-effects/fixtures/parity-photo.png" "$IMG_OUT" \
     > "$SCRATCH/image.log" 2>&1; then
  echo "    ok: $IMG_OUT ($(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).files.map(f=>f.file).join(', '))" "$IMG_OUT" 2>/dev/null))"
else
  echo "    FAILED:"; tail -8 "$SCRATCH/image.log"; rc=1
fi

echo "=== [4/7] vitest: persist-leftover-probe.test.ts"
if node "$VITEST" run --root "$REPO" tests/tools/persist-leftover-probe.test.ts --maxWorkers=1 > "$SCRATCH/leftover-test.log" 2>&1; then
  echo "    ok (12/12 steps match the oracle)"
else
  echo "    FAILED:"; grep -E "state=|delta|×|FAIL" "$SCRATCH/leftover-test.log" | head -12; rc=1
fi

echo "=== [5/7] vitest: pod-features.test.ts"
if node "$VITEST" run --root "$REPO" tests/tools/pod-features.test.ts --maxWorkers=1 > "$SCRATCH/pod-features-test.log" 2>&1; then
  echo "    ok (coded storage + sow features + conflict modes)"
else
  echo "    FAILED:"; grep -E "×|FAIL|AssertionError" "$SCRATCH/pod-features-test.log" | head -12; rc=1
fi

echo "=== [6/7] vitest: image-version-bytes.test.ts"
if node "$VITEST" run --root "$REPO" tests/tools/image-version-bytes.test.ts --maxWorkers=1 > "$SCRATCH/image-test.log" 2>&1; then
  echo "    ok ($(grep -o 'measurement: .*' "$SCRATCH/image-test.log" | head -1))"
else
  echo "    FAILED:"; grep -E "×|FAIL|AssertionError" "$SCRATCH/image-test.log" | head -12; rc=1
fi

echo "=== [7/7] vitest: pod-round-trip.test.ts"
if node "$VITEST" run --root "$REPO" tests/tools/pod-round-trip.test.ts --maxWorkers=1 > "$SCRATCH/round-trip-test.log" 2>&1; then
  echo "    ok (eat runs inside the deck's mod event runtime)"
else
  echo "    FAILED:"; grep -E "×|FAIL|AssertionError" "$SCRATCH/round-trip-test.log" | head -12; rc=1
fi

echo "=== oracle batch done rc=$rc"
exit "$rc"
