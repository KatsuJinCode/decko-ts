# oracle-capture-compile-engines.rb - renders the compile-engine surfaces
# for byte fixtures: the SassC compile path (card-mod-style
# set/abstract/01_css.rb
# compress/compile + 02_scss.rb compile_scss), the CoffeeScript compile
# (card-mod-script set/abstract/02_coffee_script.rb:20-22) and the mod
# asset-dir walk (card-mod-assets set/abstract/asset_group.rb relative_paths,
# folder_group.rb Dir.chdir/Dir.glob walk, local_manifest_group.rb manifest
# items).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-compile-engines.rb
#
# Records to fixtures/captured/compile-engines.json:
# 1. engine_versions - SassC/libsass + CoffeeScript wrapper/compiler
#    versions + Cardio.config.compress_assets (the deck's config state:
#    under false the js compressed view is identity compress, 00_script.rb:25-27).
# 2. compile_pins - REAL deck asset sources (the gem mod files the deck's
#    stylesheets/scripts are built from) with Ruby's compiled bytes through
#    the exact surfaces the TS port mirrors: SassC::Engine.new(source,
#    style:
#    :compressed).render (the css compress quirk - BOTH compress? arms run
#    :compressed because compile ignores its _style param, 01_css.rb:63-73),
#    SassC style :expanded (02_scss.rb:12-14 compile_scss default),
#    CoffeeScript.compile(script, no_wrap: b) for both b (02_coffee_script.rb:
#    20-22 + bare_compile :13-19).
# 3. card_level_pins - the same surfaces through the DECK's own view methods
#    on the virtual mod-asset group item cards (Card.new instances built by
#    the asset walk - never persisted): scss item format(:scss)._render_core
#    (the UNcompiled pass-through - process_content raw, 02_scss.rb:27-29),
#    css item format(:css)._render_compressed AND format(:css)._render_compiled
#    (the byte-identical pair = the ignored-param quirk proven deck-side,
#    01_css.rb:52-58), coffee item format(:js)._render_core + format(:js).
#    _render_compressed (comment_with_source + identity compress under
#    compress_assets=false, 00_script.rb:9-12 + 20-22).
# 4. asset_walk - the mod asset-dir walk per loaded mod: assets_path,
#    manifest presence, per local group card: base_path + relative_paths
#    (Ruby's Dir.glob answer for folder groups / manifest_group_items for
#    manifest groups) + the item cards' name/type/content decomposition
#    (asset_group.rb:15-18 -> new_asset_file_card).
# 5. no_write_proof - Card::Action count before/after the whole run
#    (the virtual-card walk creates no rows).
#
# Determinism contract (mirrors oracle-capture-content-inputs.rb): output
# JSON is pretty-printed with deeply sorted keys + trailing newline; no
# timestamps, no probe cards, no DB writes of any kind.

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "compile-engines.json")

actions_before = Card::Action.count

payload = {}

# ---- engine versions + config state ----------------------------------------

payload["engine_versions"] = {
  "sassc" => SassC::VERSION,
  "libsass" => (SassC::Native.libsass_version if SassC::Native.respond_to?(:libsass_version)),
  "coffee_wrapper" => (CoffeeScript::VERSION rescue nil),
  "coffee_compiler" => (CoffeeScript::Source.version rescue nil),
  "compress_assets" => Cardio.config.compress_assets,
  "mods_loaded" => Cardio::Mod.dirs.mods.map(&:name)
}

# ---- compile pins: real deck asset sources through the ported surface -------

# { mod => { "style" => [relative paths under assets/style],
#            "script" => [...] } } - every file below is a real mod asset the
# deck ships; the compiled bytes are what the deck's stylesheet/script
# pipeline is built from.
SOURCES = {
  "bootstrap" => {
    "style"  => ["decko_bootstrap.scss", "bootstrap_colorpicker.scss", "material_icons.css", "bootstrap-icons.css"],
    "script" => ["decko_modal.js.coffee", "decko_popover.js.coffee", "script_load_select2.js.coffee"]
  },
  "style" => {
    "style"  => ["jquery_ui_decko.scss", "jquery_ui_smoothness.css"],
    "script" => []
  },
  "account" => {
    "style"  => ["account.scss"],
    "script" => ["toggle_visibility.js.coffee"]
  },
  "format" => {
    "script" => ["jquery/jquery.autosize.js"]
  }
}.freeze

def mod_path(mod_name)
  mod = Cardio::Mod.dirs.mods.find { |m| m.name.to_s == mod_name }
  raise "mod not loaded: #{mod_name}" unless mod

  mod.path.to_s
end

def kind_of(path)
  return "coffee" if path.ends_with?(".js.coffee")
  return "scss"   if path.ends_with?(".scss")
  return "css"    if path.ends_with?(".css")

  "js"
end

def sassc(input, style)
  SassC::Engine.new(input, style: style).render
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message.lines.first&.strip}"
end

def coffee(script, no_wrap)
  CoffeeScript.compile script, no_wrap: no_wrap
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message.lines.first&.strip}"
end

pins = []
SOURCES.each do |mod_name, by_subpath|
  by_subpath.each do |subpath, rels|
    rels.each do |rel|
      path = File.join(mod_path(mod_name), "assets", subpath, rel)
      raise "missing source: #{path}" unless File.exist?(path)

      source = File.read(path)
      kind   = kind_of(rel)
      pin = {
        "mod" => mod_name,
        "subpath" => subpath,
        "relative_path" => rel,
        "absolute_path" => path,
        "kind" => kind,
        "source" => source
      }
      case kind
      when "css", "scss"
        pin["sassc_compressed"] = sassc(source, :compressed)
        pin["sassc_expanded"]   = sassc(source, :expanded) if kind == "scss"
      when "coffee"
        pin["coffee_no_wrap_false"] = coffee(source, false)
        pin["coffee_no_wrap_true"]  = coffee(source, true)
      end
      pins << pin
    end
  end
