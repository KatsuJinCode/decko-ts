# Rule evaluation engine — port notes

The rule system is the missing piece between the static html-format views
(src/card/render/views.ts) and the per-card-type/per-set customizations
Ruby Decko ships out of the box. This stream ports the **naming + lookup +
interpretation** half; the **registration** half (mod loading, the Ruby
metaprogramming that wires rules into pattern base classes) is its own
stream.

## Truth sources (read directly from the installed gems)

- `card-1.110.0/lib/card/rule.rb` — the Rule class: `fetch_id`,
  `fetch`, cache writes/reads.
- `card-1.110.0/lib/card/rule/all.rb` — `rule_card_id` consults the rule
  cache by lookup key `"<set>+<setting>"` for the card's pattern lookup
  keys in precedence order (Set::Pattern::All#rule_lookup_keys).
- `card-1.110.0/lib/card/rule/cache.rb` — `Cache#lookup_key` builds
  codename-form keys `"[anchor_id, pattern_code, setting_code].compact.join('+')"`,
  NO stars — `"all+read"`, `"605+self+read"`, `"2+type+read"`.
- `card-mod-rules-0.20.0/set/rule/rules.rb` — rule cards decompose as
  `set = trunk, setting = tag`; preferences drop the user part.
- `card-mod-permissions-0.20.0/set/all/permissions.rb` — `rule_class_name`:
  the cards.read_rule_class column value is the rule card's trunk's tag,
  i.e. the PATTERN CARD NAME (`*all`, `*self`).
- `card-1.110.0/lib/card/set/pattern/all.rb` — `patterns` (the lookup
  chain the rule walk rides): most-specific-first, drops first for new
  cards.
- `card-1.110.0/lib/card/set/pattern/class_methods.rb` —
  `pattern_applies?` default, `anchor_parts_count`, `module_key`,
  `generic_label`.

## Naming half — already in place

`src/card/set-patterns/rule-names.ts` (LANDED, wave 2 stream 9):

- `ruleName(setName, settingName)` — plain name join (e.g. `"*all" + "*read" -> "*all+*read"`).
- `ruleNamesForCard(card, settingName)` — ordered candidate names,
  pattern precedence order (most-specific first).
- `settingCardNameForCode(code)` — code→name lookup (`"read" -> "*read"`).
  Falls back to `"*"+code` when codename registry is unavailable.

These are the algebraic side; the lookup.ts stream adds the storage walk.

## Lookup half — new in this stream

`src/card/rules/lookup.ts`:

- `findRule(fetcher, card, settingCode)` — fetches each candidate in
  precedence order, returns the first hit (with full candidates list for
  diagnostics).
- `findRules(fetcher, card, settingCodes)` — multiple settings, returns
  one resolved rule per setting.
- `ruleCacheKey(anchorId, patternCode, settingCode)` — the codename-form
  cache key (for debugging / future rule-cache work).
- `nameAsPatternCardInput(name)` — wraps a plain name as a PatternCardInput
  for callers that haven't fetched a CardRecord.

## Application half — new in this stream

`src/card/rules/apply.ts`:

Rule cards in Ruby carry HAML or Ruby code that gets `class_eval`'d on
the pattern base class. This port does NOT replicate that metaprogramming.
Instead, rule cards here carry a structured JSON view definition in
db_content:

```json
{ "view": "open", "class": "rule-class", "wrap": "accordion",
  "tag": "h2", "titleClass": "large", "jointClass": "em",
  "anyExtraKey": "value" }
```

The contract:
- `view` is required (matches the requested render view: open/closed/
  content/title/...).
- Recognized keys (`wrap`, `class`, `tag`, `titleClass`, `jointClass`)
  map to surgical HTML transforms.
- Unknown keys land in `opts` so future versions can extend without
  breaking the engine.
- Non-JSON content (legacy HAML) returns `undefined` and the rule is
  skipped — the v2 stream handles those.

`applyViewOverride(baseHtml, override)` — runs the four surgical
transforms (`class` → card-slot class list, `titleClass` → title span,
`tag` → heading swap, `jointClass` → `+` joint span). Surgical only;
re-rendering for `wrap`/`view` changes is the caller's job (the rule
engine says "render THIS view with THESE adjustments", not "render
WHATEVER view this rule wants" — same separation Ruby uses).

`resolveViewOverride(view, rules)` — picks the rule whose `view` field
matches the requested view. Skips rules with non-parseable content.

## Test coverage

21 own tests (tests/card/rules/lookup.test.ts + integration.test.ts):
- Candidate generation (precedence order, includes *all, *self, type).
- Storage walk via the in-memory LocalSqliteDriver (the same path
  production takes, just with a temp DB).
- Junction-row rule cards (`*all+*read` etc.) seeded with leftId/rightId
  and resolved through the lexicon.
- JSON parse edge cases (empty, non-JSON, missing view, wrong types).
- HTML transforms (class append, titleClass swap, tag swap, joint styling).
- End-to-end: rule found → override applied → final HTML carries it.

Landing-time suite count is not restated here; the standing verification
surface is `tests/standing-net.json` (run via
`node tools/test-queue/run-standing-net.mjs`).

## Integration into the renderer

The rule engine is a library the renderer can opt into. The integration
call is two lines:

```ts
const rule = await findRule(this.fetcher, card, "*" + view);
const override = rule ? resolveViewOverride(view, [rule.rule]) : undefined;
const baseHtml = engine.views[view]({ fmt, voo });
return applyViewOverride(baseHtml, override);
```

This is left as a separate stream (render-rule-integration) because:
- the engine must keep working without rule cards (the demo deploy
  proves this — no rule cards, static HTML_VIEWS only)
- the integration is a render-path concern (warm-cache semantics, error
  envelopes) that the rule engine shouldn't dictate
- callers may want different rules for different views (e.g. only :open
  gets the override pass, :content is always raw)

## Out of scope (deferred)

- Mod loading (card-mod-* discovery + registration)
- Legacy HAML/Ruby rule content (the v2 stream)
- view caching (the rule walk results are fetched fresh every render;
  adding a cache keyed on (card_name, view) is the next perf lever)
- Edit-form rules (write-path integration)
- The codename registry integration in ruleCacheKey — currently the
  engine walks by name; codename-form cache keys are deferred until we
  have real production cards to test against
