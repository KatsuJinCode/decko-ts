# Routes round five, 2026-10-23: the kept-named rows' evidence strengthened, the instrument's eleven new cases, and the six next rows

Lane: `port/routes-round5-20261023` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-round5-20261023`, branched at
`3f719bc736cbc2a30f999aee3b343a558fd9ff48` (the round-four tip). The
checkout was cloned from the round-four checkout itself, whose tip was
verified identical to the pushed `origin/port/routes-round4-20261023`
(`git ls-remote` read `3f719bc736cbc2a30f999aee3b343a558fd9ff48` on both)
after the ask-named clone directory was found not to exist; node_modules
came across from the round-four checkout (560 MB robocopy, no network).
Every commit is pushed forward-only to origin (KatsuJinCode/decko-ts,
private; `gh repo view` reads `isPrivate: true`).

Family state at the start of this round, per the ask: 47 of 72 DONE
projected, 25 open; round four closed A8 A9 A18 and kept A12 A17 A22 A23
B5 B6 B7 named, with A12 carrying the operator-decision flag. The
completeness-roster snapshot in the [Family] coordination repo reads 41
DONE / 31 WORKING NOW (its refresh predates the round-three and round-four
folds); this round's dispositions are fold inputs like every round's
before them.

## Part one: the kept-named rows, and what the instrument could still decide

The instrument (`tests/server/oracle-capture-rails-route-recognition-
ruby.rb`, round four's) reproduces its committed fixture BYTE FOR BYTE in
this lane before anything was added: md5 `603c0bb41f0aa53dd37c5cdeec4f93af`
before and after, read from the files. Eleven cases the first pass had no
executed answer for were added (commit `123ced475`): the two-segment
markless and three-segment marked spellings of the CREATE, DELETE, UPDATE
and ASSET arms, the `.:format` suffix riding the action arm's MARK
segment, and the bare deprecated prefix. The extended capture is
byte-stable across two runs (md5 `406dbe895f8d49ebe7e3037cb78bfc31`),
58 cases, route count 29.

| Row | Commit | Disposition |
| --- | --- | --- |
| A17 | `68288e397` | Two cell families CLOSE (below); the create/delete/update named cell now covers the whole shape set in the matcher's own words. |
| A22 | no commit | No instrument-decidable cell remains: the named remainder is the signed-in may-create `:new-form` arm, and the executed table itself (the fixture's own route table, 29 routes) carries no such arm - the shape is post-router dispatch behavior the recognition instrument cannot decide. |
| A23 | no commit | The mount's absence is already an executed-matcher fact (the /jasmine case lands on the asset arm, order 5); recognition has no further cell. |
| B5 | `4c335e985` | The marked spellings join the record; the capture re-runs IDENTICAL in this lane; the log-line divergence stays named. |
| B6 | no commit | The named remainder is the edge's missing asset-input refresh seam - a serving-architecture fact, not a route-recognition cell. |
| B7 | no commit | The named remainders are the write path's header grammar, the denial-VIEW renderer and the Cloudflare session surface - header/method seams, not route shapes. |
| A12 | no commit | KEPT NAMED with the operator-decision flag prominent, untouched, exactly as the ask requires. |

### What closed, and on what evidence (A17)

- **The marked asset spellings are the asset action.** The executed matcher:
  `GET /asset/Front` and `GET /card/asset/Front` answer the ASSET action on
  order 23 with mark Front; the port's asset arm admits exactly that set
  (`parsePath` answers `assetStub` for both), pinned in the sync grammar
  test and at the HTTP layer.
- **The bare deprecated prefix is the card.** `GET /assets` answers the card
  named "assets" on order 6 - the port's own grammar comment's claim, now
  in the matcher's words, pinned at both layers with the NotFound answer a
  deck without that card gives.
- **The `.:format` suffix rides the action arm's MARK.** `GET
  /read/Front.json` and `GET /card/read/Front.json` answer mark Front,
  format json, on order 20; the port's rewrite to the bare arm with the
  segment verbatim lands the same place, and the suffixed spellings are
  byte-equal (modulo the slot nonce) to the bare spellings at the HTTP
  layer, json and rss alike.
- **The named cell, wider and still named.** The pinned deck's create,
  delete and update GET alternatives answer the state-changing action on
  EVERY marked spelling (`/card/create` order 19 with no mark,
  `/card/create/Front`, `/card/delete` order 22, `/card/delete/Front`,
  `/card/update/X` order 21). The port admits none of them: the two-segment
  spellings read as the card named "card" in the segment-named view (404 at
  render), the three-segment spellings fall to the wildcard's bad_address
  class. The recorded hardening (the C16 posture, same-origin-XHR-only GET
  mutations) is a deliberate divergence; the refusal is pinned at the HTTP
  layer (nothing mints, nothing trashes, nothing updates).

## Part two: the six next rows in row-id order (B8, B9, B10, B11, B13, C3)

| Row | Commit | Disposition |
| --- | --- | --- |
| B8 the `*previous` read arm | `404c7f3ff`, `f2a6d8a98` | CLOSED. The row's one named non-check (no disabled-arm negative check) is now measured: arm neutralized at its one decision point, ALL THREE edge legs fail (the request falls through to the card named `*previous` and answers NotFound); the source was restored byte-for-byte before anything was committed and the legs are green again (3 passed). The capture re-runs byte-identical (md5 `c8b2dcaa041211d3407e6c95735b9f75`). A fourth leg pins the pre-load_card signature durably: a counting wrapper on the render seam proves ZERO render calls for the `*previous` request. |
| B9 the `implicit_mark` home fallback | `214d3dfde` | The empty-?mark= divergence is pinned on BOTH hosts now (the asymmetry the row carried since tranche 3 is gone: the edge carries the same-named leg the staging host has), and it carries the OPERATOR DECISION FLAG: closing it changes what a live deck serves for /?mark= (the home fallback's card -> a not-found) on every host, the A12 class - the operator's yes owns it. The capture re-runs byte-identical (md5 `e90f46ff767727c95af47318a2ac794f`). |
| B10 the setup arming | `882a2de67` | The portable half's VERDICT HAND-OFF lands: the /setup route (the producer the verdict seam's own header names) now hands the census verdict it just computed to the sync view gate, refreshed to open while the census is zero and written sticky false once it closes - the shape of Ruby's own memo, which caches ONLY the false (auth/setup.rb:36). A closed reason the census did not compute and the port's own gate states hand NOTHING; the env-gate-off case never reaches the hand-off, so the row's pinned assertion stands. THE CONTRACT HALF STAYS THE DISAGREEMENT: the read-path arming (the bare markless read serving the setup card) is NOT landed - it would require resolving the env-gate contract, the setup token posture (docs/SECURITY.md divergence 5) and the route-vs-view bytes question, three recorded decisions one landing would overwrite silently. The disagreement stays surfaced. The arming-parity fixture was regenerated (line numbers only, zero text changes). |
| B11 the edit_draft consumption | `04f25e9b8`, `b4f3a5e45` | The row's own unblock condition is met: the render entry carries the host-to-render CONTENT OVERRIDE (HistoryRenderParams.contentOverride), the hosts read the flag where Ruby's controller does, and the CARD-scoped last-draft reader (lastDraftContent, Ruby's Card#drafts scope, content/all.rb:42-44) is new beside the history mod's act-scoped draftActs. The transient root's lifetime is measured into shape (see below). Both B11 pins changed on purpose with the landing, as they demanded; the second one's quoted source range was re-pointed in the capture script (the emitter moved). |
| B13 `record_as_main` | no commit | The row is closure-ready on parity and needed NO change; both receipts re-ran in this lane: the capture is byte-identical (md5 `6f644c3893df77d73bc658ba07796e00`), and the disabled-call negative check reproduces tranche 3's record exactly (call commented at its one site, 3 of 4 legs fail - the empty-?main= leg's NOT-the-card assertion survives both worlds; the source restored byte-for-byte, 4 of 4 green). The row's promotion is the fold's containment step. |
| C3 `soft_redirect` | `1f93c5e0e` | The row's unblock condition is met and the divergence case is flipped to the pinned answer: the ajax slot arm reads the success envelope's view first and falls back to the request's OWN view key (the query's ?view=) - the pinned merge order (response.rb:64-69: the envelope's params MERGE OVER the request's, so the envelope's view wins when it carries one and the request's survives when it does not). A new case pins the envelope still winning over the request's own. The capture re-runs byte-identical (md5 `483e0f726fc679b9d1bbd9987975f42f`). |

### The honest record inside B8's landing

The row commit `404c7f3ff` ran `npx tsc --noEmit` in the same shell chain
and the chain's echo swallowed the exit: tsc FAILED (exit 1, three type
errors in the new counting wrapper), the commit landed anyway, and its
message claimed "tsc: exit 0". That claim was false when it was written.
The correction commit `f2a6d8a98` fixes the wrapper (the render seam is a
METHOD on the RenderEngine instance; the counter patches the instance
property over a bound inner), states the truth, and is the row's real tsc
record.

### B11's transient root, measured into shape

Three observations drove the final shape, all run in this lane:

1. The overridden record must not reach the fetch cache: the first shape
   let the flag leg render the draft AND the next flagless request answer
   the draft too, with the fetcher's own cached record carrying the
   override bytes.
2. A per-render cache reset breaks the page pipeline: the page lane's
   prepare and main passes share the seat, and resetting between them
   answers "render card not prepared" (500).
3. The landed shape: the prefetch's cache-write and cache-record callbacks
   treat the overridden card as a TRANSIENT ROOT (skipped / re-enriched,
   the assigned-type arm's own precedent), the bare lane resets at its
   render exit (pagePrepareDepth === 0), and the page lane resets at
   renderPageWithStatus's end after both passes have consumed the store.
   The recorded sequence after the fix: flag leg draft (200), flagless leg
   saved (200), direct render saved, fetcher record reads the saved
   content.

The parity test's HTTP legs drive the real edge request core over a deck
seeded through the port's OWN draft-save machinery (ActWriter.saveDraft):
?edit_draft=true renders the draft, ?edit_draft=false renders the draft
TOO (the truthiness cell at HTTP - every query value is a string, and
"false" the string is TRUTHY in Ruby), the flagless request renders the
saved content, and the request AFTER a flag request answers saved. The
test file's ORDER is load-bearing (the HTTP describe runs first; the
engine boots bind the process-wide mod loader to their own storage) and
the file says so.

## Captures: re-run in this lane, against the pinned gemset

Every capture below was executed against the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` (68 gems,
actionpack-7.2.4 present) and compared with its committed fixture,
byte for byte; Ruby 3.4.11 on PATH, no Rails, no database.

