# The register-treewalk family's working rows, adjudicated

Every one of the family's thirty WORKING rows was taken in row-id order
and its own verification was attempted against the PINNED Ruby. Three of
the thirty closed on their own verification; the other twenty-seven keep
their bucket with the measured gap named.

## What was measured, and how

The pinned gemset is the deck at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`, and the port
tree is this checkout's `src/`. The card gem cannot be loaded standalone
(card-1.110.0/lib/card.rb opens `class Card < Cardio::Record`, and
Cardio::Record is an ActiveRecord model), so the pinned bytes are read
BY LINE and the method bodies are EXECUTED over recording doubles. Every
probe records what the pinned method asked for, and the port side is
re-checked against the port tree as it stands.

The three instruments, and what each is for:

| instrument | what it measures |
| --- | --- |
| `tools/treewalk-family-def-coverage.mjs` | the row's Ruby file set and its per-def roster |
| `tools/treewalk-family-row-disposition.mjs` | the per-def disposition: PORTED, PORTED-INLINE, NAMED-COLLAPSE, SKIP, INERT-API or GAP |
| `tests/server/oracle-capture-card-gem-row-methods-ruby.rb` | the pinned bytes, executed over recording doubles |
| `tests/server/treewalk-row-disposition-parity.test.ts` | the port side, re-checked against the tree as it stands |

## The dispositions

- **PORTED** - the port binds the behaviour, in a file that cites this
  row's Ruby source.
- **PORTED-INLINE** - the port carries the behaviour at a call site and
  cites this row's Ruby source, in the port's own comment.
- **NAMED-COLLAPSE** - the port's own words say it carries the
  behaviour by a different mechanism ("the TS engine has no process-global
  Auth singleton - the actions layer takes an explicit actor parameter -
  so `as`/`as_bot` (proxy.rb:5-24) collapse into 'pass a different
  actor object'").
- **SKIP** - a private helper the pinned deck cannot reach.
- **INERT-API** - a method whose only callers are the deck's own spec or
  migration tree, so the old system's runtime never reached it either.
- **GAP** - a def the port does not carry, where the deck's runtime could
  reach it.

A row closes to DONE only where it has NO GAP.

## The thirty rows

| row | defs | PORTED | INLINE | COLLAPSE | SKIP | INERT | GAP | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| reg-treewalk-c1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | DONE |
| reg-treewalk-c2-auth-proxy-rb-6-29-48-59 | 6 | 0 | 4 | 1 | 0 | 0 | 1 | WORKING ON IT |
| reg-treewalk-c2-auth-setup-rb-9-15-39-51 | 7 | 0 | 4 | 0 | 0 | 1 | 2 | WORKING ON IT |
| reg-treewalk-c2-auth-token-rb-10-33 | 5 | 0 | 5 | 0 | 0 | 0 | 0 | DONE |
| reg-treewalk-c2-cache-all-card-class-class-methods-populate-shared | 51 | 18 | 25 | 1 | 0 | 0 | 7 | WORKING ON IT |
| reg-treewalk-c2-cache-rb-34-91-cache-shared-temporary-rb | 10 | 3 | 5 | 1 | 0 | 0 | 1 | WORKING ON IT |
| reg-treewalk-c2-content-all-rb-5-56 | 13 | 4 | 6 | 0 | 0 | 0 | 3 | WORKING ON IT |
| reg-treewalk-c2-content-clean-rb-37-95 | 7 | 0 | 0 | 0 | 3 | 0 | 4 | WORKING ON IT |
| reg-treewalk-c2-content-rb-20-120 | 16 | 2 | 3 | 0 | 0 | 0 | 11 | WORKING ON IT |
| reg-treewalk-c2-director-rb-director-rb-9 | 119 | 25 | 30 | 6 | 1 | 0 | 57 | WORKING ON IT |
| reg-treewalk-c2-dirty-rb-dirty-method-factory-rb | 11 | 1 | 5 | 0 | 0 | 0 | 5 | WORKING ON IT |
| reg-treewalk-c2-fetch-rb-fetch-all-card-class-results-retrieve-sto | 57 | 21 | 27 | 0 | 0 | 0 | 9 | WORKING ON IT |
| reg-treewalk-c2-format-rb-format-content-context-names-render-regi | 76 | 12 | 38 | 3 | 3 | 0 | 20 | WORKING ON IT |
| reg-treewalk-c2-mailer-rb-9-26 | 2 | 0 | 1 | 0 | 0 | 0 | 1 | WORKING ON IT |
| reg-treewalk-c2-mark-rb | 3 | 1 | 1 | 0 | 0 | 0 | 1 | WORKING ON IT |
| reg-treewalk-c2-model-save-helper-rb-3 | 7 | 0 | 0 | 0 | 0 | 1 | 6 | WORKING ON IT |
| reg-treewalk-c2-name-rb-name-all-all-descendants-all-parts-card-cl | 55 | 25 | 14 | 1 | 4 | 0 | 11 | WORKING ON IT |
| reg-treewalk-c2-reference-rb-reference-all-rb | 26 | 8 | 8 | 1 | 1 | 1 | 7 | WORKING ON IT |
| reg-treewalk-c2-rule-rb-rule-all-cache-preference-cache-read-rule- | 39 | 11 | 20 | 0 | 0 | 0 | 8 | WORKING ON IT |
| reg-treewalk-c2-set-rb-set-28 | 240 | 43 | 72 | 3 | 22 | 1 | 99 | WORKING ON IT |
| reg-treewalk-c2-setting-rb-63-114 | 12 | 1 | 8 | 0 | 0 | 0 | 3 | WORKING ON IT |
| reg-treewalk-c2-subcards-rb-subcards-add-all-args-relate-remove-rb | 46 | 10 | 8 | 1 | 0 | 0 | 27 | WORKING ON IT |
| reg-treewalk-c2-view-rb-view-classy-permission-rb-view-cache-4 | 55 | 7 | 16 | 0 | 16 | 0 | 16 | WORKING ON IT |
| reg-treewalk-d1 | 62 | 14 | 7 | 1 | 10 | 1 | 29 | WORKING ON IT |
| reg-treewalk-d2 | 293 | 35 | 61 | 2 | 52 | 3 | 140 | WORKING ON IT |
| reg-treewalk-d3 | 39 | 0 | 0 | 0 | 8 | 0 | 31 | WORKING ON IT |
| reg-treewalk-e1 | 169 | 45 | 74 | 3 | 9 | 0 | 38 | WORKING ON IT |
| reg-treewalk-e3 | 110 | 0 | 0 | 0 | 0 | 57 | 53 | WORKING ON IT |
| reg-treewalk-e4 | 6 | 0 | 0 | 0 | 3 | 3 | 0 | DONE |
| reg-treewalk-e5 | 27 | 1 | 0 | 0 | 9 | 0 | 17 | WORKING ON IT |

## The three closures

### reg-treewalk-c1

The port measurably matches the pinned Ruby on this row's whole surface: The row's subject is the class BODY, not methods, and the port carries every declaration in it: the mixin roster (the seven extends and eleven includes, each with a port module named for it), the action_specific_attributes list (the port names the same list and cites lib/card.rb:146), the four associations (the port reads and writes the same rows by the same keys), and the three Rails callback chains (the port names all three in the dispatcher's table and cites lib/card.rb:181). The one declaration the port does not carry is the `delegate :config, :paths, to: Cardio` line, because that reaches the RAILS APPLICATION's configuration and the port is not Rails.

### reg-treewalk-c2-auth-token-rb-10-33

The port measurably matches the pinned Ruby on this row's whole surface: The port carries all five of the row's methods and cites the Ruby for each: encode is the port's `encodeAuthToken` (src/card/auth/token.ts:309), validate! is at :466, decode at :370, expiration at :169, and signin_with_token is the port's `signinFromToken` (src/server/request-authenticators.ts:123), which cites card-1.110.0/lib/card/auth/token.rb:38-41 by name. The pinned bytes were executed to confirm the behaviours: decode answers with the error MESSAGE on a bad token rather than raising, and expiration reads the config.

### reg-treewalk-e4

The port measurably matches the pinned Ruby on this row's whole surface: The row's six defs are the deck's own RSpec SPEC HELPERS (assert_rename, expect_successful_rename, name_invariant_attributes, card_to_rename, run_admin_task, card_subject), and the pinned deck calls them only from its own spec files, so the old system's RUNTIME never reached them. The port's counterpart for a spec file is its own TEST SUITE, and the port carries the behaviour those specs check: the rename invariants (tests/card/actions/renamegate-rename-created-sides-verdicts.test.ts and rename-referer-cache-staleness.test.ts), the blocked self-side rename (obstructed-self-side-rename-write.test.ts) and the codename cache reset (codename-cache-reset-save-path.test.ts). A spec helper is not something a port SHOULD bind, so the rig measures these as the deck's inert library API and its private helpers, not as port gaps.

## The twenty-seven that stay open

Each of these keeps WORKING ON IT with the gap named in one
mechanism sentence, and the defs named with their Ruby file and line, in
the row's receipt under `docs/runs/treewalk-row-conversion-2026-10-22/`.

- **reg-treewalk-c2-auth-proxy-rb-6-29-48-59** - The port has no permission-proxy: Ruby’s `with` saves and restores a PROCESS-GLOBAL current_id and the port's engine has no process-global to save, which is the same mechanism the port names for the row's collapsed `temporarily` (src/card/auth/actor.ts:29).
- **reg-treewalk-c2-auth-setup-rb-9-15-39-51** - The port carries the setup census and not the test surface: the row's two remaining defs are a test-only helper the pinned deck never calls and the id LIST behind the count, which the port does not need because it counts the accounts directly (countUserAccounts, src/card/auth/first-run-setup.ts:311).
- **reg-treewalk-c2-cache-all-card-class-class-methods-populate-shared** - The port fills its cache on demand and has no class-level cache registry: the row's defs are the cache POPULATION half (Ruby pre-fills the cache at boot), the class-level REGISTRY and the shared-cache STAMP, none of which the port has a counterpart for.
- **reg-treewalk-c2-cache-rb-34-91-cache-shared-temporary-rb** - The port carries the guard as INLINE behaviour and does not cite the helper: `with_multiple_keys` (cache.rb:95-99) is the one-line guard that makes a multi-key read return nothing for one key, and the port's readMulti opens with exactly that condition (src/card/fetch/cache.ts:337) without naming the helper.
- **reg-treewalk-c2-content-all-rb-5-56** - The port's draft surface is a different mechanism: the row's three defs are the DRAFT half of Ruby's content surface (re-read the content, the last draft's content, whether the content is blank), and the port's save path carries a draft action and the draft's stored bytes (src/card/actions/types.ts:168-172) instead.
- **reg-treewalk-c2-content-clean-rb-37-95** - The port has no content-CLEANING surface: the row's defs strip the tags, the comments and the style attributes from a card's content, and no port file cites lib/card/content/clean.rb at all.
- **reg-treewalk-c2-content-rb-20-120** - The port has no chunk-QUERY API: the row's defs find the chunks of a type, walk them and strip them, and the port's chunk surface is the RENDERER's nest syntax (src/card/render/nest-syntax.ts) rather than Ruby's query surface.
- **reg-treewalk-c2-director-rb-director-rb-9** - The port runs an act's stages in one call and has no director REGISTRY: the row's defs are the registry (unregister, appoint, main_director), the run and stage machinery and the store, and the port's act lifecycle is the action engine's own (src/card/actions/card-action-engine.ts).
- **reg-treewalk-c2-dirty-rb-dirty-method-factory-rb** - The port computes the before-values it needs instead of defining dirty methods on the record: the row's defs are the half Ruby's method factory GENERATES, and the port's write path carries the dirty tracking by a different mechanism (src/card/actions/update-referer-content.ts:72 and :467).
- **reg-treewalk-c2-fetch-rb-fetch-all-card-class-results-retrieve-sto** - The port has no Ruby-shaped fetch options and no results helpers: the row's defs are validate_opts! (the guard that refuses a contradictory options pair), the newish and refresh helpers and the results helpers, and the port carries the guard by its own mechanism (src/card/fetch.ts:223-226).
- **reg-treewalk-c2-format-rb-format-content-context-names-render-regi** - The port's format module is the renderer's own and has no Rails-facing surface: the row's defs are require_card_to_initialize!, the mime type, the context-names round trip, the render and wrapper methods and the registration helpers.
- **reg-treewalk-c2-mailer-rb-9-26** - The port builds its mail headers in renderMail and its envelope in the transport, so the three defaults Ruby holds in ONE method are split across two port functions: the row's def is defaults_from_config, and the port cites only its charset half (src/card/notify/mail.ts:202).
- **reg-treewalk-c2-mark-rb** - The port's own map does not claim mark.rb#cardish: the port's fetch path carries the BEHAVIOUR (a Card record mark resolves at src/card/fetch/retrieve.ts:154) and cites lib/card/mark.rb, but no port file names the method.
- **reg-treewalk-c2-model-save-helper-rb-3** - The row is the deck's EXTERNAL-SCRIPTING library API and the port carries the capability under its own names without citing Ruby's file: the pinned deck's runtime calls none of these methods (the deck's own red-team audit measured the same), so there is no behaviour the port owes.
- **reg-treewalk-c2-name-rb-name-all-all-descendants-all-parts-card-cl** - The port carries the name composition under its own surface and does not have Ruby's SUPERCARD branch: the row's defs are the construction helpers, the supercard handling, the name= writer's subcard cascade and the rename helpers.
- **reg-treewalk-c2-reference-rb-reference-all-rb** - The port carries the reference read and write path and not the reference REPAIR and the referer-collection half: the row's seven defs are the ones the port binds no function for under any name.
- **reg-treewalk-c2-rule-rb-rule-all-cache-preference-cache-read-rule-** - The port carries the rule cache READ path and the invalidation is its write path's job: the row's eight defs are the cache-clearing surface and the preference helpers behind it.
- **reg-treewalk-c2-set-rb-set-28** - The port carries the set-module DECLARATION surface by a different mechanism: the row's ninety-nine defs are the set-definition DSL's own generators and registries (the event and view method factories, the format-module registration, the options and trait surfaces), and the port's mod loader reads the deck's set files and records the registrations (src/card/mod-loader/mod-registrar.ts).
- **reg-treewalk-c2-setting-rb-63-114** - The port carries the setting REGISTRY and not the option helpers behind it: the row's three defs fill a setting's default option hash, narrow a setting to one card type and list the types a setting may be used on.
- **reg-treewalk-c2-subcards-rb-subcards-add-all-args-relate-remove-rb** - The port saves a card's subcards in the same act and has no sub-card API: the row's twenty-six defs are the add, the remove and the reads around them, and the port's write path is the action engine's (src/card/actions/card-action-engine.ts).
- **reg-treewalk-c2-view-rb-view-classy-permission-rb-view-cache-4** - The port has no view LINEAGE and no per-view cache: the row's sixteen defs are the view ancestry (root, deep_root, next_ancestor), the classy surface and the view-cache cluster, and the port's view is the format module's own.
- **reg-treewalk-d1** - The port is not Rails and has no Rails initializers, environments or schema loader: the row's twenty-nine defs are the Rails core extensions (the Hash and Module extensions, the ActiveRecord patches) and the better_errors patch, mechanisms Rails provides and the port has no use for.
- **reg-treewalk-d2** - The port is not Rails and has no railtie, no Rails application class and no rake command layer: the row's one hundred and forty defs are the Rails host's own surface, and the port is a library and an edge worker rather than a Rails server.
- **reg-treewalk-d3** - The port has no generator: the row's thirty-one defs are the interactive prompts, the deck generator's file map, the migration generator and the mod and set generators, and the port's own deck bootstrap is the seed-and-boot path (src/card/auth/boot-seed.ts).
- **reg-treewalk-e1** - The port carries the core mod by a different mechanism: the row's thirty-eight defs are the core mod's admin and set-module surface, and the port's equivalents are the core-admin-runtime (src/card/mod-loader/mods/core-admin-runtime.ts) and the core mod's own registrations (src/card/mod-loader/mods/core-mod.ts).
- **reg-treewalk-e3** - The port has no Rails migration history and no Rails seed loader: the row's fifty-three defs are the schema and transform migrations themselves, and the port's schema is its own (db/schema.sqlite.sql) with the deck's data read as a seed corpus.
- **reg-treewalk-e5** - The port has no rake task runner: the row's seventeen defs are the rake task CLI and its option parsing plus the seed and migrate tasks' own methods, and the port's equivalents are the commands the deploy scripts invoke.

## What this lane did NOT do

- It did not close a row on a name match. The rig's earlier rule
  counted a def as ported when its name appeared anywhere in a
  non-comment port line, and the rig found Card::Auth::Token's `encode`
  "ported" at an image resizer's own encode. A name bound in an
  unrelated file proves nothing.
- It did not treat a port file's own header as proof that it carries
  every method in the Ruby file it names. The rig's per-def check
  measures the file's CONTENTS, and the lexicon row is the example: the
  roster had closed it as PORTED on the header alone, and four of the
  five defs the file is supposed to carry are absent from the port.
- It did not mark a row DONE on a reading. Every row's verdict rests on
  the pinned bytes executed and the port tree re-read.
- It did not deploy anything, and it did not touch the live host.

## Where the evidence is

- Per-row receipts: `docs/runs/treewalk-row-conversion-2026-10-22/<row-id>/RECEIPT.md`.
- The family-wide receipt: `docs/reports/treewalk-working-rows-2026-10-22.md`.
- The oracle fixtures: `fixtures/captured/card-*-methods-ruby-oracle.json`
  and `fixtures/captured/card-class-declarations-ruby-oracle.json`.
- The branch: `port/register-treewalk-convert-20261022` in
  KatsuJinCode/decko-ts.
