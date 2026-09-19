# api_probe.rb - discover ground-truth APIs in card 1.110 for capture.rb
def probe label
  yield
rescue StandardError => e
  puts "#{label}: ERROR #{e.class}: #{e.message[0, 120]}"
end

probe("TYPES") { puts "TYPES: #{Card.search(type: 'Cardtype', return: 'name').sort.inspect}" }
probe("CARD METHODS") do
  c = Card.fetch("*all")
  puts "CARD METHODS: #{(c.methods - Object.new.methods).grep(/read|perm|rule|who/).sort.inspect}"
end
probe("rule read") do
  c = Card.fetch("*all")
  puts "rule(:read): #{c.rule(:read).inspect}"
end
probe("who can read") do
  c = Card.fetch("*all")
  puts "who_can: #{c.try(:who_can, :read).inspect}"
end
probe("search api") do
  puts "SEARCH API: #{Card.search(type: 'Search', limit: 3, return: 'name').inspect}"
end
probe("html type render") do
  c = Card.fetch("*all+*read")
  puts "*all+*read type: #{c.type_name} content: #{c.content.inspect}"
end
