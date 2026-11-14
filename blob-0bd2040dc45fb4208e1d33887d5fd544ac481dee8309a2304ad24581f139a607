# Deck reconnaissance: what roles, types, sets and rule counts actually exist,
# so the semantic question set is generated from the real deck.
require "json"

out = {}
out["roles"] = Card.search(type: "Role", return: :name).sort
out["types"] = Card.search(type: "Cardtype", return: :name).sort
out["codenames"] = Card.where(codename: true).map(&:codename).sort
out["cardtypes_count"] = Card.where(type_id: Card.fetch_type_id("Cardtype")).where(trash: false).count
out["cardsets_count"] = Card.where(type_id: Card.fetch_type_id("Set")).where(trash: false).count

# sample sets and their subcard key order
sample_sets = %w[*all *star *rstar *type +*type *right] + out["roles"].first(4)
out["sets"] = {}
sample_sets.each do |sname|
  card = Card[sname]
  next out["sets"][sname] = "MISSING" unless card
  out["sets"][sname] = {
    "id" => card.id,
    "type" => card.type.to_s,
    "subcard_keys" => (card.subcards&.keys&.to_a&.sort || []).first(30),
    "subcard_keys_unsorted" => (card.subcards&.keys&.to_a || []).first(30)
  }
end

# how many cards per type
out["type_counts"] = Card.where(trash: false).group(:type_id).count.map { |tid, n|
  [Card.fetch(tid)&.name.to_s, n]
}.to_h.sort_by { |_, n| -n }.first(20).to_h

puts JSON.pretty_generate(out)