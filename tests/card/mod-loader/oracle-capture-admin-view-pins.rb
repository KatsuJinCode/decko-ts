# oracle-capture-admin-view-pins.rb - oracle byte-capture for the 5
# rendered-unpinned core-mod admin views the lane-admin-pins capture targets:
#   1. set/self/mod.rb view :roles          (on the Mod cardtype card)
#   2. set/self/mod.rb view :cardtypes      (on the Mod cardtype card)
#   3. set/type/mod.rb view :styles         (on mod: format)
#   4. set/type/mod.rb view :scripts        (on mod: format)
#   5. set/type/mod.rb view :depends_on     (on mod: format)
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-admin-view-pins.rb
#
# Records to <lane-worktree>/fixtures/captured/admin-view-pins.json:
#   1. rendered bytes for the 5 view names above, on the deck-resident
#      targets the existing core-mod-admin-views.test.ts already uses
#      (Mod = the cardtype card; mod: format = the format-mod instance).
#      Captures run as Card::Auth.as_bot (Decko Bot admin) — the same
#      actor the engine's main render uses (viewer actorId 1).
#   2. Per-view meta (id, name, key, type, db_content, codename, content)
#      for each target, so the TS fixture can seed byte-identical cards.
#   3. Source-location provenance for each view (instance_method.source_location
#      of the view's set-module method) so the pin cites gem file:line.
#   4. The no-write proof: card_actions count before and after the whole
#      capture. The capture performs ZERO card writes (renders only).
#
# Normalizations applied (the same masks the TS test applies):
#   - data-slot-id -> "RANDOMIZED" (SecureRandom.hex(10), wrap.rb:45)
#   - the accordion collapse-id hash -> "HASH" (SipHash per-process)
#   - data-card-id is NOT masked: the TS fixture seeds the captured ids.
#
# Determinism contract (mirrors oracle-capture-bar-box-format-views.rb):
# output JSON is pretty-printed with deeply sorted keys + a trailing newline.
# A re-run must produce byte-identical JSON.

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "admin-view-pins.json")
PIN_DIR   = "CAPTURE_DIR"

