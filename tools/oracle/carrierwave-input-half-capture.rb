# carrierwave-input-half-capture.rb - oracle capture for the INPUT half of
# the asset-output machinery (the lane-carrierwave-input-half port):
#   card-mod-assets set/abstract/asset_outputter.rb:32-34 input_from_item_cards
#   card-mod-assets set/abstract/asset_outputter.rb:74-76 input_item_cards
#   card-mod-assets set/abstract/asset_inputter.rb:44-53  asset_input_content
#                                                         / assemble_asset_input_content
#   card-mod-assets set/right/asset_input.rb              the +*asset input child
#   card-mod-style  set/abstract/style_group.rb:5-15      the scss group assemble
#   card-mod-script set/abstract/script_group.rb:5-11     the js group assemble
#
# Run (from tools/oracle/decko-oracle-app of the MAIN checkout - the app and
# its development deck live there):
#   RAILS_ENV=development bundle exec decko runner \
#     C:/localProjects/decko-ts-lane-cwinput/tools/oracle/carrierwave-input-half-capture.rb
#
# Determinism contract (same as carrierwave-write-seam-capture.rb): READ-ONLY
# probing - no creates, no updates, no deletes. asset_input_content may call
# update_asset_input when the stored input is blank, but the +*asset input
# child is an Abstract::VirtualCache card (save_virtual_content aborts :success
# and writes the in-memory Virtual store, never the DB), so no deck rows
# change. Large captured strings carry a sha256 + byte length so the TS
# assertions can pin them without embedding hundreds of KB; the head/tail
# slices are recorded too.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "tmp", "carrierwave-input-half-oracle.json")

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

# big-string record: full bytes only when short, else sha + length + slices
def byte_record(str, full_below: 4096)
  return { "class" => str.class.name, "nil" => true } if str.nil?
  rec = { "class" => str.class.name, "bytes" => str.bytesize }
  if str.bytesize <= full_below
    rec["full"] = str
  else
    rec["sha256"] = Digest::SHA256.hexdigest(str)
    rec["head"] = str[0, 512]
    rec["tail"] = str[-512, 512]
  end
  rec
end

def safe(label)
  yield
rescue StandardError => e
  { "error_class" => e.class.name, "error_message" => e.message }
end

def set_module_names(card)
  card.set_modules.map(&:to_s)
rescue StandardError => e
  { "error_class" => e.class.name, "error_message" => e.message }
end

# the per-item probe: everything the TS port's item branch reads
def item_probe(card)
  p = {}
  p["name"] = safe("name") { card.name }
  p["key"] = safe("key") { card.key }
  p["id"] = safe("id") { card.id }
  p["class"] = safe("class") { card.class.name }
  p["type_name"] = safe("type_name") { card.type_name }
  p["set_modules"] = safe("set_modules") { set_module_names(card) }
  p["virtual"] = safe("virtual?") { card.virtual? }
  p["new"] = safe("new?") { card.new? }
  p["trash"] = safe("trash?") { card.trash? }
  p["responds_asset_input_content"] = safe("responds?") { card.respond_to?(:asset_input_content) }
  p["responds_asset_input"] = safe("responds?") { card.respond_to?(:asset_input) }
  p["responds_input_item_cards"] = safe("responds?") { card.respond_to?(:input_item_cards) }
  p["responds_input_format"] = safe("responds?") { card.respond_to?(:input_format) }
  p["db_content"] = safe("db_content") { byte_record(card.db_content) }
  p["content"] = safe("content") { byte_record(card.content) }
  if card.respond_to?(:input_format)
    p["input_format"] = safe("input_format") { card.input_format.to_s }
  end
  if card.respond_to?(:input_view)
    p["input_view"] = safe("input_view") { card.input_view.to_s }
  end
  # asset_inputter.rb:44-49 asset_input_content - THE component bytes
  p["asset_input_content"] = safe("asset_input_content") { byte_record(card.asset_input_content) }
  # the virtual assemble (asset_inputter.rb:51-53)
  if card.respond_to?(:assemble_asset_input_content)
    p["assemble_asset_input_content"] =
      safe("assemble") { byte_record(card.assemble_asset_input_content) }
  end
  # the persisted-input branch: asset_input (asset_inputter.rb:47-48)
  if card.respond_to?(:asset_input)
    p["asset_input"] = safe("asset_input") { byte_record(card.asset_input) }
    p["asset_input_blank"] = safe("blank?") { card.asset_input.blank? }
    p["asset_input_card"] = safe("asset_input_card") do
      c = card.asset_input_card
      if c.nil?
        nil
      else
        { "name" => c.name.to_s, "id" => c.id, "virtual?" => c.virtual?,
          "new?" => c.new?, "class" => c.class.name,
          "db_content" => byte_record(c.db_content) }
      end
    end
  end
  p
end

payload = {}

