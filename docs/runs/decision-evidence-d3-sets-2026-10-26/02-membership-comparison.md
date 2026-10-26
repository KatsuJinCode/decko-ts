# Decision 3 receipt: per-set membership comparison

## Method

1. Port side: the installed modules' set definition data, read
   programmatically from the 31 manifests the ModLoader composes
   (`defaultDeckSources()`, src/card/mod-loader/default-mod-deck.ts;
   enumeration harness output in 01-declaration-list.md's header).
2. Ruby side: every .rb file under set/ in the pinned gems
   (C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems): card-1.110.0 mod/core/set and every
   card-mod-*/set tree. Files whose first line matches
   set_template.rb:47-53's `/\A#!\s?not? set module/` are helper
   modules and register nothing; they are listed, not counted as
   set declarations.
3. Matching key: the normalized set path, identical rule both
   sides (strip .rb, strip segment-leading NN_ prefixes). The
   port's declared setPath strings keep the NN_ prefixes (the strip
   runs later, in setModuleShortname's camelizedSegments, mod-registrar.ts:37-42); normalization is applied to both sides.

## The set patterns (shared junction machinery)

Every set on both sides instantiates one of nine core patterns.
Ruby registers them from card-1.110.0 mod/core/set_pattern/01_all.rb
.. 09_self.rb; the port carries the same nine as PATTERN_TABLE
(src/card/set-patterns/registry.ts), each entry naming its Ruby
source file. Options compared as data (Ruby column read off each
file's @@options block, absent = false; port column read off the
enumeration dump of PATTERN_TABLE):

| pattern code | Ruby source | compound_only (Ruby / port) | assigns_type (Ruby / port) |
|---|---|---|---|
| all | set_pattern/01_all.rb | false / false | false / false |
| all_plus | set_pattern/02_all_plus.rb | true / true | false / false |
| type | set_pattern/03_type.rb | false / false | false / false |
| star | set_pattern/04_star.rb | false / false | false / false |
| rstar | set_pattern/05_rstar.rb | true / true | false / false |
| rule | set_pattern/06_rule.rb | true / true | false / false |
| right | set_pattern/07_right.rb | true / true | true / true |
| type_plus_right | set_pattern/08_type_plus_right.rb | true / true | true / true |
| self | set_pattern/09_self.rb | false / false | false / false |

Nine of nine match. The type_plus_right pattern additionally carries
@@options anchor_parts_count: 2 (08_type_plus_right.rb:1-5); the
port names it in the registry (registry.ts:82) and carries the
*self pattern's dynamic anchor_parts_count as
anchorPartsCountFor (registry.ts:110-113, 09_self.rb).

Lookup order: Ruby's Pattern.concrete ends in reverse file order
([self, type_plus_right, right, rule, rstar, star, type, all_plus,
all], registry.ts header); the port's table is the same nine codes
in the same order (verified in the enumeration dump).

## Junction membership per set

A recorded set's membership is path-derived: pattern code plus
anchor. Every matched line in 01-declaration-list.md pairs a
declaration whose normalized path equals the recorded set's, so the
name/pattern and the junction the set names are identical by
construction; the not-equal lines are the 36 sets with no port
declaration at all. Two declared mechanisms carry the
"is this card in the set" question in the port:

- the default NAME predicate (cardBelongsToSet, content-overrides.ts),
  comparing the set path's anchor against the card's name keys;
- `membership: "set-module-chain"` (Ruby's own question, Pattern::Base
  module_key over anchor codenames, set/pattern/base.rb:21-29),
  declared on exactly two set modules: follow's right/followers and
  follow's type_plus_right/user/follow, both starred-codename
  anchors the name comparison cannot see (mod-manifest.ts:516-541).

The date family (right/when_created and friends) keeps the name
predicate deliberately: the chain predicate is correct there too but
would shadow the date content overrides at load order (the named
decision in mod-manifest.ts:531-541). This is a declared loading
decision, not a membership difference: with the name environment
installed the same cards resolve (MEASURED, per the manifest note).

### Multi-contributor sets (Ruby's one set module, many files)

Ruby reopens one set module across mods; 17 recorded set paths hold
more than one file. The port declares the same paths once per
contributing mod (SetModuleBasket dedupe, mod-registrar.ts:165-179):

| set path | recorded files | port declarations |
|---|---|---|
| abstract/items | collection: set/abstract/items.rb; layout: set/abstract/items.rb | collection: abstract/items, layout: abstract/items |
| abstract/list | layout: set/abstract/list.rb; list: set/abstract/01_list.rb | list: abstract/01_list |
| all/content | core: set/all/content.rb; format: set/all/content.rb | core: all/content, format: all/content |
| all/debug | core: set/all/debug.rb; monkey: set/all/debug.rb | core: all/debug |
| right/account | account: set/right/account.rb; api_key: set/right/account.rb; follow: set/right/account.rb | account: right/account, api_key: right/account, follow: right/account |
| right/head | format: set/right/head.rb; layout: set/right/head.rb | format: right/head, layout: right/head |
| self/admin | core: set/self/admin.rb; carrierwave: set/self/admin.rb; recaptcha: set/self/admin.rb | core: self/admin, carrierwave: self/admin, recaptcha: self/admin |
| self/search | carrierwave: set/self/search.rb; search: set/self/search.rb | search: self/search, carrierwave: self/search |
| type/cardtype | core: set/type/cardtype.rb; follow: set/type/cardtype.rb; format: set/type/cardtype.rb; rules: set/type/cardtype.rb; search: set/type/cardtype.rb | core: type/cardtype, format: type/cardtype, rules: type/cardtype, follow: type/cardtype |
| type/html | format: set/type/html.rb; layout: set/type/html.rb | format: type/html, layout: type/html |
| type/image | bar_and_box: set/type/image.rb; carrierwave: set/type/image.rb | carrierwave: type/image |
| type/list | edit: set/type/list.rb; list: set/type/list.rb | list: type/list, edit: type/list |
| type/mod | core: set/type/mod.rb; assets: set/type/mod.rb; format: set/type/mod.rb | core: type/mod, format: type/mod, assets: type/mod |
| type/plain_text | edit: set/type/plain_text.rb; format: set/type/plain_text.rb | format: type/plain_text, edit: type/plain_text |
| type/pointer | edit: set/type/pointer.rb; list: set/type/pointer.rb | list: type/pointer, edit: type/pointer |
| type/set | follow: set/type/set.rb; rules: set/type/set.rb | rules: type/set, follow: type/set |
| type/user | account: set/type/user.rb; follow: set/type/user.rb | account: type/user, follow: type/user |

Four of the seventeen rows hold fewer port declarations than
recorded contributor files, each a named disposition rather than a
missing set:

- abstract/list: layout's set/abstract/list.rb opens with
  `include_set Abstract::Items` and adds no registration of its own;
  the include chain rides the list mod's declaration.
- type/cardtype: card-mod-search's set/type/cardtype.rb is a
  method-only module (card-mod-search.ts header); the other four
  contributors each declare the set.
- type/image: card-mod-bar_and_box's :boxed/:boxed_link views are
  compiled into the port's seed layer (format.ts:4704-4716, citing
  set/type/image.rb:6-12); carrierwave's declaration carries the
  set path.
