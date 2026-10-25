# reg-treewalk-c2-content-rb-20-120

- Ruby's file set: `card-1.110.0/lib/card/content.rb`
- The row's own label: `content.rb:20-120`
- 1 Ruby file(s), 16 def(s).
- PORTED 12 / PORTED-INLINE 4 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

Closed by porting the chunk-query surface. The new module
src/card/render/content-chunks.ts carries the row's parser walk and query
methods over the three chunk classes the port's own scans already scope to
(Nest, Link, EscapedLiteral - the :default list, as scoped in
src/card/render/nest-syntax.ts and src/card/actions/refresh-references-out.ts):

- `each_chunk` (content.rb:64-77) is `eachChunk`, the chunks in parse order
  via `scanChunks` (the parser.rb:45-59 walk: leftmost prefix position wins,
  the class's full regex consumes anchored, a failed full match advances one
  character);
- `find_chunks` (content.rb:38-41) is `findChunks`, with Ruby's nil quirk
  kept: nil interprets to the Chunk MODULE, nothing is an instance of it,
  and the answer is empty;
- `interpret_chunk_type` (content.rb:124-135) is `interpretChunkType` (the
  Chunk-module nil, the const_get names, the unknown-type raise);
- `stash_chunks` (content.rb:137-145) is `stashChunks` (the `{{N}}` markers
  in chunk order, the texts in the stash);
- `without_chunks` (content.rb:107-112) is `withoutChunks` (stash, run the
  block, unstash), with `without_nests` (content.rb:99-101) and
  `without_references` (content.rb:103-105) as the Nest-only and
  Nest+Link+EscapedLiteral forms;
- `strip_chunks` (content.rb:118-120) is `stripChunks` (the selected
  chunks' text vanishes from the content, Ruby's reject! then to_s);
- `unstash_chunks` (content.rb:147-152) is `unstashChunks`, numeric-only
  restore under the deck's own Float-parse `number?`
  (config/initializers/01_core_extensions/object.rb:3-6), with the array
  read past the end answering nothing, and Ruby's Float() set spelled out
  rather than Number() (which answers 0 for "" and " " where Ruby raises);
- `has_chunk?` (content.rb:43-45) is `hasChunk`, and it reproduces the
  pinned bytes' own raise: the pinned body reads `each_chunk.any` - `any`,
  not `any?` - and raises NoMethodError on every call (measured against the
  pinned Ruby 3.4.11), so the port raises the same way instead of silently
  fixing the pinned system;
- `custom_process_chunks` (content.rb:54-59) and `resolve_format`
  (content.rb:153-158) close as the port's own documented collapses, named
  in the module header: the port has no content object with a burnable
  chunk list (chunk rendering is the renderer's dispatch over the scanned
  pieces), and the chunk queries parse the content string with one chunk
  list, so there is no format object to resolve.

Oracle evidence: the pinned content.rb was loaded by its own bytes under
Ruby 3.4.11 (with clean.rb, the deck's Object#number? and ActiveSupport's
Array.wrap stood in - all three are what the deck's runtime carries;
without the Array.wrap stub the pinned without_chunks dies at its own
`::Set.new Array.wrap(...)` - measured) and run over the fixed parse of
"a [[L]] b {{N}} c \{{E}}". The answers the port pins are those answers:
find_chunks(nil) empty, find_chunks(:Link) the link, the has_chunk? raise
with its message, the stash marker and order, without_chunks/without_
references restoring stashed chunks verbatim around the block's edits, the
numeric-only unstash with the past-the-end empty, and strip_chunks'
double-space remainder. The pins live in
tests/card/render/content-chunks-row.test.ts (17 tests). The row's fixture
was regenerated from the pinned bytes after the port
(fixtures/captured/card-content-methods-ruby-oracle.json, 32 probes, counts
PORTED 12 / PORTED-INLINE 4, GAP 0), the instrument re-run answers
`files=1 defs=16 PORTED=12 INLINE=4 SKIP=0 GAP=0 -> CLOSABLE`, the parity
suite reads 204/204 against the regenerated fixture, and tsc is clean.

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
