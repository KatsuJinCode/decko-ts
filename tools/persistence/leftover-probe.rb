# leftover-probe.rb -- the Ruby oracle half of the persistence LEFTOVER probe.
#
# The same shape as persist-write-probe.rb (one `decko runner` process per
# step, driver run-ruby-steps.sh with PROBE_SCRIPT=leftover-probe.rb), for
# the operations the 70-step op list does not cover:
#
#   1  create a host card                       (setup)
#   2  create a rule card under it              (setup)
#   3  RENAME the rule card (another setting)
#   4  assign non-standard content to *recent settings
#   5  assign non-standard content to the Mod card
#   6  create a host card                       (setup)
#   7  create its child                         (setup)
#   8  delete the host (trash cascade)          (setup)
#   9  revert the delete act (REVIVES the trashed child)
#   10 create a card with a subcard            (setup)
#   11 create the subcard's own child          (NOT in act 10)
#   12 revert act 10 (trashes the subcard — the subcard's child cascade?)
#
# The probe's scope is wider than the name prefix: *recent settings and the
# Mod card are IN the dump (the two self-set list cards), so their rows are
# compared step by step.

require "json"

OUTDIR = ARGV[0] or abort "usage: leftover-probe.rb <outdir> <stepIndex>"
STEP = Integer(ARGV[1] || "0")
abort "step index must be >= 1" if STEP < 1

PREFIX = "PersistProbe"

# The probe's own cards by name prefix, plus the two self-set list cards
# whose assigned content this probe measures (Decko's keys singularize:
# "*recent settings" keys as "*recent_setting"), and everything reachable
# from them through left_id/right_id.
PROBE_SQL = <<~SQL.freeze
  WITH RECURSIVE probe(id) AS (
    SELECT id FROM cards WHERE name LIKE '#{PREFIX}%' OR key IN ('*recent_setting', 'mod')
    UNION
    SELECT c.id FROM cards c JOIN probe p ON c.left_id = p.id OR c.right_id = p.id
  ) SELECT id FROM probe
SQL

def probe_ids
  ActiveRecord::Base.connection.select_values(PROBE_SQL).map(&:to_i).sort
end

