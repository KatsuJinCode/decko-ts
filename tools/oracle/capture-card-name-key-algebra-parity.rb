# capture-card-name-key-algebra-parity.rb - oracle capture: Card::Name's key
# algebra, so the TypeScript port's values can be re-measured instead of
# trusted.
#
# Ruby truth pinned by this capture:
#   - cardname-0.20.0 lib/cardname.rb#generate_key -> #simple_key (line 106):
#     the key is `decoded.underscore.gsub(/[^\p{Word}\*]+/, "_").split(/_+/)
#     .reject(&:empty?).map { stable_key }.join("_")`.
#   - activesupport-7.2.4 lib/active_support/inflector/methods.rb#underscore
#     (line 100): `word.gsub!(/([a-z\d])([A-Z])/,'\1_\2')` then downcase. This
#     runs BEFORE the gsub above, so an UPPERCASE token whose final letter is
#     preceded by a digit keys DIFFERENTLY from its lowercase spelling:
#       Card::Name.new("MVEMONUT31C").key == "mvemonut31_c"
#       Card::Name.new("mvemonut31c").key == "mvemonut31c"
#     They are two different NAMES in Ruby. The trigger is any digit before any
#     capital, not specifically digit+C: "CARD 3X" -> "card_3_x",
#     "CARD 2ND" -> "card_2_nd", "CARD 1ST" -> "card_1_st".
#
#   The `NOT_OK_FOR_KEY` fold in the port (src/card/name.ts:128) is NOT the
#   source of that separator: on the word `underscore` already returned, the
#   fold is inert for any input built only from characters it allows, because
#   "_" is \p{Pc} (connector punctuation) and sits inside its own allowed class.
#
# The class captured here is card-1.110.0's Card::Name (what src/card/name.ts
# ports), NOT bare Cardname: the two differ on compound strings, because
# Card::Name.new runs new_from_compound_string (lib/card/name.rb:87) and
# re-joins the parts, so Card::Name.new("Card +").s == "Card+" while
# Cardname.new("Card +").s == "Card +". Bare Cardname would report a false
# divergence on any name containing the joint.
#
# No deck inflection initializer is applied, matching the default tables the
# port's unit tests run under.
#
# Run (Ruby >= 3.2, cardname 0.20.0 + activesupport ~> 7.2 + card 1.110.0 on
# the gem path; the reference gemset lives under decko-ruby-oracle-gems):
#   GEM_HOME=<gemset> GEM_PATH=<gemset> \
#     ruby tools/oracle/capture-card-name-key-algebra-parity.rb \
#     <input-names.json> <out.json>
#
# READ-ONLY: constructs Cardname value objects only; no card is read or saved.
#
# The values this produces are pinned as unit tests in
# tests/card/name/ruby-oracle-key-algebra-parity.test.ts, and reported in the
# ACT-185 leg of reference-harness/browser/probe-pageonly-ranks91-100.mjs.

require "json"
require "rubygems"
require "active_support"
require "active_support/inflector"
require "active_support/core_ext"
require "cardname"
# cardname's own core_ext defines Object#to_name (needed by #stripped); it is
# not on the gem's default require path, so load it by absolute location.
require File.join(Gem::Specification.find_by_name("cardname").gem_dir, "lib", "core_ext")

# card/name/name_variants.rb reopens Card::Name, and card/name.rb declares its
# superclass, so declare Card::Name < Cardname first (reopening with a matching
# superclass is legal) rather than booting all of Rails.
class Card
  class Name < Cardname
  end
end
card_lib = File.join(Gem::Specification.find_by_name("card").gem_dir, "lib")
require File.join(card_lib, "card", "name", "name_variants")
require File.join(card_lib, "card", "name")

inputs = JSON.parse(File.read(ARGV.fetch(0)))
records = inputs.map do |input|
  name = Card::Name.new(input)
  {
    "input" => input,
    "s" => name.s,
    "key" => name.key,
    "underscore" => input.underscore,
    "url_key" => name.url_key,
    "safe_key" => name.safe_key,
    "decoded" => name.decoded,
    "stripped" => name.stripped.to_s,
    "parts" => name.part_names.map(&:to_s),
  }
end
File.write(ARGV.fetch(1), JSON.pretty_generate(records))
warn "captured #{records.length} Card::Name key records to #{ARGV[1]}"