end
payload["compile_pins"] = pins

# ---- card-level pins: the deck's own view methods on virtual asset cards ----
# The mod asset group machinery (asset_group.rb item_cards -> relative_paths ->
# new_asset_file_card) builds Card.new instances; rendering them writes nothing.

def item_by_name(group_card, name)
  group_card.item_cards.compact.find { |c| c.name.to_s == name }
end

def card_render(card, format_sym, view)
  card.format(format_sym)._render(view.to_sym)
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message.lines.first&.strip}"
end

CARD_PIN_TARGETS = [
  # [mod, tag, group selector, item basename, views to capture]
  ["bootstrap", "script", "bootstrap", "decko_modal.js.coffee",      %i[core compressed]],
  ["bootstrap", "script", "bootstrap", "decko_popover.js.coffee",    %i[core compressed]],
  ["bootstrap", "style",  "bootstrap_decko", "decko_bootstrap.scss", %i[core compressed compiled]],
  ["style",     "style",  "local", "jquery_ui_decko.scss",          %i[core compressed compiled]],
  ["style",     "style",  "local", "jquery_ui_smoothness.css",      %i[core compressed compiled]],
  ["account",   "script", "local", "toggle_visibility.js.coffee",   %i[core compressed]],
  ["account",   "style",  "local", "account.scss",                  %i[core compressed compiled]],
  ["format",    "script", "jquery", "jquery/jquery.autosize.js",     %i[core compressed]]
].freeze

card_pins = {}
CARD_PIN_TARGETS.each do |mod_name, tag, group_name, item_name, views|
  mod_card = Card["mod: #{mod_name}"]
  if mod_card.nil?
    card_pins["#{mod_name}+*#{tag}"] = { "error" => "mod card missing" }
    next
  end
  assets = mod_card.fetch(tag.to_sym)
  if assets.nil?
    card_pins["#{mod_name}+*#{tag}"] = { "error" => "+*#{tag} child missing" }
    next
  end
  # group cards are virtual, named "<assets card>+group: <name>" (mod_assets.rb
  # new_assets_group_card); manifest groups additionally carry the group_name
  # accessor (mod_assets.rb:144-148). Match either.
  group = assets.item_cards.compact.find do |g|
    gn = g.respond_to?(:group_name) ? g.group_name : nil
    gn == group_name || g.name.to_s.end_with?("group: #{group_name}")
  end
  if group.nil?
    card_pins["#{mod_name}+*#{tag}"] = {
      "error" => "group card missing",
      "local_group_names" => assets.item_cards.compact.map do |g|
        g.respond_to?(:group_name) ? g.group_name : g.name.to_s
      end
    }
    next
  end
  item = item_by_name(group, item_name.split("/").last)
  if item.nil?
    card_pins["#{mod_name}+*#{tag}+#{group_name}"] = {
      "error" => "item missing",
      "item_names" => group.item_cards.compact.map(&:name).map(&:to_s)
    }
    next
  end
  record = {
    "item_type_code" => (item.type_code.to_s rescue nil),
    "item_db_content" => item.db_content
  }
  views.each { |v| record["render_#{v}"] = card_render(item, :js, v) if tag == "script" }
  views.each { |v| record["render_#{v}"] = card_render(item, v == :core && tag == "style" ? :scss : :css, v) if tag == "style" }
  card_pins["#{mod_name}+*#{tag}+#{group_name}+#{item_name}"] = record
end
payload["card_level_pins"] = card_pins

# ---- the mod asset-dir walk per loaded mod ----------------------------------

walk = {}
Cardio::Mod.dirs.mods.map(&:name).sort.each do |mod_name|
  mod_card = Card["mod: #{mod_name}"]
  next if mod_card.nil?

  mod_record = {}
  ["script", "style"].each do |tag|
    assets = mod_card.fetch(tag.to_sym)
    next if assets.nil? || !assets.respond_to?(:local_group_cards)

    groups = assets.item_cards.compact.map do |group|
      base = group.respond_to?(:base_path) ? group.base_path : nil
      rels =
        if group.respond_to?(:relative_paths)
          group.relative_paths
        else
          []
        end
      {
        "group_name" => (group.respond_to?(:group_name) && group.group_name ? group.group_name : group.name.to_s.split("+group: ").last),
        "base_path" => base,
        "relative_paths" => rels,
        "items" => group.item_cards.compact.map do |ic|
          { "name" => ic.name.to_s, "type_code" => (ic.type_code.to_s rescue nil), "content" => ic.db_content }
        end
      }
    end
    mod_record[tag] = {
      "assets_path" => (assets.respond_to?(:assets_path) ? assets.assets_path : nil),
      "manifest_exists" => (assets.respond_to?(:manifest_exists?) ? assets.manifest_exists? : nil),
      "manifest_group_items" => (assets.respond_to?(:manifest) && assets.manifest_exists? ? assets.manifest.except("remote") : nil),
      "groups" => groups
    }
  end
  walk[mod_name] = mod_record unless mod_record.empty?
end
payload["asset_walk"] = walk

# ---- no-write proof ---------------------------------------------------------

actions_after = Card::Action.count
payload["no_write_proof"] = {
  "actions_before" => actions_before,
  "actions_after" => actions_after,
  "unchanged" => actions_before == actions_after
}

# ---- write ------------------------------------------------------------------

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "no_write_proof: #{payload['no_write_proof'].inspect}"
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
$stdout.flush
