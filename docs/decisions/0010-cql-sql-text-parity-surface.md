# CQL SQL text: the parameterized canonical shape is the declared parity surface

## Context

The port's CQL compiler (`src/cql/sql.ts`) walks the query tree the way
card-1.110.0's `SqlStatement` (+ `sql_statement/joins.rb`, `where.rb`,
`order.rb`) walks it, and the two disagree about the BYTES of the SQL text
while agreeing about what the text does. The completeness register grades this
"B21: SQL cosmetics" and its entry already names the parameterized shape as
the declared parity surface, with no behavioral difference. The working notes
that carried the declaration (`docs/cql-port-notes.md`, "Oracle quirks" and
"Known approximations") were removed with the 2026-10-07 docs set, which left
the declaration without a home: `src/cql/sql.ts`'s header still cited a file
that no longer exists. This record is that declaration's new home.

The shapes Ruby emits that the port does not, each read in the pinned gemset
(card-1.110.0 lib/card/query/sql_statement.rb):

- The comment slot. `SqlStatement#comment` (sql_statement.rb:54-58) prepends
  `/* <comment> */\n` when `Card.config.sql_comments` is on and the root
  query carries a comment. The comment is not a statement property: the root
  `CardQuery` generates it from the statement's own inspect text
  (`default_comment`, card-1.110.0 lib/card/query/card_query.rb:41-45), and
  the config's pinned default is OFF (lib/cardio/railtie.rb:26,
  `config.sql_comments = false`), so the pinned deck's SQL text carries no
  comment either. The divergence exists only in a configuration that turns
  the flag on. The port emits no SQL comment in any configuration.
- The limit block's spacing. `SqlStatement#limit_and_offset`
  (sql_statement.rb:99-107) emits `LIMIT  <n> ` with a doubled space and a
  trailing space, and appends `OFFSET <n> ` with its own trailing space; both
  trailing spaces survive into the joined text (`to_s`, sql_statement.rb:34-40,
  joins the parts with single spaces). The port emits `LIMIT <n>` and
  ` OFFSET <n>` with single spaces and no trailing space.
- The count field's spacing. `SqlStatement#full_field` for `:count`
  (sql_statement.rb:77) emits `coalesce(count( distinct <alias>.id),0) as
  count`, with a space after the opening paren. The port emits
  `coalesce(count(distinct <alias>.id),0) as count`.
- The select leading space. `SqlStatement#select` (sql_statement.rb:44-46)
  indents a subquery's SELECT by `depth * 2` spaces
  (`leading_space`, sql_statement.rb:48-50). The port emits no indentation.
- Placeholders. Every user value becomes a `?` bound parameter, ordered by
  first appearance in the text; Ruby inlines quoted literals
  (`Value#sqlize`, value.rb:69-77).

What the port already reproduces, so the divergence stays a text matter:
SELECT DISTINCT exactly when the join list is non-empty
(sql_statement.rb:44-46 against `src/cql/sql.ts`'s select line), LIMIT only
when the limit is positive and OFFSET only with a LIMIT
(sql_statement.rb:99-107; offset alone renders nothing), the count field's
`coalesce(count(distinct ...),0) as count` shape, and the name return shape
`<alias>.name, <alias>.left_id, <alias>.right_id`
(sql_statement.rb:65-75).

## Decision

The parameterized canonical text is the declared parity surface for the port's
CQL compiler. The port's SQL text is what Ruby's text is with every user value
replaced by a `?` parameter and the whitespace canonicalized to single spaces;
the five named shapes above are the complete list of textual divergences, and
`tests/cql/sql-text-parity-surface.test.ts` pins that list mechanically so a
future change that inlines a literal, emits the comment slot, or re-widens
the whitespace fails there first, before any oracle pin does. The pin's
filename classifies it into the test harness's parity gate
(tools/test-gates.mjs matches "parity"), whose cadence is "at merge", so
every candidate roll's gate run exercises it; the correctness gate's
constant path carries the sql-generation pins of the same shapes.

Inlining Ruby's quoted literals is refused, and it is the one refusal that
matters: a CQL statement's values are untrusted input, and interpolating them
into SQL text is the injection vector parameterization exists to close. This
is the "flat wrong or destructive" class the operator's 2026-10-24 parity
ruling carves out, and the refusal is total: no host, no mode, and no
compatibility flag turns it back on. Reproducing the four spacing shapes
around placeholders is technically available (they are literal text, not
values), and it is declined here for a stated reason rather than by silence:
the port's canonical text is pinned by the whole `tests/cql/` suite, so a
spacing rewrite would touch every pin in the family for no behavioral gain.
That balance can be revisited only with the pins moved in the same landing,
which is what the pin test's existence requires of any future lane.

## Costs and limits

- Log capture, EXPLAIN, and byte-diff debugging against the Ruby oracle read
  the port's SQL differently from Ruby's; the parameter ordering and the
  single spaces are the difference. Anyone diffing the two texts normalizes
  whitespace and literals first.
- The comment slot stays unrendered in every configuration, where Ruby
  renders the statement's inspect text into every root statement's SQL when
  an operator sets `sql_comments` on (card_query.rb:41-45). A future lane
  that wants it takes the decision with it: render it, move the pins, and
  retire the divergence from this list. A `comment` KEY inside a statement is
  a bad statement in both implementations (Ruby's interpret sends every
  statement key as a method call, abstract_query.rb:48-52; the port raises
  CqlBadQuery for a key outside its attribute tables).
