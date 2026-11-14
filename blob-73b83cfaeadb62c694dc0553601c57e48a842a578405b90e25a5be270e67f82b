# Treewalk row `reg-treewalk-c2-name-rb-name-all-all-descendants-all-parts-card-cl`

Verification ledger for the five `lib/card/name/` sub-files the tree-walk
coverage pass never read. The pass recorded them in
`rubyFilesUnread` (`tmp/bulk-parity-2026-10-19/treewalk-coverage.json`) and
left their names unverified; this file closes that.

Scope: every `def` (and the one `alias_method`) in

| file | defs |
| --- | --- |
| `name/all.rb` | 17 defs |
| `name/all/descendants.rb` | 6 defs |
| `name/all/parts.rb` | 10 defs |
| `name/card_class.rb` | 3 defs |
| `name/name_variants.rb` | 7 defs |
| total | **42 defs + 1 alias** |

Ruby source: the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-1.110.0/`
(`gems/` is the pinned `ruby/3.4.0` install; the row's `sourceParent` names
card-1.110.0). No other version of `card` was consulted.

Status vocabulary: **VERIFIED** (the port matches the Ruby, named test pins
it), **VERIFIED-INLINE** (the port carries the semantics at its call site
with the Ruby line cited, no same-named function — named test pins it),
**SKIP** (no port counterpart and no reachable port caller, or the pinned
gemset itself never calls it — the citation is the evidence).

---

## name/all.rb — `Card::Name::All` (included into Card at lib/card.rb:157)

| Ruby | port | status + evidence |
| --- | --- | --- |
| `name` :12-14 | `src/card/fetch/card-record.ts:137-154` (`composeCardRecord`), `src/card/actions/card-action-engine.ts:5910` (`composedNameOf`) | VERIFIED-INLINE — `left_id ? Lexicon.lex_to_name([left_id, right_id]) : column`. Tests: `tests/card/fetch/fetch.test.ts` "composes compound names via the lexicon, not the (NULL) column (name/all.rb:13)" and "fetches compound cards by name through the lexicon's side ids"; `tests/card/fetch/compound-name-resolution-order.test.ts` (5 tests). |
| `cardname` :15 (alias) | same two sites | VERIFIED-INLINE — an alias, not a second behaviour; the port stores one name per record (`CardRecord.name`). Same tests. |
| `key` :17-19 | `card-record.ts:141-145`, `card-action-engine.ts:5919` (`keyOf`) | VERIFIED-INLINE — `left_id ? name.key : column`. Test: `fetch.test.ts` "writes fetched cards to the cache under their KEY (write_to_cache: cache.write card.key, card)". |
| `name=` :21-27 | `src/card/history/write-path.ts:1033-1048` (`assertNameKeyConvention`), `card-action-engine.ts:3179-3186` | VERIFIED-INLINE — the column half (`write_attribute :name, simple? ? s : nil`) is enforced at the writer boundary: compound cards must carry `name = key = NULL`, simple cards both. Tests: `tests/card/actions/update.test.ts` "rewrites name+key columns, records a name change row (key is NOT tracked)", "rewires right_id and keeps name/key NULL; change row is right_id only", "renames a junction to a simple name: sides clear, columns fill". |
| `[]` :29-37 | none | SKIP — the Integer/Range arm joins a part window and fetches the card named by it. Its only pinned-gemset callers are `card-mod-rules-0.20.0/set/rule/rules.rb:26` (`rule_set`) and `:75` (`set_prototype`), both on rule cards, both spelled `rule_set`/`set_prototype`/`prototype` — concepts the port's rule layer does not have (its rules resolve set names by candidate walk, `src/card/rules/lookup.ts:52-77`). The absence belongs to the card-mod-rules row, not this one. |
| `autoname` :39-45 | `card-action-engine.ts:1775-1793` (`autonamedCreateInput`) | VERIFIED — see the `Card.exist?` measurement below. Tests: `tests/card/actions/create.test.ts` "createCard autoname rule (installed core autoname_spec.rb)" — 8 tests including "uses the seed, then advances past existing names without rule history", "reuses the stored seed when its previous card is trashed", "treats canonical-name collisions as occupied and uses Ruby succession". |
| `update_superleft` :47-50 | none | SKIP — sets `@superleft` when the new name is a field of the supercard's name. Callers: `lib/card/fetch/results.rb:66`, `lib/card/subcards/add.rb:56`, `all.rb:96`. The port stores no supercard/supercard attribute; it derives the left side from `name.leftName` (e.g. `src/card/permissions/read-rules.ts:621-640`). The port therefore always takes the `else` branch of `left` (below) — a named, documented difference, not a silent one. |
| `update_subcard_names` :52-58 | `card-action-engine.ts:962-1128` (`saveSubcardsInWriter`) | VERIFIED-INLINE — new subcards of a renamed supercard are re-saved under the new supercard name in the same act. Tests: `tests/card/actions/update.test.ts` "renaming a part cascades VIRTUALLY: zero row writes for junction descendants"; `tests/card/actions/renamegate-rename-created-sides-verdicts.test.ts` (8 tests). |
| `id_string` :60-62 | `src/card/fetch/card-record.ts:113-115` (`idString`), used at `src/card/fetch.ts:708` | VERIFIED — `"~#{id}"`. Test: `tests/card/fetch/fetch.test.ts` "expireCard deletes the legacy '~id' key too (cache/all.rb#expire_id id_string)". |
| `key=` :64-72 | `write-path.ts:1033-1048` | VERIFIED-INLINE — the column half (`write_attribute :key, simple? ? newkey : nil`) is the writer assertion above; Ruby's early return (`return if newkey == key`) is the engine's no-change path. Tests: same three `update.test.ts` name/key tests. |
| `assign_side_ids` :76-83 (private) | `card-action-engine.ts:3182-3184` | VERIFIED-INLINE — simple ⇒ both ids NULL; compound ⇒ both sides resolved. Test: `update.test.ts` "renames a junction to a simple name: sides clear, columns fill". |
| `assign_side_id` :87-90 (private) | `card-action-engine.ts:3190-3196`, header at `:5353-5368` | VERIFIED-INLINE — `Lexicon.id(name.send(side_name))`. The `-1` placeholder for a not-yet-stored side has no durable counterpart here: the port creates the side inside the same act and writes its real id, so no row is ever written with `-1`. Test: `tests/card/actions/obstructed-self-side-rename-write.test.ts` (2 tests). |
| `superize_name` :92-98 (private) | — | SKIP — the subcard of a supercard is renamed through the supercard's own subcard list, then the name is made absolute against the supercard. Only reachable through `name=` on a card that has `@supercard`, which the port never sets (same mechanism as `update_superleft` above). |
| `clean_patterns` :100-105 (private) | `card-action-engine.ts:2666-2676` (documented at the rename permission gate) | VERIFIED-INLINE — patterns rebuild from the assigned name before the validate-stage check. Test: `tests/card/actions/update.test.ts` "rejects renaming onto a live name; allows same-key variants". |
| `update_cache_key` :107-111 (private) | `src/card/fetch.ts:708` + the writer's expire path | VERIFIED-INLINE — the temp-cache entry keyed by the old key is rewritten. Tests: `tests/card/actions/rename-referer-cache-staleness.test.ts` (4 tests); `tests/card/fetch/cache.test.ts` (25 tests). |
| `update_subcard_name` :113-118 (private) | `card-action-engine.ts:1093-1112` | VERIFIED-INLINE — same mechanism as `update_subcard_names`. Same tests. |
| `name_to_replace_for_subcard` :120-130 (private) | — | SKIP — its branch (`"".to_name` when the subcard name starts with a joint and the new name has parts) is the relative-field rename repair; with no supercard/name-swap surface in the port there is no call site that could reach it. Same tests as `update_subcard_names` cover the paths that exist. |

## name/all/descendants.rb — `Card::Name::All::Descendants`

| Ruby | port | status + evidence |
| --- | --- | --- |
| `field_cards` :9-11 | `src/card/permissions/set-read-rule.ts:391-399` (`cascadeAllFieldReadRules`), `:404-425` (`cascadeLeftRuleFieldReadRules`) | VERIFIED-INLINE — ids, then rows; Ruby's `field_ids.map(&:card)` with `Auth.as_bot`. Only caller: `card-mod-permissions-0.20.0/set/all/permissions.rb:179` (`each_field_as_bot`). Tests: `tests/card/permissions/read-rule-left-delegation.test.ts` (describe "read-rule _left delegation (permissions.rb:55-71, read side)"); `tests/card/permissions/read-rule-derive-and-codename-reset-oracle.test.ts`. |
| `field_names` :13-15 | none | UNUSED — `grep -rn --include=*.rb --include=*.haml -E "(^\|[^_.a-z])field_names"` over `card-1.110.0`, `decko-0.20.0`, `card-mod-*` and `cardname-0.20.0` returns exactly one line, the definition itself (`lib/card/name/all/descendants.rb:13`). The card-mod-content hits are `nested_field_names` (chunk.rb:42), a different method. Recorded, not ported. |
| `field_ids` :17-19 | `set-read-rule.ts:427-433` (`fieldCardIds`) | VERIFIED-INLINE — `child_ids :left`. Same tests. |
| `each_child` :21-29 | `card-action-engine.ts:5928-5934` (`childRows`), `src/card/actions/update-referer-content.ts:463-485` | VERIFIED-INLINE — `(left_id = ? OR right_id = ?) and trash is false`. Callers: `trash.rb:49` (`delete_children`) and `each_descendant` itself. Tests: `tests/card/actions/delete.test.ts` "deletes junction children recursively; PARTS survive", "deletes each diamond child exactly once (visited set)", "subcard deletes skip validate_delete down the tree (validate: false)". |
| `child_ids` :32-39 | `card-action-engine.ts:5937-5943` (`childIds`), called at `:3080` | VERIFIED-INLINE — one side, trash excluded. Caller: `mod/core/set/all/name_events.rb:100` (`changed_from_simple_to_compound? && child_ids(:right).present?`). Test: `tests/card/actions/update.test.ts` "rejects simple->compound when the card is in use as a tag (name_events.rb:90-101)". |
| `each_descendant` :41-46 | `update-referer-content.ts:456-518` (`rewriteDescendantReferers`), header `:63-80` | VERIFIED-INLINE — same graph (left OR right, trash excluded), breadth-first. Documented difference: the port computes each descendant once, Ruby re-walks subtrees per descendant (header lines :74-78). Test: `tests/card/actions/update.test.ts` "renaming a part cascades VIRTUALLY: zero row writes for junction descendants"; `tests/card/actions/rename-referer-cache-staleness.test.ts`. |

## name/all/parts.rb — `Card::Name::All::Parts`

| Ruby | port | status + evidence |
| --- | --- | --- |
| `left` :6-15 | `src/card/permissions/read-rules.ts:621-640` | VERIFIED-INLINE for the `else` branch (`Card.fetch(name.left)`), SKIP for the `superleft` branch (no `@superleft` in the port — see `update_superleft` above). Test: `tests/card/permissions/read-rule-left-delegation.test.ts` "renders a compound card whose winning read rule says _left through its LEFT card's rule". |
| `left_or_new` :17-19 | `read-rules.ts:621-652`, `set-read-rule.ts:222-258` | VERIFIED-INLINE — `left(args) || Card.new(name: name.left)`, inlined at both permission call sites with citations. Tests: same two permission files. |
| `right` :21-23 | `card-action-engine.ts:3179-3196` (side resolution), `src/card/actions/name-validation.ts` | VERIFIED-INLINE — the tag side is resolved by name through the lexicon. Test: `update.test.ts` "rewires right_id and keeps name/key NULL; change row is right_id only". |
| `trunk` :25-27 | `name.leftName` / `DeckoName.trunk` uses throughout the rule walk; the Card-level fetch at `read-rules.ts:621-640` | VERIFIED-INLINE — `simple? ? self : left`, i.e. a simple card is its own trunk and a compound card's trunk is its left card. (The name-level `#trunk_name` is the cardname gem, tested separately: `tests/card/name/name-port.test.ts` "#trunk / #trunk_name / #trunk_key".) Card-level pinning test: `tests/card/permissions/read-rule-left-delegation.test.ts` "renders a compound card whose winning read rule says _left through its LEFT card's rule". |
| `tag` :29-31 | `name.rightName` uses (`card-action-engine.ts:5440`, `rule-content-walk.ts:245`) | VERIFIED-INLINE — `simple? ? self : Card.fetch(name.right)`. Card-level pinning test: `tests/card/actions/update.test.ts` "rewires right_id and keeps name/key NULL; change row is right_id only". (The name-level `#tag_name` is the cardname gem: `name-port.test.ts` "#tag / #tag_name / #tag_key".) |
| `right_id=` :33-35, `left_id=` :37-39 | `card-action-engine.ts:3182-3196` | VERIFIED-INLINE — both go through the one side writer. Tests: the same `update.test.ts` side tests. |
| `write_card_or_id` :43-45 (private) | inlined into the side resolution above | VERIFIED-INLINE. |
| `when_id_exists` :47-55 (private) | inlined (id → write; new card → store first; else write through) | VERIFIED-INLINE. Test: `obstructed-self-side-rename-write.test.ts`. |
| `with_id_after_store` :60-63 (private) | the act's subcard-before-supercard stage order (`card-action-engine.ts:2062`, `:1093-1112`) | VERIFIED-INLINE — Ruby saves the side first and yields its id afterwards; the port orders side saves before the compound's own store in the same act (director/store.rb:37-58 is cited at `:2062`). Test: `tests/card/actions/save-lifecycle-order.test.ts`. |

