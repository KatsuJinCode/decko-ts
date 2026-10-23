# reg-treewalk-e4

- Ruby's file set: `card-1.110.0/mod/core/spec/ (15)`
- The row's own label: RSpec specs for the core set modules (specification, not system)
- 15 Ruby file(s), 6 def(s).
- PORTED 0 / PORTED-INLINE 0 / NAMED-COLLAPSE 0 / SKIP 3 / INERT-API 3 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The row's six defs are the deck's own RSpec SPEC HELPERS (assert_rename, expect_successful_rename, name_invariant_attributes, card_to_rename, run_admin_task, card_subject), and the pinned deck calls them only from its own spec files, so the old system's RUNTIME never reached them. The port's counterpart for a spec file is its own TEST SUITE, and the port carries the behaviour those specs check: the rename invariants (tests/card/actions/renamegate-rename-created-sides-verdicts.test.ts and rename-referer-cache-staleness.test.ts), the blocked self-side rename (obstructed-self-side-rename-write.test.ts) and the codename cache reset (codename-cache-reset-save-path.test.ts). A spec helper is not something a port SHOULD bind, so the rig measures these as the deck's inert library API and its private helpers, not as port gaps.

## How this row was measured

- The row's Ruby file set and per-def roster: `tools/treewalk-family-def-coverage.mjs`.
- The per-def disposition: `tools/treewalk-family-row-disposition.mjs`.
- The pinned bytes, executed: `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`
  (or `tests/server/oracle-capture-card-class-declarations-ruby.rb` for the c1 row, whose
  subject is the class body rather than methods), whose fixture is under
  `fixtures/captured/`.
- The port side, re-checked against the port tree as it stands:
  `tests/server/treewalk-row-disposition-parity.test.ts`.

Branch: `port/register-treewalk-convert-20261022` in KatsuJinCode/decko-ts.
