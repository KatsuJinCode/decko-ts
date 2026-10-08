require "json"
out = {}
out["card_defined_callbacks"] = (Card.defined_callbacks.map(&:to_s).sort rescue "ERR")
out["simple_methods"] = (Card.instance_methods.grep(/_without_callbacks$/).map { |m| m.to_s.sub(/_without_callbacks$/, "") }.sort.first(200) rescue "ERR")
out["count_simple"] = (Card.instance_methods.grep(/_without_callbacks$/).size rescue "ERR")
out["modules_with_callbacks"] = (Card.singleton_class.ancestors.size rescue "ERR")
out["event_class_const"] = Card::Set::Event.name
out["card_respond"] = (Card.new("*all").respond_to?(:observer_create) rescue "ERR")
puts JSON.pretty_generate(out)