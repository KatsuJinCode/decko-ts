# reg-treewalk-c2-content-clean-rb-37-95

- Ruby's file set: `card-1.110.0/lib/card/content/clean.rb`
- The row's own label: `content/clean.rb:37-95`
- 1 Ruby file(s), 7 def(s).
- PORTED 0 / PORTED-INLINE 0 / NAMED-COLLAPSE 0 / SKIP 3 / INERT-API 0 / GAP 4.

## Verdict: WORKING ON IT

The port does not carry 4 of the row's defs: The port has no content-CLEANING surface: the row's defs strip the tags, the comments and the style attributes from a card's content, and no port file cites lib/card/content/clean.rb at all.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `clean!` | clean.rb:37 | public | port-bound |
| `clean_tags` | clean.rb:47 | private | internal-reachable |
| `html_attribs` | clean.rb:65 | private | internal-reachable |
| `process_attribute_match` | clean.rb:86 | private | internal-reachable |

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
