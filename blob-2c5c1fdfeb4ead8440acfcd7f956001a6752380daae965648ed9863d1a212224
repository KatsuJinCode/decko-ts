# revert-trace.rb -- traces the act-row writes of the REVIVING revert
# (leftover-probe.rb step 9's shape): what inserts/deletes hit card_actions
# for the junction that the revert revives.
#
#   DATABASE_URL=sqlite3:<deck copy> bundle exec decko runner revert-trace.rb
#
# Builds Host + junction child, deletes the host, then sends the same revert
# request the probe sends, logging every card_actions INSERT/DELETE and every
# UPDATE cards SET trash.

def log_sql(topic, payload)
  sql = payload[:sql].to_s
  return unless sql =~ /INSERT INTO "card_actions"|DELETE FROM "card_actions" WHERE "card_actions"."id" = |UPDATE "cards" SET .*trash/

  warn "[trace] #{sql.slice(0, 160)}"
end

ActiveSupport::Notifications.subscribe("sql.active_record") do |*args|
  ev = ActiveSupport::Notifications::Event.new(*args)
  log_sql(ev.name, ev.payload)
end

Host = "TraceRevive Host"
Junction = "TraceRevive Host+TraceRevive Kid"

def run
  host = Card.create!(name: Host, type: "RichText", content: "h",
                      subcards: { "+TraceRevive Kid" => { content: "k" } })
  junction_id = Card.fetch(Junction).id
  host_id = host.id
  warn "[trace] host=#{host_id} junction=#{junction_id}"
  host = Card.find(host_id)
  host.delete!
  warn "[trace] after delete: junction row trash=#{Card.where(id: junction_id).pick(:trash)} actions=#{Card::Action.where(card_id: junction_id).pluck(:id)}"

  act = Card::Action.where(card_id: host_id).order(:id).last.card_act_id
  params = ActiveSupport::HashWithIndifferentAccess.new(
    "mark" => Host, "look_in_trash" => "true", "assign" => "true",
    "revert_to" => "previous", "revert_act" => act.to_s,
    "card" => { "skip" => "validate_renaming" }
  )
  Card::Env.params = params
  card = Card.uri_fetch(params)
  warn "[trace] revert target=#{card&.id}"
  card.update! params[:card].to_h
  warn "[trace] after revert: host row trash=#{Card.where(id: host_id).pick(:trash)} host actions=#{Card::Action.where(card_id: host_id).pluck(:id)}"
  warn "[trace] after revert: junction row trash=#{Card.where(id: junction_id).pick(:trash)} junction actions=#{Card::Action.where(card_id: junction_id).pluck(:id)}"
  warn "[trace] junction changes=#{Card::Change.where(card_action_id: Card::Action.where(card_id: junction_id).pluck(:id)).pluck(:id, :field, :value).inspect}"
ensure
  Card::Env.params = {}
end

warn "[trace] result=#{ActiveSupport::Dependencies.interlock.permit_concurrent_loads { Thread.new { Card::Auth.as_bot { run } }.value.inspect }}"
