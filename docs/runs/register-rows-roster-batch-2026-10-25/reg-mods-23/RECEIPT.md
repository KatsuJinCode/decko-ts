# reg-mods-23

- The pinned Ruby gem: `card-mod-markdown-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-markdown (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-markdown.ts`.
- The declaration census at this tree: 1 gem set file, 1 gem view name and
  0 gem event names, all registered port-side, with nothing left open. The
  row's gap is a GRAMMAR gap, not a registration gap.

## Verdict: WORKING ON IT

The kramdown grammar's middle parsers fall through to the port's paragraph
parser. Ruby dispatches the block parsers in order and the first match
claims the position (`kramdown 2.5.2 parser/kramdown.rb:75-77`), so a
construct the dispatch knows builds its own element. The port implements a
subset of that dispatch (`src/card/render/kramdown.ts:126-134`): blank
line, code block, fenced code block, block quote, ATX header, horizontal
rule, list, setext header, paragraph. The middle parsers are not ported,
so their text reaches the paragraph parser. The port's own file names the
cases (`src/card/mod-loader/mods/card-mod-markdown.ts:47-58`): tables,
footnotes, definition lists, abbreviations, attribute lists, math, raw
HTML blocks and spans, link reference definitions and end-of-block
markers. The coderay TOKENIZATION is a tenth divergence, where the
code-block wrapper is byte-exact but code that tokenizes gets
inline-styled spans the port does not produce
(`src/card/render/kramdown.ts:341-362`).

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-23-card-mod-markdown-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 23's block).
- The named instrument that runs the port's markdown over each of those
  constructs:
  `tests/card/mod-loader/register-row-23-card-mod-markdown-grammar-census.test.ts`.

The battery at this commit:

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/card/mod-loader/register-row-23-card-mod-markdown-grammar-census.test.ts
      2 files passed, 25 tests passed.

Branch: `port/roster-batch-20261025` in KatsuJinCode/decko-ts, from the
roll tip `deploy/full-candidate-20261029` at `c9ab5b33`.