## name/card_class.rb — `Card::Name::CardClass` (extended into Card at lib/card.rb:134)

| Ruby | port | status + evidence |
| --- | --- | --- |
| `generate_alternative_name` :20-24 | `src/card/pods/eat.ts:388-396` (`alternativeName`) | VERIFIED — `"#{name} 1"` counted up while a card of that name exists. The existence test is `lexicon.id(candidate)`, which is `lex_to_id` with `trash: false` (`src/card/fetch/lexicon.ts:8-9`, `:489-494`) — the same real-card, trash-excluded test `Card.exist?` performs. Callers: `director/card_class.rb:138,158,166` and `uniquify_name` below; the port reaches them through `eat.ts:300-336` (the three conflict modes). Test: `tests/tools/pod-features.test.ts` "conflict modes and codename-versus-name resolution leave Ruby's rows" — **NOT RUN in this pass** (it is gated by `it.runIf(RUN)`, `pod-features.test.ts:33`, which needs the Ruby-oracle deck; reported as not run rather than as passing). |
| `alternative` :45-47 | `eat.ts:388-396` | VERIFIED — `Card.generate_alternative_name self`, same function. Same not-run test; also `create.test.ts` "treats canonical-name collisions as occupied and uses Ruby succession" covers the successor chain. |
| `rename!` :5-7 | none | SKIP — its only caller in the pinned gemset is `uniquify_name` (`card_class.rb:16`). |
| `uniquify_name` :9-18 | none | SKIP — its only caller is `lib/card/model/save_helper/save_arguments.rb:47`, reached from `save_helper.rb:37` (`update_card name, args.reverse_merge(rename_if_conflict: :new)`). The port's model layer exposes no `rename_if_conflict` option and no name-keyed `update_card` (`grep -rn "rename_if_conflict\|renameIfConflict" src/` → no hits), so neither the caller nor the callee has a port call site. `generate_alternative_name`, the shared half, is ported (above). |

