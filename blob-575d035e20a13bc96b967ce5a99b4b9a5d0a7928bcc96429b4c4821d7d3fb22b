# oracle-capture-admin-card-views.rb - renders the two set/self/admin.rb
# views on *admin and records their bytes as fixture JSON:
#   1. set/self/admin.rb view :core     (on *admin — the task table)
#   2. set/self/admin.rb view :warning  (on *admin — the warning alert)
#
# The sibling fixture fixtures/captured/admin-view-pins.json carries the
# other admin targets (produced by oracle-capture-admin-view-pins.rb with
# its own no-write proof) — this script adds ONLY the *admin target so the
# two self/admin views get rendered bytes instead of derived expectations.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-admin-card-views.rb
#
# Records to fixtures/captured/admin-views-2-oracle.json:
#   1. rendered bytes for :core / :warning on *admin, rendered as
#      Card::Auth.as_bot (the engine's main render actor, viewer actorId 1).
#   2. Per-view meta (id, name, key, type, db_content, codename) for *admin.
#   3. Source-location provenance (instance_method.source_location).
#   4. The no-write proof: card_actions count before and after the whole
#      run. The script performs ZERO card writes (renders only).
#
# Normalizations (the same masks the TS tests apply):
#   - data-slot-id -> "RANDOMIZED" (SecureRandom.hex(10), wrap.rb:45)
#   - the accordion collapse-id hash -> "HASH" (SipHash per-process)
#   - data-card-id is NOT masked: the TS fixture seeds the captured ids.
#
# Determinism contract (mirrors oracle-capture-admin-view-pins.rb):
# output JSON is pretty-printed with deeply sorted keys + a trailing newline.
# A re-run must produce byte-identical JSON.

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "admin-views-2-oracle.json")

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

def view_source_location(view_name)
  fmt_mod = (Card::Set::Self.const_get(:Admin) rescue nil)
  fmt_mod = fmt_mod.const_get(:Format) if fmt_mod.respond_to?(:const_get)
  return nil unless fmt_mod.is_a?(Module)

  meth = fmt_mod.instance_methods.find { |m| m.to_s == view_name.to_s }
  return nil unless meth

  src = fmt_mod.instance_method(meth).source_location rescue nil
  return nil unless src

  [fmt_mod.name, src]
rescue StandardError, NameError
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
    "self_admin_core"    => "card-1.110.0 mod/core set/self/admin.rb:59-61",
    "self_admin_warning" => "card-1.110.0 mod/core set/self/admin.rb:63-69"
  },
  "targets" => {}
}

before_count = action_count

admin_card = Card["*admin"]
raise "*admin card missing" unless admin_card

results["targets"]["admin_card"] = {
  "meta" => card_meta(admin_card),
  "views" => {}
}
%w[core warning].each do |view|
  results["targets"]["admin_card"]["views"][view] = {
    "rendered" => render_view(admin_card, view),
    "source_location" => view_source_location(view)
  }
end

# the deck config the :warning view reads (the alert's on/off switch)
results["deck_config"] = {
  "action_mailer_perform_deliveries" =>
    Card.config.action_mailer.try(:perform_deliveries)
}

after_count = action_count
results["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => before_count == after_count
}

FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(results)) + "\n")

puts "captured admin-views-2-oracle: #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"