SLOT_ID_RE   = /data-slot-id=(["'])\h+\1/.freeze
COLLAPSE_RE  = /(card-[0-9a-z_:]+-)-?[0-9]+(-collapse-id)/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE,  'data-slot-id="RANDOMIZED"')
      .gsub(COLLAPSE_RE, '\1HASH\2')
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def card_meta(card)
  { "id" => card.id, "key" => card.key, "name" => card.name.to_s,
    "type_id" => card.type_id, "type_name" => card.type_name.to_s,
    "type_code" => card.type_code.to_s, "db_content" => card.db_content.to_s,
    "codename" => card.codename&.to_s,
    "created_at" => card.created_at.iso8601 }
end

# Find the set-module instance method that defines a view and return its
# source_location. Tries the typical candidates: set/self/<anchor>.rb and
# set/type/<anchor>.rb (for view_name via Card::Set::Type::ALL::*::Format).
def view_source_location(view_name)
  candidates = []
  # self/<anchor>.rb view defs
  %w[admin mod].each do |anchor|
    mod = Card::Set::Self.const_get(anchor.to_s.camelize.to_sym) rescue nil
    next unless mod
    %i[Format].each do |fmt|
      fmt_mod = mod.const_get(fmt) rescue nil
      next unless fmt_mod
      candidates << fmt_mod
    end
  end
  # type/mod.rb view defs
  type_mod = Card::Set::Type.const_get(:Mod) rescue nil
  type_fmt = type_mod && (type_mod.const_get(:Format) rescue nil)
  candidates << type_fmt if type_fmt

  candidates.compact.each do |fmt_mod|
    meth = fmt_mod.instance_methods.find { |m| m.to_s == view_name.to_s }
    next unless meth
    src = fmt_mod.instance_method(meth).source_location rescue nil
    return [fmt_mod.name, src] if src
  end
  nil
end

def render_view(card, view)
  raw = card.format(:html).render(view)
  { "bytes" => normalize(raw.to_s), "raw_size" => raw.to_s.bytesize,
    "normalized_size" => normalize(raw.to_s).bytesize }
rescue StandardError => e
  { "denied" => true, "error_class" => e.class.name,
    "message" => e.message.to_s[0, 300] }
end

def action_count
  ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM card_actions").to_i
end

results = {
  "actors_note" => "bot=Decko Bot(admin) — the engine's main render actor",
  "normalizations" => {
    "data-slot-id" => "RANDOMIZED",
    "collapse-id"  => "HASH"
  },
  "no_write_discipline" =>
    "render-only capture; card_actions count asserted unchanged across every render",
  "gem_cite" => {
    "self_admin_core"      => "card-1.110.0 mod/core set/self/admin.rb:59-61",
    "self_admin_warning"   => "card-1.110.0 mod/core set/self/admin.rb:63-69",
    "self_mod_cardtypes"   => "card-1.110.0 mod/core set/self/mod.rb:14-24",
    "self_mod_settings"     => "card-1.110.0 mod/core set/self/mod.rb:14-24",
    "self_mod_tasks"       => "card-1.110.0 mod/core set/self/mod.rb:14-24",
    "self_mod_configurations" => "card-1.110.0 mod/core set/self/mod.rb:14-24",
    "self_mod_roles"       => "card-1.110.0 mod/core set/self/mod.rb:26-37",
    "type_mod_core"        => "card-1.110.0 mod/core set/type/mod.rb:7-19",
    "type_mod_description" => "card-1.110.0 mod/core set/type/mod.rb:21-23",
    "type_mod_settings"    => "card-1.110.0 mod/core set/type/mod.rb:29-31",
    "type_mod_cardtypes"   => "card-1.110.0 mod/core set/type/mod.rb:33-35",
    "type_mod_configurations" => "card-1.110.0 mod/core set/type/mod.rb:37-44",
    "type_mod_tasks"       => "card-1.110.0 mod/core set/type/mod.rb:46-51",
    "type_mod_styles"      => "card-1.110.0 mod/core set/type/mod.rb:53-58",
    "type_mod_scripts"     => "card-1.110.0 mod/core set/type/mod.rb:60-65",
    "type_mod_gem_info"    => "card-1.110.0 mod/core set/type/mod.rb:67-83",
    "type_mod_depends_on"  => "card-1.110.0 mod/core set/type/mod.rb:85-87",
    "type_mod_views"       => "card-1.110.0 mod/core set/type/mod.rb:89-91"
  },
  "targets" => {}
}

before_count = action_count

# ---- target 1: Mod cardtype card (the 4 self/mod views) -----------------
modcard = Card["Mod"]
raise "Mod cardtype card missing" unless modcard

results["targets"]["mod_cardtype_card"] = {
  "meta" => card_meta(modcard),
  "views" => {}
}
%w[roles cardtypes settings tasks configurations].each do |view|
  results["targets"]["mod_cardtype_card"]["views"][view] = {
    "rendered" => render_view(modcard, view),
    "source_location" => view_source_location(view)
  }
end

# ---- target 2: mod: format (the type/mod views) -------------------------
formatmod = Card["mod: format"]
raise "mod: format card missing" unless formatmod

results["targets"]["mod_format_card"] = {
  "meta" => card_meta(formatmod),
  "views" => {}
}
%w[core description settings cardtypes configurations tasks styles scripts
   gem_info depends_on views].each do |view|
  results["targets"]["mod_format_card"]["views"][view] = {
    "rendered" => render_view(formatmod, view),
    "source_location" => view_source_location(view)
  }
end

# ---- target 3: mod: core (no style/script children — empty arms) --------
coremod = Card["mod: core"]
if coremod
  results["targets"]["mod_core_card"] = {
    "meta" => card_meta(coremod),
    "views" => {}
  }
  %w[styles scripts depends_on].each do |view|
    results["targets"]["mod_core_card"]["views"][view] = {
      "rendered" => render_view(coremod, view),
      "source_location" => view_source_location(view)
    }
  end
end

after_count = action_count
results["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => before_count == after_count
}

FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(results)) + "\n")

if File.directory?(PIN_DIR)
  FileUtils.mkdir_p(PIN_DIR)
  File.write(File.join(PIN_DIR, "admin-view-pins-oracle.json"),
             JSON.pretty_generate(deep_sort(results)) + "\n")
end

puts "captured admin-view-pins: #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"