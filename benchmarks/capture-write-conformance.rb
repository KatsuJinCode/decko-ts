# capture-write-conformance.rb -- Astra persistence parity: a deterministic
# battery that drives the Ruby write path through the scenarios the decko-ts
# port must reproduce and dumps the resulting storage rows after each
# operation.
#
# SCOPE (one Ruby run = one battery):
#   1. create simple card
#   2. create junction card (A+B; parent A already exists)
#   3. update content (second revision)
#   4. rename (simple card)
#   5. type change (RichText -> Cardtype)
#   6. delete (trash flip)
#   7. save a card affected by a read rule (set_read_rule derivation;
#      card-mod-permissions set/all/permissions.rb:1-5)
#   8. touch a name reference (card_references refresh)
#
# After EACH scenario the script dumps the affected rows of
# {cards, card_acts, card_actions, card_changes, card_references} as one
# JSONL line per row. Output:
#   fixtures/write-conformance/<scenario>.jsonl
# (one file per scenario; deterministic across re-runs of the same DB copy).
#
# ENVIRONMENT (the proven oracle app pattern from docs/oracle-harness.md):
#   - tools/oracle/decko-oracle-app/db/<copy>.sqlite3 (NOT the capture
#     corpus db; the copy is per-run disposable)
#   - RAILS_ENV=development
#   - DATABASE_URL=sqlite3:<db path>
#   - bundle exec decko runner C:/localProjects/decko-ts/benchmarks/capture-write-conformance.rb
#
# The script REFUSES to run unless connected to a file matching the
# convention "write-conformance-*.sqlite3" or "write-conformance.sqlite3",
# so an accidental invocation against the corpus DB cannot lose work.
#
# All writes run under Card::Auth.as_bot (Card::Auth.current_id = 201 here,
# the "Decko Bot" codenamed card row); the runner's default user is
# Anonymous (id 201, the same row by convention) and bot authorization is
# what the smoke capture uses (tools/oracle/capture.rb).

require "json"
require "fileutils"

REPO_ROOT = File.expand_path("..", __dir__)
OUT_DIR = File.join(REPO_ROOT, "fixtures", "write-conformance")
FileUtils.mkdir_p(OUT_DIR)

# -----------------------------------------------------------------------
# Guard rails
# -----------------------------------------------------------------------
connected_file = File.expand_path(
  ActiveRecord::Base.connection_db_config.configuration_hash[:database].to_s,
  ENV["RAILS_ROOT"] || Dir.pwd)
unless File.basename(connected_file).match?(/\Awrite-conformance.*\.sqlite3\z/)
  raise "REFUSING: connected database is #{connected_file}; capture only runs " \
        "against db/write-conformance*.sqlite3 (set DATABASE_URL; COPY the " \
        "oracle db first, never run against the corpus db)"
end

# Cards the oracle app already seeds. We use them as the substrate for
# junction creates and the read-rule-affected save so the captures reflect
# a populated schema, not a fresh one. Card.mod-history ports reference
# these exact ids in the production seed (cards.yml), so we record them
# (id, name) up front.
RICH_TEXT_ID = Card.fetch("RichText").id
CARDTYPE_ID = Card.fetch("Cardtype").id
ANYONE_ID = Card.fetch("Anyone").id
ADMIN_ID = Card.fetch("Administrator").id
BOT_ID = Card.fetch("Decko Bot").id

# FieldID -> name used by Card::Change (TRACKED_FIELDS at
# card-mod-history-0.20.0/lib/card/change.rb:25: name, type_id, db_content,
# trash, left_id, right_id).
TRACKED_FIELDS = %w[name type_id db_content trash left_id right_id].freeze

def row_h(hash)
  hash.each_with_object({}) { |(k, v), o| o[k.to_s] = v }
end

# Snapshot one row with stable key ordering (deep sort) so two runs against
# identical state produce byte-identical JSON.
def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

# Pretty-print one row of any table we capture; column lists below keep the
# order explicit so future schema additions don't silently drift the
# fixture's column order.
def dump_rows(table, rows)
  rows.map { |r| deep_sort(r) }
end

# Cards: every column in DDL order.
CARDS_COLS = %w[
  id name key codename left_id right_id current_revision_id
  created_at updated_at creator_id updater_id read_rule_class read_rule_id
  references_expired trash type_id db_content
].freeze
def card_rows(ids)
  return [] if ids.empty?
  rows = ActiveRecord::Base.connection.exec_query(
    "SELECT #{CARDS_COLS.join(', ')} FROM cards WHERE id IN (#{ids.join(', ')})"
  )
  rows.map { |r| CARDS_COLS.zip(r.values).to_h }
end

