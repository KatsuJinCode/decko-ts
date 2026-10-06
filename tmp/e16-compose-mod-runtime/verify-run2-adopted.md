# E-16 adoption verification (second session, tip 586f1511)

Lane E-16 adopted after the predecessor died to a provider error. Its two commits
(f1b632fe RED instrument, 586f1511 GREEN fix) were already committed and were NOT
redone; this record is the independent re-run of every gate the lane asks for,
plus two live mutation probes and a direct baseline comparison for the one
standing failure.

Every number below is output observed in THIS session, not inherited from the
predecessor's commit message.

## Ruby oracle citations - verified against the installed gems

Read this session (awk line-numbered dumps):

- `C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/card-1.110.0/lib/cardio/mod/dirs.rb`
  lines 51-63: `Dirs#initialize` runs `add_core_mods` (55), `add_gem_mods` (56),
  then `add_from_modfile || add_from_dir` per path (57-60) - core AND every gem
  mod land in ONE dirs list. Cited as 54-62; brackets the composing calls.
- `.../card-1.110.0/lib/cardio/mod/loader.rb` lines 16-21: `Loader.load_mods`
  = `SetPatternLoader.new.load` + `SetLoader.new.load` +
  `Card::Set.process_base_modules` + `load_initializers`. Cited EXACTLY.
- `.../card-1.110.0/lib/card/set/event.rb` lines 72-74: `def event(event,
  stage_or_opts={}, opts={}, &) Event.new(event, self).register(...)` - each
  declaration registers into the one space as its file loads. Cited as 71-74;
  the def body is 72-73.
- `.../card-mod-integrate-0.20.0/set/all/observer.rb` lines 18-21:
  `def event_cards(setting)` / `@card_event_cache ||` /
  `((event_rule = rule_card(setting)) && event_rule.recursed_item_cards) ||` /
  `[]`. Cited EXACTLY - this is the nil-rule `|| []` arm the WRITE_PATH_HOST's
  `fetchRenderCard -> undefined` reproduces.
- `.../card-mod-comment-0.20.0/set/all/comment.rb` lines 5-12: `event
  :add_comment, :prepare_to_store, on: :save, when: :comment` with
  `return unless comment.present?` (7) and
  `self.content = [content, format.comment_with_signature].compact.join "\n<hr>\n"`
  (9-10). Cited as "comment.rb:7-9"; the join that produces the byte oracle is
  line 10. Instrument assertion matches these bytes.

Note for the next reader: the comment and integrate mods are SEPARATE gems
(`card-mod-comment-0.20.0`, `card-mod-integrate-0.20.0`), not files inside
`card-1.110.0`. Two of the predecessor's comments cite bare `comment.rb` /
`observer.rb` names without the gem; resolved here.

## Gates re-run in this session

All vitest invocations used `--no-file-parallelism`, per lane discipline.

| Gate | Command | Result |
|---|---|---|
| tsc | `npx tsc --noEmit` | exit 0, no output |
| E-16 instrument | `npx vitest run tests/server/write-routes-serving-mod-composition.test.ts --no-file-parallelism` | 4 passed (4), 1.69s |
| serving write surface (12 files) | vitest run --no-file-parallelism over the 12 write/server/worker files | 12 passed (12), **118 passed (118)**, 13.42s |
| mods wave, affected families (10 files) | comment x3, recaptcha x3, integrate, refresh-references-in, event-seam-save-path, default-mod-deck | 10 passed (10), **143 passed (143)**, 7.17s |
| one-trip standing set | `npx vitest run --no-file-parallelism tests/card/one-trip/` | 13 passed / 3 skipped files; **65 passed / 6 skipped (71)**, 67.83s |
| fetch standing set | `npx vitest run --no-file-parallelism tests/card/fetch/` | 5 passed (5), **79 passed (79)**, 3.88s |
| one-trip + fetch combined | - | **144 passed / 6 env-gated skips** - identical to the predecessor's recorded set |
| workerd write surface | `npx vitest run --no-file-parallelism tests/deploy/deploy-worker-write-surface.test.ts` | **15 passed / 1 failed (16)**, 83.04s |

## RED-first proof

The RED commit `f1b632fe` changed ONLY
`tests/server/write-routes-serving-mod-composition.test.ts` and the log -
`git diff f1b632fe~1 f1b632fe -- src/` is EMPTY, so the recorded RED run
(3 failed | 1 passed) was genuinely taken against the pre-fix source. Valid
RED-first.

## Mutation-proofness - two live probes, both reverted

**Probe 1 (seat gating).** Restored the pre-E-16 armed-only shape in
`src/server/write-routes.ts` (`modEvents` inside the `ctx.recaptcha !== undefined`
spread). Arm 1 went RED with the byte assertion
`expected 'body before comment' to be 'body before comment\n<hr>\n<p>served …'`;
arms 2/3 stayed green because they construct the seam directly.
Result: 1 failed | 3 passed.

**Probe 2 (seam composition).** Made `defaultDeckEventRuntime` build a private
recaptcha-only `ModLoader` - the literal pre-E-16 defect shape. Arms 1, 2 and 3
all went RED; arm 4 (the armed-DELETE regression guard) correctly stayed green.
Result: 3 failed | 1 passed - the exact shape recorded in `red-run1.log`.

Both probes were reverted; `git diff -- src/ tests/` is empty afterwards and
`npx tsc --noEmit` was re-run clean (exit 0) after the revert. Arms 1-3 are
non-vacuous; arm 4 is a guard, correctly insensitive to composition.

## The one standing failure - proven pre-existing by direct baseline run

`worker.ts write surface > default posture: both flags unset > signs a real
account in while DISARMED (the login-action exemption)` fails at 30s.

To prove E-16 did not cause it, the single test was run at the pre-E-16 tip in
the already-existing worktree `C:/localProjects/decko-ts-lane-boardview-base`
(at `7f8173dd` - reused rather than copying, per the copies door; C: had 37G
free, under the 50G line, and 27 worktrees already existed).

- baseline `7f8173dd`: `Error: Test timed out in 30000ms.` - 1 failed | 15 skipped
- E-16 tip `586f1511`: `Error: Test timed out in 30000ms.` - 1 failed | 15 skipped

Identical test, identical error text, identical timeout. The failure set is
unchanged by E-16. Note the error is a 30s TIMEOUT, not the
`BunnyDbError incomplete input` the predecessor's commit message names; the
conclusion (pre-existing) holds and is now proven by baseline comparison rather
than asserted.

## Uncommitted derived artifacts - deliberate, not residue

`benchmarks/one-trip-render/integration-posture-report.json` and
`benchmarks/one-trip-render/one-trip-harness-report.json` are modified in the
worktree. They were ALREADY dirty when this session adopted the lane (before any
command ran here), and running `tests/card/one-trip/` refreshes them again -
they are harness-derived measurements that differ per machine and run
(Home offTrips 176 -> 163 here). Deliberately NOT committed: committing them
would inject this machine's measurement into the lane diff, and they are not the
E-16 unit of work. Not reverted either - a tracked-file revert is permission-
gated. They are named here so they are not mistaken for an unfinished change.