- all/debug: card-mod-monkey's set/all/debug.rb (view :debug plus
  developer introspection methods) has NO port carrier - a finding,
  recorded as such in 01's line for this set; core's declaration
  carries core's own set/all/debug.rb (to_s/inspect), which the
  port's core-mod.ts cites ("mod/core/set/all/debug.rb, to_s/
  inspect (dev surface)").

Placement deviations in the double-carried paths (all four are
script/style set modules the assets manifest declares beside their
own mod's declaration): type/local_script_manifest_group,
type/local_style_manifest_group, type_plus_right/set/script,
type_plus_right/set/style. The sets are carried; the assets
manifest's extra declarations are bookkeeping, not membership.

### Helper files (Ruby `#! no set module`, five)

- declared by the port as set modules anyway (0 views, 0 events on
  each entry): all/follow/follow_link, all/follow/start_follow_link,
  all/follow/stop_follow_link (card-mod-follow manifest);
- carried as ported classes with no declaration:
  rule/rule_form/rule_set_radio (RuleSetRadio,
  card-mod-rules.ts:2175), all/reference_editor/link_editor/
  link_parser (LinkParser, card-mod-tinymce_editor.ts:494).

## Seed and member rules as data

Set declarations on both sides carry no rules of their own; rule
rows ship as mod deck-seed data (data/real.yml), loaded by Ruby's
Cardio::Mod::Eat (eat.rb:22-33, Card.ensure! per row, symbols in
name lists resolved through the codename registry,
lib/card/name.rb:85-87). The pinned gems ship 20 top-level rule
rows (last segment = a defined setting). Their port carriers:

| rule row (reference form) | mod | port carrier |
|---|---|---|
| role+members+*update -> Help Desk | account | boot-seed named remainder (boot-seed.ts:106-111, deliberately not created: side cards live in other mods' real.yml) |
| user+account+*create -> _left | account | boot-seed named remainder (boot-seed.ts:106-111) |
| signup+*type+*thanks -> :signup_success | account | boot-seed named remainder (boot-seed.ts:106-111) |
| all+*style -> 'yeti skin' | bootstrap | deck state; read at runtime (style-asset-events.ts reads *all+*style content); recorded fixtures carry the recorded deck's row |
| image+*right+*default | carrierwave | deck state; not boot-seeded |
| all+*default | content | deck state; not boot-seeded |
| cardtype+*type+*structure | content | deck state; not boot-seeded |
| cardtype+*self+*structure | content | deck state; not boot-seeded |
| role+*type+*structure | defaults | deck state; not boot-seeded |
| all+*follow_fields -> '*nests' | follow | deck state; the junction's effect is carried at the follow surface (card-mod-follow.ts:169) |
| all+*head -> '{{:head|core}}' | format | deck state; not boot-seeded |
| all+*guide (markdown default guide) | help | deck state; not boot-seeded |
| cardtype+*type+*guide | help | deck state; not boot-seeded |
| structure+*right+*guide | help | deck state; not boot-seeded |
| all+*layout -> 'Default Layout' | layout | deck state; read at runtime (page.ts resolves the layout name) |
| structure+*right+*default (nest_list) | list | deck state; not boot-seeded |
| all+*content_option_view -> 'smart_label' | list | deck state; not boot-seeded |
| all+*captcha -> '1' | recaptcha | EQUAL: manifest ruleSeeds (card-mod-recaptcha.ts, setPath all/recaptcha), keyed by DeckoName key and resolved against candidates through the name environment (mod-rule-seeds.ts) exactly as Ruby resolves the yml's [:all, :captcha] symbols through Codename.name! |
| signup+*type+*captcha -> '1' | recaptcha | EQUAL: manifest ruleSeeds (same site), same resolution |
| all+*script (script list) | script | deck state; compiled-script bundle reads the runtime rule (compiled-script-bundle.ts) |

The two recaptcha rows are the only ones the set-DSL surface
(the manifests' ruleSeeds arrays) carries, and they are equal to
the recorded rows as data (same rule, same content). The account
layer's three rows are declared, named remainders of the boot seed
(boot-seed.ts:102-111), not silent drops. The rest are deck state
the recorded fixtures carry; they gate what a FRESH deck boots
with, not set membership.