## name/name_variants.rb — `Card::Name::NameVariants` (included into Card::Name at lib/card/name.rb:13)

| Ruby | port | status + evidence |
| --- | --- | --- |
| `vary` :10-15 | `src/card/name.ts:993-999` + `applyVariant` `:1099-1128` | VERIFIED — the variant list, the four aliases, the ignore-unknown rule and the `[,\s]+` split. Test: `name-port.test.ts` "#vary". |
| `standard` :18-26 | `src/card/name.ts:1007-1015` | VERIFIED — lexicon name per part, blank ⇒ self. Test: `name-port.test.ts` "#standard — maps parts to their lexicon-registered names". |
| `card` :28-30 | none | SKIP — `Card.fetch self, new: {}`. Callers in the pinned gemset are one-time data transforms (`mod/core/data/transform/20130411191151_renaming_for_menu.rb:15`, `card-mod-account-0.20.0/data/transform/20220815112551_move_roles.rb:32`) and specs — no runtime caller. The one method that called it from library code, `field_cards` (descendants.rb:10), is ported by id instead (`set-read-rule.ts:427-433`). |
| `card_id` :32-34 | `src/card/name.ts:1018-1020` | VERIFIED. Test: `name-port.test.ts` "#card_id / #codename / #codename_or_string". |
| `codename` :37-39 | `src/card/name.ts:1023-1027` | VERIFIED. Same test. |
| `codename_or_string` :41-43 | `src/card/name.ts:1030-1032` | VERIFIED. Same test. |
| `@@variant_aliases` :7-8 | `applyVariant` cases, `src/card/name.ts:1101-1108` | VERIFIED — four aliases, inlined into the switch. Same test. |

