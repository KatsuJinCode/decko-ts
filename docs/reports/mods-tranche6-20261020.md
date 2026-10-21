# Mods tranche 6

Base: eceb562706cfe696b377351aa116e8939bac8e18.
Register: brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md.
The register is maintained in the lead documentation repository, not this worktree.

## Remaining partial entries in register order

After excluding the entries dispositioned by mods tranches 1-5:
16 follow; 17 format; 19 history; 23 markdown; 27 script; 28 search;
29 session; 32 tinymce_editor; 33 virtual.
Virtual's event-body skips are already recorded by the events lane, but no
mods tranche has separately dispositioned entry 33. PORTED entries are excluded.
This batch takes entries 16, 17 and 19, in that order.

## 16 follow

Verified matching: the HTML follow_button is registered, with cache never.
Corrected stale manifest prose claiming the button was unported.
The modal helper has exactly one mention in the entire pinned card-mod set
Ruby/HAML source: its definition. This is no missing reachable view.
Skip and named: JSON follow_status invokes link_opts on StartFollowLink or
StopFollowLink CLASS objects. The gem defines only the instance method.
Both branches raise NoMethodError, measured by loading the gem's own classes.
No guessed successful JSON answer is registered.

Oracle: oracle-capture-follow-link-remainder.rb and its JSON capture record the
method error, both branches, the modal census and the source SHA-256.
Checks: card-mod-follow-remainder-census plus card-mod-follow, 15/15 passed.
No deployment and no production-host contact.

## 17 format

Ported: JSON-LD not_found, denial and test, with raw Ruby error_result JSON
bytes and the literal test error. The capture executes the gem's JSON-LD
block and helper, without copying its expected answer into the probe.
Corrected the stale html-only dispatch claim: params.format already reaches
RenderFormat. These views now pass through that real dispatch.
Remainders named precisely: dynamic JSON errors and JSON-LD errors/server_error
need root error_status and card.errors state not exposed by RenderFormat;
format_unsupported also mutates that root state. CSV body and RSS XML remain
unregistered view bodies; separate show helpers exist, so their absence is not
absence of a format family. No full-mod parity claim is made.
Checks: JSON-LD static errors, card-mod-format, RSS format views: 62/62 passed.

## Process evidence

Gateway research was started before design; its default provider returned an
unhelpful refusal. The local pinned gem source is the authoritative evidence.
Gateway health reported bridges up; no running search was terminated.
Touched follow tests completed in 3.50 seconds, format tests in 2.22 seconds.
The first follow save changed line endings accidentally. A separate forward
commit restores the original LF bytes; no history was rewritten.

## 19 history

Ported: all/history/export JSON history and actions, using the existing
format dispatch with a new card/view-scoped prepared result. history reads
the full history_card_ids closure, including drafts. actions reads only the
root card and excludes drafts. Both use ascending action id order, preserve
Ruby's act/action hash insertion order, and apply last-value-wins changes.
The result is not sourced from the HTML reader, which is paginated.
A new request clears the result; a card/view mismatch never returns another
card's data. No data means an empty array, not invented action rows.
The Ruby capture executes the pinned export.rb view blocks and hash helpers
on synthetic act/action/change objects. The engine test seeds the equivalent
SQLite rows and includes a nested card, a draft, repeated field changes,
a far-away HTML page number, and an unrelated empty card.
The optional atom explicit-show extension remains outside these two views.

Corrected the register's stale reason that manifest JSON views have no render
route. The route exists, and both view registrations are now exercised by it.
The two composed-deck census files now pin exactly these five new rows:
three JSON-LD format errors and two JSON history exports. Counts change by
exactly five; the foreign rows still do not enter the HTML flat table.

## Validation and limits

- Follow touched battery: 15/15 passed.
- Format touched battery: 62/62 passed.
- History plus both updated census suites: 58/58 passed.
- Full mod-loader battery: 142 files, initially 2040 passed, 5 stale census
  assertions failed, 1 data-gated skip. After correcting the five exact
  inventory expectations, the affected census suites pass 15/15. The full
  unchanged battery was not repeated.
- Render/history battery: 234 files passed, 1 failed, 31 skipped;
  1242 tests passed, 3 failed, 144 skipped. All three failures are in
  content-options-one-line-count-capture-state-pins; rerunning that exact
  file on the untouched tranche-5 base reproduces all three failures.
- Type checking: three errors in untouched write-path-races.test.ts,
  reproduced identically on the tranche-5 base. No added type errors.
- Full composed synthetic-v1 reference grade: rendering 1754/1754,
  semantics 2389/2389, persistence 16/16, side effects 12/19, read writes 8/8,
  other tables 12/12. This is a FAIL grade, not release acceptance.
  A fresh run on the exact tranche-5 base produces the same seven side-effect
  failures. Raw run comparison: 0 unexplained differences across 1752 render,
  2388 semantics and 16 scenario records (normalization masks recorded by the
  existing comparison tool). New JSON views are covered by the direct Ruby
  captures, not by claiming synthetic-v1 includes them.

The full mod battery took 107.84 seconds. The render/history battery exceeded
the diagnostic threshold at 176.59 seconds. Diagnosis: 266 selected files,
repeated isolated module imports, two-worker concurrency, and a depth-sweep
suite taking 24.09 seconds; tests/import/transform accounted for 44/29/24
percent of tracked work. This was a broader selection than the touched paths
needed. No unchanged full battery was repeated. Baseline failures were
isolated to one file (0.55 seconds), and the corrected census/history battery
took 2.34 seconds. Existing runners were allowed to complete.

The worktree is retained for lead integration: it contains the unmerged
branch and ignored/raw validation evidence. It is not an abandoned scratch
checkout. No dependency installation, deployment or production-host contact
was performed.

Grade receipt SHA-256 mods-tranche6-synthetic-v1: 8b50b88e5da5f77c2a254021f3fbf20a379feed1030c5c4060a17a6164a72768.

Grade receipt SHA-256 mods-tranche6-baseline-synthetic-v1: 81a8a6f3cae2a587e5c6de8b27eeba346f6b14816f0bd3df08533ecfcc5e5348.

Oracle capture SHA-256 values:
- follow-link-remainder.json: 17cb3e2d2ca9b3a25bc650795dd5a1f2ba20950b3c57ccc618e1fbe33dd0174a
- jsonld-static-errors.json: 7f756aaa87e763058e8806c2ed4b3a1e6a5d09a920ba1cf940e2c7ed047527a1
- history-json-export.json: 5c257b5ee28f709b5f109467716ce9205899e9bee2f9ff4d9f64eca0725a62e1

Final touched battery after census corrections: 9 files, 135/135 passed in 3.76 seconds.
