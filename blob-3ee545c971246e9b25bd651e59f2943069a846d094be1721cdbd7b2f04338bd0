# orphan-history-probe.rb -- what the Ruby oracle does when a create meets
# orphan history: card_acts / card_actions / card_changes rows that name a
# card id with no card row, at the id the next create takes.
#
#   bash tools/persistence/run-ruby.sh <oracleAppDir> <deck copy> \
#     tools/persistence/orphan-history-probe.rb
#
# Run it only against a disposable copy of a deck: it writes the orphan rows
# and one card. It prints one JSON object: the id the cards table would hand
# out next, the id the new card took, whether the save succeeded, and the new
# card's actions, changes and create action.

require "json"

conn = ActiveRecord::Base.connection
int = ->(sql) { conn.select_value(sql)&.to_i }

max_id = int.call("SELECT MAX(id) FROM cards") || 0
seq = int.call("SELECT seq FROM sqlite_sequence WHERE name = 'cards'") || 0
next_id = [max_id, seq].max + 1

conn.execute("INSERT INTO card_acts (card_id, actor_id, acted_at, ip_address) " \
             "VALUES (#{next_id}, #{Card::Auth.as_bot { Card::Auth.current_id }}, '2020-01-01 00:00:00', '192.0.2.1')")
orphan_act = int.call("SELECT MAX(id) FROM card_acts")
conn.execute("INSERT INTO card_actions (card_id, card_act_id, action_type, draft) " \
             "VALUES (#{next_id}, #{orphan_act}, 0, 0)")
orphan_action = int.call("SELECT MAX(id) FROM card_actions")
conn.execute("INSERT INTO card_changes (card_action_id, field, value) " \
             "VALUES (#{orphan_action}, 0, 'Deleted Card')")

# A Thread with the large stacks run-ruby.sh sets (see persist-write-probe.rb).
result = ActiveSupport::Dependencies.interlock.permit_concurrent_loads do
  Thread.new do
    Card::Auth.as_bot do
      card = Card.create!(name: "Orphan History Probe", type: "RichText", content: "fresh")
      { "ok" => true, "card_id" => card.id }
    rescue StandardError => e
      { "ok" => false, "error" => "#{e.class}: #{e.message}" }
    end
  end.value
end

card_id = int.call("SELECT id FROM cards WHERE name = 'Orphan History Probe'")
actions = card_id ? conn.select_rows(
  "SELECT id, card_act_id, action_type, draft FROM card_actions WHERE card_id = #{card_id} ORDER BY id"
) : []
changes = actions.to_h do |(action_id, *)|
  [action_id, conn.select_rows("SELECT field, value FROM card_changes WHERE card_action_id = #{action_id} ORDER BY id")]
end
create_action = card_id ? Card::Auth.as_bot { Card.fetch(card_id)&.create_action&.id } : nil

puts JSON.generate(
  "next_id_before" => next_id,
  "orphan" => { "card_id" => next_id, "act_id" => orphan_act, "action_id" => orphan_action },
  "save" => result,
  "card_id" => card_id,
  "actions" => actions,
  "changes_by_action" => changes,
  "create_action_id" => create_action,
)
