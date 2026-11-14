# Upstream-failure classification — the oracle's own failures, the reproduced-failure category, and the honest split

Lane: upstream-failure-classification. Worktree `$REPO_ROOT/../decko-ts-failclass`,
branch `upstream-failure-classification-2026-10-10`, base = integration tip
`3c23e1f7`, pushed at tip `858884fc`. The engine's `src/` tree carries zero
diffs (`git diff --stat 3c23e1f7..858884fc -- src/` is empty) — the lane is
classification and reporting only; every change is instrument (the runner, the
gate, the ledger, SPEC).

## The ruling implemented

Where the original site is itself broken — errors, crashes, missing content —
and the copy behaves the same way, that is a REPRODUCED UPSTREAM FAILURE: a
success of the port, counted and reported in its own category. It is not a
divergence. Only rows where the copy behaves DIFFERENTLY from the original are
true divergences (remaining work). Identity is still the bar: a
reproduced-failure row verifies byte-identity against the oracle's failure
bytes — the category names what kind of thing is matched, it does not loosen
the match.

## The oracle's failure rows, measured from the committed capture

The synthetic-v2 oracle capture (`expected/render.jsonl.gz`, 2,581 rows) holds
exactly 24 rows whose recorded result is an error record rather than bytes:

- All 24 are `Card::Error::CodenameNotFound: unknown codename: test_context`
  — six cards (Cohort Welcome, welcome email, password reset email, follower
  notification email, verification email, signup alert email) x four actors.
  The deck references a codename stock Ruby's table does not define, so the
  page render raises for every actor: the original site's own failure,
  recorded by the capture.
- Zero rows carry the capture-side `CAPTURE_ERROR` sentinel in this fixture.
- These 24 rows were the instrument's `oracle_errors` count: tallied and
  SKIPPED — never compared, invisible to pass and fail alike. The old
  accounting reported them as a bare number with no name and no verdict.

The engine's answer on all 24 (from the gate run at this tip): the same
raise — `CodenameNotFoundError: unknown codename: test_context`. Same
message, byte for byte; the class name differs only by host-language naming
convention (Ruby's namespaced class vs the engine's flat Error subclass).

## N7 — the host-language class-naming canonical form

An error record's class name is the host language's identity, N5's and N6's
class: no port can emit the other language's naming. N7 canonicalizes the
class to its name proper — the terminal `::` segment of the Ruby path
(`Card::Error::CodenameNotFound` -> `CodenameNotFound`), with one trailing
`Error` suffix (the JS subclass convention,
`CodenameNotFoundError` -> `CodenameNotFound`) dropped from either side. The
message compares byte-exact, every other record field counts, and a different
name proper is a different failure. Two-sided and agreement-enforced like
N3-N6: the grader normalizes both sides through the same function
(`normalize.mjs`), `compare-runs.mjs` masks error records the same way, and
the runner suite carries 5 N7 tests that a nearby meaningful change still
fails (another class proper, another message, an extra record field).

## The grader's new failure branch (grade-lib)

An item whose oracle answer is itself a failure now grades on what the oracle
recorded:

- **Capture-side fault** (`CAPTURE_ERROR` sentinel, as class or as payload):
  says nothing about the site — reported as an oracle capture fault, ungraded.
  Zero in this fixture.
- **Recorded upstream failure**: the engine's answer must be the same failure
  under N7 with the message byte-exact; a match counts as a REPRODUCED
  UPSTREAM FAILURE (its own success category, listed per kind in the report's
  `reproduced` arrays). A different failure, or a render where the oracle
  failed, fails the item with the raise named in the reason.

The gate (`seconds-corpus-gate.mjs`) reads the ledger's second section and
enforces it in BOTH directions: a listed reproduced failure that stopped
reproducing fails the gate (a regressed success), and a reproduced failure
missing from the ledger fails it (an unreported success). The enforcement
fired for real mid-lane: the first after-instrument run failed with "24
reproduced upstream failures missing from the ledger" before the section was
written.

## The 107 ledger rows, classified against the committed oracle bytes

Every pin's oracle capture examined (raised-error record / debug-error-page /
capture sentinel / working page):

- **99 rows: the oracle capture is a working page** (95 string renders, plus
  4 special view results — `Topic 001:id` records the integer 655, three
  views record `null`). The copy differs from working bytes: true divergences,
  remaining port work. Of these, 11 rows the copy answers
  `UnsupportedViewError` where the oracle renders a working page (the copy
  behaves differently — divergence), the rest are byte-level gaps.
