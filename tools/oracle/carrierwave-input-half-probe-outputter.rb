# carrierwave-input-half-probe-outputter.rb - ADDITIVE probe outputter: a small
# real TypePlusRight::Set::Script outputter whose input_from_item_cards bytes
# are small enough to embed whole in the TS test assertions (the two deck
# outputters assemble ~370KB/~1MB - shas only there).
#
# Items: the NINE mod script groups whose asset_input_content was captured
# FULL (<=4096B) in carrierwave-input-half-oracle.json - mod: search+*script
# (2634B), mod: rules+*script (2309B), mod: account+*script (587B),
# mod: carrierwave+*script (2951B), mod: ace editor+*script (1663B),
# mod: bar and box+*script (2068B), mod: follow+*script (899B),
# mod: tabs+*script (1071B), mod: recaptcha+*script (1778B).
#
# The rule card is UPDATED to this item list when it differs (the card was
# created by THIS lane's first probe run - the two-item version - and the
# update only extends this lane's own probe fixture; no pre-existing deck
# card is touched).
#
# Creates (if missing): "Oracle Cw In" (a Set card) + the rule
# "Oracle Cw In+*script". No deletes - same additive contract as
# carrierwave-write-seam-capture.rb.
#
# Run (from tools/oracle/decko-oracle-app of the MAIN checkout):
#   RAILS_ENV=development bundle exec decko runner \
#     C:/localProjects/decko-ts-lane-cwinput/tools/oracle/carrierwave-input-half-probe-outputter.rb

require "json"
require "digest"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "tmp", "carrierwave-input-half-probe.json")

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def safe
  yield
rescue StandardError => e
  { "error_class" => e.class.name, "error_message" => e.message }
end

payload = {}
seed_log = {}

PROBE_ITEMS = [
  "mod: search+*script", "mod: rules+*script", "mod: account+*script",
  "mod: carrierwave+*script", "mod: ace editor+*script",
  "mod: bar and box+*script", "mod: follow+*script", "mod: tabs+*script",
  "mod: recaptcha+*script"
].freeze
PROBE_CONTENT = PROBE_ITEMS.join("\n")

Card::Auth.as_bot do
  if Card.fetch("Oracle Cw In", new: {}).new_card?
    Card.create! name: "Oracle Cw In", type: "Set"
    seed_log["Oracle Cw In"] = "created"
  else
    seed_log["Oracle Cw In"] = "present"
  end
  rule = Card["Oracle Cw In+*script"]
  if rule.nil?
    Card.create! name: "Oracle Cw In+*script", type: "List", content: PROBE_CONTENT
    seed_log["Oracle Cw In+*script"] = "created"
  elsif rule.db_content != PROBE_CONTENT
    rule.update! content: PROBE_CONTENT
    seed_log["Oracle Cw In+*script"] = "updated to #{PROBE_ITEMS.size} items"
  else
    seed_log["Oracle Cw In+*script"] = "present (#{PROBE_ITEMS.size} items)"
  end
end
payload["seed_log"] = seed_log

out = safe { Card.fetch("Oracle Cw In+*script") }
if out.is_a?(Hash)
  payload["outputter"] = out
else
  probe = {}
  probe["id"] = out.id
  probe["class"] = out.class.name
  probe["type_name"] = out.type_name
  probe["set_modules"] = safe { out.set_modules.map(&:to_s) }
  probe["content"] = out.db_content
  probe["is_asset_outputter"] = out.is_a?(Card::Set::Abstract::AssetOutputter)
  probe["output_format"] = safe { out.output_format.to_s }
  probe["item_names"] = safe { out.item_names }
  probe["known_only_names"] = safe { out.item_cards(known_only: true).compact.reject(&:trash).map(&:name) }
  probe["input_item_card_count"] = safe { out.input_item_cards.size }
  probe["input_item_card_names"] = safe { out.input_item_cards.map(&:name) }
  probe["find_invalid_input"] = safe do
    inv = out.find_invalid_input
    inv.nil? ? nil : inv.name.to_s
  end
  # THE whole-assembly bytes (embeddable: <=4KB) - all three joints
  probe["input_from_item_cards"] = safe { out.input_from_item_cards }
  probe["input_from_item_cards_joint_empty"] = safe { out.input_from_item_cards("") }
  probe["input_from_item_cards_joint_pipe"] = safe { out.input_from_item_cards("|") }
  # the per-item components for the offline join check
  probe["parts"] = safe { out.input_item_cards.map { |c| { "name" => c.name.to_s, "bytes" => c.asset_input_content.bytesize } } }
  payload["outputter"] = deep_sort(probe)
end

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH}"
