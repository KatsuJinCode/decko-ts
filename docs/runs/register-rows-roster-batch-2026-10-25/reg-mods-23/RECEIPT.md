# reg-mods-23

- The pinned Ruby gem: `card-mod-markdown-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`; the kramdown
  oracle itself runs from the local Ruby 3.3.12 install with kramdown-2.5.2,
  coderay-1.1.3 and kramdown-syntax-coderay-1.0.1, the same versions the
  committed regeneration script cites).
- The row's label at the roster batch: `card-mod-markdown (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-markdown.ts`.
- The declaration census at this tree: 1 gem set file, 1 gem view name and
  0 gem event names, all registered port-side. The row's gap was a GRAMMAR
  gap, not a registration gap.

## Verdict: DONE

The register-row-23 lane (branch `port/regfix-3-20261025`) closed the gap:
the kramdown grammar's middle parsers are ported. Ruby dispatches the block
parsers in order and the first match claims the position
(`kramdown 2.5.2 parser/kramdown.rb:75-77`); the port's dispatch
(`src/card/render/kramdown.ts` parseBlocksInto) now runs all eighteen
parsers in Ruby's order - blank_line, codeblock, codeblock_fenced,
blockquote, atx_header, horizontal_rule, list, definition_list, block_html,
setext_header, block_math, table, footnote_definition, link_definition,
abbrev_definition, block_extensions, eob_marker, paragraph - where the old
port ran a nine-parser subset. The nine middle parsers, their span-side
partners (span_html, footnote_marker, inline_math, span_extensions), the
abbreviation replacement pass (abbreviation.rb replace_abbreviations), and
the coderay tokenization are in:

- `src/card/render/kramdown.ts`: the nine middle parsers, the span-side
  partners, the abbreviation replacement, the table cell/pipe machinery,
  the raw-html block tree, and the coderay wiring in codeBlockHtml.
- `src/card/render/code-highlighting/scanners/ruby.ts`: the coderay Ruby
  scanner (ruby.rb's state machine; unimplemented constructs - heredocs,
  %-literals, regex literals, ?x characters, `shell` strings, #{...}
  inline blocks - make the scan BAIL to the plain pass-through so a
  half-correct token stream is never emitted).
- `src/card/render/code-highlighting/index.ts`: the `ruby` language
  dispatch.

The coderay tokenization covers the deck's scanner languages (ruby,
java_script). The narrowed remainder: coderay languages outside the deck's
scanner set render as coderay's own plain-text fallback inside the
byte-exact DIV wrapper, and ruby/js code using the constructs listed above
falls back the same way; the wrapper bytes stay exact in both.

## How this row was closed

- The row's fixture, now verdict DONE with no gap:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-23-card-mod-markdown-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 23's block, the closed form).
- The grammar census, rewritten from pinning the fall-through to pinning
  the claims:
  `tests/card/mod-loader/register-row-23-card-mod-markdown-grammar-census.test.ts`.
- The oracle-surface pins in
  `tests/card/mod-loader/card-mod-markdown.test.ts`: the old honest-
  remainder table's fifteen rows (the nine constructs' ten rows plus the
  three coderay rows, the `<www.example.com>` raw-html row and the
  unclosed-strong emphasis row) all produce the ORACLE bytes now and moved
  to the parity table MIDDLE_PARSER_PARITY; the whole file's 167 tests
  pass.

## Oracle agreement

Every parity row's expected bytes are the recorded kramdown-2.5.2 oracle
bytes (captured 2026-10-20 through the committed regeneration script
`tests/card/mod-loader/oracle-capture-markdown-views.rb`), and the lane
re-verified them against the LIVE oracle during the pass: a scratch probe
ran the same option hash (`syntax_highlighter: :coderay`,
`syntax_highlighter_opts: {line_numbers: false, default_lang: :ruby}`) over
the row's constructs plus a broader corpus and byte-compared the port
against kramdown/CodeRay output - 21/21 on the row's probe set, 26/30 on
the coderay corpus (the four misses are the scanner's documented bail
constructs), and the full regeneration of the ORACLE/EXTENDED/SETEXT pins
passes unchanged (167/167 in the test file).

## The battery at this commit

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/card/mod-loader/register-row-23-card-mod-markdown-grammar-census.test.ts
      2 files passed, 42 tests passed.

    ./node_modules/.bin/vitest run tests/card/mod-loader/card-mod-markdown.test.ts
      1 file passed, 167 tests passed.

The full correctness gate (`node tools/test-gates.mjs run correctness`)
holds with its known failure set; see the lane's report for the run.

Branch: `port/regfix-3-20261025` in KatsuJinCode/decko-ts, from the
roster-batch tip `port/roster-batch-20261025` (`5efc8162`), which sits on
the newest pushed roll tip `deploy/full-candidate-20261029` (`c9ab5b33`).
