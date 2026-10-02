# Oracle probe, part 1+2: which cards reach the two haml_file :core views, and
# what are the exact bytes the real engine emits for them.
#
# READ-ONLY against the shared live oracle DB. No card is created, updated or
# destroyed. Asserts Card::Act.count is unchanged across the run (the no-write
# discipline the edit2-lane receipt documents).
#
#   1. does any set module in the running bundle include Abstract::HamlFile
#      (i.e. is there ANY card whose :core goes through `haml card.content`)?
#   2. which cards reach card-mod-assets' :core, and what are their bytes?
#   3. the exact bytes the real bootstrap `list_group` helper emits (the ONE
#      helper group_list.haml calls) - recorded so the Haml-only harness has a
#      faithful stub.
#
# Usage (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec ruby <this file> <output json path>

require "json"
require "./config/environment"
require "haml"

OUT = ARGV[0] || "C:/localProjects/decko-ts-lane-hamlslice/tmp/haml-slice/oracle-probe-cards.json"
result = { "haml_version" => Haml::VERSION, "card_version" => Card::VersionID }
actions_before = Card::Act.count
result["actions_before"] = actions_before

# ---------------------------------------------------------------- 1. HamlFile
hf = Card::Set::Abstract::HamlFile
included_by = []
ObjectSpace.each_object(Module) do |m|
  n = begin
    m.name
  rescue StandardError
    nil
  end
  next if n.nil? || !n.start_with?("Card::Set::") || m.equal?(hf)
  included_by << n if (m.include?(hf) rescue false)
end
result["haml_file_included_by"] = included_by.sort
result["haml_file_own_methods"] = hf.instance_methods(false).sort

# Which set modules define a :core view at all, and where does each come from?
core_owners = []
Card::Set::Format::AbstractFormat.instance_variable_get(:@views)&.each do |mod, views|
  blk = views[:core]
  next unless blk
  core_owners << { "mod" => (mod.name rescue mod.to_s), "src" => blk.source_location }
end
result["core_view_owners"] = core_owners

# ---------------------------------------------------------------- 2. assets :core
mod_type = Card.fetch "Mod", new: { type: "Cardtype" }, quiet: true
result["mod_cardtype"] = { "id" => mod_type.id, "name" => mod_type.name, "new" => mod_type.new_card? }

mod_cards =
  if mod_type.new_card?
    []
  else
    # Card[name], NOT Card.where(...): Decko's fetch runs the full set-module +
    # field resolution that gives a card its `description?` style field methods.
    # An AR row rendered directly raises NoMethodError inside mod.rb:18 and the
    # view swallows it into a render-error span - a harness artifact, not an
    # engine finding.
    Card.where(type_id: mod_type.id, trash: false).order(:name).to_a.map { |r| Card[r.name] }
  end
result["mod_cards"] = mod_cards.map { |c| { "id" => c.id, "name" => c.name } }

renders = []
mod_cards.each do |c|
  entry = { "id" => c.id, "name" => c.name }
  begin
    entry["bytes"] = c.format(:html).render :core
  rescue StandardError => e
    entry["error"] = "#{e.class}: #{e.message}"
  end
  renders << entry
end
result["assets_core_renders"] = renders

# ---------------------------------------------------------------- 3. list_group
# Rendered through a REAL Card::Format so the ActionView helper chain
# (list_group -> list_tag -> wrap_with -> content_tag) is the genuine one.
LG_SETS = {
  "empty" => [],
  "one" => ["a.png"],
  "two" => ["x.css", "y.js"],
  "escaped" => ["<b>&amp;</b>"],
  "html" => ["<i>hi</i>"],
  "quote" => ['say "hi"'],
}
lg = {}
LG_SETS.each do |name, items|
  begin
    probe = Card.new name: "haml slice list group probe #{name}", type: "RichText"
    lg[name] = probe.format(:html).send(:list_group, items)
  rescue StandardError => e
    lg[name] = "ERR #{e.class}: #{e.message}"
  end
end
result["list_group_bytes"] = lg

result["actions_after"] = Card::Act.count
File.write OUT, JSON.pretty_generate(result)
puts "WROTE #{OUT} (acts #{actions_before} -> #{result['actions_after']})"
puts "haml_file_included_by=#{result['haml_file_included_by'].inspect}"
puts "core_view_owners=#{core_owners.length}"
puts "assets_core_renders=#{renders.length} errors=#{renders.count { |r| r['error'] }}"
puts "list_group sample=#{lg['two'].inspect}"
