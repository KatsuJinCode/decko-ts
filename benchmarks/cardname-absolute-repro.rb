# Reproduction probe for cardname-0.20.0 _N/_L*R absolutization on Ruby 3.3.
# Run: ruby cardname-absolute-repro.rb
require "active_support"
require "active_support/core_ext"
require "cardname"
require "cardname/core_ext"

context = Cardname["Test Context Main"]

puts "== fresh match state, _1 absolutization:"
begin
  n = Cardname["_1"]
  puts n.absolute(context).inspect
rescue StandardError => e
  puts "CRASH: #{e.class}: #{e.message}"
end

puts "== stale-match variant (a prior unrelated regex ran first):"
"zzz7" =~ /zzz(\d+)/
puts "prior match set last_match group1=#{$LAST_MATCH_INFO[1].inspect}"
begin
  n2 = Cardname["_2"]
  puts n2.absolute(context).inspect
rescue StandardError => e
  puts "CRASH: #{e.class}: #{e.message}"
end

puts "== _LR form, fresh state:"
begin
  n3 = Cardname["_L2R"]
  puts n3.absolute(context).inspect
rescue StandardError => e
  puts "CRASH: #{e.class}: #{e.message}"
end

puts "== control: _left (no \$LAST_MATCH_INFO use on that branch):"
begin
  n4 = Cardname["_left"]
  puts n4.absolute(context).inspect
rescue StandardError => e
  puts "CRASH: #{e.class}: #{e.message}"
end
