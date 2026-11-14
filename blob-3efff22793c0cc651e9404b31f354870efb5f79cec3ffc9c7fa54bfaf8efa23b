# children-probe.rb -- why does Card.fetch("*children") return nil while the
# compound "*children+*right+*structure" fetches fine? Facts only.
require "fileutils"
CACHE_DIR = File.join(File.expand_path("..", Dir.pwd), "tmp", "cache")
FileUtils.rm_rf(Dir.glob(File.join(CACHE_DIR, "*")))

nm = "*children".to_name
puts "KEYFORM name=#{nm} key=#{nm.key.inspect} simple?=#{nm.simple?}"
puts "DB key='*child': #{Card.where(key: '*child').pluck(:id, :name, :trash).inspect}"
puts "DB key='*children': #{Card.where(key: '*children').pluck(:id, :name, :trash).inspect}"
puts "DB id=33: #{Card.where(id: 33).pluck(:id, :name, :key, :left_id, :right_id, :trash).inspect}"
puts "Lexicon.id('*children') = #{Card::Lexicon.id('*children').inspect}"
puts "Lexicon.name(33) = #{Card::Lexicon.name(33).inspect}"
c = Card.fetch("*children")
puts "fetch('*children') = #{c.nil? ? 'nil' : "id=#{c.id} key=#{c.key} name=#{c.name}"}"
c2 = Card.fetch("*children", look_in_trash: true)
puts "fetch('*children', look_in_trash) = #{c2.nil? ? 'nil' : "id=#{c2.id} key=#{c2.key}"}"
c3 = Card.fetch("*children", new: {})
puts "fetch('*children', new:) = #{c3.nil? ? 'nil' : "id=#{c3.id.inspect} new_card?=#{c3.new_card?} virtual?=#{c3.respond_to?(:virtual?) ? c3.virtual? : 'n/a'}"}"
puts "codename children -> #{Card::Codename['children'].inspect}"
puts "fetch by codename id: #{Card.fetch(Card::Codename['children']).name rescue 'raise'}"
