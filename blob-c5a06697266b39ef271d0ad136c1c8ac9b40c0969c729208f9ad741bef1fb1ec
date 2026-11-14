# Probes whether Haml 5.2.2's class-token merge (attribute_builder.rb:140,
# `(to.split(' ') | merged_class.split(' ')).join(' ')`) is order-stable across
# Ruby versions. The claim under test: the port's class-token order differences
# are inside the range Ruby's own versions produce.
#
#   ruby haml-class-order-probe.rb <label>

label = ARGV[0] || RUBY_VERSION
require "haml"

puts "ruby=#{RUBY_VERSION} patch=#{RUBY_PATCHLEVEL} engine=#{RUBY_ENGINE} label=#{label}"

# 1. The exact expression from attribute_builder.rb:140, on the shape Decko
#    produces (shorthand classes from `.foo.bar` plus an attributes-hash class).
cases = [
  ["card-context", "card-abstract", ["card-abstract", "card-new", "card-form"]],
  ["slot", "slot", ["slot", "slot-claimed", "slot-unclaimed"]],
  ["editor", "editor", ["editor", "editor-live", "editor-claimed"]],
  # Overlapping tokens: the union must dedupe, and the receiver's order wins.
  ["overlap", "b a", ["a", "b", "c"]],
  ["overlap2", "z m", ["m", "a", "z"]],
  ["empty-to", "", ["solo"]],
  ["dup-in-from", "x", ["x", "x", "y"]],
]

cases.each do |name, to, from|
  merged = (to.split(" ") | from).join(" ")
  puts format("  case=%-12s to=%-28s from=%-46s merged=%s", name, to.inspect, from.inspect, merged.inspect)
end

# 2. End-to-end through Haml itself, the way Decko's templates write classes:
#    shorthand `.foo` plus a Ruby-hash `{:class => ...}` attribute.
samples = [
  ".card-abstract\n  content",
  ".slot{:class => ['slot-claimed', 'card-form']}\n  x",
  ".a.b.c{:class => 'd e'}\n  x",
  ".editor{class: 'editor-live'}\n  x",
]

engine = Haml::Engine.new("")
samples.each_with_index do |src, i|
  begin
    out = Haml::Engine.new(src).render(Object.new)
    puts format("  haml[%d] %-52s -> %s", i, src.lines.first.strip.inspect, out.lines.first.to_s.strip.inspect)
  rescue => e
    puts format("  haml[%d] %-52s -> ERROR %s: %s", i, src.lines.first.strip.inspect, e.class, e.message.to_s.lines.first.to_s.strip)
  end
end

# 3. Hash/Array primitives the merge order ultimately rests on.
require "set"
puts "  hash_order=#{{ "b" => 1, "a" => 2, "c" => 3 }.keys.inspect}"
puts "  array_union=#{((["b", "a"] | ["a", "c"])).inspect}"
puts "  set_union=#{(Set.new(["b", "a"]) | Set.new(["a", "c"])).to_a.inspect}"
puts "  hash_merge_order=#{({ "b" => 1, "a" => 2 }.merge({ "c" => 3, "d" => 4 })).keys.inspect}"