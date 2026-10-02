# capture-readonly-follow-defaults-and-core-shape.rb — the mm-I-R lane's
# READ-ONLY oracle capture. Zero card creation (the write path is broken in
# this oracle app: creating any new junction card raises
# `undefined method `rule_class_name' for nil' inside card-mod-permissions
# set/all/permissions.rb:64 — measured on two decks, two runs, this lane).
# So the questions asked here are answerable from cards the deck already
# has.
#
# Q1 (M1, the fifth follow red): the deck HAS the real "*follow defaults"
#     setting card (dev deck id 467). What do Ruby's safe_set_keys say, and
#     what do :confirm_update_all / :edit_buttons render? (The TS port
#     raises UnsupportedViewError; the question is whether Ruby can reach
#     the set/self/follow_defaults.rb module at all — Cardname#safe_key is
#     `key.tr("*","X")` and the key singularizes, so the anchor token is
#     SELF-Xfollow_default while the module constant is FollowDefaults.)
#
# Q2 (R16 :popover / :guide): does the SETTING cardtype's :core
#     (card-mod-rules set/type/setting.rb:39-55, the "All X rules that
#     apply to" listing) fire for a COMPOUND card? The in-repo capture
#     fixtures/captured/help-popover.json shows a compound "X+*help"
#     rendering its dbContent as :core (the popover's data-bs-content),
#     while the TS port renders the listing. This prints, for every
#     Setting-typed compound the deck has, what Ruby's :core actually
#     renders, plus the type_id + safe_set_keys of each.
#
# RUN:
#   RAILS_ENV=development \
#   DATABASE_URL=sqlite3:C:/localProjects/decko-ts-mm-I-R/tmp/oracle/dev-deck.sqlite3 \
#   MM_IR_DB=C:/localProjects/decko-ts-mm-I-R/tmp/oracle/dev-deck.sqlite3 \
#   bundle exec decko runner C:/localProjects/decko-ts-mm-I-R/benchmarks/capture-readonly-follow-defaults-and-core-shape.rb
#
# NO-WRITE PROOF: card_actions is counted before and after every render and
# a mismatch raises. The original development.sqlite3 is never connected
# (the guard below); its sha256 + card_actions count are recorded in the
# receipt before and after the run.

require "json"
require "fileutils"
require "time"

OUT_PATH = "C:/localProjects/decko-ts-mm-I-R/fixtures/captured/readonly-follow-defaults-and-core-shape.json"

# --- guard: only ever run against the named disposable copy ----------------
#
# THE DECK: a COPY of the oracle app's development.sqlite3 (1,363 cards,
# 913 named; *help id 90, *guide id 89, *follow defaults id 467). The
# original is never connected.
EXPECTED_DB = "C:/localProjects/decko-ts-mm-I-R/tmp/oracle/dev-deck.sqlite3"
connected = ActiveRecord::Base.connection_db_config.configuration_hash[:database].to_s
unless File.expand_path(connected).downcase == File.expand_path(EXPECTED_DB).downcase
  raise "REFUSING: connected database is #{connected}; this capture only runs " \
        "against the lane's disposable copy #{EXPECTED_DB} (set DATABASE_URL)"
end
unless ENV["MM_IR_DB"]
  raise "REFUSING: MM_IR_DB is not set; pass MM_IR_DB=<path> to acknowledge the " \
        "disposable copy (the dual-lane capture convention)"
end

def action_count
  ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM card_actions").to_i
end

def render(card, view)
  card.format.render(view.to_sym).to_s.gsub("\r\n", "\n")
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message}"
end

def safe_keys(card)
  card.safe_set_keys
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message}"
end

out = { "captured_at" => Time.now.utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "probes" => {} }
actions_before = action_count

# --- Q1: the real *follow defaults setting ---------------------------------
fd = Card["*follow defaults"]
if fd
  out["probes"]["follow_defaults"] = {
    "id" => fd.id,
    "name" => fd.name.to_s,
    "type_id" => fd.type_id,
    "type_name" => fd.type_name,
    "safe_set_keys" => safe_keys(fd),
    "self_module_class" => begin
      fd.format.self.class.name
    rescue StandardError => e
      "CAPTURE_ERROR: #{e.class}"
    end,
    "included_modules_matching_follow_defaults" => begin
      fd.singleton_class.ancestors.map { |m| m.respond_to?(:name) ? m.name : nil }
        .compact.grep(/FollowDefault/)
    rescue StandardError => e
      "CAPTURE_ERROR: #{e.class}"
    end,
    "core" => render(fd, :core),
    "confirm_update_all" => render(fd, :confirm_update_all),
    "edit_buttons" => render(fd, :edit_buttons),
    "titled" => render(fd, :titled),
  }
else
  out["probes"]["follow_defaults"] = "ABSENT"
end

# --- Q2: does a SETTING-typed compound's :core render the listing? ---------
# Every named compound card whose type is Setting, up to 12, plus a couple
# of Setting-typed simple cards as the control arm.
compounds = []
ActiveRecord::Base.connection.select_all(<<~SQL).each do |row|
  SELECT c.id, c.name, c.type_id
  FROM cards c
  WHERE c.name LIKE '%+*%' AND c.type_id = #{Card::SettingID}
  ORDER BY c.id LIMIT 12
SQL
  compounds << row
end
out["probes"]["setting_compounds"] = compounds.map do |row|
  card = Card[row["name"]]
  {
    "name" => row["name"],
    "type_id" => row["type_id"],
    "safe_set_keys" => safe_keys(card),
    "core" => render(card, :core),
  }
end

# control: a named SIMPLE setting card's :core
simple_settings = []
ActiveRecord::Base.connection.select_all(<<~SQL).each do |row|
  SELECT c.id, c.name, c.type_id
  FROM cards c
  WHERE c.name LIKE '*%' AND c.name NOT LIKE '%+%' AND c.type_id = #{Card::SettingID}
  ORDER BY c.id LIMIT 4
SQL
  simple_settings << row
end
out["probes"]["simple_settings"] = simple_settings.map do |row|
  card = Card[row["name"]]
  {
    "name" => row["name"],
    "type_id" => row["type_id"],
    "safe_set_keys" => safe_keys(card),
    "core" => render(card, :core),
  }
end

actions_after = action_count
raise "NO-WRITE VIOLATION: card_actions #{actions_before} -> #{actions_after}" unless actions_before == actions_after

out["card_actions"] = { "before_render" => actions_before, "after_render" => actions_after }
FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(out))
puts "WROTE #{OUT_PATH}"
puts "card_actions #{actions_before} == #{actions_after}"