def probe_state
  keep = probe_ids
  return { "probe_card_ids" => [], "cards" => [], "card_acts" => [],
           "card_actions" => [], "card_changes" => [], "card_references" => [],
           "card_virtuals" => [] } if keep.empty?
  c = ActiveRecord::Base.connection
  list = keep.join(",")
  actions = c.select_all(<<~SQL).to_a
    SELECT id, card_id, card_act_id, super_action_id, action_type, draft, comment
    FROM card_actions WHERE card_id IN (#{list}) ORDER BY id
  SQL
  action_ids = actions.map { |a| a["id"] }.join(",")
  changes =
    if action_ids.empty?
      []
    else
      c.select_all(<<~SQL).to_a
        SELECT id, card_action_id, field, value FROM card_changes
        WHERE card_action_id IN (#{action_ids}) ORDER BY id
      SQL
    end
  {
    "probe_card_ids" => keep,
    "cards" => c.select_all(<<~SQL).to_a,
      SELECT id, name, key, codename, left_id, right_id, trash, type_id, db_content,
             creator_id, updater_id, read_rule_class, read_rule_id,
             current_revision_id, references_expired, created_at, updated_at
      FROM cards WHERE id IN (#{list}) ORDER BY id
    SQL
    "card_acts" => c.select_all(<<~SQL).to_a,
      SELECT id, card_id, actor_id, ip_address, acted_at FROM card_acts
      WHERE card_id IN (#{list}) ORDER BY id
    SQL
    "card_actions" => actions,
    "card_changes" => changes,
    "card_references" => c.select_all(<<~SQL).to_a,
      SELECT id, referer_id, referee_key, referee_id, ref_type, is_present
      FROM card_references
      WHERE referer_id IN (#{list}) OR referee_key LIKE '#{PREFIX.downcase}%'
      ORDER BY id
    SQL
    "card_virtuals" => c.select_all(<<~SQL).to_a,
      SELECT id, left_id, right_id, left_key, content FROM card_virtuals
      WHERE left_id IN (#{list}) ORDER BY id
    SQL
  }
end

def id_of(name)
  by_id = {}
  ActiveRecord::Base.connection.select_all(
    "SELECT id, name, left_id, right_id FROM cards"
  ).each { |r| by_id[r["id"].to_i] = r }
  memo = {}
  composed = lambda do |id|
    return memo[id] if memo.key?(id)
    row = by_id[id]
    return nil if row.nil?
    if row["left_id"].nil? && row["name"].is_a?(String) && !row["name"].empty?
      return memo[id] = row["name"]
    end
    return nil if row["left_id"].nil?
    left = composed.call(row["left_id"].to_i)
    right = composed.call(row["right_id"].to_i)
    memo[id] = (left && right) ? "#{left}+#{right}" : nil
  end
  names = {}
  by_id.keys.each do |id|
    n = composed.call(id)
    names[n] = id if n
  end
  names[name]
end

def nth_action_id(name, n)
  ids = Card::Action.where(card_id: id_of(name)).order(:id).pluck(:id)
  n == :last ? ids.last : ids[n - 1]
end

def act_of_action(action_id)
  Card::Action.find(action_id).card_act_id
end

# The history pane's revert request (the same request shape
# persist-write-probe.rb sends; card-mod-history revert_actions_link).
def revert_request(name, revert_params)
  params = ActiveSupport::HashWithIndifferentAccess.new(
    revert_params.merge("mark" => name, "look_in_trash" => "true", "assign" => "true",
                        "card" => { "skip" => "validate_renaming" })
  )
  Card::Env.params = params
  card = Card.uri_fetch(params)
  raise "revert target not found: #{name}" unless card
  card.update! params[:card].to_h
  card
ensure
  Card::Env.params = {}
end

def run_op(step)
  case step
  when 1
    [:create, "create rule host", -> { Card.create!(name: "PersistProbe Ruled", type: "RichText", content: "r") }]
  when 2
    [:create, "create rule card", lambda {
      Card.create!(name: "PersistProbe Ruled+*self+*read", content: "[[Anyone Signed In]]")
    }]
  when 3
    [:rename, "rename the rule card (another setting)", lambda {
      Card.fetch("PersistProbe Ruled+*self+*read").update!(name: "PersistProbe Ruled+*self+*create")
    }]
  when 4
    [:update, "assign non-standard content to *recent settings", lambda {
      Card.fetch("*recent settings").update!(content: "[[*read]]\n\n  [[*create]]  \n~1\n[[*all+*layout]]")
    }]
  when 5
    [:update, "assign non-standard content to the Mod card", lambda {
      Card.fetch("Mod").update!(content: "[[history]]  \n\n  [[Machines]]\n:recent_settings")
    }]
  when 6
    [:create, "create revive host", -> { Card.create!(name: "PersistProbe Host", type: "RichText", content: "h") }]
  when 7
    [:create, "create revive host's child", lambda {
      Card.create!(name: "PersistProbe Host+PersistProbe Kid", type: "RichText", content: "k")
    }]
  when 8
    [:delete, "delete the host (trash cascade)", -> { Card.find(id_of("PersistProbe Host")).delete! }]
  when 9
    [:revert, "revert the delete act (revives the trashed child)", lambda {
      act = act_of_action(nth_action_id("PersistProbe Host", :last))
      revert_request("PersistProbe Host", "revert_to" => "previous", "revert_act" => act.to_s)
    }]
  when 10
    [:create, "create cascade parent with a subcard", lambda {
      Card.create!(name: "PersistProbe Par", type: "RichText", content: "p",
                   subcards: { "+PersistProbe KidA" => { content: "k" } })
    }]
  when 11
    [:create, "create the subcard's own child", lambda {
      Card.create!(name: "PersistProbe Par+PersistProbe KidA+PersistProbe Grand", type: "RichText", content: "g")
    }]
  when 12
    [:revert, "revert the create act (subcard trash; its child?)", lambda {
      act = act_of_action(nth_action_id("PersistProbe Par", 1))
      revert_request("PersistProbe Par", "revert_to" => "previous", "revert_act" => act.to_s)
    }]
  else
    abort "unknown step #{step}"
  end
end

if (watchdog = ENV["PERSIST_WATCHDOG"])
  Thread.new do
    sleep Integer(watchdog)
    Thread.list.each do |t|
      warn "[persist] thread #{t.inspect}"
      (t.backtrace || []).first(60).each { |line| warn "[persist] | #{line}" }
    end
    exit! 3
  end
end

kind, label, fn = run_op(STEP)

def run_on_op_thread(&block)
  ActiveSupport::Dependencies.interlock.permit_concurrent_loads { Thread.new(&block).value }
end

detail = run_on_op_thread do
  begin
    value = Card::Auth.as_bot { fn.call }
    { "ok" => true, "kind" => kind, "value" => value.respond_to?(:id) ? value.id : value }
  rescue SystemStackError, StandardError => e
    warn "[persist] step #{STEP} #{label}: #{e.class}: #{e.message}"
    { "ok" => false, "kind" => kind, "error" => "#{e.class}: #{e.message}" }
  end
end

render = nil
if kind == :revert && detail["ok"] && detail["value"].is_a?(Integer)
  render = run_on_op_thread do
    Card::Auth.as_bot do
      Card::Cache.reset_all
      card = Card.fetch(detail["value"], look_in_trash: true)
      { "name" => card.name.to_s, "trash" => card.trash, "type" => card.type_name.to_s,
        "core" => card.trash ? nil : card.format(:html).render(:core).to_s }
    rescue StandardError => e
      { "error" => "#{e.class}: #{e.message}" }
    end
  end
end

state = probe_state
warn "[persist] #{STEP} #{label} ok=#{detail['ok']} " \
     "cards=#{state['cards'].size} acts=#{state['card_acts'].size} " \
     "actions=#{state['card_actions'].size} changes=#{state['card_changes'].size} " \
     "refs=#{state['card_references'].size}"

require "fileutils"
FileUtils.mkdir_p(OUTDIR)
File.write(
  File.join(OUTDIR, format("step-%02d.json", STEP)),
  JSON.pretty_generate({ "step" => STEP, "label" => label, "detail" => detail, "state" => state,
                         "codename_ids" => { "salt" => Card::Codename.id(:salt),
                                             "password" => Card::Codename.id(:password) },
                         **(render ? { "render" => render } : {}) })
)
