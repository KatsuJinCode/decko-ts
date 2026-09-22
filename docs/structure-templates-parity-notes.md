# Structure template parity notes — stream R2

Date: 2026-09-21. Scope: cards whose `db_content` is empty/NULL must render
their set's `*structure` rule template content, exactly as Ruby does.

## The Ruby mechanism (file+line)

Every content view in Ruby flows through ONE accessor, `Card#content`:

- `card-1.110.0/lib/card/content/all.rb:8-10` —
  `def content; structured_content || standard_content; end`
- `content/all.rb:25-27` — `structured_content` = `structure &&
  default_content`: the applicable template's `db_content`. Ruby truthiness
  matters: an empty-string template (`""`) is truthy and WINS over the
  card's own content; only `nil` (NULL `db_content` on the rule card)
  falls through.
- `content/all.rb:17-19` — `standard_content` = `db_content ||
  (new_card? ? default_content : "")`. For persisted (real) cards:
  `db_content || ""`.
- `card-mod-content-0.20.0/set/all/templating.rb:40-42` — `structure` =
  `template&.is_structure? ? template : nil`.
- `templating.rb:19-33` — `template`: for existing cards,
  `structure_rule_card`; for new cards, the `*default` template path
  (`new_card_template`, `dup_structure` — NOT ported, see remainder).
- `templating.rb:44-48` — `structure_rule_card` =
  `rule_card(:structure, skip_modules: true)`, then NIL-ed when its
  `db_content&.strip == "_self"`. The walk does NOT continue past a
  `_self` hit: the FIRST existing `<set>+*structure` card in
  pattern-precedence order decides, and `_self` means "no structured
  content".
- `templating.rb:11-13` — `is_structure?` = the rule card's right-part
  codename is `:structure` (true by name construction for
  `<set>+*structure` cards; see remainder note on codename nuance).
- `card-1.110.0/lib/card/rule/all.rb:9-14` — `rule_card`/`rule_card_id`:
  the first hit for the setting across the card's rule lookup keys
  (pattern precedence, `lib/card/set/pattern/all.rb:23,66-68`).
- `card-1.110.0/mod/core/set/all/content.rb:26-28` — `default_content` =
  `template&.db_content`.
- Views: `card-mod-format-0.20.0/set/all/base.rb:75-77` —
  `view :raw` = `structure_card&.content || _render_blank`;
  `base.rb:85-87` — `view :core` = `process_content(_render_raw)`.
  So one content-level substitution covers raw/core/open/closed alike.
  Template nests resolve against the STRUCTURED card's context
  (`Card::Content.new content, self`).

## What changed (port side)

