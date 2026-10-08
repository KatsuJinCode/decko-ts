# carrierwave-input-half-followup.rb - the LEAF-level probes the main capture
# did not reach: the virtual group/file cards under a mod asset card, the
# compress_assets config that gates the uglifier/SassC arms, and the
# style: mods scss-core decomposition (per-item cores + presence).
#
# Run (from tools/oracle/decko-oracle-app of the MAIN checkout):
#   RAILS_ENV=development bundle exec decko runner \
#     REPO_ROOT//tools/oracle/carrierwave-input-half-followup.rb
#
# Read-only, same contract as carrierwave-input-half-capture.rb.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "tmp", "carrierwave-input-half-followup.json")

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def byte_record(str, full_below: 4096)
  return { "class" => str.class.name, "nil" => true } if str.nil?
  rec = { "class" => str.class.name, "bytes" => str.bytesize }
  if str.bytesize <= full_below
    rec["full"] = str
  else
    rec["sha256"] = Digest::SHA256.hexdigest(str)
    rec["head"] = str[0, 384]
    rec["tail"] = str[-384, 384]
  end
  rec
end

def safe
  yield
rescue StandardError => e
  { "error_class" => e.class.name, "error_message" => e.message }
end

def card_probe(card, deep: false)
  p = {
    "name" => safe { card.name.to_s },
    "id" => safe { card.id },
    "class" => safe { card.class.name },
    "type_name" => safe { card.type_name },
    "virtual?" => safe { card.virtual? },
    "new?" => safe { card.new? },
    "set_modules" => safe { card.set_modules.map(&:to_s) },
    "db_content" => safe { byte_record(card.db_content) }
  }
  if deep && card.respond_to?(:input_item_cards)
    items = safe { card.input_item_cards }
    if items.is_a?(Array)
      p["input_item_card_count"] = items.size
      p["input_item_cards"] = items.map { |ic| file_card_probe(ic) }
    else
      p["input_item_cards"] = items
    end
  end
  p
end

# a virtual asset FILE card: the content is the file path; the core/compressed
# renders are the leaf bytes the group joins
def file_card_probe(card)
  p = card_probe(card)
  p["content_method"] = safe { byte_record(card.content, full_below: 2048) }
  p["js_compressed"] = safe { byte_record(card.format(:js)._render_compressed) }
  p["js_core"] = safe { byte_record(card.format(:js).render(:core)) }
  p["scss_core"] = safe { byte_record(card.format(:scss).render(:core)) }
  p["css_compressed"] = safe { byte_record(card.format(:css)._render_compressed) }
  p
end

payload = {}

payload["config"] = {
  "compress_assets" => safe { Cardio.config.compress_assets },
  "file_storage" => safe { Cardio.config.file_storage },
  "rails_env" => safe { Rails.env.to_s }
}

# ---- the mod script group decomposition (mod: bootstrap+*script) ------------
ms = safe { Card.fetch("mod: bootstrap+*script") }
if ms.is_a?(Hash)
  payload["mod_bootstrap_script"] = ms
else
  probe = card_probe(ms)
  probe["item_cards"] = safe do
    ms.item_cards.map { |ic| card_probe(ic, deep: true) }
  end
  # the group card's js core (what the List-level nest lands on)
  probe["group_js_core"] = safe do
    group = ms.item_cards.first
    group ? byte_record(group.format(:js).render(:core)) : nil
  end
  payload["mod_bootstrap_script"] = probe
end

# ---- style: mods scss-core decomposition ------------------------------------
sm = safe { Card.fetch("style: mods") }
if sm.is_a?(Hash)
  payload["style_mods"] = sm
else
  probe = card_probe(sm)
  probe["item_names"] = safe { sm.item_names }
  probe["item_states"] = safe do
    sm.item_cards.map do |ic|
      { "name" => ic.name.to_s, "id" => ic.id, "real?" => ic.real?,
        "unknown?" => (ic.respond_to?(:unknown?) ? ic.unknown? : "N/A"),
        "type_name" => ic.type_name }
    end
  end
  probe["scss_core"] = safe { byte_record(sm.format(:scss).render(:core)) }
  probe["item_scss_cores"] = safe do
    sm.item_cards.each_with_object({}) do |ic, h|
      h[ic.name.to_s] = byte_record(ic.format(:scss).render(:core))
    end
  end
  probe["assemble_matches_core"] = safe { sm.assemble_asset_input_content == sm.format(:scss).render(:core) }
  payload["style_mods"] = probe
end

# ---- yeti skin internals (the SassC leaf) -----------------------------------
ys = safe { Card.fetch("yeti skin") }
if ys.is_a?(Hash)
  payload["yeti_skin"] = ys
else
  probe = card_probe(ys)
  probe["item_names"] = safe { ys.respond_to?(:item_names) ? ys.item_names : "N/A" }
  probe["content_method"] = safe { byte_record(ys.content) }
  probe["css_compressed"] = safe { byte_record(ys.format(:css)._render_compressed) }
  probe["css_compressed_matches_assemble"] = safe { ys.format(:css)._render_compressed == ys.assemble_asset_input_content }
  payload["yeti_skin"] = probe
end

# ---- the outputter assemblies vs their parts (join-semantics proof) ---------
as = safe { Card.fetch("*all+*script") }
if as.is_a?(Hash)
  payload["all_script_join_proof"] = as
else
  payload["all_script_join_proof"] = safe do
    parts = as.input_item_cards.map(&:asset_input_content)
    whole = as.input_from_item_cards
    {
      "parts_count" => parts.size,
      "whole_bytes" => whole.bytesize,
      "join_newline_matches" => parts.compact.join("\n") == whole,
      "join_two_newlines_matches" => parts.compact.join("\n\n") == whole,
      "parts_compact_nil_free" => parts.all? { |s| !s.nil? }
    }
  end
end

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH}"
