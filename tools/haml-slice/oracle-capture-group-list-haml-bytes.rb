# Oracle capture: the EXACT bytes card-mod-assets' :core produces for its
# `haml :group_list` call, captured through the deck's OWN haml_to_html
# (card-1.110.0/lib/card/set/format/haml_paths.rb:8-14) inside a booted Rails
# Decko format - not a bare Haml::Engine, so every railtie-level default is in
# force exactly as the deck gets it.
#
# The cards that reach mod_assets.rb:171-182 :core are the "<mod>+*style" and
# "<mod>+*script" cards: card-mod-style/set/type_plus_right/mod/style.rb:5 and
# card-mod-script/set/type_plus_right/mod/script.rb:3 both
# `include_set Abstract::ModAssets`. The Mod card itself never reaches it -
# mod/core/set/type/mod.rb:60-66 nests the style/script card with view: :core.
#
# READ-ONLY against the shared live oracle DB: no card is created, updated or
# destroyed; only in-memory Card.new objects are rendered, and the Card::Act
# count is asserted unchanged across the run.
#
# Usage (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec ruby <this file> <out json>

require "json"
require "./config/environment"

OUT = ARGV[0] || "C:/localProjects/decko-ts-lane-hamlslice/tmp/haml-slice/group-list-oracle.json"
GL = "C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/card-mod-assets-0.20.0/set/abstract/mod_assets/group_list.haml"
GL_SRC = File.read(GL)

actions_before = Card::Act.count
result = {
  "haml_version" => Haml::VERSION,
  "card_version" => Card::VersionID,
  "actions_before" => actions_before,
  "group_list_source" => GL_SRC,
  "renderer" => "Decko Card::Format#haml_to_html (Card::Set::Format::HamlPaths)",
}

# A real Card::Format whose `list_group` is the genuine bootstrap helper.
fmt = Card.new(name: "haml slice group list probe", type: "RichText").format(:html)
result["haml_to_html_owner"] = fmt.method(:haml_to_html).source_location
result["list_group_owner"] = fmt.method(:list_group).source_location

# ---- the real (title, items) pairs, harvested from the live deck ---------
harvested = []
asset_cards = []
Card.where(trash: false).to_a.map { |r| r.name }.each do |cname|
  next unless cname =~ /\+\*(style|script)\z/
  card = (Card[cname] rescue next)
  next unless card.respond_to?(:assets_path) && card.assets_path
  asset_cards << { "id" => card.id, "name" => card.name, "type" => card.type_name }
  card.local_group_cards.each do |grp|
    harvested << [grp.cardname.tag, grp.input_item_cards.map(&:name)]
  end
  rc = (card.group_remote_card rescue nil)
  next unless rc && rc.respond_to?(:urls)
  harvested << ["group: remote", rc.urls] if rc.urls.present?
end
result["assets_core_cards"] = asset_cards
result["assets_core_card_count"] = asset_cards.size
result["harvested_group_count"] = harvested.size
result["harvested_groups_distinct"] = harvested.map(&:first).uniq.sort

# Each entry is the GROUPS local value for that case name.
EDGE = {
  "empty" => [],
  "one" => [["group: local", ["a.png"]]],
  "two" => [["group: local", %w[x.css y.js]]],
  "escaped" => [["group: local", ["<b>&amp;</b>"]]],
  "html" => [["group: local", ["<i>hi</i>"]]],
  "quote" => [["group: local", ['say "hi"']]],
  "apos" => [["group: local", ["it's"]]],
  "amp" => [["group: local", ["a&b"]]],
  "tag" => [["group: local", ["<script>alert(1)</script>"]]],
  "empty_title" => [["", ["a"]]],
  "amp_title" => [["a & b <c>", ["d & e"]]],
  "two_groups" => [["group: remote", []], ["local", ["x.css"]]],
  "three" => [%w[a b], %w[c d], %w[e]],
}

def render(fmt, src, locals)
  fmt.haml_to_html src, locals
rescue StandardError => e
  "ERR #{e.class}: #{e.message}"
end

bytes = {}
EDGE.each { |name, groups| bytes["edge-#{name}"] = render(fmt, GL_SRC, { "groups" => groups }) }
harvested.each_with_index do |(title, items), i|
  bytes["harvested-#{i}"] = render(fmt, GL_SRC, { "groups" => [[title, items]] })
end
result["bytes"] = bytes
result["harvested_inputs"] = harvested.each_with_index.map do |(t, items), n|
  { "key" => "harvested-#{n}", "groups" => [[t, items]] }
end

result["haml_default_options"] = Haml::Options.instance_methods(false).sort.each_with_object({}) do |m, h|
  h[m.to_s] = (Haml::Options.new.public_send(m) rescue "n/a")
end

result["actions_after"] = Card::Act.count
File.write OUT, JSON.pretty_generate(result)
puts "WROTE #{OUT}"
puts "actions #{actions_before} -> #{result['actions_after']}"
puts "assets :core cards: #{asset_cards.size}; harvested groups: #{harvested.size}; distinct bytes: #{bytes.values.uniq.size}"
bytes.first(6).each { |k, v| puts "  #{k} => #{v.inspect}" }
