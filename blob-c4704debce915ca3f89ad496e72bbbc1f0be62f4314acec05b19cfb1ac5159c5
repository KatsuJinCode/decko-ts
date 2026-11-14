# capture-help-guide-follow-defaults-oracle.rb — DOES NOT COMPLETE.
#
# Kept as the record of the attempt, not as working tooling: this lane needs
# to SEED probe cards (the questions are about cards the deck does not
# have), and the oracle app's create path raises on any new junction card:
#
#   Card::Error::NoMethodError: undefined method `rule_class_name' for nil
#     at card-mod-permissions-0.20.0/set/all/permissions.rb:64
#
# Measured twice in this lane, on two different decks: the anonymized
# corpus-v2.sqlite3 copy (whose junction structure is stripped - 40,090 rows
# with a null name AND null left/right ids) and the development.sqlite3
# copy (a real, fully-structured deck, 1,363 cards). Both die at the first
# `Card.create!` of a compound name. The two READ-ONLY captures that DID
# run - and that answer the same questions from cards the deck already has
# - are capture-readonly-follow-defaults-and-core-shape.rb and
# capture-readonly-rule-card-core-type-shape.rb.
#
# Original intent of this script (the R16 :guide / :popover probe deck and
# the M1 *follow defaults probe), for whoever picks the write path up:
# Read-only renders against a DISPOSABLE COPY of a deck; the original is
# never connected (the guard below refuses any other database, and the
# receipt records the deck's sha256 + card_actions count before AND after
# the run).
#
# Why these three questions need Ruby and not gem-reading:
#   1. R16 :popover — the in-repo fixture
#      fixtures/captured/help-popover.json captured
#      `Card["Oracle Help Popover Probe+*help"].format.render(:popover)`
#      = an anchor whose data-bs-content is the compound's dbContent
#      ("popover probe card body"). The TS port, on a compound seeded with
#      type_id = Setting, renders the SETTING cardtype's :core
#      (card-mod-rules set/type/setting.rb:39-55, the "All X rules that
#      apply to" listing) instead. Either the fixture's probe card was NOT
#      Setting-typed (a seed artifact) or the port's dispatch is wrong.
#      This capture renders the SAME view for a Setting-typed compound, a
#      RichText-typed compound, and an untyped compound, which settles it.
#   2. R16 :guide — guide.rb:34-40 nests the guide RULE card with view:
#      :core. For a Setting-typed rule card Ruby's :core is
#      set/type/setting.rb's listing (set/rule/html_views.rb's :core just
#      calls super() for a non-Search rule), so the "guide text = the
#      rule's dbContent" expectation may be Ruby-false. Captured here for
#      the Setting-typed rule, the POINTER-typed rule (guide.rb's
#      `first_card if type_id == PointerID` arm) and the Markdown arm.
#   3. M1 *follow defaults — the set/self/follow_defaults.rb set module's
#      :edit_buttons / :confirm_update_all. Ruby's self pattern anchors on
#      card.name (09_self.rb), and Cardname#safe_key (cardname-0.20.0
#      lib/cardname/variants.rb:19) is `key.tr("*","X")` — for the card
#      named "*follow defaults" the key singularizes, so the anchor token
#      is SELF-Xfollow_default while the set module's constant is
#      FollowDefaults. This capture prints the deck's own
#      safe_set_keys + which modules Ruby's MRO actually includes, plus the
#      render result for both views.
#
# RUN (from C:/localProjects/decko-ts/tools/oracle/decko-oracle-app):
#   RAILS_ENV=development \
#   DATABASE_URL=sqlite3:C:/localProjects/decko-ts-mm-I-R/tmp/oracle/corpus-v2.sqlite3 \
#   MM_IR_DB=C:/localProjects/decko-ts-mm-I-R/tmp/oracle/corpus-v2.sqlite3 \
#   bundle exec decko runner C:/localProjects/decko-ts-mm-I-R/benchmarks/capture-help-guide-follow-defaults-oracle.rb
#
# DETERMINISM: every probe is a find-or-create by name; the render phase
# writes nothing (card_actions count is compared around it and a mismatch
# raises). Card creation happens BEFORE the measured render phase, so the
# no-write proof covers the captures themselves.

require "json"
require "fileutils"
require "time"

OUT_PATH = "C:/localProjects/decko-ts-mm-I-R/fixtures/captured/help-guide-follow-defaults-oracle.json"

# --- guard: only ever run against the named disposable copy ----------------
#
# THE DECK: a COPY of the oracle app's development.sqlite3 - a real,
# fully-structured deck (1,363 cards, 913 named; *help id 90, *guide id 89,
# *follow defaults id 467). The anonymized corpus-v2.sqlite3 is NOT usable
# as a probe deck: its junction structure is stripped - 40,090 rows carry a
# null name AND null left/right ids - so any create that walks a rule or
# permission lookup dies in permissions.rb:64 (`rule_class_name' for nil).
# Measured in this lane before switching decks (two failed runs, both on
# the anonymized copy). The original development.sqlite3 is never
# connected; the receipt records its sha256 + card_actions count before
# AND after the run.
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

def find_or_create(name, attrs = {})
  card = Card[name]
  return card if card

  Card.create!({ name: name }.merge(attrs))
  Card[name]
end

def render(card, view)
  normalize(card.format.render(view.to_sym))
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message}"
end