# ---- the deck's outputters --------------------------------------------------
# TypePlusRight::Set::Style / ::Script include Abstract::AssetOutputter
# (card-mod-style set/type_plus_right/set/style.rb, card-mod-script
# set/type_plus_right/set/script.rb). The deck boots with both rules live.
outputter_names = ["*all+*style", "*all+*script"]
payload["outputters"] = deep_sort(outputter_names.each_with_object({}) do |name, h|
  card = safe(name) { Card.fetch(name) }
  if card.is_a?(Hash) || card.nil?
    h[name] = { "fetch" => card.is_a?(Hash) ? card : "NIL" }
    next
  end
  probe = {}
  probe["id"] = card.id
  probe["class"] = card.class.name
  probe["type_name"] = card.type_name
  probe["set_modules"] = set_module_names(card)
  probe["content"] = byte_record(card.db_content)
  probe["is_asset_outputter"] = card.is_a?(Card::Set::Abstract::AssetOutputter)
  probe["output_format"] = safe("output_format") { card.output_format.to_s }
  # asset_outputter.rb:74-76
  items = safe("input_item_cards") { card.input_item_cards }
  if items.is_a?(Array)
    probe["input_item_card_count"] = items.size
    probe["input_item_cards"] = items.map { |ic| item_probe(ic) }
    probe["item_cards_known_only_names"] =
      safe("item_names") { card.item_cards(known_only: true).compact.reject(&:trash).map(&:name) }
  else
    probe["input_item_cards"] = items
  end
  # THE ASSEMBLY BYTES - asset_outputter.rb:32-34, joint "\n"
  probe["input_from_item_cards"] =
    safe("input_from_item_cards") { byte_record(card.input_from_item_cards) }
  # the joint parameter flows (asset_outputter.rb:32 signature)
  probe["input_from_item_cards_joint_empty"] =
    safe("joint") { byte_record(card.input_from_item_cards("")) }
  probe["input_from_item_cards_joint_pipe"] =
    safe("joint") { byte_record(card.input_from_item_cards("|")) }
  # the validation twin (asset_outputter.rb:16-18)
  probe["find_invalid_input"] =
    safe("find_invalid_input") do
      inv = card.find_invalid_input
      inv.nil? ? nil : { "name" => inv.name.to_s, "class" => inv.class.name }
    end
  # the referers machinery the events drive (asset_inputter.rb:3-13)
  probe["dependent_asset_inputters"] =
    safe("deps") { card.respond_to?(:dependent_asset_inputters) ? card.dependent_asset_inputters.map { |d| { "name" => d.name.to_s, "class" => d.class.name } } : "NO METHOD" }
  probe["outputters"] =
    safe("outs") { card.respond_to?(:outputters) ? card.outputters.map { |d| { "name" => d.name.to_s, "class" => d.class.name } } : "NO METHOD" }
  h[name] = probe
end)

# ---- the named inputter cards the deck carries ------------------------------
# "style: mods" is the deck-live *all+*style item (write-lane capture: id 328).
# The mod asset cards ("mod: bootstrap+*style" family) are the ModAssets
# inputters whose item cards are the VIRTUAL file cards.
named = ["style: mods", "style: mod", "mod: bootstrap+*style", "mod: bootstrap+*script",
         "mod: card-mod-bootstrap+*style"]
payload["named_cards"] = deep_sort(named.each_with_object({}) do |name, h|
  card = safe(name) { Card.fetch(name) }
  if card.is_a?(Hash) || card.nil?
    h[name] = { "fetch" => card.is_a?(Hash) ? card : "NIL (or fetch error)" }
    next
  end
  probe = item_probe(card)
  # the group branch (asset_group.rb:45-48 input_item_cards override):
  # the virtual file cards the group assembles from
  if card.respond_to?(:input_item_cards)
    items = safe("input_item_cards") { card.input_item_cards }
    if items.is_a?(Array)
      probe["input_item_card_count"] = items.size
      probe["input_item_cards"] = items.map { |ic| item_probe(ic) }
    else
      probe["input_item_cards"] = items
    end
  end
  h[name] = probe
end)

# ---- the +*asset input RIGHT machinery --------------------------------------
# right/asset_input.rb: VirtualCache + virtual_content = left's assemble.
ai_probe = {}
ai_card = safe("fetch") { Card.fetch("style: mods+*asset input") }
if ai_card.is_a?(Hash) || ai_card.nil?
  ai_probe["fetch"] = ai_card.is_a?(Hash) ? ai_card : "NIL"
else
  ai_probe["class"] = ai_card.class.name
  ai_probe["id"] = ai_card.id
  ai_probe["virtual?"] = safe("virtual?") { ai_card.virtual? }
  ai_probe["new?"] = safe("new?") { ai_card.new? }
  ai_probe["set_modules"] = safe("set_modules") { set_module_names(ai_card) }
  ai_probe["db_content"] = safe("db_content") { byte_record(ai_card.db_content) }
  ai_probe["virtual_content"] =
    safe("virtual_content") { ai_card.respond_to?(:virtual_content) ? byte_record(ai_card.virtual_content) : "NO METHOD" }
  ai_probe["updated_at"] = safe("updated_at") { ai_card.updated_at&.to_s }
end
payload["asset_input_child"] = deep_sort(ai_probe)

dir = File.dirname(OUT_PATH)
Dir.mkdir(dir) unless Dir.exist?(dir)
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH}"
