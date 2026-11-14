# n9-cardtype-body-probe.rb -- what the Ruby oracle renders for a cardtype
# card whose own body was stored, and WHICH rule the structure lookup picks.
#
#   DATABASE_URL=sqlite3:<deck copy> bundle exec decko runner n9-cardtype-body-probe.rb
#
# The N9 residual (the anchor-regression receipt, 2026-10-26, section 7 item
# 1): the exercise creates a card of type "User", writes a body through the
# card's own update route, and the page's main slot renders the card's content
# view without the body. This probe asks the ORACLE the two questions the
# port has to answer the same way:
#
#   1. which rule does `rule_card :structure` pick for such a card (the
#      rule_lookup_keys walk, with the cache key it hits), and
#   2. what bytes does the card's :content view render - the card's own
#      db_content, or the *structure rule's template.
#
# The answer decides whether the port's content read path is wrong or the
# exercise's predicate is: Ruby's Card#content (content/all.rb:5-7) is
# `structured_content || standard_content`, and structured_content is the
# *structure rule's db_content (content/all.rb:25-28 + mod/core/set/all/
# content.rb:26-28 default_content = template&.db_content).

stamp = Time.now.to_i
name = "N9Probe_User_#{stamp}"
body = "N9 PROBE BODY #{stamp}"

puts "== CREATE"
created = Card.create!(name: name, type: "User", content: body)
card = Card[name]
puts "  name=#{card.name} type_name=#{card.type_name} type_id=#{card.type_id}"
puts "  db_content=#{card.db_content.inspect}"

puts "== UPDATE THE BODY THE WAY THE EXERCISE DOES (the card's own update route)"
card.update!(content: body)
card = Card[name]
puts "  db_content=#{card.db_content.inspect}"

puts "== THE STRUCTURE LOOKUP"
puts "  rule_lookup_keys=#{card.rule_lookup_keys.inspect}"
puts "  rule_card(:structure)=#{card.rule_card(:structure)&.name.inspect}"
puts "  structure=#{card.structure&.name.inspect} id=#{card.structure&.id.inspect}"
puts "  structure db_content=#{card.structure&.db_content.inspect}"
puts "  card.content=#{card.content.inspect}"
puts "  standard_content=#{card.standard_content.inspect}"
puts "  structured_content=#{card.structured_content.inspect}"

puts "== THE RENDERED CONTENT VIEW"
html = card.format(:html).render(:content)
puts "  CONTENT_VIEW_BYTES=#{html.bytesize}"
puts html

puts "== THE MARKER TEST (the exercise's predicate)"
puts "  body_in_content_view=#{html.include?(body)}"
