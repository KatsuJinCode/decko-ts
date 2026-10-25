# reg-treewalk-c2-content-clean-rb-37-95

- Ruby's file set: `card-1.110.0/lib/card/content/clean.rb`
- The row's own label: `content/clean.rb:37-95`
- 1 Ruby file(s), 7 def(s).
- PORTED 4 / PORTED-INLINE 3 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The receipt's four gaps resolve at the canonical tree: the port has carried
the Clean module's algorithm all along in src/card/actions/content-clean.ts
(the save path's HTML restriction), and this close puts the row's citations
on the file so the instrument can see what the code already was:

- `clean!` (clean.rb:37-45) is `cleanContent`, with `clean_spaces`
  (clean.rb:59-61) as `cleanSpaces`;
- `clean_tags` (clean.rb:47-57) is the tag pass inlined in `tagPieces` (the
  same gsub expression, one cleaned tag per match, then the comment pass);
- `html_attribs` (clean.rb:65-70) is `rubyHtmlAttribs`, the ok_attrs walk in
  list order with each value's own quote;
- `process_attribute_match` (clean.rb:86-95) is the ATTR_VALUE_RE read and
  the class filter (`filterClasses` keeps only /^w-/i classes) inside
  `processAttribute`.

The citations live in the file's provenance header and the per-function doc
comments, each naming the def and its lines; they are claims about code that
was already there, not new code.

Oracle evidence, executed this session: the pinned clean.rb was loaded by its
own bytes under Ruby 3.4.11 (the probe lives at
tests/server/oracle-probes-workbatch-c-20261025/content-clean-clean-probe.rb,
with the english alias of `$~` and ActiveSupport 7.2.4's blank? stood in,
both things the deck's runtime carries; without the alias the pinned
clean_tags reads a nil `$LAST_MATCH_INFO` and dies - measured)
and its clean! ran over a 22-input battery (tags, attributes, quotes, the
class filter, comments, nbsp spacing, unclosed and stray-close tags, upper-case
tags and attributes). 21 of the 22 answers are byte-identical in the port.
The one difference is the divergence the module header names: Ruby's
\b-anchored attribute search reads a value for `style` out of
`data-mce-style="..."` (the `-` before `style` is a word boundary) and emits a
phantom `style="color: red"`; the port's WHATWG read finds no style attribute
and stores the browser's read. The battery is pinned in
tests/card/actions/content-clean-ruby-clean-oracle.test.ts (21 byte-exact
cases plus the named divergence), green together with the module's own
security suite (tests/card/actions/content-clean-security.test.ts).

The row's fixture was regenerated from the pinned bytes after the citations
(fixtures/captured/card-content-clean-methods-ruby-oracle.json, 14 probes,
counts PORTED 4 / PORTED-INLINE 3, GAP 0), the instrument re-run answers
`files=1 defs=7 PORTED=4 INLINE=3 SKIP=0 GAP=0 -> CLOSABLE`, and the parity
suite reads 204/204 against the regenerated fixture.

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
