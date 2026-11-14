# Whole signed-in harness at the tip, end to end — 2026-10-18

Lane: tip-fullrun (one of the parallel lanes on `codex/release-lead-20261015`). Baseline:
`.runtime/edge-signed-in/2026-10-18-runner-harness-full-run` — **237/241** at source
`c9d7d2ea`, clean, stock render configuration.

## The run records

| run | source | clean | config | result | record |
|---|---|---|---|---|---|
| baseline | `c9d7d2ea` | yes | stock (`{}`) | 237/241 | `.runtime/edge-signed-in/2026-10-18-runner-harness-full-run/report.md.json` |
| run A (stock) | `9e7dcf4b` | yes | stock (`{}`) | **237/241** | `.runtime/edge-signed-in/2026-10-18-lane-tip-fullrun-stock-2026-10-18T18-16-16-076Z/` |
| run B (graded) | `9e7dcf4b` | yes | `DECKO_CONFLICT_RETRY:"1"` | **240/241** | `.runtime/edge-signed-in/2026-10-18-lane-tip-fullrun-conflict-retry1-2026-10-18T19-03-41-947Z/` |

Both new runs: `node tools/edge-signed-in-exercise.mjs --out <record>/report.md` (run B adds
`--conflict-retry 1`), detached clean worktree at `9e7dcf4b`, bundle rebuilt by the harness
itself (`buildBundle()` in `tools/edge-signed-in-exercise/lib/stack.mjs:48`), local deck
(21,676 cards), local mail capture, run A 18:16:16Z→18:43:35Z, run B →19:28:31Z.
`9e7dcf4b` was the branch tip when the worktree was created; it carries everything between
the baseline and the tip including the row-7 fix (`776349b2`) and the harness boot fix
below. `6564bcc3` (live-walk search-order tooling) and `9e7dcf4b` (deploy-path D1
junction-chain fix) touch no whole-harness check contract.

## Headline defect found and fixed: the tip's harness could not boot

`8a9f802d` moved `const MAIL_DIR=join(RAW,'mail')` / `const mailInbox=[]` BELOW the new
live-walk `if (restrictWrites) … else …` boot branch. The local-boot arm executes at module
evaluation (top-level await) and runs `mkdirSync(MAIL_DIR)` + closes over it in the mail
sink, so every full run (the account module is mail-required) died in the temporal dead
zone before its first check:

```
ReferenceError: Cannot access 'MAIL_DIR' before initialization
    at file:///.../tools/edge-signed-in-exercise.mjs:345
```

Measured twice on a clean detached `8a9f802d` worktree this session. The baseline ran
`c9d7d2ea` (declarations at line 239, boot at 243) and the row-7 lane ran `776349b2` — both
predate `8a9f802d`, so no full harness run had ever executed on it. Fixed in `4af78994`
(the two consts move back above the branch; no check module, no engine source, no bundle
input touched — boot sequencing only). No fix existed on any branch when found
(`git log --all -S MAIL_DIR -- tools/edge-signed-in-exercise.mjs`).

## Arithmetic vs 237/241 — every check that changed state

Duplicate-aware per-key diff of `results` (group+check, count-checked) between baseline and
run A: exactly two state changes; run B vs run A is the conflict ruling plus the timing leg
below.

1. **`owner audit required checks / row 7` (Delete removes the card and completes the
   previous-page redirect, without recreating that target): FAIL → PASS at stock.**
   Run A evidence: `trashed:true, liveRowsForName:0, targetRecreated:false,
   redirectCompleted:true, pageAccepted:true`. Moved by `776349b2` — the check now grades
   "without recreating that target" from the deck itself (a live `trash=0` row under the
   deleted name) instead of the unsound proxy (a pre-named create form being OFFERED on the
   landing page, which is the oracle's own behaviour and created nothing).
2. **`checks module conflict / conflict response refreshes the visible forms revision` and
   `/ two browser editors resolve a real stale-save conflict`: FAIL at stock in run A
   (`refreshed:false`), PASS in run B.** Moved by the lead ruling
   (`brandonDojoTech/docs/handoffs/edge-demo-coordination.md:1569-1571`): engine default
   stays stock, the two checks grade under the explicit opt-in configuration
   (`DECKO_CONFLICT_RETRY:"1"`) where the repair is active, both verdicts and both
   configurations preserved, stock verdict retained as the stock-parity receipt. Run A is
   that stock receipt at the tip (both checks still red at stock — measured, satisfying the
   no-flag-flip term); run B is the graded record: all six conflict rows pass, including
   `retry through the same form persists after a fresh browser read`, which stock runs
   never even recorded (the parent threw at the refresh leg).
3. **`9. timings / no signed-in page exceeded 3 s of server time`: PASS → FAIL in run A
   only; passes in run B on the same tree.** Environmental, not the tree: run A's whole
   latency distribution shifted (p95 1015→1181 ms, p99 1616→1802 ms, even `/` at 2523 ms)
   while the baseline's slowest request was 2503 ms and run B's slowest is 2274 ms with
   zero ≥3 s. Run A shared the machine with the active lane fleet. Not an engine
   regression: the two over-budget pages are the heaviest /new prefill renders, whose
   baseline equivalents ran 2071-2073 ms.
4. **Sign-in redirect fix (`7e21fc04`): zero movement vs 237/241 — it is already inside
   the baseline source** (`git merge-base --is-ancestor 7e21fc04 c9d7d2ea` → true). All
   section-1 sign-in checks passed in the baseline and stay passing; its effect (read-path
   location history so `*previous` resolves off `/`) is part of why row 7's redirect leg
   completes, per `776349b2`'s own message.

**Graded arithmetic (ruling applied): 240/241** — every stock-red check is either fixed
(row 7), graded pass under the ruled configuration (conflict ×2), or the twimg deck-data
failure below. **Stock-parity receipt at the tip: 237/241** (run A).

## Unfixed, with reasons

- **`final browser asset audit / no script, stylesheet, font or image failed`** — FAIL in
  all three runs, byte-shape unchanged: `http://widgets.twimg.com/j/2/widget.js`
  mixed-content, 28 contexts. This is DECK DATA (the URL lives in deck card content, not
  engine source), the owner's call is pending
  (`edge-demo-coordination.md:1559`; fallback proposal
  `recovery/release/private-probes/widget-fallback-proposal-20261017/proposal.json` routed
  upward). Neither lane applies it without Julian's word.
- **Conflict checks at stock stay red** — by the ruling's own terms: the engine default
  stays stock, retry remains opt-in, and the stock-default verdict is retained as the
  stock-parity receipt. Fixing them at stock would require the flag flip the ruling forbids.
- **3 s timing budget sensitivity under fleet load** — observed once (run A). Not an
  instrument change was made; the check is correct and passed on the re-run. Lane-placement
  (quiet machine for timing-budget runs) is the process answer, not a code fix.

## Custody

Run A/B provenance: source `9e7dcf4b`, `sourceFilesClean:true`, `dirty:false`,
`renderConfigurationOverrides` exactly `{}` (A) / `{"DECKO_CONFLICT_RETRY":"1"}` (B).
Sources untouched; the harness built its own bundle from the worktree. The scratch
worktree `C:/localProjects/decko-tip-fullrun-worktree-20261018` (own session's product,
contents reproduced from git + rebuildable dist) is removed after landing.
