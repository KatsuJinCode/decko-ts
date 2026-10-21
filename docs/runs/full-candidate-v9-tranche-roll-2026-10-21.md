# Full candidate v9: the two-tranche roll, 2026-10-21

The wave's assignment: roll `port/routes-tranche5-20261021` (frozen tip
3ffcd4b5) and `port/matrix-journey-tranche5-20261021` (frozen tip f583811d)
into `deploy/full-candidate-20261020` (worktree
`C:/localProjects/decko-ts-full-candidate-20261020`, wave start c35b4f99,
the v8 roll receipt commit), verify containment, merge, rebuild conflicts by
regions, gate (typecheck plus `node tools/test-gates.mjs run correctness`,
failure set must equal the empty baseline), rebuild the bundle, record SHA-256
and bytes, push. Nothing deploys.

The assignment said the routes tip "carries the A18 verb correction to
src/server/write-routes.ts - a real port-source change, so the bundle WILL
change this time". That premise was correct, and it is confirmed below by the
engine bundle moving 14 bytes while the read pair stayed byte-identical.

## The frozen set and the containment verdicts

Both tips verified after `git fetch origin --prune`, by `git rev-parse`
against the frozen values:

| branch | frozen tip | tip verified | contained at wave start (c35b4f99) | merge commit |
| --- | --- | --- | --- | --- |
| port/routes-tranche5-20261021 | 3ffcd4b5 | 3ffcd4b53a8ccd76558461bb8fbd886c2194a5f3 | NO | 9fdd4646 |
| port/matrix-journey-tranche5-20261021 | f583811d | f583811d04056d6dcd1c7bf23775f146067f8871 | NO | 926b7508 |

Neither branch was contained. Each merge-base was already an ancestor of the
candidate, so both merges were short forwards rather than long rebases:
routes-tranche5's base is 1c097e4c (the tranche-4 tip the v8 roll merged),
matrix-journey-tranche5's base is e22c388e (the matrix-journey tip the v8
roll merged).

Post-merge containment re-verified on the committed tree: both 3ffcd4b5 and
f583811d pass `merge-base --is-ancestor` against HEAD. No merge-set branch
moved past its frozen tip during the roll: `origin/port/routes-tranche5-20261021`
is still exactly 3ffcd4b5 and the local
`port/matrix-journey-tranche5-20261021` is still exactly f583811d.

## Scope check before merging

The two tranches touch 27 and 10 files respectively. The overlap between what
each side changed since its own merge-base was computed with `comm` over
`git diff --name-only`, and it is one file per tranche:

- routes-tranche5: `src/server/write-routes.ts` only.
- matrix-journey-tranche5: `reference-harness/browser/probe-never-measured-batch1.mjs` only.

## The routes-tranche5 merge (9fdd4646)

