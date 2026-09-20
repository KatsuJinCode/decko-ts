# Set-pattern registry port notes (decko-ts)

Port of the Decko set-pattern registry - the machinery that decides which
rule card applies to which card - to TypeScript. First piece of the
rules/permissions engine.

## Truth sources (read directly from the installed gems)

- `card-1.110.0/lib/card/set/pattern.rb` - the Pattern module (find, codes,
  ids, grouped_codes, reloadables, reset).
- `card-1.110.0/lib/card/set/pattern/class_methods.rb` - the class side:
  register (front-insert!), options accessors, `pattern_applies?` default,
  `anchor_parts_count` default, `module_key`, `generic_label` fallback.
- `card-1.110.0/lib/card/set/pattern/base.rb` - the instance side:
  anchor_name/anchor_id handling (`find_anchor_id`), `anchor_parts`,
  `to_s` (set name), `safe_key`, `module_key`, `rule_lookup_key`.
- `card-1.110.0/lib/card/set/pattern/all.rb` - the Card-instance side:
  `concrete_patterns`, `patterns` (new cards skip the first), `set_names`,
  `rule_lookup_keys`, `safe_set_keys`.
- `card-1.110.0/mod/core/set_pattern/01_all.rb .. 09_self.rb` - the nine
  core registrations (options + label/prototype_args/anchor overrides).
- `card-1.110.0/lib/cardio/mod/loader/set_pattern_loader.rb` +
  `module_template.rb` + `loader.rb` - HOW registration happens (file order,
  code derivation, the `register` postamble).
- `card-mod-rules-0.20.0/set/type/set.rb` - the reverse mapping (set card
  name -> pattern + anchor), labels, `rule_cache_key_base`.
- `card-1.110.0/lib/card/rule/all.rb` + `lib/card/rule/cache.rb` - the
  rule-name/lookup-key algebra.