- **`src/card/rules/structure.ts` (new)** — the mechanism module:
  - `structureRuleUniverseStatement()`: one flat, indexed statement
    fetching every live `*structure` rule card with its composed key.
    Rule rows match by `right_id = <the *structure setting card>` (a
    subquery in the same statement); the composed key is the set card's
    key one junction deep (`anchor_key + '+' + pattern_key + '+' +
    '*structure'`, or the set card's own key for anchorless sets).
    Deliberately NOT the prefetch walk's full-deck `resolved` CTE: that
    shape measured ~5 s/call on rule-dense seeds (see perf note below).
  - `structureUniverseFromResults()`: key -> template content map.
  - `resolveStructuredContent()`: the candidate walk —
    `ruleNamesForCard(card, "*structure")` (pattern precedence order,
    oracle-tested in set-patterns) matched against the universe by key;
    first hit decides; `_self` (after trim) and NULL content return
    undefined exactly like `structure_rule_card`/`default_content`.
  - `structuredCardContent()`: `content/all.rb:8-10` for a persisted
    card — template content, else `db_content ?? ""`.
  - `templateReferenceNames()`: absolute names in a template (real nest
    parser), for closure completion.
- **`src/card/render.ts`** — the prepare-phase hook:
  - the universe statement rides the cold render's closure batch via
    `additionalStatements` (appended LAST — the permission parser reads
    folded results by fixed index), parsed right after the codename
    codehash. Zero extra round trips.
  - `applyStructureContent()` (two idempotent passes: after closure
    prefetch, after search preparation — Ruby's search core also reads
    `content`, `card-mod-search-0.20.0/set/abstract/cql_search.rb:8-12
    cql_content -> query = content`): substitutes template content into
    `RenderCard.dbContent` in place — the single content accessor the
    views read (`format.ts#renderRaw`, the port of base.rb:75-77) — so
    NO view code changed. Then completes the closure: absolute template
    references are fetched with ONE batched key IN-query per round
    (verifyClosure's shape); genuinely absent names (the corpus's
    `{{xxxx}}` targets) are recorded in `structureRefMisses` and never
    re-queried — Ruby renders those as unknown-card views and so does
    the port's nest path.
  - `closureWarm()` now skips `structureRefMisses` keys, so structured
    cards go warm after their first render instead of staying
    permanently cold on absent nest targets.
  - `resetCaches()` clears the three new structures.
  - **`computeIsRule` order fix (corpus:253)**: Ruby evaluates
    `standard_rule? || preference?` (`lib/card/rule/all.rb:33`);
    `standard_rule?` (all.rb:37-40) runs FIRST for EVERY name shape —
    `name.left` of a 3-part name is its first two parts
    (cardname `parts[0..-2]`, ported as `DeckoName#leftName`). The port
    previously routed all >2-part names straight into the preference
    branch, dropping the RULE set key for names like
    `SET+*right+SETTING` that Ruby classifies via `standard_rule?`.
- **`src/card/rules/index.ts`** — exports the new module.

## Perf note (honest)

One cold prepare on the permission-dense replay seed (~3.4k rows,
rule-junction heavy) costs ~10 s in the prefetch walk's two recursive
`resolved` CTE statements — a pre-existing prefetch.ts cost that grows
with junction density (on the full 49k-row corpus file the same CTE runs
in 0.8 s; the seeded-deck plan searches via the low-selectivity trash
index, `SEARCH j USING INDEX cards_trash_index`). My universe statement
was deliberately shaped flat (indexed `right_id` join, ~0 ms) to not add
a third such CTE. Making the walk CTEs fast is the render/prefetch
stream's work; the structure hook adds one statement and zero round
trips.

## Query shape (decko-commons/decko#1282)

- Cold render: the universe statement is FOLDED into the existing closure
  batch — +1 statement, +0 round trips. Measured on the unit deck
  (`tests/card/rules/structure-templates.test.ts`, "the universe
  statement folds into the cold batch"): 13 statements / 8 round trips
  before this stream, 14 / 8 after. Template-reference completion adds
  at most ONE extra IN-query round trip per cold render and only when a
  template carries absolute refs (the corpus templates do: the
  `{{xxxx}}` miss check).
- Warm render: ZERO queries (pinned by test) — the structured pass is
  pure memory and absent targets are recorded misses.

## Statement-count deltas for other streams' pinned tests (NOT re-pinned
here — coordinator to re-pin)

- `tests/card/render/junction-depth-closure.test.ts:94` and `:166`:
  `statements` pin `toBe(10)` -> `toBe(11)` (round trips stay `toBe(5)`).
  NOTE: at report time the working tree shows these pins ALREADY at 11
  (auto-backup snapshot era) — re-verify against the live file.
- `tests/card/render/render-engine.test.ts`: the depth pins on disk read
  `toEqual({ 1: 11, 2: 11, 4: 11, 8: 11 })` (already re-pinned for the
  folded universe statement) and `toBeLessThanOrEqual(11)` (passes).
  The one RED assertion is line 266:
  `expect(statementsByDepth[8]).toBeLessThan(RUBY_MEASURED[8])` —
  depth-8 statements are now 11, EQUAL to Ruby's measured 11, and the
  strict less-than can no longer hold. The #1282 axis that matters —
  round trips — stays strictly better: 5 vs Ruby's 11
  (`roundTripsByDepth` pins `{ 1: 5, 2: 5, 4: 5, 8: 5 }` pass).
  Recommended re-pin: `toBeLessThanOrEqual(RUBY_MEASURED[8])`, or move
  the strict comparison to the round-trips axis where the design's win
  actually lives.

## Proof (corpus, shard-000000)

`tests/card/render/structure-corpus-replay.test.ts` +
`tests/card/render/structure-corpus-seeding.ts` (own seeding file; wraps
the proven permission-corpus seeding and adds the *structure rule
universe + closure + rule-predicate codenames + template-referenced
cards).

- Classification oracle replicated from the driver: `SELECT content FROM
  cards WHERE trash = 0 AND content IS NOT NULL AND name LIKE
  '%+*structure'` — 465 structure-pending records in shard-000000, 770
  non-denied captured views.
- Sampled gate (default): 14 entries strided by id, 23 views, **all
  byte-identical** after slot-id canonicalization (harness `diff.ts`).
  First sampled entry: `corpus:3` (`orvipveb`) closed/content/title —
  byte-exact against Ruby's captured template renders.
- `STRUCTURE_CORPUS_FULL=1` sweeps all 465 entries / 770 views. AT REPORT
  TIME THIS SWEEP HAS NOT COMPLETED: vitest killed it at the 60-minute
  per-test wall with no partial output — ~465 cold prepares at the
  pre-existing ~10 s/prepare CTE cost (see perf note) exceed the wall
  (the estimated need is ~75 min). Rerun it after the render/prefetch
  stream brings the cold-prepare cost down, or raise the timeout; the
  sampled gate above is the delivered proof.
- Excluded with pinned markers (NON-structure mechanisms, views-stream
  territory): `corpus:61` closed (menu popover renders the *help rule's
  content, card-mod-help; port emits `&nbsp;`), `corpus:253` closed
  (bar column split from the `*mini bar cols` setting,
  card-mod-bar_and_box set/all/bar.rb:2-6; port hardcodes 9,3). Each
  exclusion asserts the actual bytes match the documented marker, so
  the list cannot mask other regressions.
- Capture-error views (expected bytes start with `CAPTURE_ERROR`, e.g.
  corpus:3 `open` — Ruby itself raised) carry no oracle bytes and are
  counted, not replayed. Same convention as the driver.

## Test names added

- `tests/card/rules/structure-templates.test.ts` (20):
  - resolveStructuredContent (6): precedence self>type>all; type
    fall-through; "_self" kills without fall-through; NULL template
    content falls through; empty template WINS; empty universe.
  - structuredCardContent (3): template wins; standard path; NULL ->
    "".
  - templateReferenceNames (1); structureRuleUniverseStatement (1).
  - RenderEngine structured content (9): NULL-content card renders the
    template; template wins over own content; :raw parity; "_self"
    renders own content; rule-less NULL card renders empty; absolute
    template refs join the closure; folded batch (14 stmts / 8 round
    trips) + warm zero-query; junction-composed universe keys;
    candidate/universe key agreement.
- `tests/card/render/structure-corpus-replay.test.ts` (1): sampled
  byte-identical corpus replay + warm zero-query + foreign-pending
  markers.

## Honest remainder

1. **Junction-style (2020-convention) rule cards deeper than one set
   junction** are not matched by the universe statement's flat
   composition (rule sets like `A+B+*self`, whose key needs a second
   composition level). The corpus deck stores every rule card within
   that depth (verified 139/139) with name/key columns; deeper decks
   would need the bounded composition extended by one more LEFT JOIN
   level (or the resolved-CTE shape, at a perf cost).
2. **`is_structure?` codename check**: Ruby re-verifies the rule card's
   right-part codename is `:structure` (templating.rb:11-13); the port
   accepts candidates ending in `+*structure` by name shape. A deck
   that renamed the structure setting card away from `*structure` while
   keeping the codename would diverge (no such deck in evidence).
3. **new_card? default content** (`content/all.rb:17-19` new-card
   branch + `templating.rb:19-33` `new_card_template`/`dup_structure`):
   unknown/new cards under a structure or *default rule do not get
   template/default content; the port's unknown-nest path keeps its own
   behavior. The corpus renders persisted cards only.
4. **Preference-shaped `*structure` rules** (`SET+USER+*structure`) are
   not special-cased in the candidate walk; `ruleNamesForCard` yields
   the set-precedence candidates, matching `rule_card`'s cache walk for
   standard shapes. Preference resolution (rule/all.rb:19-26) is a
   later stream.
5. **Full sweep wall clock**: dominated by the pre-existing prefetch CTE
   cost on rule-dense seeds; the 2026-09-21 run was killed at the
   60-minute wall without completing. Fixing that cost belongs to the
   render/prefetch stream and would make `STRUCTURE_CORPUS_FULL=1`
   cheap.
6. **Concurrent-stream tsc noise at report time**: `tests/card/gherkin`
   (3 errors), `tests/card/conformance/write-path.test.ts`,
   `tests/card/render/tmp-debug-rule.test.ts` — other streams' WIP
   files; this stream's files typecheck clean.