| Capture | Committed fixture md5 | Re-run |
| --- | --- | --- |
| rails-route-recognition (the instrument, before extension) | `603c0bb41f0aa53dd37c5cdeec4f93af` | IDENTICAL |
| rails-route-recognition (extended, 58 cases) | new this round | byte-stable across two runs, md5 `406dbe895f8d49ebe7e3037cb78bfc31` |
| card-asset-action (B5) | `db21fd884f8243ae423c5ae7da77dadb` | IDENTICAL |
| previous-mark (B8) | `c8b2dcaa041211d3407e6c95735b9f75` | IDENTICAL |
| implicit-mark (B9) | `e90f46ff767727c95af47318a2ac794f` | IDENTICAL |
| record-as-main (B13) | `6f644c3893df77d73bc658ba07796e00` | IDENTICAL |
| soft-redirect (C3) | `483e0f726fc679b9d1bbd9987975f42f` | IDENTICAL |
| register-routes-remaining-eight (B10's and B11's quoted ranges) | re-pointed this round | regenerated; diffs confined to the quoted line numbers, zero text changes |

## The battery (final state, run in this lane)

- **The full `tests/server/` suite**: **124 files passed, 1 skipped (125);
  1242 tests passed, 14 skipped, 0 failed**. The one skipped file is
  `tests/server/edit-session-replay.test.ts` ("needs data or setup that a
  clean clone does not have"), the same skip the round-three and round-four
  receipts record. The count is the round-four tip's 1233 passed plus this
  round's new legs.
- **The full `tests/deploy/` suite**: **83 files passed, 1 failed, 1
  skipped (85); 675 tests passed, 1 failed, 10 skipped**. The one failure
  is `tests/deploy/worker-edge-cache-runtime.test.ts`, the pre-existing
  environmental failure this lineage's receipts record from tranche three
  onward, re-verified in this lane to fail ALONE (3 passed, 1 failed, with
  the recorded message: "armed; cache=miss; not-stored" against the
  expected "miss+stored"). Two earlier full-deploy runs in this lane showed
  the staging-boot files' beforeAll boot timing out under full-suite
  parallel load while the freshly-rebuilt dist settled; at the final state
  those files pass.
- **The staging endpoint suites at the final dist**:
  tests/card/auth/first-run-setup-endpoint.test.ts and
  tests/card/auth/signin-endpoint.test.ts -> 2 files passed, 15 tests
  passed, 0 failed.
- **Per row**, the battery at that row's own commit is in that row's commit
  message.
- `npx tsc --noEmit`: **exit 0, zero output lines**, the exit code read
  directly from tsc as its own command (the B8 chain lesson, recorded in
  `f2a6d8a98`). `node --check vm-staging-server.mjs`: exit 0.

## A discovered process defect, named for the record

The staging dist bootstrap's readiness gate
(`tests/card/auth/staging-server-dist-bootstrap.ts`) checks that every dist
module the server imports EXISTS and is non-empty, but not that its content
is CURRENT. This round's B11 landing added an export to a module the
staging server already imported: the gate passed on the stale dist, the
server died at import time ("does not provide an export named
'lastDraftContent'"), and seven staging-boot suites failed at beforeAll
under the full deploy suite. The lane rebuilt dist (`tsc -p tsconfig.json`,
the bootstrap's own recipe) and the suites went green; the gate's currency
gap is named here for the harness lane that owns it.

## What this round did NOT land, named

- **A12**, untouched, kept named with the operator-decision flag prominent.
- **B9's empty-?mark= divergence** and **B10's env-gate contract**: both now
  carry the operator-decision flag in their own test comments; both fixes
  change what a live deck serves.
- **A17's create/delete/update GET halves**, still the recorded C16-posture
  hardening - now with the whole shape set in the executed matcher's words.
- **B5's log line**, still named, not HTTP-visible.
- **B13's promotion** (fold containment) and the roster fold itself, owned
  by the fold lane as before.

## Disk

Added: the lane's own checkout
`C:/localProjects/decko-ts-routes-round5-20261023` (a clone of the
round-four checkout, node_modules copied in from it, no network), the
rebuilt `dist/` build output (gitignored, ~27 MB, the staging suites' own
bootstrap artifact), ten commits, this report, the instrument's eleven
new cases and the round's tests. Moved out of the checkout: this lane's
scratch directory `.tools-tmp-round5/` (the capture re-runs, the probes and
the negative-check states), ARCHIVED to
`C:/localProjects/decko-ts-lane-archives/routes-round5-20261023-tools-tmp/`
(29 files, ~350 KB) rather than deleted, so the checkout carries none of it
and none of its bytes is lost. The empty `.tools-tmp-round5/` directory
itself remains in the checkout (the machine's deletion gate refuses
directory removal; it holds zero bytes).

Nothing deployed. No live host was contacted and no metered database was
touched: every measurement in this round ran against the local pinned
gemset, the port's own source, or a locally booted staging server.
