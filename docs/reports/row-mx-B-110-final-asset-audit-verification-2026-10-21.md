# Row mx-B-110 - the final browser asset audit: green again at this base, the fixture still free of the retired widget

Row: `mx-B-110-final-main-browser-asset-audit` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Check id `B-110`; the action is "no script, stylesheet, font or image failed
during the complete main browser journey".

## What the row asked for

The roster row's blocker text: "Migrate the remaining widgets.twimg.com rows
in decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
cards.db_content (same guarded CAS shape as the 2026-10-18 live-deck migration,
custody recovery/release/private-probes/private-tool-repairs-20261018/remote-widget-cas/plan.json)
and re-run the final asset audit."

Tranche 1 did both: it migrated the three remaining rows under the guarded
CAS (`tools/deck-fixtures/migrate-retired-twitter-widget-embeds-cas.mjs`,
applied with `--include-trashed`) and re-ran the audit, which came back green
(`docs/reports/matrix-journey-row-mx-B-110-final-asset-audit-verification-2026-10-20.md`).
This tranche re-runs the audit on a fresh run at this tranche's base - the
branch has moved since (the set-membership fix, commit `2ca5e9b3`) and the
row's evidence has to be read against the current tree - and re-checks that
the fixture still carries no retired widget.

## The audit, re-run

A fresh local run of the signed-in exercise on this branch's base
(`eaf5149b`, source files clean, the deck copied onto the engine schema,
headless Chromium, a local loopback stack):

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche2-20261021/full-run-base/report.md

The row's leg:

    final browser asset audit /
      no script, stylesheet, font or image failed across the exercised browser contexts
      | PASS | {"contexts":28,"failures":[]}

The run as a whole: 240 / 242 passed, 2 failed - the instrument defect in the
E11b leg and the timing leg, both recorded with their evidence in
`docs/reports/receipts/row-mx-155-base-run-2026-10-21.json`. Neither is on
this row's surface. The triage's original red (28 contexts, 4 mixed-content
failures, all `http://widgets.twimg.com/j/2/widget.js`) does not reproduce.

## The fixture, still clean

The audit is green because the deck no longer carries the retired widget. The
migration tool's own re-run against the fixture is a no-op:

    node tools/deck-fixtures/migrate-retired-twitter-widget-embeds-cas.mjs --dry-run
    -> 0 candidates, admission matches 0, one version row

and the query the triage used (cards whose content still embeds
`widgets.twimg.com`) returns nothing. The migration shape is the guarded CAS
of the 2026-10-18 live-deck migration: one atomic statement whose admission
counts the target rows whose content still matches the expected pre-image and
reads the deck's version row, so a concurrent write aborts the migration
instead of clobbering it.

## The live deck, and why it is not this lane's to close

The live deck is a different deck under a different authorisation: its
migration is on record at brandonDojoTech/recovery/release/private-probes/
private-tool-repairs-20261018/remote-widget-cas/plan.json (2026-10-18).
Nothing in this tranche deploys, and nothing in it touches live.

## Disposition

- The row's named work is **done and re-verified at this base**: the fixture
  carries no retired widget embed, the migration re-run is a no-op, and the
  audit passes with 28 browser contexts and zero failures.
- The row is ready to move to DONE on the next roster refresh; this lane does
  not edit the roster.
- One thing this lane found on ANOTHER surface, and reports on that row: the
  list family's base-format input view answered 500 for a User card's
  "+follow" part and now renders through Ruby's view chain - see
  `docs/reports/row-mx-155-follow-views-base-format-input-chain-2026-10-21.md`.

RECEIPT: `docs/reports/receipts/row-mx-B-110-final-asset-audit-2026-10-21.json`.

BATTERY: the local signed-in exercise above (240 / 242; the audit leg PASS);
the migration tool's own dry run (0 candidates); no engine source touched by
this row's work.
