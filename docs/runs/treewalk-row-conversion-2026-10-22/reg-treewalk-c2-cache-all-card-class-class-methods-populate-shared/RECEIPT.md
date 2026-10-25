# reg-treewalk-c2-cache-all-card-class-class-methods-populate-shared

- Ruby's file set: `card-1.110.0/lib/card/cache/{all,card_class,class_methods,populate,shared_class}.rb`
- The row's own label: `cache/{all,card_class,class_methods,populate,shared_class}.rb`
- 5 Ruby file(s), 51 def(s).
- PORTED 18 / PORTED-INLINE 29 / NAMED-COLLAPSE 4 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

Closed on the pinned instrument's own verdict at the canonical tree. The
receipt's seven named gaps all resolve at the roll tip: the class-methods
registry landed as commit `92ef12d6` (branch `port/treewalk-grind-20261020`):
`cacheByClass`, `cacheForClass` (with the nil-klass raise), `renewCaches`
(counter nil, noRenewal short-circuit, shared stamp renew, per-cache temp
reset), `renewSharedCache`, `resetCaches`, `resetAllCaches`,
`resetGlobalCaches` (with shared annihilate), `resetSharedCaches`,
`resetTempCaches`, `resetOtherCaches` (the codename reset stays a named
injected divergence: Ruby reaches the process-global Card::Codename, the
port's is per-engine; `Cardio::Utils.delete_tmp_files!` has no port
counterpart), `sharedCacheOn`, `cacheTallies`, `cacheTallyTotal` - and
`SharedCacheStore` gained `clear?()`. The remaining names are the port's own
documented skips, carried in the cache.ts header block as the instrument
reads them: the view-cache cluster of cache/all.rb (no per-view cache keys in
the port), the populate cluster of cache/populate.rb (keyed to Ruby's Lexicon
value shapes and Set.basket seeds), and `seed_from_stash`/`stash_to_cache`
(a Rails dev-reload aid). NAMED-COLLAPSE 4 is the registry reading those
documented collapses; the port's population is on-demand rather than Ruby's
boot-time pre-fill, and the header says so.

Integration evidence at the canonical roll tip `c17906db`
(deploy/full-candidate-20261101, this branch's base): `92ef12d6` is an
ancestor of the tip (`git merge-base --is-ancestor`), and the instrument
re-run on the tip answers `files=5 defs=51 PORTED=18 INLINE=29 SKIP=0 GAP=0
-> CLOSABLE` (`node tools/treewalk-family-row-disposition.mjs <row-id>`).
The oracle suite is green on the tip: the whole `tests/card/fetch/` directory
passes (cache.test.ts 25/25 among it), and
`tests/server/treewalk-row-disposition-parity.test.ts` 204/204 against the
row's fixture `card-cache-all-methods-ruby-oracle.json` (counts PORTED 18 /
PORTED-INLINE 29 / NAMED-COLLAPSE 4, GAP 0, 102 pinned probes).

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
