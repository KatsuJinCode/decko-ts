# Execute the REAL card-mod-script-0.20.0 js :compressed view body and run it
# on synthetic cores, for the register entry 27 parity pins.
#
# The bytes come from the gem's own source file (ARGV[0]), not from a
# transcription: the `format :js do ... end` block is sliced out of
# set/abstract/00_script.rb and class_eval'd on a harness that supplies only
# the two things the block reads from outside itself - the card name and
# _render_core - plus a Cardio.config.compress_assets stub for the
# compress? switch. compress() / try_compress() / comment_with_source() and
# the view body are the gem's own.
#
# Usage (Ruby 3.4 with uglifier-4.2.1 installed at
# C:/localProjects/decko-ruby-oracle-gems):
#   ruby oracle-capture-script-compressed.rb <path to set/abstract/00_script.rb> cases.json
#
# cases.json is a JSON array of {name, card_name, core, compress_assets}.
# Output on stdout: a JSON array of {name, card_name, core, compress_assets,
# value} - `value` is the rendered view, `error` (when present) is the raised
# message.

require "json"
require "uglifier"

# Card::Error is referenced by try_compress's rescue arm; the harness
# defines the constant the gem expects so the real rescue path runs.
# card-1.110.0 lib/card/error.rb:16 `cattr_accessor :current` - unset
# unless an error is in flight, which is the state compression_error_message's
# else-branch reads (00_script.rb:32-38).
module Card
  class Error < StandardError
    def self.current
      nil
    end
  end
end

# Cardio.config.compress_assets - the flag compress? reads
# (00_script.rb:40-42). Set per case below.
module Cardio
  Config = Struct.new(:compress_assets)
  def self.config
    @config ||= Config.new(false)
  end
end

source = File.read(ARGV.fetch(0))
lines = source.lines
start = lines.index { |l| l.strip == "format :js do" }
raise "no `format :js do` block in #{ARGV[0]}" if start.nil?
finish = (start + 1...lines.length).find { |i| lines[i] == "end\n" }
raise "unterminated `format :js do` block" if finish.nil?
js_block = lines[start..finish].join

harness = Class.new do
  attr_accessor :card_name, :core

  # set/format.rb:120-144 `format :js do` reopens the JsFormat class; the
  # harness mirrors that by class_eval'ing the block's body.
  def self.format(_name, &block)
    class_eval(&block)
  end

  def self.view(name, *args, **opts, &block)
    define_method("view_#{name}", block)
  end

  def self.include_set(*_args); end

  # format/method_delegation.rb's _render_core - the core bytes, no hooks.
  def _render_core
    core
  end

  # comment_with_source's `card.name` and compression_error_message's `name`.
  def name
    card_name
  end

  def card
    Struct.new(:name).new(card_name)
  end
end
harness.class_eval(js_block)

cases = JSON.parse(File.read(ARGV.fetch(1)))
out = cases.map do |c|
  probe = harness.new
  probe.card_name = c["card_name"]
  probe.core = c["core"]
  Cardio.config.compress_assets = c["compress_assets"]
  row = {
    "name" => c["name"],
    "card_name" => c["card_name"],
    "core" => c["core"],
    "compress_assets" => c["compress_assets"],
  }
  begin
    row["value"] = probe.view_compressed
  rescue StandardError => e
    row["error"] = e.message
  end
  row
end
puts JSON.pretty_generate(out)