- `card-mod-permissions-0.20.0/set/all/permissions.rb` (#rule_class_name) -
  the `cards.read_rule_class` derivation.
- `card-1.110.0/config/initializers/01_core_extensions/integer.rb` -
  `Integer#cardname` = `Card::Lexicon.name` (Base#pattern resolution).

## Registration mechanism: why the lookup order is REVERSED file order

Each pattern is one numbered file `mod/core/set_pattern/NN_code.rb`
(01_all .. 09_self). The SetPatternLoader loads them in sorted filename
order (`loader.rb#each_file_in_dir` uses `Dir.glob(...).sort`), strips the
`NN_` prefix for the code (`loader.rb#parts_from_path`), and appends
`register "<code>".underscore.to_sym, (options || {})` to each file
(`SetPatternTemplate#postamble`).

`register` (`pattern/class_methods.rb`) does
`Pattern.concrete.insert opts.delete(:index).to_i, self`. **No core pattern
passes `:index`**, so `nil.to_i == 0` and every registration FRONT-INSERTS.
The concrete table ends up in reverse load order - this is the lookup /
precedence order. (Mods could pass `index:` to position themselves; none of
the installed card-mod-* gems ship a set_pattern dir at all.)

The pattern code is the UNDERSCORED codename (`:type_plus_right`), while the
codename of the pattern card is spaced (`type plus right`) - the registry
accepts the underscored form everywhere (`findPattern("type_plus_right")`).

## The registry table

Lookup order (most specific first). `id` = pattern card id in the ORACLE
deck (deck-specific; resolved through the codename registry at runtime).

| file | code | pattern card | id | options | anchor | set name shape | rule name (add `+<setting>`) | rule lookup key |
|---|---|---|---|---|---|---|---|---|
| 09_self | `self` | `*self` | 27 | - | the card's full name | `<name>+*self` | `X+*self+*read` | `<cardId>+self` |
| 08_type_plus_right | `type_plus_right` | `*type plus right` | 25 | compound_only, assigns_type, anchor_parts_count=2 | `<left type>+<tag>` | `<Type>+<field>+*type plus right` | `T+f+*type plus right+*read` | `<anchorCardId>+type_plus_right` |
| 07_right | `right` | `*right` | 26 | compound_only, assigns_type | the card's tag | `<field>+*right` | `f+*right+*read` | `<fieldCardId>+right` |
| 06_rule | `rule` | `*rule` | 24 | compound_only | anchorless | `*rule` | `*rule+*read` | `rule` |
| 05_rstar | `rstar` | `*rstar` | 23 | compound_only | anchorless | `*rstar` | `*rstar+*read` | `rstar` |
| 04_star | `star` | `*star` | 22 | - | anchorless | `*star` | `*star+*read` | `star` |
| 03_type | `type` | `*type` | 21 | - | the card's type (name + id) | `<Type>+*type` | `T+*type+*read` | `<typeId>+type` |
| 02_all_plus | `all_plus` | `*all plus` | 20 | compound_only | anchorless | `*all plus` | `*all plus+*read` | `all_plus` |
| 01_all | `all` | `*all` | 7 | - | anchorless | `*all` | `*all+*read` | `all` |

Applies? per pattern (override or the `compound_only? ? name.compound? :
true` default): self/all -> always; all_plus/right/type_plus_right/rule ->
compound cards; star -> `name.star?`; rstar -> `name.rstar?`; type ->
`!!type_id` (new cards have the default type, so they match); rule ->
`card.rule?` (ported as the `isRule` input flag; Ruby derives it in
`lib/card/rule/all.rb#rule?` from the part types).

Key semantics carried per instance (`PatternInstance`, instance.ts):

- `setName` - `Base#to_s`: pattern card for anchorless, `anchor+*pattern`
  for anchored. This is the SET CARD name in storage.
- `ruleLookupKey` - `Base#rule_lookup_key`: bare code (anchorless) or
  `<anchor id>+<code>`; **nil when the anchor card has no id** - and
  `All#rule_lookup_keys` compacts nils away, so a set whose anchor card does
  not exist contributes no lookup key even though its set name appears in
  `patterns` (oracle-verified for new cards and for
  `Set+*read+*type plus right` on the `*all+*read` card).
- `safeKey` - `Base#safe_key`: `CODE-<anchor.safe_key>`; the anchor's
  safe_key turns `*` into `X` and `+` into `-` (cardname variants.rb), e.g.
  `SELF-Xall-Xread`, `TYPE_PLUS_RIGHT-rich_text-child_one`.
- `moduleKey` - `Base#module_key`: anchorless -> `All`/`Star`/...;
  anchored -> `Type::Basic`-style, built from the pattern code plus anchor
  part CODENAMES (all-or-nothing: any part without a codename -> nil).
  Note the RichText cardtype card's codename is `basic` (renamed card,
  kept codename) - oracle-verified `Type::Basic` vs safe key
  `TYPE-rich_text`.
- `anchorParts` / `anchorPartsCount` - `Base#anchor_parts`: for
  multi-part patterns, anchors longer than the count split into a joined
  head + trailing parts (`A+B+*self` comment in base.rb); *self's count is
  the anchor's own part count (09_self.rb override).

## Rule-name algebra (rule-names.ts) - the naming half only

- Rule cards live at `<set name>+<setting card name>`
  (`lib/card/rule/cache.rb#sql`: rules.left_id = sets.id, rules.right_id =
  settings.id). `ruleName(set, setting)` joins the two names.
- The read machinery consults, in precedence order, the candidate names
  `setNamesForCard(card).map(|set| set + "+" + setting)` - oracle:
  "Oracle Junction" + `*read` -> `["Oracle Junction+*self+*read",
  "RichText+*type+*read", "*all+*read"]`, and the actual rule card resolved
  for that probe is `*all+*read` (id 10).
- Cache keys are CODENAME-based, no stars:
  `Rule::Cache#lookup_key` = `[anchor_id, pattern_code, setting_code]
  .compact.join("+")` (e.g. `all+read`, `606+self+read`, `2+type+read`);
  the card side builds the same key from `ruleLookupKey + "+" +
  settingCode` (`Rule::All#rule_id_lookup`).
- Preference fallback: `"<settingCode>+<userId>"` then
  `"<settingCode>+<allId>"` (`Rule::All#preference_card_id`).
- `cards.read_rule_class` = the consulted rule card's trunk tag when its
  trunk is a Set (`permissions.rb#rule_class_name`): the PATTERN CARD NAME
  with star - oracle: `*all+*read` -> `*all`,
  `Oracle Restricted+*self+*read` -> `*self`. The read-rule cascade
  (card-mod-permissions `set/right/read.rb#pattern_index`) orders patterns
  by `Pattern.ids.index(pattern_id)` - i.e. this registry's lookup order.
- `ruleSetCardName`/`ruleSettingCardName` decompose a rule card
  (`card-mod-rules set/rule/rules.rb#rule_set_name/#rule_setting_name`);
  preference cards (SET+USER+SETTING) drop the user part.

## Environment

Ids and codenames resolve through the NAME layer's environment
(`src/card/name/environment.ts` - `setNameEnvironment`), the same way Ruby
resolves through `Card::Lexicon` + `Card::Codename`:

- `pattern_id` (`Pattern.ids`) = codename registry `id(code)`.
- `anchor_name.card_id` (right/tpr lookup keys) = lexicon `id(key)`.
- pattern card names (`Base#pattern`) = lexicon `name(codename id)`.
- `module_key` codenames = `DeckoName.codename` (lexicon id ->
  `nameForId`).

Without an environment: set names, safe keys, labels and the anchorless
lookup keys all work; anchored lookup keys and pattern ids need the
lexicon/codename registries (the card fetch layer provides them from
storage).

## TS surface

`src/card/set-patterns.ts` (barrel) ->
- `set-patterns/registry.ts` - PATTERN_TABLE + findPattern/patternCodes/
  patternIds/groupedCodes/reloadableCodes
- `set-patterns/instance.ts` - PatternInstance (Base port)
- `set-patterns/card-patterns.ts` - per-card queries (concretePatternsForCard,
  patternsForCard, setNamesForCard, ruleLookupKeysForCard, safeSetKeysForCard,
  typeAssigningModuleKeys)
- `set-patterns/set-name.ts` - parseSetName + parsed-set accessors
- `set-patterns/rule-names.ts` - rule naming + cache-key algebra
- `set-patterns/labels.ts` - label/short_label/generic_label ports

`PatternCardInput` (types.ts) is the card state the registry reads: name,
id, isNew, typeId, typeName, leftTypeName (tpr left-type; default
"RichText" mirrors quick_type), isRule.

## Oracle verification

Live verification: read-only `decko runner` probes against
`tools/oracle/decko-oracle-app` (card-1.110.0 / decko-0.20.0, SQLite deck),
generators + captures committed here:

- `set-pattern-oracle-probe.rb` -> `set-pattern-oracle-capture.json`
  (registry table, per-card patterns/lookup keys/safe keys for 5 cards,
  new-card behavior, rule-name check, set-card parsing, labels,
  rule_class_name).
- `set-pattern-oracle-probe2.rb` -> `set-pattern-oracle-capture2.json`
  (module keys, per-instance safe keys, tpr set labels, rule_cache_key_base).

Status per pattern: ALL NINE patterns verified live - table position,
options, set names, lookup keys, prototype args (resolved prototype name),
and labels come from the captures; `tests/card/set-patterns/
oracle-parity.test.ts` re-asserts the TS output against both capture files.

Upstream quirks found and ported verbatim (each cited in tests):

1. **Front-insert registration** - reverse file order is the lookup order
   (class_methods.rb#register `insert opts.delete(:index).to_i`).
2. **New cards skip the first concrete pattern** (`pattern/all.rb#patterns`,
   `concrete_patterns[1..]`) - in practice the *self set.
3. **Nil lookup keys are compacted away** - sets whose anchor card does not
   exist are unnameable in the rule cache even though the set name exists.
4. **module_key uses anchor CODENAMES, safe_key uses the NAME** - and the
   RichText cardtype's codename is `basic` (`Type::Basic` vs
   `TYPE-rich_text`, same card).
5. **`uncapitalized_label` always returns ""** - `label = label.to_s`
   shadows the method with a nil local at parse time (set/type/set.rb);
   oracle-confirmed "" for real sets with real labels. Ported verbatim.
6. **tpr label with a one-part anchor** renders `on "" cards` /
   `on "s"` (label interpolates the empty left) - oracle-confirmed.
7. **`rule_cache_key_base` interpolates nils** ("" or `"<id>+"` shapes)
   for codename-less sets; the port returns undefined for unresolvable
   parts (documented divergence, resolvable cases byte-equal).

## What the next stream (rule lookup over storage) needs from here

- The candidate walk is `ruleLookupKeysForCard(card)` (id-based, precedence
  order) x `settingCode`, i.e. `ruleCacheKey(lookupKey, code)` per entry,
  first hit in the rule cache wins (`Rule::All#rule_id_lookup`). The cache
  itself is populated by the SQL in `lib/card/rule/cache.rb` (port with the
  fetch layer: rules joined to sets/settings by type_id, trash-false).
- `read_rule_class` / `read_rule_id` writes come from
  `permission_rule_id_and_class` (permissions.rb): rule id via the walk,
  class via `ruleClassName(ruleCardName, trunkIsSet)`.
- Preference lookup adds the user-suffixed keys
  (`preferenceCacheKeys`).
- `patternIds` (codename registry) feeds the read-rule cascade's
  `pattern_index` comparisons (card-mod-permissions set/right/read.rb).

## Deferred

- Pattern MODULE loading (Card::Set modules per set, `module_list`) - mod
  system, wave 3. `moduleKey` is ported for parity; `module_list` lookup
  against `Card::Set.modules` is not.
- Prototype instantiation (`Type::Set#prototype`, `prototype_args` ->
  Card.new with supercard) - Card layer; the ARG SHAPES are ported.
- `rule?` derivation from storage (`standard_rule?`/`preference?` type
  checks) - callers pass `isRule` until the fetch layer exposes type ids.
- Permission checks themselves - later rules stream.
- Pattern registration by mods (`register` with `index:`) - wave 3 mod
  system; the default table is frozen.

## Test counts

`tests/card/set-patterns/`: 135 tests across 5 files (registry, per-pattern
semantics, set-name parsing, rule names, oracle parity) - all green; the
parity file asserts against the two live captures.
