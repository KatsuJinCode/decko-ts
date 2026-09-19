# Probe: does the full decko app define $LAST_MATCH_INFO (i.e. did anything
# in the bundle require 'english'), and does relative-name absolutization work in-app?
# Run from tools/oracle/decko-oracle-app via decko runner.
puts "== app probe on Ruby #{RUBY_VERSION}"
"x1" =~ /x(\d+)/
if $LAST_MATCH_INFO.nil?
  puts "LAST_MATCH_INFO: nil after a fresh match -> 'english' NOT loaded by this bundle"
else
  puts "LAST_MATCH_INFO: #{$LAST_MATCH_INFO.inspect} -> 'english' IS loaded"
end
begin
  n = Card::Name.new("_1")
  ctx = Card::Name.new("Test Context Main")
  puts "absolutize _1 in-app: #{n.absolute(ctx).inspect}"
rescue StandardError => e
  puts "absolutize _1 in-app CRASH: #{e.class}: #{e.message}"
end
