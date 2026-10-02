# Oracle probe for the haml template slice.
#
# READ-ONLY against the shared live oracle DB. No card is created, updated or
# destroyed; only in-memory Card.new objects are rendered, and the probe
# asserts the CardAction count is unchanged (the no-write discipline).
#
# Answers, against the REAL Ruby engine (decko 0.20.0 / card 1.110.0 /
# haml 5.2.2):
#
#   1. does any set module in the running bundle include Abstract::HamlFile
#      (i.e. is there ANY card whose :core goes through `haml card.content`)?
#   2. which cards reach card-mod-assets' :core, and what are their exact
#      rendered bytes?
#   3. what bytes does the real Haml 5.2.2 engine emit for the slice's
#      template set under a controlled local/helper scope?
#
# Usage (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec ruby <this file> <output json path>

require "json"
require "./config/environment"
require "haml"


if ARGV[0].nil? || ARGV[0].empty?
  raise "pass the output json path: bundle exec ruby #{__FILE__} <output json path>"
end
OUT = ARGV[0]

# The gem home is machine-local; GEM_HOME overrides, Gem.dir supplies the
# running app's default, and the installed gems live under its gems/ folder.
# An unusable value is a loud error.
GEM_ROOT = File.join(ENV["GEM_HOME"] || Gem.dir, "gems")
raise "gems folder not usable: #{GEM_ROOT} (set GEM_HOME to the Ruby gem home)" unless File.directory?(GEM_ROOT)
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
result["haml_file_core_view_registered"] =
  Card::Set::Format::AbstractFormat.respond_to?(:views) ? true : false

# ---------------------------------------------------------------- 2. assets :core
mod_type = Card.fetch "Mod", new: { type: "Cardtype" }, quiet: true
result["mod_cardtype"] = { "id" => mod_type.id, "name" => mod_type.name, "new" => mod_type.new_card? }

# which set module answers :core for a Mod card
mod_card = Card.where(type_id: mod_type.id, trash: false).order(:name).first if !mod_type.new_card?
if mod_card
  fmt = mod_card.format :html
  result["assets_core_method_owner"] = (fmt.method(:core).source_location rescue nil)
end

mod_cards = mod_type.new_card? ? [] : Card.where(type_id: mod_type.id, trash: false).order(:name).to_a
result["mod_cards"] = mod_cards.map { |c| { "id" => c.id, "name" => c.name } }

renders = []
mod_cards.each do |c|
  begin
    body = c.format(:html).render :core
    renders << { "id" => c.id, "name" => c.name, "bytes" => body }
  rescue StandardError => e
    renders << { "id" => c.id, "name" => c.name, "error" => "#{e.class}: #{e.message}" }
  end
end
result["assets_core_renders"] = renders

# ------------------------------------------- 3. real haml bytes for the slice
# `list_group` is the ONLY helper group_list.haml calls. Copied byte-for-byte
# from card-mod-bootstrap/set/all/bootstrap/helper.rb:12 list_group so the
# oracle render is the real view body, not a stand-in.
BOOTSTRAP_HELPER = File.join(GEM_ROOT, "card-mod-bootstrap-0.20.0", "set", "all", "bootstrap", "helper.rb")
result["bootstrap_helper_path"] = BOOTSTRAP_HELPER
result["bootstrap_helper_list_group_src"] =
  File.read(BOOTSTRAP_HELPER)[/def list_group.*?^    end/m].to_s.lines.first(30).join

GL_PATH = File.join(GEM_ROOT, "card-mod-assets-0.20.0", "set", "abstract", "mod_assets", "group_list.haml")
result["group_list_source"] = File.read(GL_PATH)

# The real list_group body, defined in a module the Haml binding can see.
eval <<~RUBY, binding, GL_PATH # rubocop:disable Security/Eval
  def list_group content_or_options=nil, options={}
    if content_or_options.is_a?(Array)
      content_or_options.map { |item| "<li class=\\"list-group-item\\">\#{item}</li>" }.join("\\n")
    else
      options = content_or_options if content_or_options
      "<ul class=\\"list-group\\">\\n" +
        safe_join(Array(options[:content]).map { |item| "<li class=\\"list-group-item\\">\#{item}</li>" }, "\\n") +
        "\\n</ul>"
    end
  end
RUBY

GL_CASES = {
  "empty" => [],
  "one-group" => [%w[group: remote a.png b.png]],
  "two-groups" => [["group: remote", []], ["local", %w[x.css y.js]]],
  "escaped" => [["<escaped & title>", ["<b>&amp;</b>"]]],
  "empty-title" => [["", ["a"]]],
  "three" => [%w[a b], %w[c d], %w[e]],
}
gl = {}
GL_CASES.each do |name, groups|
  gl[name] = Haml::Engine.new(File.read(GL_PATH)).render(binding, { "groups" => groups })
end
result["group_list_bytes"] = gl

result["actions_after"] = Card::Act.count
File.write OUT, JSON.pretty_generate(result)
puts "WROTE #{OUT} (actions #{actions_before} -> #{result['actions_after']})"
puts "haml_file_included_by=#{result['haml_file_included_by'].inspect}"
puts "assets_core_renders=#{renders.length} errors=#{renders.count { |r| r['error'] }}"
