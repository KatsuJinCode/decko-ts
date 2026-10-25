# reg-treewalk-c2-cache-rb-34-91-cache-shared-temporary-rb

- Ruby's file set: `card-1.110.0/lib/card/cache.rb`
- The row's own label: `cache.rb:34-91` + `cache/{shared,temporary}.rb`
- 1 Ruby file(s), 10 def(s).
- PORTED 3 / PORTED-INLINE 6 / NAMED-COLLAPSE 1 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

Closed on the pinned instrument's own verdict at the canonical tree: the row's
last gap (`with_multiple_keys`, cache.rb:95) is PORTED-INLINE, not a gap. The
port's readMulti opens with exactly that guard's `size <= 1` short-circuit and
answers `{}` for a single-key call (src/card/fetch/cache.ts readMulti), and the
pin that names the semantics is `tests/card/fetch/cache.test.ts` "readMulti
skips single-key calls". The row's tally half landed as commit `96f7d657`
(branch `port/treewalk-grind-20261020`): `CardCache.tally` increments the
process-global `cacheTallyCounter` keyed by the cache's class
(undefined for Ruby's nil `@klass`) and returns the count, with `className`
retained on CardCache for the bucket key, and `exist?` was verified already
ported as `CardCache.exist` (`temp.exist || shared.exist`, cache.rb:87-91).

Integration evidence at the canonical roll tip `c17906db`
(deploy/full-candidate-20261101, this branch's base): both grind commits are
ancestors of the tip (`git merge-base --is-ancestor` for `96f7d657` and
`92ef12d6`), and the instrument re-run on the tip answers
`files=1 defs=10 PORTED=3 INLINE=6 SKIP=0 GAP=0 -> CLOSABLE`
(`node tools/treewalk-family-row-disposition.mjs <row-id>`).
The oracle suite is green on the tip: `tests/card/fetch/cache.test.ts` 25/25
(the tally oracle test among them), the whole `tests/card/fetch/` directory
green, and `tests/server/treewalk-row-disposition-parity.test.ts` 204/204
against the row's fixture `card-cache-methods-ruby-oracle.json`
(counts PORTED 3 / PORTED-INLINE 6 / NAMED-COLLAPSE 1, GAP 0).

## How this row was measured

- The row's Ruby file set and per-def roster: `tools/treewalk-family-def-coverage.mjs`.
- The per-def disposition: `tools/treewalk-family-row-disposition.mjs`.
- The pinned bytes, executed: `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`
  (or `tests/server/oracle-capture-card-class-declarations-ruby.rb` for the c1 row, whose
  subject is the class body rather than methods), whose fixture is under
  `fixtures/captured/`.
- The port side, re-checked against the port tree as it stands:
  `tests/server/treewalk-row-disposition-parity.test.ts`.

Branch: `port/register-treewalk-round1b-20261024` in KatsuJinCode/decko-ts.
Close: `port/workbatch-c-20261025`, workbatch-c lane, 2026-10-25.
