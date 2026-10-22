# oracle-capture-pinned-event-bodies-ruby.rb - the shared rig for the
# [Family] rows' EVENT captures: it extracts a pinned gem's own `event`
# declaration and body out of the pinned gemset, and executes that body over
# recording doubles.
#
# WHAT THIS IS. A row in this family grades the port on ONE pinned event
# body: the bytes the pinned gem's own `event :name ... do ... end` carries.
# Every capture in this tranche needs the same three pieces, and this file
# is those three pieces:
#
#   1. the PINNED GEMSET on the load path (no Rails, no database);
#   2. the pinned event declaration and body, extracted BY LINE from the
#      pinned file, so the executed bytes are the gem's own and not a
#      transcription of them;
#   3. recording doubles for the collaborators an event body touches
#      (errors, Env, Card, Auth, the layout registry, the rule caches), so
#      the capture records WHAT THE BODY ASKED FOR and never what the port
#      wants the answer to be.
#
# THE STUBBING RULE (the shared harness's own rule, kept here): every
# double RECORDS. A pinned method that cannot be stood up is recorded as
# raising, not replaced with a plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-<row-slug>-ruby.rb \
#     > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "yaml"

# The pinned gemset's own loader. The shared loading rig lives in
# oracle-capture-pinned-deck-harness-ruby.rb; this file needs the gemset
# reader from it and nothing else, so the require is lazy and tolerant: a
# capture that only reads pinned SOURCE (no execution) still works when the
# full harness is not on the path.
begin
  require_relative "oracle-capture-pinned-deck-harness-ruby"
rescue LoadError
  # The gemset reader below stands in for the harness.
end

# ---------------------------------------------------------------------------
# the pinned gemset
# ---------------------------------------------------------------------------