def normalize(text)
  return nil if text.nil?

  text.to_s.gsub("\r\n", "\n")
end

out = { "captured_at" => Time.now.utc.iso8601, "probes" => {}, "seed_log" => {} }

# ---------------------------------------------------------------------------
# seed the probe deck (idempotent, before the measured render phase)
# ---------------------------------------------------------------------------
Card::Auth.as_bot do
probe_left = find_or_create("Oracle Popover Typed", content: "popover probe card body")
probe_left_basic = find_or_create("Oracle Popover Basic", content: "popover basic body")
probe_left_plain = find_or_create("Oracle Popover Plain", content: "popover plain body")
# the *help setting must exist for the +*help compounds
find_or_create("Oracle Popover Typed+*self")
find_or_create("Oracle Popover Typed+*self+*help", content: "Moderator-approved help text.")

typed = find_or_create("Oracle Popover Typed+*help", content: "popover probe card body")
basic = find_or_create("Oracle Popover Basic+*help", content: "popover basic body")
plain = find_or_create("Oracle Popover Plain+*help", content: "popover plain body")

# force the Setting type explicitly (the pin question is exactly this type)
typed.update!(type_id: Card::SettingID) if typed.type_id != Card::SettingID
basic.update!(type_id: Card::RichTextID) if basic.type_id != Card::RichTextID

guide_set = find_or_create("Oracle Guide Probe+*self")
guide_rule = find_or_create("Oracle Guide Probe+*self+*guide",
                            type: "Setting",
                            content: "Editing guidance rule text for the probe card.")
guide_rule.update!(type_id: Card::SettingID) if guide_rule.type_id != Card::SettingID
guide_content = find_or_create("Oracle Guide Content", content: "The actual guide body.")
guide_pointer_rule = find_or_create("Oracle Guide Probe+*self+*guide2", type: "Setting", content: "")
guide_pointer_rule.update!(type_id: Card::PointerID)
guide_pointer_rule.create_pointer(:left, guide_content.id) if guide_pointer_rule.respond_to?(:create_pointer)

end # Card::Auth.as_bot (the seeding block)

follow_defaults = Card["*follow defaults"]

out["seed_log"] = {
  "typed" => { "id" => typed.id, "name" => typed.name.to_s, "type_id" => typed.type_id },
  "basic" => { "id" => basic.id, "name" => basic.name.to_s, "type_id" => basic.type_id },
  "plain" => { "id" => plain.id, "name" => plain.name.to_s, "type_id" => plain.type_id },
  "guide_rule" => { "id" => guide_rule.id, "name" => guide_rule.name.to_s, "type_id" => guide_rule.type_id },
  "guide_pointer_rule" => { "id" => guide_pointer_rule.id, "name" => guide_pointer_rule.name.to_s, "type_id" => guide_pointer_rule.type_id },
  "follow_defaults" => follow_defaults ? { "id" => follow_defaults.id, "name" => follow_defaults.name.to_s, "type_id" => follow_defaults.type_id } : "ABSENT",
}

# --- measured read-only render phase -----------------------------------------
actions_before = action_count

probes = {}
[["typed", typed], ["basic", basic], ["plain", plain]].each do |label, card|
  next if card.nil?

  probes["popover_#{label}"] = {
    "name" => card.name.to_s,
    "type_id" => card.type_id,
    "safe_set_keys" => begin
      card.safe_set_keys
    rescue StandardError => e
      "ERR #{e.class}"
    end,
    "core" => render(card, :core),
    "popover" => render(card, :popover),
  }
end

probes["guide_rule_setting_typed"] = {
  "name" => guide_rule.name.to_s,
  "type_id" => guide_rule.type_id,
  "core" => render(guide_rule, :core),
}
probes["guide_pointer_rule"] = {
  "name" => guide_pointer_rule.name.to_s,
  "type_id" => guide_pointer_rule.type_id,
  "core" => render(guide_pointer_rule, :core),
}
probes["guide_view_on_plain_card"] = {
  "name" => probe_left_plain.name.to_s,
  "guide" => render(probe_left_plain, :guide),
}
probes["guide_view_on_set_card"] = {
  "name" => guide_set.name.to_s,
  "guide" => render(guide_set, :guide),
}

if follow_defaults
  probes["follow_defaults"] = {
    "name" => follow_defaults.name.to_s,
    "type_id" => follow_defaults.type_id,
    "safe_set_keys" => begin
      follow_defaults.safe_set_keys
    rescue StandardError => e
      "ERR #{e.class}"
    end,
    "core" => render(follow_defaults, :core),
    "confirm_update_all" => render(follow_defaults, :confirm_update_all),
    "edit_buttons" => render(follow_defaults, :edit_buttons),
    "self_modules" => begin
      follow_defaults.format.self.class.name
    rescue StandardError => e
      "ERR #{e.class}"
    end,
    "included_self_modules" => begin
      follow_defaults.singleton_class.ancestors.map(&:name).grep(/FollowDefault/)
    rescue StandardError => e
      "ERR #{e.class}"
    end,
  }
end

actions_after = action_count
raise "NO-WRITE VIOLATION: card_actions #{actions_before} -> #{actions_after}" unless actions_before == actions_after

out["probes"] = probes
out["card_actions"] = { "before_render" => actions_before, "after_render" => actions_after }
FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(out))
puts "WROTE #{OUT_PATH}"
puts "card_actions #{actions_before} == #{actions_after}"
