# history_capture.rb - RUNG 3 history-view capture: seed a deterministic
# multi-revision card family, then record Ruby's :history / :act /
# :action_summary html bytes plus the raw act/action/change rows those
# views read (the render-time query seam's target data).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner REPO_ROOT//tools/oracle/history_capture.rb
#
# Determinism contract (same rules as capture.rb):
# - the probe family is seeded ONLY when the original-name card is missing;
#   re-runs never edit it (an edit would append acts and change every
#   history byte). Delete the family from the dev DB to re-seed.
# - rendered bytes are normalized: slot-id (random by design), the
#   time_ago_in_words phrase (wall-clock dependent), and DB-local row ids
#   (card/act/action) are replaced with placeholders. The un-normalized
#   ids and timestamps ARE recorded under "state" so the TS test can seed
#   a matching-shaped DB.
# - renders run as the runner's default user (Anonymous) - the wiring
#   evidence for "anonymous can read history per Ruby's rules".

require "json"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "history-views.json")

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
# Rails time_ago_in_words phrases (ActionView::Helpers::DateHelper): the
# exact word list the history bytes carry ("edited about 2 hours ago by ...").
TIME_AGO_RE = /
  (less\ than\ a\ minute|
   less\ than\ \d+\ seconds|
   \d+\ seconds?|
   about\ \d+\ (hours?|days?|months?|years?)|
   \d+\ (minutes?|hours?|days?|months?|years?))
  \ ago
