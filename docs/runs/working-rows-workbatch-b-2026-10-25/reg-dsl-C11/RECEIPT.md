# reg-dsl-C11

- Family: register-dsl.
- Row: "C11 Card::Path URL GENERATION (path mark/view/action/format/anchor/query ...)".
- Verdict at the time of this lane: PARTIAL, bucket WORKING ON IT. The construct-by-construct
  audit is done and pinned (`tests/card/render/card-path-grammar-parity.test.ts`); the
  verdict's one non-audit reason is the anchor opt (card-mod-format-0.20.0
  `lib/card/path.rb:99-102`, `#<anchor>`), a NAMED REMAINDER.

## Verdict: NAMED - the row's own two unblock arms are both outside a working-row close

The blocker states the unblock condition: "a surface that emits an anchor exists to grade, or
the register adopts the named-remainder disposition." Neither arm exists at the base this
receipt was measured on (`deploy/full-candidate-20261101` tip `c17906db`), and this is the
exact mechanism that blocks the row:

1. No emitting surface exists to grade. Fresh grep at this base across the port's URL
   builders (`src/server/worker-shared-surface.ts`, `src/server/write-routes.ts`,
   `src/card/render/format.ts`, `src/card/render/search-paging.ts`,
   `src/card/render/rule-bar-right.ts`): no builder passes an anchor opt and no builder emits
   a `#fragment` through the path grammar; every "anchor" hit is a set-key or pattern anchor
   in prose or identifiers. Inventing an emitter would add a URL-builder feature with no
   consumer, which is not a parity obligation - the audit's standard (matches the source =
   done) grades surfaces that exist.
2. Adopting the named-remainder disposition is the register owner's decision. The row's
   verdict text is register policy ("a named remainder is not a completed construct"); a
   working-row lane does not re-write the register's disposition rules.

What this lane verified on the base (so the row's file stands measured, not stale):

- `npx vitest run tests/card/render/card-path-grammar-parity.test.ts` (inside the 3-file run
  with the two registered-format deploy suites): the grammar suite's 7 tests passed, i.e.
  every construct the port carries - mark/url_key, the base mark/view parse contract,
  new_cardtype, the `.<format>` extension, the query, handle_unknown's card[name] prefill,
  contextualize - is green at this base, and the suite's own header records the anchor
  construct as the named remainder with the same grep conclusion this receipt re-ran.

The row stays PARTIAL / WORKING ON IT until one of its own two unblock arms happens. This
receipt names the mechanism; it is not a close and does not pretend to be one.
