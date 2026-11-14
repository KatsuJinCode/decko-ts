# rule-rename-lookup-trace.rb -- the exact rule_cache lookup keys and hits
# during a rule-card RENAME (leftover-probe.rb step 3's shape), so the port
# can reproduce the stored read_rule columns.
#
#   DATABASE_URL=sqlite3:<deck copy> bundle exec decko runner rule-rename-lookup-trace.rb

module TraceLookup
  def rule_lookup_keys
    keys = super
    warn "[trace] rule_lookup_keys(#{name}): #{keys.inspect}"
    keys
  end
end

Card.include(TraceLookup)

module TraceRuleLookup
  def rule_id_lookup lookup_hash, cache_suffix, fallback_suffix = nil
    result = super
    warn "[trace] rule_id_lookup(#{name}, #{cache_suffix}): #{result.inspect} (hash size #{lookup_hash.size})"
    unless result
      wanted = rule_lookup_keys.map { |k| "#{k}+#{cache_suffix}" }
      warn "[trace]   wanted keys: #{wanted.inspect}"
      warn "[trace]   hash self keys: #{lookup_hash.keys.select { |k| k.include?('337') }.inspect}"
    end
    result
  end
end

Card::Rule::All.prepend(TraceRuleLookup)

module TraceRename
  def update_read_rule
    warn "[trace] update_read_rule #{name} (id #{id})"
    super
  end
end

Card.include(TraceRename)

def run
  Card.create!(name: "TraceLk Ruled", type: "RichText", content: "r")
  rule = Card.create!(name: "TraceLk Ruled+*self+*read", content: "[[Anyone Signed In]]")
  warn "[trace] created rule id=#{rule.id}"
  Card.fetch("TraceLk Ruled+*self+*read").update!(name: "TraceLk Ruled+*self+*create")
  warn "[trace] rename done"
end

warn "[trace] result=#{ActiveSupport::Dependencies.interlock.permit_concurrent_loads { Thread.new { Card::Auth.as_bot { run } }.value.inspect }}"