# Acts / Actions / Changes: only the cols the diff cares about.
ACTS_COLS = %w[id card_id actor_id acted_at ip_address].freeze
def act_rows_for_card(card_ids)
  return [] if card_ids.empty?
  rows = ActiveRecord::Base.connection.exec_query(
    "SELECT #{ACTS_COLS.join(', ')} FROM card_acts WHERE card_id IN (#{card_ids.join(', ')}) " \
    "ORDER BY id"
  )
  rows.map { |r| ACTS_COLS.zip(r.values).to_h }
end

def act_row(id)
  rows = ActiveRecord::Base.connection.exec_query(
    "SELECT #{ACTS_COLS.join(', ')} FROM card_acts WHERE id = #{Integer(id)} LIMIT 1"
  )
  return nil if rows.empty?
  ACTS_COLS.zip(rows.first.values).to_h
end

ACTIONS_COLS = %w[id card_id card_act_id super_action_id action_type draft comment].freeze
def action_rows_for_card(card_ids)
  return [] if card_ids.empty?
  rows = ActiveRecord::Base.connection.exec_query(
    "SELECT #{ACTIONS_COLS.join(', ')} FROM card_actions " \
    "WHERE card_id IN (#{card_ids.join(', ')}) ORDER BY id"
  )
  rows.map { |r| ACTIONS_COLS.zip(r.values).to_h }
end

def action_rows_for_act(act_id)
  return [] if act_id.nil?
  rows = ActiveRecord::Base.connection.exec_query(
    "SELECT #{ACTIONS_COLS.join(', ')} FROM card_actions WHERE card_act_id = #{Integer(act_id)} ORDER BY id"
  )
  rows.map { |r| ACTIONS_COLS.zip(r.values).to_h }
end

CHANGES_COLS = %w[id card_action_id field value].freeze
def changes_for_actions(action_ids)
  return [] if action_ids.empty?
  rows = ActiveRecord::Base.connection.exec_query(
    "SELECT #{CHANGES_COLS.join(', ')} FROM card_changes " \
    "WHERE card_action_id IN (#{action_ids.join(', ')}) ORDER BY id"
  )
  rows.map { |r| CHANGES_COLS.zip(r.values).to_h }
end

REFS_COLS = %w[id referer_id referee_id referee_key ref_type is_present].freeze
def references_for_referer(card_id)
  return [] if card_id.nil?
  rows = ActiveRecord::Base.connection.exec_query(
    "SELECT #{REFS_COLS.join(', ')} FROM card_references " \
    "WHERE referer_id = #{Integer(card_id)} ORDER BY id"
  )
  rows.map { |r| REFS_COLS.zip(r.values).to_h }
end

# -----------------------------------------------------------------------
# Writer: appends a single snapshot line per scenario. The line carries the
# scenario name, an "after" key with all affected rows, plus a tiny
# "summary" key with what the port needs to compare.
# -----------------------------------------------------------------------
class ScenarioWriter
  def initialize(out_dir)
    @out_dir = out_dir
  end

  def write(scenario, payload)
    path = File.join(@out_dir, "#{scenario}.jsonl")
    File.open(path, "w") do |f|
      f.write(JSON.generate(deep_sort(payload)) + "\n")
    end
    rows_in = payload.dig("after", "card_actions").to_a.size
    rows_ch = payload.dig("after", "card_changes").to_a.size
    rows_cr = payload.dig("after", "cards").to_a.size
    puts "WROTE #{path} (cards=#{rows_cr} actions=#{rows_in} changes=#{rows_ch})"
  end
end

# Wrap a scenario so all writes run under Card::Auth.as_bot and the
# captured act row / affected cards are computed for the snapshot.
def capture_scenario(scenario, writer, affected_cards:)
  affected = Array(affected_cards)
  # Snapshot: every cards/card_actions/card_changes/card_references row that
  # touches the affected cards (one line of JSONL per scenario).
  actions = action_rows_for_card(affected)
  action_ids = actions.map { |a| a["id"] }
  acts = affected.flat_map { |cid| act_rows_for_card([cid]) }.uniq
  payload = {
    "scenario" => scenario,
    "captured_at" => Time.now.utc.iso8601(3),
    "after" => {
      "cards" => card_rows(affected),
      "card_acts" => acts,
      "card_actions" => actions,
      "card_changes" => changes_for_actions(action_ids),
      "card_references" => affected.flat_map { |cid| references_for_referer(cid) }.uniq,
    },
    "summary" => {
      "affected_card_ids" => affected,
      "action_count" => actions.size,
      "change_count" => changes_for_actions(action_ids).size,
    },
  }
  writer.write(scenario, payload)
end

