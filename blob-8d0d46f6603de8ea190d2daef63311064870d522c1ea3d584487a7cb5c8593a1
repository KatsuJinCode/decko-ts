# rule-rename-trace.rb -- traces read-rule resolution during the RENAME of a
# rule card (leftover-probe.rb step 3's shape): what update_read_rule
# resolves and writes for the set members and the cards pointing at the rule.
#
#   DATABASE_URL=sqlite3:<deck copy> bundle exec decko runner rule-rename-trace.rb

module TraceUpdateReadRule
  def update_read_rule
    warn "[trace] update_read_rule on #{name} (id #{id})"
    without_timestamps do
      reset_patterns
      resolved = permission_rule_id_and_class(:read)
      warn "[trace]   resolved for #{name}: #{resolved.inspect}"
    end
    super
  end
end

Card.include(TraceUpdateReadRule) if defined?(Card) && Card.ancestors.include?(Card::Dirty)

module TraceCascade
  def update_read_ruled_cards
    warn "[trace] cascade_read_rule: update_read_ruled_cards for #{name} (id #{id})"
    super
  end
end

Card.include(TraceCascade)

def run
  Card.create!(name: "TraceRule Ruled", type: "RichText", content: "r")
  rule = Card.create!(name: "TraceRule Ruled+*self+*read", content: "[[Anyone Signed In]]")
  warn "[trace] created rule id=#{rule.id}"
  c = Card.fetch("TraceRule Ruled")
  warn "[trace] host pre-rename: class=#{c.read_rule_class.inspect} rid=#{c.read_rule_id.inspect}"
  Card.fetch("TraceRule Ruled+*self+*read").update!(name: "TraceRule Ruled+*self+*create")
  c = Card.fetch("TraceRule Ruled")
  warn "[trace] host post-rename: class=#{c.read_rule_class.inspect} rid=#{c.read_rule_id.inspect}"
  j = Card.fetch("TraceRule Ruled+*self")
  warn "[trace] junction post-rename: class=#{j.read_rule_class.inspect} rid=#{j.read_rule_id.inspect}"
  rule2 = Card.fetch("TraceRule Ruled+*self+*create")
  warn "[trace] renamed rule post-rename: class=#{rule2.read_rule_class.inspect} rid=#{rule2.read_rule_id.inspect}"
end

warn "[trace] result=#{ActiveSupport::Dependencies.interlock.permit_concurrent_loads { Thread.new { Card::Auth.as_bot { run } }.value.inspect }}"
