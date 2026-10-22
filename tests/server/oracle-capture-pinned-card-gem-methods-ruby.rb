# oracle-capture-pinned-card-gem-methods-ruby.rb - the shared rig for the
# [Family] rows' card-gem method captures.
#
# WHAT THIS IS. Every [Family] row in this family grades the port on ONE
# pinned card-gem file set: the files under card-1.110.0/lib/card/ (plus the
# card gem's config/, db/ and mod/core/ trees). The row's question is always
# the same shape: for the `def`s in those files, does the port carry the same
# BEHAVIOUR?
#
# A name search cannot answer that, and the family learned that the hard way
# (the 2026-10-19 pass counted a def as ported when its name appeared
# anywhere in a non-comment port line). So this rig answers the BEHAVIOURAL
# question: it runs the PINNED method body and the PORT function over the
# SAME probe, and records what each asked for. The two records are then
# compared, and the row closes only where they agree.
#
# THE THREE PIECES every capture in this family needs:
#
#   1. the PINNED GEMSET read BY LINE - the card gem cannot be loaded
#      standalone (card-1.110.0/lib/card.rb opens `class Card < Cardio::Record`,
#      and Cardio::Record is an ActiveRecord model, so requiring it pulls
#      Rails in and needs a database). The rig therefore NEVER requires the
#      gem: it reads the pinned file's own lines and extracts the method
#      body BY LINE, so the executed bytes are the gem's own and not a
#      transcription of them.
#   2. a RECEIVER the method body can run on, with the collaborators the
#      body touches supplied as RECORDING DOUBLES. Every double RECORDS.
#      A pinned method that cannot be stood up is recorded as raising, not
#      replaced with a plausible value.
#   3. the PORT side, read the same way: the port function named by the
#      capture is bound to a port receiver, and the same probe runs.
#
# WHY EXTRACT BY LINE AND NOT `require`. Two reasons, both measured:
#   - `require "card"` cannot work without Rails and a database, so a
#     require-based capture could never run on this machine.
#   - the card gem's own `lib/card/set.rb` SHADOWS Ruby's stdlib `set` when
#     the gemset's lib directories are on $LOAD_PATH: i18n's
#     `require "set"` then loads card-1.110.0/lib/card/set.rb and dies with
#     `uninitialized constant Card::Set::Event` (measured; the trace runs
#     i18n-1.15.2/lib/i18n/config.rb:3 -> card-1.110.0/lib/card/set.rb:122).
#     A line-extraction rig has no load path at all, so it cannot be
#     shadowed.
#
# THE STUBBING RULE (the shared harness's own rule, kept here): every double
# RECORDS. The capture writes down what the pinned method asked for; it
# never writes down what the port wants the answer to be.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-<row-slug>-ruby.rb \
#     > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