/x.freeze
# DB-local ids surfacing in the bytes: accordion collapse ids
# ("act-id-<act.id>"), per-act slot classes ("revision-<act.id>"),
# query-param links ("act_id=<id>" / "action_id=<id>"), and the card id
# attribute. Each shape normalizes independently; the raw ids live in
# "state" so tests can seed matching rows.
ACT_ID_RE     = /act-id-\d+/.freeze
REVISION_RE   = /revision-\d+/.freeze
ACT_PARAM_RE  = /act_id=\d+/.freeze
ACTION_PARAM_RE = /action_id=\d+/.freeze
CARD_ID_ATTR_RE = /data-card-id=(["'])\d+\1/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(TIME_AGO_RE, "TIME_AGO ago")
      .gsub(ACT_ID_RE, "act-id-N")
      .gsub(REVISION_RE, "revision-N")
      .gsub(ACT_PARAM_RE, "act_id=N")
      .gsub(ACTION_PARAM_RE, "action_id=N")
      .gsub(CARD_ID_ATTR_RE, 'data-card-id="N"')
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

FAMILY = ["History Probe", "History Probe Renamed",
          "History Probe Renamed+child"].freeze

def with_params(h)
  params = Card::Env.params
  saved = params.dup
  # Env.params is a plain Hash in the runner (no controller): the readers
  # are inconsistent about key style (act_from_context reads "act_id",
  # action_from_context reads :action_id), so set BOTH key styles.
  both = {}
  h.each { |k, v| both[k.to_s] = v; both[k.to_sym] = v }
  params.replace(both)
  yield
ensure
  params.replace(saved)
end

def render_normalized(card, view, params = {})
  with_params(params) { normalize(card.format.render(view)) }
end

payload = {}

# ---- seed ------------------------------------------------------------------
# The family RENAMES its seed card (the rename act is one of the captured
# behaviors), so the guard cannot key on the original name - a partial run
# leaves "History Probe" missing while "History Probe Renamed" exists.
# Instead: purge every family card (trashed included) at the SQL layer and
# seed fresh each run. The purge makes the seed CONVERGENT: same acts,
# same actions, same changes every run. Only DB-local ids differ, and ids
# are normalized out of the rendered bytes.
FAMILY_KEYS = ["history_probe", "history_probe_renamed",
               "history_probe_renamed+child"].freeze

def purge_family
  Card::Auth.as_bot do
    conn = ActiveRecord::Base.connection
    placeholders = FAMILY_KEYS.map { "?" }.join(",")
    ids = conn.select_values(
      "SELECT id FROM cards WHERE key IN (#{placeholders})", nil, FAMILY_KEYS
    ).map(&:to_i)
    ids += conn.select_values(
      "SELECT id FROM cards WHERE left_id IN (#{placeholders})", nil, ids
    ).map(&:to_i) unless ids.empty?
    ids = ids.uniq
    return if ids.empty?

    action_ids = Card::Action.where(card_id: ids).pluck(:id)
    Card::Change.where(card_action_id: action_ids).delete_all
    Card::Action.where(id: action_ids).delete_all
    Card::Act.where(card_id: ids).delete_all
    Card::Reference.where(referee_id: ids).or(Card::Reference.where(referer_id: ids)).delete_all
    Card.where(id: ids).delete_all
  end
end

purge_family
seed_log = {}
seed_log["family"] = "purged-and-reseeded"
Card::Auth.as_bot do
    Card.create! name: "History Probe", type: "RichText", content: "first body"
    seed_log["01_create"] = :ok
    p1 = Card.fetch("History Probe")
    p1.update! content: "second body"
    seed_log["02_content_update"] = :ok
    p1 = Card.fetch("History Probe")
    p1.update! name: "History Probe Renamed"
    seed_log["03_rename"] = :ok
    p1 = Card.fetch("History Probe Renamed")
    p1.update! content: "<p>third body with inclusion {{History Probe Renamed+child}}</p>"
    seed_log["04_inclusion_update"] = :ok
    Card.create! name: "History Probe Renamed+child", type: "RichText",
                 content: "child body"
    seed_log["05_child_create"] = :ok
    c1 = Card.fetch("History Probe Renamed+child")
    c1.update! content: "child body v2"
    seed_log["06_child_update"] = :ok
  end
payload["seed_log"] = seed_log

probe   = Card.fetch("History Probe Renamed")
child   = Card.fetch("History Probe Renamed+child")

# ---- raw state (the rows the views read at render time) --------------------
state = {}
acts = Card::Act.where(card_id: [probe.id, child.id]).order(:id)
state["acts"] = acts.map do |a|
  { "id" => a.id, "card_id" => a.card_id, "actor_id" => a.actor_id,
    "acted_at" => a.acted_at&.iso8601 }
end
action_rows = Card::Action.where(card_id: [probe.id, child.id]).order(:id)
state["actions"] = action_rows.map do |a|
  { "id" => a.id, "card_id" => a.card_id, "card_act_id" => a.card_act_id,
    "action_type" => a.action_type.to_s,
    "draft" => a.draft ? true : false }
end
change_rows = Card::Change.where(card_action_id: action_rows.pluck(:id)).order(:id)
state["changes"] = change_rows.map do |c|
  { "card_action_id" => c.card_action_id, "field" => c.field,
    "value" => c.value.to_s }
end
state["cards"] = {
  probe.id => { "name" => probe.name.to_s, "type_id" => probe.type_id },
  child.id => { "name" => child.name.to_s, "type_id" => child.type_id }
}
state["anonymous_id"] = Card::Auth.current_id
state["anon_ok_read_probe"] = probe.ok?(:read)
state["anon_ok_update_probe"] = probe.ok?(:update)
state["child_act_in_parent_history"] =
  probe.history_acts.map(&:id).include?(action_rows.find { |a| a.card_id == child.id }&.card_act_id)
payload["state"] = state

# ---- rendered views --------------------------------------------------------
views = {}
views["probe#history"] = begin
  render_normalized(probe, :history)
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end

parent_act_ids  = acts.select { |a| a.card_id == probe.id }.map(&:id)
child_act_ids   = acts.select { |a| a.card_id == child.id }.map(&:id)
parent_actions  = action_rows.select { |a| a.card_id == probe.id }
child_actions   = action_rows.select { |a| a.card_id == child.id }

# :act - the single-revision view. Three shapes: an explicit parent act,
# an explicit act on the nested child, and no act_id (falls to the card's
# last_action's act).
views["probe#act(parent_act_2)"] = begin
  render_normalized(probe, :act, "act_id" => parent_act_ids[1])
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end
views["probe#act(child_act)"] = begin
  render_normalized(probe, :act, "act_id" => child_act_ids[0])
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end
views["probe#act(no_param)"] = begin
  render_normalized(probe, :act)
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end

# :action_summary - the diff view. Three shapes: an update with a content
# change (real diff vs the previous action), the create action (all-added
# diff, no previous value), and a rename-only action (no content change
# -> "<i>empty</i>" + the expand toggle link).
update_action = parent_actions.find { |a| a.action_type == :update && a.id > parent_actions.first.id }
views["probe#action_summary(update_action)"] = begin
  render_normalized(probe, :action_summary, "action_id" => update_action.id)
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end
views["probe#action_summary(create_action)"] = begin
  render_normalized(probe, :action_summary, "action_id" => parent_actions.first.id)
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end
rename_act = acts.find { |a| a.card_id == probe.id && parent_act_ids.index(a.id) == 2 }
rename_action = rename_act && Card::Action.where(card_act_id: rename_act.id, card_id: probe.id).first
views["probe#action_summary(rename_action)"] = begin
  render_normalized(probe, :action_summary, "action_id" => rename_action.id)
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end
# :action_expanded for the update action - captured for the remainder list
# (the summary toggle's target), not ported this lane.
views["probe#action_expanded(update_action)"] = begin
  render_normalized(probe, :action_expanded, "action_id" => update_action.id)
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end
# anonymous wiring evidence: the bare view URL a browser hits
views["probe#content(sentinel)"] = begin
  render_normalized(probe, :content)
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end

payload["rendered"] = views

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH}"
puts "acts: #{state['acts'].map { |a| a['id'] }.inspect}"
puts "anon_ok_read_probe: #{state['anon_ok_read_probe']}"
puts "child_act_in_parent_history: #{state['child_act_in_parent_history']}"
