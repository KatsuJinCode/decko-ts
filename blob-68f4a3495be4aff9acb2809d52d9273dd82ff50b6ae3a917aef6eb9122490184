# Evaluate the pinned JSON-LD block, with its own error_result helper.
require "json"
source = File.read(ARGV.fetch(0))
klass = Class.new do
  def self.view(name, *args, **opts, &block)
    define_method("view_#{name}", block) if block
  end
end
klass.class_eval(source.split("format :jsonld do", 2).fetch(1).sub(/end\s*\z/, ""))
probe = klass.new
out = {}
%i[not_found denial test].each do |view|
  begin
    out[view] = probe.public_send("view_#{view}")
  rescue => e
    out[view] = {error: e.class.name, message: e.message}
  end
end
puts JSON.pretty_generate(out)