module PinnedCardGem
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

  # A pinned file's own lines, with their line numbers. The capture quotes
  # these instead of paraphrasing the source.
  def pinned_lines(relative)
    read_pinned(relative).lines.each_with_index.map do |line, index|
      { "line" => index + 1, "text" => line.chomp }
    end
  end

  # The pinned file's method body for ONE method name, extracted BY LINE.
  #
  # The extraction walks the file's own lines and finds the `def` whose name
  # matches (a Ruby `?`/`!`/`=` suffix is part of the name), then collects
  # lines until the `end` at the def's own indentation. The returned hash
  # carries the START AND END LINE NUMBERS, so a reader can check the
  # extracted bytes against the pinned file without running anything.
  def pinned_method(relative, method_name)
    lines = read_pinned(relative).lines
    def_re = /^\s*def\s+(?:self\.)?([A-Za-z_][A-Za-z_0-9]*[?!=]?)\b/
    start = nil
    name = nil
    indent = nil
    lines.each_with_index do |line, index|
      m = line.match(def_re)
      next unless m
      next unless m[1] == method_name

      start = index
      name = m[1]
      indent = line[/\A\s*/].length
      break
    end
    raise "method #{method_name.inspect} not found in #{relative}" if start.nil?

    # The `end` that closes the def: the first following line whose own
    # indentation equals the def's and whose content is `end`.
    finish = nil
    ((start + 1)...lines.length).each do |index|
      line = lines[index]
      next if line.strip.empty?

      line_indent = line[/\A\s*/].length
      if line_indent == indent && line.strip == "end"
        finish = index
        break
      end
    end
    # A def whose body is a single expression on the same line (endless
    # method) has no closing `end` of its own.
    finish = start if finish.nil? && lines[start].match?(/\A\s*def\s+\S+.*\bend\b\s*\z/) == false && lines[start].rstrip.end_with?("=")
    raise "no closing end found for #{method_name.inspect} in #{relative}" if finish.nil?

    {
      "file" => relative,
      "method" => name,
      "startLine" => start + 1,
      "endLine" => finish + 1,
      "source" => lines[start..finish].join,
    }
  end

  # Every `def` in a pinned file, with its line number and its name.
  def pinned_defs(relative)
    read_pinned(relative).lines.each_with_index.filter_map do |line, index|
      m = line.match(/^\s*def\s+(?:self\.)?([A-Za-z_][A-Za-z_0-9]*[?!=]?)/)
      next unless m

      { "name" => m[1], "line" => index + 1, "text" => line.strip }
    end
  end

  # Define a pinned method body on a receiver class, over the given
  # collaborators. The method's own bytes are the pinned file's bytes.
  def define_pinned_method(receiver, relative, method_name, collaborators = {})
    extracted = pinned_method(relative, method_name)
    # A `def` inside a `module` body is defined at the module's level; the
    # capture supplies the module nesting through the receiver's name.
    source = extracted["source"]
    source = source.gsub(/^(\s*)def\s+([A-Za-z_][A-Za-z_0-9]*[?!=]?)(\s*\(?[^)]*\)?)?\s*$/, "\\1def \\2\\3")
    receiver.class_eval(source, extracted["file"], extracted["startLine"])
    collaborators.each { |name, value| receiver.define_singleton_method(name) { value } }
    extracted
  end
end

# The recorder: a double that writes down what it was asked.
class Recorder
  attr_reader :calls

  def initialize(name)
    @name = name
    @calls = []
  end

  def record(kind, detail = nil)
    @calls << { "double" => @name, "call" => kind, "detail" => detail }
    self
  end

  def to_json(*args)
    { "double" => @name, "calls" => @calls }.to_json(*args)
  end
end

# A method-missing double: every unknown message is RECORDED, and the
# double returns a value the capture supplies. The default answer is a
# recorder that answers a fresh empty recorder, so a chain of unknown calls
# is visible rather than silent.
class RecordingDouble
  def initialize(name, answers = {})
    @name = name
    @answers = answers
    @calls = []
  end

  attr_reader :calls, :name

  def method_missing(sym, *args, &block)
    detail = {
      "args" => args.map { |a| a.is_a?(Symbol) || a.is_a?(String) || a.nil? || a.is_a?(Numeric) || a == true || a == false ? a : a.class.name },
    }
    @calls << { "double" => @name, "call" => sym.to_s, "detail" => detail }
    @answers.fetch(sym) { @answers.fetch(sym.to_s) { RecordingDouble.new("#{@name}.#{sym}") } }
  end

  def respond_to_missing?(_sym, _include_private = false)
    true
  end
end

# The comparison helper: two records of the same probe, compared field by
# field. The capture writes the comparison into its own output so the
# receipt can be read without running anything else.
module PinCompare
  module_function

  # The two sides of one probe, and whether they agree.
  #
  # `ruby` and `port` are the recorded results. A probe agrees when the
  # recorded call SEQUENCE matches, method by method, with the same
  # arguments rendered the same way. A difference in either is a
  # difference, and the capture writes down where.
  def compare(probe, ruby, port)
    ruby_calls = Array(ruby && ruby["calls"])
    port_calls = Array(port && port["calls"])
    differences = []
    max = [ruby_calls.length, port_calls.length].max
    (0...max).each do |index|
      r = ruby_calls[index]
      p = port_calls[index]
      if r.nil?
        differences << { "at" => index, "kind" => "port-only", "port" => p }
      elsif p.nil?
        differences << { "at" => index, "kind" => "ruby-only", "ruby" => r }
      elsif r["call"] != p["call"]
        differences << { "at" => index, "kind" => "different-call", "ruby" => r, "port" => p }
      end
    end
    {
      "probe" => probe,
      "rubyCalls" => ruby_calls.length,
      "portCalls" => port_calls.length,
      "agrees" => differences.empty?,
      "differences" => differences,
    }
  end
end