- **8 rows: the oracle capture is itself a failure page** — the oracle's own
  render raised and the recorded page is the raise's admin debug page:
  - the six raise-posture rows (`Note 001:debug_server_error`,
    `Ada Admin+*account:verify_url` / `reset_password_url` / `closure`,
    `*all+*script:asset_output_url`, `Report 1:preview_editor`): the copy
    raises the SAME error with the byte-same message and renders the debug
    page through heading, message and div structure — but the reproduction is
    NOT byte-identical (the N6 frame-count residual: 51-63 Ruby frames vs the
    engine's 8-10 V8 frames, the count the instrument checks). Not byte-exact
    = not yet a reproduced success: they stay TRUE divergences, now named
    with their failure kind (`row_kind: "upstream-failure page"` in the
    ledger). Closing them is the frame-structure port work N6's receipt
    records.
  - `All Topics:search_error`: the oracle raises
    (`undefined method 'message' for an instance of Array`); the copy raises
    its BadQuery guard with a DIFFERENT message — a different failure, true
    divergence.
  - `Topic 001:edit_structure`: the oracle raises (the debug page inside the
    recorded modal); the copy renders an empty result — the failure is not
    reproduced at all, true divergence.

So: ZERO of the 107 move. No pinned row byte-matches its oracle (that is what
being pinned means on this instrument), and a pinned row therefore cannot yet
claim the reproduced-failure category. The ruling's "roughly two dozen"
lived in the skipped `oracle_errors`, not in the ledger — the data decides,
and the data says 24.

## The ledger's new shape (format /2)

`pins` — the 107 TRUE DIVERGENCES, remaining work, each with its
first-difference evidence and a `row_kind` (99 `working-page divergence`, 8
`upstream-failure page` with the failure kind named). `reproduced_upstream_failures`
— the 24 SUCCESSes, each with the failure kind, the oracle's and the engine's
error records, and the ruling recorded. Any diff on an op in neither section
fails the gate.

## Verdict (the honest split, one engine, at `858884fc`)

```
SECONDS-CORPUS-REPORT {"instrument":"seconds-corpus","fixture":"synthetic-v2",
"adapter":"decko-ts-composed","pages":2581,"identical":2450,"not_identical":0,
"reproduced_upstream_failures":24,"true_divergences":107,"oracle_errors":0,
"wall_ms":11259,"under_60s":true,"same":true}
```

2,581 graded = 2,450 byte-identical working pages + 24 reproduced upstream
failures (successes, previously the ungraded oracle_errors) + 107 true
divergences (remaining work, all pinned). `grade.mjs` prints the reproduced
count per kind alongside the pass rate; the summary carries
`reproduced_upstream_failures` with the pass/fail accounting unchanged.

## Gates (all at the pushed tip `858884fc`)

- Corpus gate: the verdict above; exit 0. The negative direction was
  exercised live mid-lane (unrecorded reproduced rows failed the gate).
- Runner tests: 77/77 (67 former + 5 N7 + 5 recorded-upstream-failure,
  including the three negative controls: a different failure, a render where
  the oracle failed, and the sentinel staying ungraded).
- `tsc --noEmit`: clean (rc 0).
- Suite slice (tests/card/mod-loader, tests/card/render/reference-harness-
  ruby-forms, tests/card/render/fresh-deck/, tests/card/render/debug-server-
  error.test.ts): 1,789 passed / 6 failed / 2 expected fail / 1 skipped —
  the same 6 failures by name as the base logs (card-mod-edit-views x4,
  card-mod-follow-views :edit_buttons, reference-harness-ruby-forms
  slot-id). Zero newly failing.
- 41-page edge byte gate (`tests/deploy/no-caching-decision-state.test.ts`,
  mirror `9599868362d97bbf…` + `tmp/gate/pages.txt` `b5f9b5ed9f43b083…`
  md5-verified copies): 7/7 including the marker-edit proof.
- Engine `src/` zero diffs (asserted above).

## Integration movement note

Mid-run the integration line advanced (`3c23e1f7` -> `96d97df1`, the
upload-preview merge). `git diff --stat 3c23e1f7..96d97df1 -- benchmarks/
seconds-corpus/ reference-harness/` is empty: zero overlap with the
instrument. This lane's numbers are measured at its own tip over the
committed oracle capture, which no engine merge changes; the int line's
standard per-change gate run will re-report both counts on the merged tree.

## Disk

Deleted at landing (regenerable with
`seconds-corpus-gate.mjs --keep --work <dir>`): the two gate run-results
directories (~43 MB each) and the per-pin classification probe JSON (the
durable classification is the committed ledger's `row_kind` fields). Kept
under the worktree's `tmp/failclass/` (16 KB): the ledger builder
(`update-ledger.mjs`, one-shot) and the repo-cwd vitest runner the edge gate
needs. The gitignored edge-gate inputs stay per the standing arrangement:
`benchmarks/one-trip-render/deck-analyzed.sqlite3` (40 MB) and
`tmp/gate/pages.txt` — they go with the worktree.