module PinnedEvent
  GEMSET_ENV = "DECKO_RUBY_GEMSET"
  DEFAULT_GEMSET = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"

  module_function

  def gems_root
    root = ENV[GEMSET_ENV] || DEFAULT_GEMSET
    raise "no pinned gemset at #{root}; set #{GEMSET_ENV}" unless Dir.exist?(root)

    root
  end

  def pinned_path(relative)
    File.join(gems_root, relative)
  end

  def read_pinned(relative)
    path = pinned_path(relative)
    raise "pinned file not found at #{path}" unless File.exist?(path)

    File.read(path)
  end

  def pinned_lines(relative)
    read_pinned(relative).lines.each_with_index.map do |line, index|
      { "line" => index + 1, "text" => line.chomp }
    end
  end

  # The pinned gems' lib directories on the load path, so a capture can
  # require the pinned gem's own dependency (ActiveSupport's String#number?,
  # for one) and get the PINNED version of it.
  def load_pinned_libs!
    libs = Dir.glob(File.join(gems_root, "*", "lib")).sort
    raise "no pinned gems found at #{gems_root}" if libs.empty?

    libs.each do |lib|
      gem_dir = File.dirname(lib)
      gem_name = File.basename(gem_dir).sub(/-\d[^-]*\z/, "")
      nested = File.join(lib, gem_name)
      $LOAD_PATH.unshift(nested) if File.directory?(nested)
      $LOAD_PATH.unshift(lib)
    end
    libs.length
  end

  # The pinned event DECLARATION and BODY, taken out of the pinned file by
  # line. The declaration is the gem's own `event` line; the body is every
  # line between it and the `end` at the same indentation.
  #
  # The returned hash carries the file, the declaration's line number, the
  # declaration's own text, and the body's text, so a capture can print the
  # exact bytes it executed.
  def event(relative, name)
    lines = read_pinned(relative).lines
    pattern = /^(\s*)event\s+:#{Regexp.escape(name.to_s)}\b/
    index = lines.index { |line| line.match?(pattern) }
    raise "no `event :#{name}` in #{relative}" if index.nil?

    indent = lines[index][pattern, 1]
    end_index = nil
    ((index + 1)...lines.length).each do |i|
      if lines[i].rstrip == "#{indent}end"
        end_index = i
        break
      end
    end
    raise "no `end` for `event :#{name}` in #{relative}" if end_index.nil?

    {
      "file" => relative,
      "line" => index + 1,
      "declaration" => lines[index].chomp,
      "body" => lines[(index + 1)...end_index].map(&:chomp).join("\n"),
      "body_lines" => lines[(index + 1)...end_index].each_with_index.map do |line, offset|
        { "line" => index + 2 + offset, "text" => line.chomp }
      end,
    }
  end

  # The pinned method's own source (`def name ... end`), by line, for the
  # helpers an event body calls.
  def method(relative, name)
    lines = read_pinned(relative).lines
    pattern = /^(\s*)def\s+(?:self\.)?#{Regexp.escape(name.to_s)}(?![A-Za-z0-9_])/
    index = lines.index { |line| line.match?(pattern) }
    raise "no `def #{name}` in #{relative}" if index.nil?

    indent = lines[index][pattern, 1]
    end_index = nil
    ((index + 1)...lines.length).each do |i|
      if lines[i].rstrip == "#{indent}end"
        end_index = i
        break
      end
    end
    raise "no `end` for `def #{name}` in #{relative}" if end_index.nil?

    {
      "file" => relative,
      "line" => index + 1,
      "declaration" => lines[index].chomp,
      "body" => lines[(index + 1)...end_index].map(&:chomp).join("\n"),
    }
  end

  # Define the pinned event body on a probe as a REAL method, so the body's
  # own `return` (the shape Ruby allows inside an event block) returns from
  # the method and the body's own `next` (inside a block) leaves that block.
  # The definition is a `def` with the pinned bytes inline, not an eval of
  # a string inside a method, so `return` stays legal.
  def define_event_body(probe, event_source, method_name = :__pinned_event_body__)
    body = event_source["body"]
    probe.singleton_class.class_eval(
      "def #{method_name}\n#{body}\nend",
      event_source["file"],
      event_source["line"]
    )
    event_source
  end

  # Call the defined pinned body. A body that ABORTS (Ruby's `abort
  # :success`) raises SystemExit; the capture records that as the body's
  # outcome rather than letting it kill the run.
  def call_event_body(probe, method_name = :__pinned_event_body__)
    probe.public_send(method_name)
    { "raised" => nil }
  rescue SystemExit => e
    { "raised" => "SystemExit", "status" => e.status }
  rescue StandardError => e
    { "raised" => e.class.name, "message" => e.message }
  end

  # Define a pinned METHOD on a target class: the method's own `def` text is
  # evaluated into the target, so calling it runs the pinned bytes. Pass a
  # probe's singleton class for an instance method, or a class's singleton
  # class for a class method.
  def define_method(target, relative, name)
    source = method(relative, name)
    target.class_eval(
      "def #{name}\n#{source["body"]}\nend",
      source["file"],
      source["line"]
    )
    source
  end

  # The PINNED ActiveSupport Array#to_sentence, defined on Array with the
  # pinned conversions file's own bytes. The pinned file cannot be required
  # wholesale (it pulls i18n, which pulls the deck), so the method is
  # defined from the pinned source and the one helper it needs
  # (Hash#assert_valid_keys) is required on its own.
  def define_to_sentence!
    require "active_support/core_ext/hash/keys"
    source = method(
      "activesupport-7.2.4/lib/active_support/core_ext/array/conversions.rb",
      "to_sentence",
    )
    Array.class_eval(
      "def to_sentence(options = {})\n#{source["body"]}\nend",
      source["file"],
      source["line"],
    )
    source
  end

  # The pinned locale file's tokens, so a capture's `t` is the pinned text
  # and not a stand-in. The namespace is recorded so a reader can see which
  # locale the text came from.
  def locale(relative, namespace = "en")
    data = YAML.safe_load(read_pinned(relative), permitted_classes: [], aliases: false) || {}
    data[namespace] || {}
  end
end

# ---------------------------------------------------------------------------
# the recording doubles
# ---------------------------------------------------------------------------

# The errors bag an event body writes into. `errors.add` records the
# attribute and the message; nothing else is answered.
class RecordingErrors
  attr_reader :added

  def initialize
    @added = []
  end

  def add(attribute, message = nil)
    @added << { "attribute" => attribute.to_s, "message" => message }
    nil
  end

  def added_messages
    @added.map { |entry| entry["message"] }
  end
end

# The call recorder: a mixin for probes whose collaborators are recorded as
# a named call with its arguments.
module RecordingCalls
  def calls
    @calls ||= []
  end

  def record_call(name, *args)
    calls << { "call" => name.to_s, "arguments" => args.map { |a| describe(a) } }
    nil
  end

  def describe(value)
    case value
    when nil, true, false, Numeric, String then value
    when Symbol then value.to_s
    when Array then value.map { |item| describe(item) }
    when Hash then value.transform_keys(&:to_s).transform_values { |v| describe(v) }
    else value.to_s
    end
  end
end
