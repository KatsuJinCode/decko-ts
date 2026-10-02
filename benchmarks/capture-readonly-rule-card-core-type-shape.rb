# capture-readonly-rule-card-core-type-shape.rb — READ-ONLY oracle capture
# (mm-I-R lane). Zero writes; card_actions compared around every render.
#
# Q (the family behind several standing reds — R16 :popover/:guide, M2
#   followers :core, the date mod's virtual-card :core): what TYPE does a
#   real rule card carry, and what does its :core render?
#
# The TS test suites seed their rule/compound probe cards with
# typeId 14 (= the Setting cardtype in their fixture ids), and the port then
# renders card-mod-rules' SETTING cardtype :core (set/type/setting.rb:39-55,
# "All X rules that apply to" + per-class rule bars) where the test expects
# the card's dbContent. The dev deck's real junctions (450 rows with
# left_id/right_id, names nulled by the anonymizer) show a different type
# for a rule card — this capture pins the truth for both arms:
#   * a real RULE card ("*all+*read", resolved structurally) — type + :core
#   * a real SETTING card ("*read") — type + :core (the listing arm)
#   * the type histogram of the deck's junction rows
#
# RUN:
#   RAILS_ENV=development \
#   DATABASE_URL=sqlite3:C:/localProjects/decko-ts-mm-I-R/tmp/oracle/dev-deck.sqlite3 \
#   MM_IR_DB=C:/localProjects/decko-ts-mm-I-R/tmp/oracle/dev-deck.sqlite3 \
#   bundle exec decko runner C:/localProjects/decko-ts-mm-I-R/benchmarks/capture-readonly-rule-card-core-type-shape.rb

require "json"
require "fileutils"
require "time"

OUT_PATH = "C:/localProjects/decko-ts-mm-I-R/fixtures/captured/readonly-rule-card-core-type-shape.json"

EXPECTED_DB = "C:/localProjects/decko-ts-mm-I-R/tmp/oracle/dev-deck.sqlite3"
connected = ActiveRecord::Base.connection_db_config.configuration_hash[:database].to_s
unless File.expand_path(connected).downcase == File.expand_path(EXPECTED_DB).downcase
  raise "REFUSING: connected database is #{connected}; expected #{EXPECTED_DB}"
end
raise "REFUSING: MM_IR_DB is not set" unless ENV["MM_IR_DB"]

def action_count
  ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM card_actions").to_i
end

def probe(card)
  {
    "id" => card.id,
    "name" => card.name.to_s,
    "type_id" => card.type_id,
    "type_name" => begin
      card.type_name
    rescue StandardError => e
      "ERR #{e.class}"
    end,
    "safe_set_keys" => begin
      card.safe_set_keys
    rescue StandardError => e
      "ERR #{e.class}"
    end,
    "core" => begin
      card.format.render(:core).to_s.gsub("\r\n", "\n")[0, 600]
    rescue StandardError => e
      "CAPTURE_ERROR: #{e.class}: #{e.message}"
    end,
  }
end

out = { "captured_at" => Time.now.utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "probes" => {} }
actions_before = action_count

out["probes"]["constants"] = {
  "SettingID" => Card::SettingID,
  "SetID" => Card::SetID,
  "ListTypeID" => begin
    Card["List"]&.id
  rescue StandardError
    nil
  end,
}

# the two arms
[["rule_card", "*all+*read"], ["setting_card", "*read"], ["rule_card_type", "*type+*read"],
 ["list_card", "Decko Bot"]].each do |label, name|
  card = Card[name]
  out["probes"][label] = card ? probe(card) : "ABSENT"
end

# the junction type histogram (names are null, so the sides carry the shape)
out["probes"]["junction_type_histogram"] =
  ActiveRecord::Base.connection.select_all(<<~SQL).to_a
    SELECT type_id, COUNT(*) AS n
    FROM cards
    WHERE left_id IS NOT NULL
    GROUP BY type_id
    ORDER BY n DESC
  SQL

# a junction row's structural name: rebuild it from the sides so the render
# can name the card (the anonymizer nulled names, the ids survived)
rows = ActiveRecord::Base.connection.select_all(<<~SQL).to_a
  SELECT c.id, c.name, c.type_id, c.left_id, c.right_id, c.db_content,
         l.name AS left_name, r.name AS right_name
  FROM cards c
  LEFT JOIN cards l ON l.id = c.left_id
  LEFT JOIN cards r ON r.id = c.right_id
  WHERE c.left_id IS NOT NULL AND l.name IS NOT NULL AND r.name IS NOT NULL
  ORDER BY c.id LIMIT 8
SQL
out["probes"]["junction_rows"] = rows.map do |row|
  entry = { "id" => row["id"], "left" => row["left_name"], "right" => row["right_name"],
            "type_id" => row["type_id"], "db_content" => row["db_content"].to_s[0, 60] }
  reconstructed = "#{row['left_name']}+#{row['right_name']}"
  card = Card[reconstructed]
  entry["reconstructed_name"] = reconstructed
  entry["render"] = if card
                      { "type_id" => card.type_id,
                        "safe_set_keys" => (begin
                          card.safe_set_keys
                        rescue StandardError => e
                          "ERR #{e.class}"
                        end),
                        "core" => (begin
                          card.format.render(:core).to_s.gsub("\r\n", "\n")[0, 400]
                        rescue StandardError => e
                          "CAPTURE_ERROR: #{e.class}: #{e.message}"
                        end) }
                    else
                      "UNRESOLVED"
                    end
  entry
end

actions_after = action_count
raise "NO-WRITE VIOLATION: #{actions_before} -> #{actions_after}" unless actions_before == actions_after

out["card_actions"] = { "before_render" => actions_before, "after_render" => actions_after }
FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(out))
puts "WROTE #{OUT_PATH}"
puts "card_actions #{actions_before} == #{actions_after}"
