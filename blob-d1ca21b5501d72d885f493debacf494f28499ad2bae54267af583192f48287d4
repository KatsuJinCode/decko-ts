# fetch-mechanism-probe.rb -- name the exact Card.fetch behavior on the corpus
# deck for the names that failed the load sample. Read-only except for any
# decko-internal machinery; prints object facts, no assumptions.
require "fileutils"
CACHE_DIR = File.join(File.expand_path("..", Dir.pwd), "tmp", "cache")
FileUtils.rm_rf(Dir.glob(File.join(CACHE_DIR, "*")))
[
  "*all+*read", "*all+*default", "*children", "*all", "*default", "*read",
  "pfrgxnplvdqsh", "*all plus", "*all_plu", "*children+*right+*structure"
].each do |nm|
  card = Card.fetch(nm)
  facts = if card.nil?
            "nil"
          else
            "class=#{card.class} id=#{card.id.inspect} name=#{card.name.to_s.inspect} " \
              "key=#{card.key.inspect} new_card?=#{card.new_card?} trash=#{card.trash.inspect} " \
              "codename=#{card.codename.inspect} type_id=#{card.type_id.inspect}"
          end
  puts "FETCH #{nm.inspect} -> #{facts}"
end
puts "Card.count=#{Card.count}"
[10, 11, 53067, 53068, 53069].each do |i|
  row = Card.where(id: i)&.pick(:name, :key, :trash)
  puts "ROW #{i}: #{row.inspect}"
end