---

## The `Card.exist?` measurement behind `autoname` and `generate_alternative_name`

Both names turn on what `Card.exist?(name)` means, and the naive reading
is wrong, so it was measured rather than assumed.

`Card < Cardio::Record < ActiveRecord::Base`
(`lib/card.rb:131`, `lib/cardio/record.rb:2-4`), and no `exist?` is defined
anywhere in `card-1.110.0` (361 `.rb` files), `decko-0.20.0` or
`card-mod-core-0.20.0` — `grep -rn --include=*.rb -E "def +(self\.)?exist\?"`
over the whole oracle tree returns only `Card::Cache` (cache.rb:89,
cache/shared.rb:128, cache/temporary.rb:71) and `Card::Codename`
(codename.rb:75). The first reading was therefore ActiveRecord's own.

A probe against the pinned stack
(`tmp/card-exist-probe/probe_card_exist_semantics.rb`, run with
`GEM_HOME=GEM_PATH=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0`,
`cards` created with `id: :integer` exactly as `db/schema.rb:78` does)
measured that reading to be **false** for every ordinary name:

```
Card.exist?(b1):       false   (live card named b1)
sql for exists?(b1):   SELECT 1 AS one FROM "cards" WHERE "cards"."id" = NULL LIMIT 1
Card.exists?('1'):     true    (numeric string)
```

