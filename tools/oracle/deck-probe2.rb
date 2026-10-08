require "json"
out = {}
all = Card["*all"]
out["all_subcards"] = (all.subcards&.keys&.to_a || [])
out["all_rules"] = Card.search(left: "*all").map(&:name).sort.first(40)
out["all_rules_unsorted"] = Card.search(left: "*all").map(&:name).first(40)
out["star_rules"] = Card.search(left: "*star").map(&:name).sort
rstar = Card["*rstar"]
out["rstar_rules"] = Card.search(left: "*rstar").map(&:name).sort
out["all_cards_rule_read"] = all.rule("read")
out["type_of_foo"] = Card["*type"].type.to_s
out["read_rule_of_type"] = Card["*type"].rule("read")
out["rules_for_type"] = Card.search(left: "*type").map(&:name).sort.first(40).map do |n|
  is_rule = begin
    Card[n].rule?
  rescue StandardError
    "ERR"
  end
  [n, is_rule]
end
puts JSON.pretty_generate(out)