Clean, zero conflicts, 27 files (8 new parity suites under tests/server/, 9
oracle-capture ruby scripts, 8 captured fixtures under fixtures/captured/,
`src/server/write-routes.ts`, and the tranche's row receipt).

The overlapping file auto-merged because the two sides touch disjoint hunks:
the candidate's side carries the `task` / `colorsParams` / `themeColorsParams`
param parsing, the apostrophe escape, the `RUBY_ALERT_CLASS` alert bytes, the
`right/<codename>` and `abstract/attachment` set-membership arms, the
subcard-scoped `action_id_of_cached_upload`, and the `commentAuthorSession`
wiring; the branch's side carries the A18 correction in `matchRoute`. Both
verified present after the merge:

- the A18 `patch` fold, declared exactly once, at `src/server/write-routes.ts:951`
  (`grep -c 'const patch = method === "PATCH";'` returns 1);
- the A18 create-arm verb test at `src/server/write-routes.ts:993` reading
  `if (verb === "create" && !(post || patch)) return null;`, the corrected
  form of the branch's `!(post || put)`.
- the candidate's `slotterMode?: string;` declaration still exactly once, and
  `colorsParams` (4 occurrences) and `subcardInputs` (6) all intact.

The A18 correction is the substance of the merge and it is a real behaviour
change, not a comment: `engine_routes.rb:46` declares the (card)/create arm
`via: %i[post patch]`, so a PUT to a path that arm owns matches no route in
the pinned table at all, and the pinned actionpack admits a route only when
`@request_method_match.any? { |m| m.call request }` holds. Before the
correction the port folded PATCH into `put` and answered the create arm for
PUT; after it, `patch` is its own predicate and the create arm answers POST
and PATCH only.

## The matrix-journey-tranche5 merge (926b7508), conflicts rebuilt region by region

Git auto-merged cleanly: the `resolvedFollowOption` import at
`reference-harness/browser/probe-never-measured-batch1.mjs:61`, the
`resolvedFollowOptionDb` helper at :181, `vitest.config.ts:47` (the new
follow-preference suite's classification line), `tests/card/follow/follow-rule-runtime.test.ts`,
the new `reference-harness/browser/lib/follow-preference-read.mjs`, its test,
and the five row receipts.

One file conflicted, two regions: the ACT-155 leg's block in
`reference-harness/browser/probe-never-measured-batch1.mjs`. THE STRUCTURAL
FACT behind both regions: the two sides repaired the same leg with two
different instruments, and each repair is correct about a different read.

- Region 1 (:1027 to :1055), the setup and the followers read. The
  candidate's side carries the instrument repair measured against the stock
  Ruby 3.3 oracle on 2026-10-19: the asterisked affordance marks
  (`+*followers`, `+*follow`), the `document.body` read target instead of
  `#main`, the `a == null` spelling, and the overlay-layout overview URLs. The
  branch's side carries the resolved-preference read, its
  `resolvedMember` binding and the comment explaining that Ruby's
  deck-wide `*all` rule resolves by the set-pattern walk
  (`rule/all.rb:17-31,66-73`) and materializes nothing per card, so a stored
  read necessarily reports `found:false` on a correctly behaving engine.
  Rebuilt as the UNION: the candidate's addresses and read targets kept
  (the un-asterisked ones provably return the create form on the oracle), the
  branch's `storedMember` and `resolvedMember` bindings and its reasoning kept,
  the comment merged into a three-read statement that names all three
  witnesses and points back at the repair note.

- Region 2 (:1077 to :1082), the grade predicate and the evidence bag. The
  candidate's side grades the member on `memberSeesFollowSurface`, the
  deck-wide enumeration her own overview actually shows. The branch's side
  grades her on `resolvedMember?.option === "*always"`. Both are the right
  question asked through the right instrument, so the rebuild takes both
  clauses, replacing the branch's weaker
  `memberOverviewText.includes(<card name>)` test with the candidate's
  `memberSeesFollowSurface` (which also accepts the oracle's "everything"
  deck-wide listing). The evidence bag is the union of both sides: the
  candidate's `memberOverviewText` and `memberSeesFollowSurface`, the branch's
  `storedMember` and `resolvedMember`, so the stored-versus-resolved
  difference stays visible in the record instead of being resolved away.

Verified after the rebuild: no residual conflict markers, and
`node --check reference-harness/browser/probe-never-measured-batch1.mjs`
parses clean. Both branches' witnesses are in the merged tree.

## Gates

Typecheck (`npx tsc --noEmit`) on the merged committed tree (926b7508):
exit 0 with ZERO output lines. Log: `C:/localProjects/decko-ts-v9-tsc.log`
(0 bytes, which is the pass).

Correctness (`node tools/test-gates.mjs run correctness`) on the same tree:
exit 0. Vitest: Test Files 629 passed | 54 skipped (683); Tests 6634 passed |
227 skipped (6861). node:test: 3 files, 15 passed, 0 failed, `"pass":true`.
Log: `C:/localProjects/decko-ts-v9-correctness.log`.

ZERO failures. The failure set equals the empty baseline the v8 roll gated to,
so the v9 gate holds the v8 standard.

Baseline provenance, stated plainly rather than assumed: the assignment names
the baseline as the empty failure set v8 gated to. The wave-start tree is the
v8-gated tree plus one markdown receipt: `git show --stat c35b4f99` reports
a single file changed, `docs/runs/full-candidate-v8-tranche-roll-2026-10-21.md`,
and the v8 receipt records its own correctness run as exit 0 with zero
failures on 6c5f4ce8. No pre-merge baseline run was executed in this roll,
because the ask defines the baseline rather than asking for it to be
re-measured.

Delta against v8, both totals accounted for rather than asserted:

| measure | v8 (6c5f4ce8) | v9 (926b7508) | why |
| --- | --- | --- | --- |
| Test Files | 683 | 683 | unchanged |
| Tests | 6631 | 6634 | +3 |
| node:test | 15 passed, 0 failed | 15 passed, 0 failed | unchanged |

The +3 tests are matrix-journey-tranche5's three new `it` blocks in the
EXISTING suite `tests/card/follow/follow-rule-runtime.test.ts` (three added,
zero removed, confirmed by `git diff e22c388e f583811d` on that path); that
suite runs under correctness. The file count is unchanged because the
tranches' new files classify OUT of correctness: the nine new route parity
suites under tests/server/ classify into the parity gate (115 files) and
appear zero times in the correctness log, and the new
`reference-harness/browser/test/follow-preference-read.test.mjs` also appears
zero times in the correctness log despite being registered at
`vitest.config.ts:47`.

Not run: `node tools/test-gates.mjs run parity` and `run deploy`. The ask
names typecheck plus correctness. This matters more than usual this roll and
is named rather than buried: the nine route parity suites routes-tranche5
brings, and the browser-harness follow-preference suite, are exactly the
suites these unrun gates would execute. They were NOT executed in this roll.
Their own tranche receipts record them passing at their own tips; this roll
neither re-measured them nor contradicted them.

## The bundle

Before, recorded from the artifacts on disk at wave start, which are the v8
bundle. All four SHA-256 values match the v8 receipt's table exactly, so the
"before" is confirmed to be the v8 build and not a drifted one.

| artifact | bytes before | sha256 before |
| --- | --- | --- |
| deploy/dist/bunny-edge-engine.bundle.js | 7,359,887 | 5084f69f2cfa5b3a51e9c594a8f031552d6066c0c3f3856751bb87d553172b7b |
| deploy/dist/bunny-edge-read.bundle.js | 2,105,211 | b8c884c29cfc366c3dc5ac9b67498b0854eaba4e95010ff102127925d9200154 |
| deploy/dist/bunny-edge-engine.code.json | 7,498,969 | 5584cc79f7d74602e41dc177d3b48b343f0e96d347046840267fa5170514e676 |
| deploy/dist/bunny-edge-read.code.json | 2,185,971 | 8845d86b0360ca4ced95aa44449ce6cfab7a9c2a643cc7c21982d63e089469da |

Rebuilt from the merged committed tree with
`node tools/bundle-bunny-edge-engine.mjs`, both bundles validated by the
tool's own assertion under the 7,600,000-byte budget:

| artifact | bytes after | sha256 after | delta |
| --- | --- | --- | --- |
| deploy/dist/bunny-edge-engine.bundle.js | 7,359,901 | 158670dba8101df49ae2432ec4bbe40a5dbb9149f3ddbb5fe46e42f0c579e85f | +14 bytes |
| deploy/dist/bunny-edge-read.bundle.js | 2,105,211 | b8c884c29cfc366c3dc5ac9b67498b0854eaba4e95010ff102127925d9200154 | byte-identical |
| deploy/dist/bunny-edge-engine.code.json | 7,498,985 | 32ae805f6c47d5def72b117a5104038d7a4e3128ce0ec0684f71a19f70010dc3 | +16 bytes |
| deploy/dist/bunny-edge-read.code.json | 2,185,971 | 8845d86b0360ca4ced95aa44449ce6cfab7a9c2a643cc7c21982d63e089469da | byte-identical |

The assignment's premise held: the bundle moved. The engine pair moved and
the read pair did not, and the reason was measured rather than assumed: the
engine bundle contains six `PATCH` tokens and the read bundle contains zero,
so `write-routes.ts` and therefore the A18 correction are inside the engine
entry's import closure and outside the read entry's. That matches the tool's
own header at `tools/bundle-bunny-edge-engine.mjs:58`, which describes the
read-only script as serving anonymous page reads and forwarding everything
else to the full one. The A18 delta is small (+14 minified bytes) because
minification strips the nine-line justification comment the branch added and
keeps only the new `patch` binding and the one `put` to `patch` substitution.

Budget headroom: 240,099 bytes under the 7,600,000 limit. The tool's
80-percent-of-limit warning line is expected and unchanged from v6, v7 and v8.

deploy/dist is gitignored: the artifacts stay local. NOTHING DEPLOYS.

## Push

`git push origin deploy/full-candidate-20261020`, forward-only, with
`merge-base --is-ancestor` verified against the remote tip before pushing.
The branch carries two new commits: 9fdd4646 (routes-tranche5 merge) and
926b7508 (matrix-journey-tranche5 merge with the ACT-155 union), plus this
receipt commit.

## Disk cost

Added in-repo: this receipt, about 9 KB. Removed: nothing, and no residue
from this roll. Scratch outside the repo, left in place because this receipt
cites them: `C:/localProjects/decko-ts-v9-tsc.log` (0 bytes),
`C:/localProjects/decko-ts-v9-correctness.log` (205,130 bytes) and
`C:/localProjects/decko-ts-v9-pre-bundle-shas.txt` (140 bytes), about 205 KB
combined.