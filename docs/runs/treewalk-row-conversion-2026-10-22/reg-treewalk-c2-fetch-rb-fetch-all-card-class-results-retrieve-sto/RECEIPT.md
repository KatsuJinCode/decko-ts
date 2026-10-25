# reg-treewalk-c2-fetch-rb-fetch-all-card-class-results-retrieve-sto

- Ruby's file set: `card-1.110.0/lib/card/fetch.rb, fetch/{all,card_class,results,retrieve,store}.rb`
- The row's own label: `fetch.rb`, `fetch/{all,card_class,results,retrieve,store}.rb`
- 6 Ruby file(s), 57 def(s).
- PORTED 24 / PORTED-INLINE 33 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The receipt's nine gaps close five by porting and four by the port's own
citations and collapses, all measured at the canonical tree:

- `fetch_from_cast` (card_class.rb:58-63) is the port's `fetchFromCast`
  (src/card/fetch.ts): the cast's id branch fetches by id (Ruby's truthy
  test, id 0 included), the name branch rides the whole cast as the
  new-opts, and the missing-row answer is the port's fetch convention for
  the RecordNotFound Ruby's find raises.
- `fetch_name` (card_class.rb:85-89) is the port's `fetchName`:
  quick_fetch and the name.
- `refresh` (fetch/all.rb:22-30) is the engine's `refreshCard`: the
  identity without force (the port's records are never frozen or
  readonly), the LIVE row (trash excluded, Card.find's default) with
  force, past the cache, and undefined where Ruby returns nil for no id.
- `standard_uri_fetch` (card_class.rb:117-126) is the engine's
  `standardUriFetch`: the params' mark, the new-opts ride, skip_modules
  and the params' look_in_trash, and the assign-on-real? arm that previews
  an existing card with the requested attributes without saving.
- `type_id_from_new_opts` (results.rb:110-114) is the port's
  `typeIdFromNewOpts`, and it is now WIRED into renew (which previously
  carried only the type_id arm despite its comment claiming the full
  resolution): type_id first, then type_code through the codename
  registry, then the type name through the Lexicon, first present wins,
  an unknown code or name answers nil exactly where Codename.id and the
  Lexicon answer nil.
- `validate_opts!` (fetch.rb:43-47) was already inlined in
  fetchWithOptions byte for byte; the close puts the backticked citation
  on it.
- `newish` (fetch/all.rb:13-21) is the body Ruby's renew runs
  (results.rb:38); the close names it on the port's renew, which carries
  the reset_patterns (no record state), handle_type / assign_attributes
  (type resolution and assignableContent) and name-superize halves.
- `prefetch_rule` (retrieve.rb:13-15) and `prep_modules`
  (fetch/store.rb:12-15) close as the port's own documented collapses:
  the retrieval ladder runs cache-then-row with no rule-card pre-warm
  (the header of src/card/fetch/retrieve.ts names it), and the port's
  cached record carries no set modules for prep_modules to prepare (the
  FetchOptions.skipModules doc in src/card/fetch.ts names it).

Oracle evidence: tests/card/fetch/fetch-row-helpers.test.ts (15 tests over
real SQLite storage) pins the new surface - the cast's id branch including
id 0, the name branch with the cast riding the new-opts, fetchName's
nil-on-unknown, refresh as identity without force and as a live past-cache
re-read with force, the standard_uri_fetch build and the assign-on-real?
arm, the type resolution order (type_id over type_code, unknown code nil)
through the renew wiring, and the validate_opts! refusal. The row's fixture
was regenerated from the pinned bytes after the ports
(fixtures/captured/card-fetch-methods-ruby-oracle.json, 114 probes, counts
PORTED 24 / PORTED-INLINE 33, GAP 0), the instrument re-run answers
`files=6 defs=57 PORTED=24 INLINE=33 SKIP=0 GAP=0 -> CLOSABLE`, the whole
tests/card/fetch/ directory passes (12 files, 344 tests, 0 failures) with
the parity suite (204/204), and tsc is clean.

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
