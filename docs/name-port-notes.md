# Name algebra port notes (decko-ts)

Port of the Decko card name algebra to TypeScript.

Truth sources (read directly from the installed gems):

- `cardname-0.20.0` (`C:\Ruby33-x64\lib\ruby\gems\3.3.0\gems\cardname-0.20.0\lib\`):
  `cardname.rb` (core), `cardname/parts.rb`, `cardname/pieces.rb`,
  `cardname/variants.rb`, `cardname/contextual.rb`, `cardname/predicates.rb`,
  `cardname/manipulate.rb`, `cardname/fields.rb`, `cardname/class_methods.rb`,
  `core_ext.rb`. Note: `Card::Name < Cardname`; the real algebra lives in the
  **cardname** gem, not in card-1.110.0's `lib/card/name.rb`.
- `card-1.110.0` (`...\gems\card-1.110.0\lib\card\`): `name.rb` (Card::Name
  constructor, marks, star predicates), `name/name_variants.rb` (vary,
  standard, codename), `name/all.rb` + `name/card_class.rb` (card-integration
  layer - deferred, see below), `lexicon.rb` (id/name index, keyed by name key),
  `config/initializers/01_core_extensions/*` (Array#cardname = compose).
- `activesupport-7.2.3.2`: default EN inflections + `underscore` - cardname
  delegates key generation to ActiveSupport.

## Ported surface

TS files: `src/card/name.ts` (DeckoName class + `name()` factory), helpers under
`src/card/name/`: `inflect.ts` (ActiveSupport inflections + Ruby String methods),
`entities.ts` (HTML entity decoding), `environment.ts` (injectable session/
params/lexicon/codename), `errors.ts` (typed errors).

The Ruby class hierarchy (`Card::Name < Cardname`) is collapsed into one
immutable class. Naming convention: Ruby snake_case methods become camelCase
properties/methods; `_name` methods return `DeckoName`, plain ones return
`string`, `_key` return `string`, predicates drop the trailing `?`.

| Ruby source (file#method) | TS API |
|---|---|
| cardname.rb#initialize / #s / #to_s | `DeckoName.parse`, `.s`, `.toString()` |
| cardname.rb#key / #generate_key / #simple_key | `.key` (computed via variants.rb#stable_key) |
| cardname.rb#== | `.equals(other)` (key equality, accepts name/string/number) |
| cardname.rb#[] / #num_parts | `.get(i)`, `.get(i, len)`, `.getRange(start, endInclusive)`, `.numParts` |
| cardname.rb#to_sym | not ported - JS strings already serve as symbols |
| class_methods.rb#new (cache) | process-wide `Map` keyed by raw string; parse returns the same frozen object |
| class_methods.rb#split_parts | `DeckoName.splitParts` |
| class_methods.rb#banned_re / #nothing_banned? | static `DeckoName.bannedCharacters` + `.isValid` |
| parts.rb#left/left_name/left_key | `.left` / `.leftName` / `.leftKey` |
| parts.rb#right/right_name/right_key | `.right` / `.rightName` / `.rightKey` |
| parts.rb#parents/parent_names/parent_keys | `.parents` / `.parentNames` / `.parentKeys` |
| parts.rb#parts / #part_names / #part_keys / #to_a | `.parts` / `.partNames` / `.partKeys` |
| parts.rb#trunk / #trunk_name / #trunk_key | `.trunk` / `.trunkName` / `.trunkKey` |
| parts.rb#tag / #tag_name / #tag_key | `.tag` / `.tagName` / `.tagKey` |
| pieces.rb#pieces / #piece_names | `.pieces` / `.pieceNames` |
| pieces.rb#ancestors / #ancestor_pieces | `.ancestors` / `.ancestorPieces` |
| variants.rb#url_key | `.urlKey` |
| variants.rb#safe_key | `.safeKey` |
| variants.rb#decoded | `.decoded` (entities.ts, see limitations) |
| variants.rb#stripped / #fully_stripped | `.stripped` / `.fullyStripped` |
| variants.rb#stable_key | `inflect.ts` internal (stabilize=false semantics) |
| contextual.rb#child_of? | `.childOf(context)` |
| contextual.rb#relative? / #simple_relative? / #relative_fragment? / #absolute? | `.isRelative` / `.isSimpleRelative` / `.isRelativeFragment` / `.isAbsolute` |
| contextual.rb#from / #name_from | `.from(...)` (string) / `.nameFrom(...)` (name) |
| contextual.rb#absolute / #absolute_name | `.absolute(ctx?)` (string) / `.absoluteName(ctx?)` |
| contextual.rb#nth_left_name | `.nthLeftName(n)` (preserves Ruby's String#length quirk) |
| contextual.rb#absolutize_contextual_parts (+ordinal_part, partmap_part, user_part, absolutize_extremes) | private helpers in name.ts |
| predicates.rb#simple? / #compound? | `.isSimple` / `.isCompound` |
| predicates.rb#valid? | `.isValid` |
| predicates.rb#starts_with_joint? | `.startsWithJoint` |
| predicates.rb#starts_with_parts? / #start_with_parts? | `.startsWithParts(...prefix)` |
| predicates.rb#ends_with_parts? / #end_with_parts? | `.endsWithParts(...suffix)` |
| predicates.rb#include? | `.includes(subname)` |
| manipulate.rb#[]= | `.withPartAt(i, v)` - pure, returns new name (Ruby mutates in place) |
| manipulate.rb#<< | `.append(v)` - pure |
| manipulate.rb#swap (+swap_part, swap_all_subsequences) | `.swap(old, new)` |
| manipulate.rb#prepend_joint / #to_field | `.prependJoint` (always returns string; Ruby returns self when prefixed) |
| manipulate.rb#sub_in | `.subIn(str, with)` |
| fields.rb#field / #field_name | `.field(tag)` / `.fieldName(tag)` |
| fields.rb#field_of? / #field_only? | `.fieldOf(ctx?)` / `.fieldOnly` |
| fields.rb#relative_field_name | `.relativeFieldName(tag)` |
| name.rb (Card::Name)#[] / from_cardish | `name(...)` factory / `DeckoName.of(...)` |
| name.rb#new / new_from_compound_string / from_id_from_string / bad_mark | `DeckoName.parse` |
| name.rb#compose / new_from_parts | `DeckoName.compose` |
| name.rb#id_from_string / #id_from_string! | `DeckoName.idFromString` / `idFromStringStrict` |
| name.rb#star? / #rstar? | `.isStar` / `.isRStar` |
| name.rb#session / #params | environment.ts (`session`, `mainName`) |
| name_variants.rb#vary | `.vary(variants)` |
| name_variants.rb#standard | `.standard` |
| name_variants.rb#card_id | `.cardId` |
| name_variants.rb#codename / #codename_or_string | `.codename` / `.codenameOrString` |
| core_ext.rb Object#to_name | `.toName()` / parse accepts DeckoName |

Inflection substrate (`src/card/name/inflect.ts`), transcribed from
activesupport 7.2.3.2 `lib/active_support/inflections.rb` and
`lib/active_support/inflector/methods.rb`:

- `singularize` / `pluralize`: default EN rules in **scan order** (Ruby
  `Inflections#plural/#singular` use `prepend`, so scan order is reverse
  definition order with the six `irregular` entries at the front, themselves
  reversed). Irregular rules are generated as `/(s0)srest$/i -> '\1'+srest` and
  `/(p0)prest$/i -> '\1'+prest` (no `^` anchor, replacement excludes the
  captured first letter). Uncountables match `/\b<word>$/i` (Uncountables#to_regex).
  First matching rule applies once; a no-op match still stops the scan (Ruby
  `sub!` is truthy on any match - hence `pluralize("gas") == "gas"`).
- `underscore`: AS 7.2 form with lookaround insertion
  `(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z\d])(?=[A-Z])` and the early-return guard
  `/[A-Z-]|::/` (why "Ünïcödé" keeps its case). Acronyms omitted (default has none).
- `titleize`, `rubyCapitalize` (Ruby String#capitalize downcases the rest),
  `rubySucc` (Ruby String#succ), `regexpQuote`.

## Verification

Live oracle: `ruby -e` against the installed gems (cardname 0.20.0,
activesupport 7.2.3.2, Ruby 3.3). The cardname gem loads standalone with
`require "active_support/all"; require "htmlentities"; require "cardname"` plus
loading `core_ext.rb`. The Card::Name layer was verified by loading card-1.110.0's
`name.rb`/`name_variants.rb` over minimal Lexicon/Codename shims.

- Inflection battery: 329 rows generated from Ruby (singularize/pluralize/
  underscore/titleize/succ/capitalize) - all pass; representative rows are
  embedded in the test suite. Succ was additionally pinned with 48 hand-probed
  separator/carry cases.
- Name algebra: 218 oracle-derived checks during development, all embedded in
  `tests/card/name/name-port.test.ts` (243 tests, all passing).

### Oracle-verification pending (source-derived only)

- `Card::Name#standard` (compound branch) - needs a live Lexicon; expectations
  derive from `name_variants.rb#standard` source.
- `Codename[card_id]` symbol semantics - shim-verified only.
- `sub_in` with regex-significant names: Ruby interpolates the variant
  **unescaped** into the regex (an `*name` would break); the port escapes via
  `regexpQuote`, so it works where Ruby would misbehave. Ordinary names are
  byte-identical.
- Unicode `String#downcase/upcase/swapcase/capitalize` use JS full case mapping
  vs Ruby's; identical for practical name characters, divergent for exotic
  codepoints (e.g. final-sigma context rules).
- `rubySucc` for non-ASCII strings: Ruby treats bytes/chars per its encoding
  rules; the port treats non-ASCII as non-alphanumeric. ASCII behavior is
  battery-verified.
- Named HTML entities beyond the ~40 common ones in `entities.ts`: the Ruby
  gem decodes the full HTML tables; unknown entities pass through unchanged in
  both.

## Upstream bugs found while porting (and what the port does)

1. **cardname 0.20.0 `contextual.rb#absolutize_contextual_parts` crashes on
   `_N` and `_L*R?` names — MECHANISM CORRECTED 2026-09-19 after deeper
   verification (coordinator re-check)**: the `case/when` regex branches read
   `$LAST_MATCH_INFO`, which is NOT a Ruby built-in — it is an alias defined
   only by `require "english"`, which cardname/card/decko never require.
   Under any standalone load the alias is an undefined global (nil), so the
   branch raises NoMethodError; with `english` loaded the code works
   correctly on Ruby 3.3.12 (empirically: `_1`.absolute → correct result,
   and case/when DOES update match state). The original note attributed the
   crash to a Ruby 3.3 case/when semantics change — that attribution was
   wrong; match semantics are intact, the alias simply did not exist in the
   probe's load. Full-app probe: a real decko app loads `english`
   transitively, so supported production usage is NOT affected. The port
   resolves the captures from an explicit `match` and implements the
   evident intent (`ordinal_part`, `partmap_part`) — unaffected either way.
2. **`variants.rb#fully_stripped` calls `Array#cardname`**, which does not
   exist in the cardname gem; it only works because card-1.110.0's
   `config/initializers/01_core_extensions/array.rb` defines it as
   `Card::Name.compose(self)`. The port implements that composition directly.
3. **`variants.rb#safe_key` docstring claims** "A-XB" and "A+*B" collide; in
   0.20.0 they do not (`a_xb` vs `a-Xb`) because "-" becomes "_" during key
   generation. The stale docstring was not treated as a spec.

## Ruby dynamics and decisions

- **`nth_left_name` guards on String#length, not part count** (`n >= length`
  where `length` is the character length of the name string). Ported as-is;
  e.g. `nth_left_name(9)` on "A+B+C+D" returns "A" while `nth_left_name(4)`
  returns "" (Ruby `[0..-5]` is nil -> empty name).
- **`ordinal_part` clamps against `context.length`** - again the string length;
  `_3` in context "C+D" therefore resolves through the blank-extreme rule to
  "C+D" (verified on patched copy).
- **Cache identity**: `Cardname.new` returns the same object for equal raw
  strings and returns its argument if it is already a Cardname; both ported
  (`parse` on a DeckoName returns it).
- **Two constructor layers**: `Cardname.new` only strips ends and caches;
  `Card::Name.new` additionally normalizes compound strings through
  split/join and resolves `~id`/`:codename` marks through the Lexicon. The port
  exposes the Card::Name semantics in `DeckoName.parse` (the engine-facing
  behavior); parts of compound names are parsed with full mark resolution,
  matching `new_from_parts` (`{ |part| new part }`).
- **Equality**: `==` compares keys for any argument (String, Integer, anything
  with `to_s`). `equals` mirrors this for `DeckoName | string | number | null`.
- **Mutators are pure**: Ruby's `[]=`/`<<`/`replace` mutate in place (Cardname
  subclasses String). DeckoName is immutable; `withPartAt`/`append` return new
  names. This is a deliberate API deviation required by the immutability
  deliverable.
- **prepend_joint** returns a plain string in all cases (Ruby returns `self` -
  a Cardname - when the joint is already present).
- **Environment**: Ruby reads process-global `Cardname.params/session`,
  `Card::Lexicon`, `Card::Codename` at call time. The port centers these in
  `NameEnvironment` (`setNameEnvironment`), read at call time. With no
  environment: `_main` -> "" (Ruby: `params[:main_name]` nil -> `to_s` -> ""),
  `_user` stays relative, marks/standard/codename behave per the nil-lexicon
  path (unknown integer identifier -> ArgumentError, unknown marks -> the
  NotFound error classes in errors.ts).
- **Lexicon is keyed**: `Lexicon.id` resolves through
  `{ key: lex.to_name.key }` (card-1.110.0 lib/card/lexicon.rb#lex_query), so
  `.cardId`/`.standard` pass the canonical key to the injected lexicon.

## Deliberately deferred (with reasons)

- **card-1.110.0 `lib/card/name/all.rb`** - the Card integration layer
  (`Card#name=`, `#key=`, `assign_side_ids`, `update_subcard_names`,
  `autoname`, `Card#[]` fetching, supercard handling). These operate on Card
  objects, subcards, and Directors, which do not exist in this stream.
- **card-1.110.0 `lib/card/name/card_class.rb`** - `rename!`, `uniquify_name`,
  `generate_alternative_name` all require `Card.fetch`/`Card.exist?`.
  (`String#succ`, which autoname relies on, is ported and verified so the
  future card layer can build on it.)
- **name_variants.rb#card / #alternative** - require `Card.fetch` and
  `Card.generate_alternative_name` respectively.
- **Set-pattern star names** ("type plus right" style rule names like
  `*type+Basic+*right`): built by `card/set/pattern/*.rb` from the pattern
  registry, not by the name layer. The name-layer predicates the pattern layer
  needs (`star?`, `rstar?`) are ported; the pattern registry belongs to the
  set/rule stream.
- **`to_sym`** - Ruby Symbols map to plain strings in TS.
- **Lexicon.lex_to_name([left_id, right_id])** - used only by the Card layer's
  name reconstruction from stored ids; belongs with the card stream.

## Test counts

- `tests/card/name/name-port.test.ts`: 243 tests, one describe block per Ruby
  method group, every expectation citing its Ruby file#method. All green.
- During development, 329 inflection-battery rows + 48 succ probes + 218 name
  checks were cross-checked against the live Ruby oracle; representative rows
  are embedded in the suite, the rest validated the port before it landed.
