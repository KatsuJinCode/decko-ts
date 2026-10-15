# Compares render_digest.rb outputs: stock against a second stock run (the
# control), then stock against the app with the gem.
#
#   ruby byte_identity.rb <stock> <stock-control> <with-gem>
#
# Each argument is a digest file, or several comma-separated (shards of one run).
#
# The control shows what differs between two runs of the same stock app on the
# same deck. Only values listed in VARYING are masked, and only because the
# control shows them varying; the check fails if the control differs anywhere
# else, so a mask can never hide a difference the control does not explain.
# Exits 0 when, after masking, the control matches stock exactly and the gem
# run matches stock exactly.

require "json"

# Values that differ between two runs of stock Decko.
VARYING = {
  # card-mod-format set/all/html/wrap.rb writes SecureRandom.hex(10) into
  # every wrapped slot's data-slot-id attribute.
  "data-slot-id" => /data-slot-id=(["'])[0-9a-f]+\1/,
  # card-mod-bootstrap set/all/bootstrap/accordion.rb builds collapse ids as
  # card-<key>-<context>-collapse-id. On the admin dashboard the context is
  # a number that differs between two stock runs; where the caller gets that
  # number has not been traced.
  "accordion-context" => /-(-?\d{6,})-collapse-id/,
  # the *now card renders the current time, to the minute
  "now" => /\w+day, \w+ \d+, \d{4} \d\d:\d\d [AP]M [A-Za-z ]+Time/
}.freeze

def load_run arg
  parts = arg.split(",").map { |path| JSON.parse File.read(path) }
  { "gem_loaded" => parts.first["gem_loaded"],
    "prefetch_nests" => parts.first["prefetch_nests"],
    "prefetch_machinery" => parts.first["prefetch_machinery"],
    "queries" => parts.sum { |p| p["queries"] },
    "bytes" => parts.map { |p| p["bytes"] }.reduce({}, :merge) }
end

def mask bytes, names
  names.reduce(bytes) { |s, name| s.gsub(VARYING[name], "#{name}=*") }
end

def first_difference a, b
  at = (0...[a.size, b.size].min).find { |i| a[i] != b[i] } || [a.size, b.size].min
  [at, a[[at - 60, 0].max, 160], b[[at - 60, 0].max, 160]]
end

# @return [Array<String>] keys whose bytes differ after masking
def differing a, b, names
  (a.keys | b.keys).sort.reject do |key|
    a[key] && b[key] && mask(a[key], names) == mask(b[key], names)
  end
end

def report label, a, b, keys, names
  keys.first(20).each do |key|
    if a[key].nil? || b[key].nil?
      puts "  MISSING #{key}"
      next
    end
    at, x, y = first_difference mask(a[key], names), mask(b[key], names)
    puts "  DIFFERS #{key} at byte #{at}"
    puts "    stock:   #{x.inspect}"
    puts "    #{label}: #{y.inspect}"
  end
end

stock_arg, control_arg, gem_arg = ARGV
abort "usage: ruby byte_identity.rb <stock> <stock-control> <with-gem>" unless gem_arg

stock = load_run stock_arg
control = load_run control_arg
batched = load_run gem_arg
abort "stock run has the gem loaded" if stock["gem_loaded"] || control["gem_loaded"]
abort "gem run does not have the gem loaded" unless batched["gem_loaded"]

total = (stock["bytes"].keys | batched["bytes"].keys).size
raw_control = differing stock["bytes"], control["bytes"], []
# a value is masked only if the control still differs when it alone is unmasked
needed = VARYING.keys.select do |name|
  differing(stock["bytes"], control["bytes"], VARYING.keys - [name]).any?
end
control_left = differing stock["bytes"], control["bytes"], needed
gem_raw = differing stock["bytes"], batched["bytes"], []
gem_left = differing stock["bytes"], batched["bytes"], needed

puts "renders: #{total}"
puts "stock:         #{stock['queries']} queries"
puts "with gem:      #{batched['queries']} queries " \
     "(prefetch_nests=#{batched['prefetch_nests']}, " \
     "prefetch_machinery=#{batched['prefetch_machinery']})"
puts "control:       #{raw_control.size} renders differ from stock before masking; " \
     "masked: #{needed.empty? ? 'nothing' : needed.join(', ')}; " \
     "#{control_left.size} differ after"
report "control", stock["bytes"], control["bytes"], control_left, needed
puts "gem:           #{gem_raw.size} renders differ from stock before masking; " \
     "#{gem_left.size} differ after"
report "with gem", stock["bytes"], batched["bytes"], gem_left, needed

if control_left.empty? && gem_left.empty?
  puts "byte-identical apart from #{needed.join(', ')}: #{total} of #{total} renders"
  exit 0
end
exit 1