That would make `autoname` (all.rb:40) dead and would contradict the pinned
spec `mod/core/spec/set/all/autoname_spec.rb:12-23` ("increments again if
name already exists" ⇒ "b2"; "handles trashed names" ⇒ the trashed name is
reusable). The contradiction is resolved by the core mod:
`mod/core/set/all/states.rb:17-22` defines `ClassMethods#real?(mark) =
quick_fetch(mark).present?` and aliases **`exist?` and `exists?` to it**. So
the class method is name-aware after all, and `quick_fetch`
(`lib/card/fetch/card_class.rb:54-56`) resolves with `trash: false`
(`lib/card/fetch/retrieve.rb:31`) — which is exactly why a trashed name is
free.

Mechanism, stated once: `autoname` advances a name while a **real,
non-trashed, non-virtual** card holds it (or while a director for that key is
live in the current act, `Director.include?`,
`lib/card/director/class_methods.rb:61-63`). The port's loop
(`card-action-engine.ts:1786-1791`) advances on a live row and frees a
trashed one — the same rule. `alternativeName`'s `lexicon.id` probe is
`lex_to_id` with the same `trash: false` filter.

The second disjunct, `Director.include?` (a same-act claim), has no
reachable arm in the port: the autoname branch runs once per create, only
when the main name is blank (`card-action-engine.ts:1821-1823`), and a
subcard always carries a name (`saveSubcardsInWriter` composes
`mainName + "+" + key`, `:975`), so no second autoname can run inside one
act. Named skip, mechanism above.

## Battery

Run in this worktree (`C:/localProjects/decko-ts-treewalk-names-20261020`,
branch `port/treewalk-names-20261020`):

- `./node_modules/.bin/vitest run tests/card/name/name-port.test.ts` — 243
  passed (243)
- `./node_modules/.bin/vitest run tests/card/fetch/` — 97 passed (97),
  7 files
- `./node_modules/.bin/vitest run tests/card/actions/create.test.ts
  tests/card/actions/update.test.ts tests/card/actions/delete.test.ts` —
  38 passed (38)
- `./node_modules/.bin/vitest run
  tests/card/actions/obstructed-self-side-rename-write.test.ts
  tests/card/actions/renamegate-rename-created-sides-verdicts.test.ts
  tests/card/actions/refresh-references-in.test.ts
  tests/card/actions/rename-referer-cache-staleness.test.ts
  tests/card/actions/input-abuse-name-validation.test.ts` — 37 passed (37)
- `./node_modules/.bin/vitest run
  tests/card/permissions/read-rule-left-delegation.test.ts
  tests/card/permissions/read-rule-derive-and-codename-reset-oracle.test.ts
  tests/card/actions/save-lifecycle-order.test.ts` — 18 passed (18)

Not run: `tests/tools/pod-features.test.ts` (Ruby-oracle gated, see the
card_class.rb table), the rest of `tests/card/permissions/*`, and the full
`tests/card/actions/` directory — a whole-directory run exceeded the working
window and was cancelled, so only the files named above are reported as
passed. No source file changed in this pass; the ledger is the only
artifact.
