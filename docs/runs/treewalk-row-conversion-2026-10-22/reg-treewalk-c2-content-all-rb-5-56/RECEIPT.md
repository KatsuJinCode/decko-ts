# reg-treewalk-c2-content-all-rb-5-56

- Ruby's file set: `card-1.110.0/lib/card/content/all.rb`
- The row's own label: `content/all.rb:5-56`
- 1 Ruby file(s), 13 def(s).
- PORTED 8 / PORTED-INLINE 5 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

Closed by porting the row's two remaining defs and pinning them against the
pinned Ruby's own answers:

- `refresh_content` (all.rb:30-32) is the port's `refreshContent`
  (src/card/fetch/card-record.ts), next to the file's existing port of the
  row's `content`: `Card.find(id)&.db_content` becomes an injected by-id
  lookup whose found row's `dbContent` replaces the card's, a missing row
  blanks it, and a card without an id never finds.
- `blank_content?` (all.rb:46-48) is the port's `isBlankContent`
  (src/card/fetch/card-record.ts), carrying both Ruby halves: ActiveSupport
  7.2.4's `String#blank?` (the White_Space regex, BLANK_RE at
  core_ext/object/blank.rb:136) over the whole content, and Ruby
  String#strip (ASCII whitespace plus NUL off the ends) before the second
  half. The two halves are not the same question - content of NUL alone
  answers false to the first and true to the second - and the port's
  whitespace set is spelled out rather than spelled `\s`, because Ruby's
  [[:space:]] and JavaScript's \s disagree at U+0085 (blank in Ruby, not in
  \s) and U+FEFF (blank in \s, not in Ruby).

Oracle evidence, executed this session under Ruby 3.4.11 with the gemset's
activesupport-7.2.4: the pinned `blank_content?` body was extracted by line
(content/all.rb:46-48, the capture rig's own extraction rule) and run over
the probe contents - empty, one space, tab-newline and NUL answer true,
"hello", " hello " and "\0x" answer false, and the single-character probes
put the whitespace sets on the record ("\u0085".blank? -> true,
"\uFEFF".blank? -> false, "\u00A0".blank? -> true, "\0".strip -> "").
The probe lives at
tests/server/oracle-probes-workbatch-c-20261025/content-all-blank-content-probe.rb.
The pins live in tests/card/fetch/content-all-refresh-and-blank.test.ts
(7 tests). The row's fixture was regenerated from the pinned bytes after the
port (fixtures/captured/card-content-all-methods-ruby-oracle.json, 26
probes, counts PORTED 8 / PORTED-INLINE 5, GAP 0), the instrument re-run
answers `files=1 defs=13 PORTED=8 INLINE=5 SKIP=0 GAP=0 -> CLOSABLE`, and
the parity suite reads 204/204 against the regenerated fixture. (`last_draft_content`,
the receipt's third gap at the 2026-10-22 measurement, is covered since then
by card-mod-history's port - the instrument binds it at
src/card/mod-loader/mods/card-mod-history.ts:775 - so this close adds the
other two.)

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