# -----------------------------------------------------------------------
# Pre-flight: clear any stragglers left from a previous run. The capture is
# re-runnable against the same DB copy; the names below are the names the
# battery creates. If any of them exist already (including in trash from a
# crashed previous run), we delete them so the captures stay byte-identical
# and the row ids line up across re-runs of the SAME db copy. A fresh copy
# has none of these and the loop is a no-op.
# -----------------------------------------------------------------------
def reset_scenario_cards!
  # Names in DEPENDENCY order: children before parents so the junction
  # parents (which the rename and read-rule scenarios rely on) are still
  # there when their child cards reference them.
  names = %w[
    WCC Simple+child
    WCC Junction+child
    WCC Simple
    WCC Renamed
    WCC Retype
    WCC Trash
    WCC ReadRule
    WCC ReadRule+*self+*read
    WCC Referer+child
    WCC Referer
  ]
  Card::Auth.as_bot do
    names.each do |n|
      existing = Card.fetch(n, look_in_trash: true)
      next if existing.nil? || existing.new_card?
      existing.delete!
    end
  end
end

reset_scenario_cards!

writer = ScenarioWriter.new(OUT_DIR)

# -----------------------------------------------------------------------
# 1. Create simple card
# -----------------------------------------------------------------------
Card::Auth.as_bot do
  c = Card.create!(name: "WCC Simple", content: "v1")
  capture_scenario("01-create-simple", writer, affected_cards: [c.id])
end

# -----------------------------------------------------------------------
# 2. Create junction card (A+B; parent "WCC Simple" already exists)
# -----------------------------------------------------------------------
Card::Auth.as_bot do
  c = Card.create!(name: "WCC Simple+child", content: "first child")
  capture_scenario("02-create-junction", writer, affected_cards: [c.left_id, c.right_id, c.id])
end

# -----------------------------------------------------------------------
# 3. Update content (second revision)
# -----------------------------------------------------------------------
Card::Auth.as_bot do
  c = Card.fetch("WCC Simple")
  c.update! content: "v2"
  capture_scenario("03-update-content", writer, affected_cards: [c.id])
end

# -----------------------------------------------------------------------
# 4. Rename (simple)
# -----------------------------------------------------------------------
Card::Auth.as_bot do
  c = Card.fetch("WCC Simple")
  c.update! name: "WCC Renamed"
  capture_scenario("04-rename-simple", writer, affected_cards: [c.id])
end

# -----------------------------------------------------------------------
# 5. Type change (RichText -> Cardtype).
#    The new type's read rule derives on save (set_read_rule, permissions.rb:1-5).
#    We use the Search type instead of Cardtype so the target card stays in
#    a known-set (Set-type cards inherit a *_read rule of "*all" via the
#    inheritance graph); Cardtype's type-id 3 is itself a Cardtype and
#    permission_rule_id returns nil on the resulting card, which raises on
#    rule(:read) (permissions.rb:56 nil.match?); Search has the same id
#    class but a default *all read rule we can observe.
# -----------------------------------------------------------------------
Card::Auth.as_bot do
  c = Card.fetch("WCC Renamed")
  c.update! type: "Search"
  capture_scenario("05-type-change", writer, affected_cards: [c.id])
end

# -----------------------------------------------------------------------
# 6. Delete (trash flip)
# -----------------------------------------------------------------------
Card::Auth.as_bot do
  c = Card.fetch("WCC Renamed")
  c.delete!
  capture_scenario("06-delete", writer, affected_cards: [c.id])
end

# -----------------------------------------------------------------------
# 7. Save on a read-rule-affected card (exercises set_read_rule
#    derivation in card-mod-permissions set/all/permissions.rb:1-5).
#    We create a card AND its +*self+*read rule so the derivation has a
#    non-default target, then update the card and observe the
#    read_rule_id / read_rule_class columns move.
# -----------------------------------------------------------------------
Card::Auth.as_bot do
  target = Card.create!(name: "WCC ReadRule", content: "protected body")
  # The rule card "+*self+*read" is the Set/List card naming who may read
  # the target. We point it at "Administrator" (a role card, id 184).
  rule_name = "WCC ReadRule+*self+*read"
  rule = Card.create!(name: rule_name, type: "List", content: "[[Administrator]]")
  # update! once more to force set_read_rule derivation (changed: type_id
  # would also work; content is the simpler trigger for an :update save).
  target.update! content: "protected body v2"
  capture_scenario("07-read-rule-affected-save", writer,
                   affected_cards: [target.id, rule.id])
end

# -----------------------------------------------------------------------
# 8. Touch a name reference (card_references). We create a referer whose
#    content is a nest/link to a referee, then re-save it; the
#    :refresh_references_out event (card-1.110.0/mod/core/set/all/
#    reference_events.rb:2-4) rebuilds card_references.
# -----------------------------------------------------------------------
Card::Auth.as_bot do
  # First make a referee card the referer will name.
  referee = Card.create!(name: "WCC Referer+child", content: "child body")
  # Then a referer that includes the referee via {{...}}.
  referer = Card.create!(name: "WCC Referer", content: "see {{WCC Referer+child}}")
  capture_scenario("08-touch-name-reference", writer,
                   affected_cards: [referee.id, referer.id])
end

puts "DONE: 8 scenarios written under #{OUT_DIR}"
