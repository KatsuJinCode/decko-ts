# Execute the pinned export.rb view bodies and hash helpers on synthetic rows.
require "json"
source = File.read(ARGV.fetch(0))
klass = Class.new do
  attr_accessor :card
  def self.view(name, *args, **opts, &block); define_method("view_#{name}", block); end
end
klass.class_eval(source.sub(/\Aformat :json do/, "").sub(/end\s*\z/, ""))
act_type = Struct.new(:id, :actor_id, :acted_at, :card_id)
change_type = Struct.new(:field, :value)
action_type = Struct.new(:id, :card_id, :action_type, :comment, :card_changes, :act)
acts = [act_type.new(10, 7, "2026-10-20 12:00:00", 200), act_type.new(11, 7, "2026-10-20 12:01:00", 200)]
rows = [action_type.new(20, 200, :update, nil, [change_type.new(:db_content, "old"), change_type.new(:db_content, "new")], acts[0]),
        action_type.new(21, 200, :draft, "draft note", [change_type.new(:db_content, "draft")], acts[1]),
        action_type.new(22, 201, :create, nil, [], acts[0])]
card_type = Struct.new(:history_actions, :actions) do
  def real?; true; end
end
probe = klass.new
probe.card = card_type.new(rows, [rows[0]])
puts JSON.pretty_generate({history: probe.view_history, actions: probe.view_actions})
