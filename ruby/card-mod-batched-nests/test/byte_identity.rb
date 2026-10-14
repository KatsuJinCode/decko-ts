# Compares two render_digest.rb outputs: every render must be byte-identical.
#
#   ruby byte_identity.rb <stock.json> <with-gem.json>
#
# Exits 0 when both files hold the same renders with the same bytes, 1 when any
# render differs or is missing from one side, and prints each difference.

require "json"

stock_path, gem_path = ARGV
abort "usage: ruby byte_identity.rb <stock.json> <with-gem.json>" unless gem_path

stock = JSON.parse File.read(stock_path)
batched = JSON.parse File.read(gem_path)

abort "#{stock_path}: rendered with the gem loaded" if stock["gem_loaded"]
abort "#{gem_path}: rendered without the gem" unless batched["gem_loaded"]

keys = (stock["renders"].keys | batched["renders"].keys).sort
differing = keys.reject { |key| stock["renders"][key] == batched["renders"][key] }

puts "stock:     #{stock['render_count']} renders, #{stock['queries']} queries"
puts "with gem:  #{batched['render_count']} renders, #{batched['queries']} queries " \
     "(prefetch_nests=#{batched['prefetch_nests']}, " \
     "prefetch_machinery=#{batched['prefetch_machinery']})"

if differing.empty?
  puts "byte-identical: #{keys.size} of #{keys.size} renders"
  exit 0
end

differing.each do |key|
  a = stock["bytes"][key]
  b = batched["bytes"][key]
  if a.nil? || b.nil?
    puts "MISSING #{key} (#{a.nil? ? 'stock' : 'with gem'})"
    next
  end
  at = (0...[a.size, b.size].min).find { |i| a[i] != b[i] } || [a.size, b.size].min
  puts "DIFFERS #{key} at byte #{at}"
  puts "  stock:    #{a[[at - 60, 0].max, 160].inspect}"
  puts "  with gem: #{b[[at - 60, 0].max, 160].inspect}"
end
puts "#{differing.size} of #{keys.size} renders differ"
exit 1
