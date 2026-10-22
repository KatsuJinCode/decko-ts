# oracle-capture-card-gem-row-methods-ruby.rb - the [Family] rows' METHOD
# capture, driven by the row's own disposition.
#
# WHAT THIS IS. A method-based row in this family grades the port on the
# `def`s in a set of pinned card-gem files. This capture is the row's
# ORACLE side: it runs the PINNED method body and records what the method
# asked for, so the port side can be compared against the pinned bytes
# rather than against a reading of them.
#
# THE RIG IS SHARED. The method extraction, the recording double and the
# comparison helper live in
# tests/server/oracle-capture-pinned-card-gem-methods-ruby.rb, and this
# file is the row-level driver over that rig.
#
# WHY THE PINNED BODY IS EXTRACTED BY LINE, and not required: the card
# gem cannot be loaded standalone. card-1.110.0/lib/card.rb opens
# `class Card < Cardio::Record`, and Cardio::Record is an ActiveRecord
# model, so requiring it pulls Rails in and needs a database. Measured:
# with the gemset's lib directories on the load path, i18n's
# `require "set"` (i18n-1.15.2/lib/i18n/config.rb:3) loads
# card-1.110.0/lib/card/set.rb and dies at
# card-1.110.0/lib/card/set.rb:122 with
# `uninitialized constant Card::Set::Event` - the card gem SHADOWS Ruby's
# stdlib `set` on that load path. A line-extraction rig has no load path,
# so it cannot be shadowed, and the executed bytes are the gem's own
# rather than a transcription of them.
#
# THE STUBBING RULE, the family's own: every double RECORDS. A pinned
# method that cannot be stood up is recorded as raising, never replaced
# with a plausible value. A method that raises is not a FAILURE of the
# port: it is a fact about the pinned method, and the row receipt reads
# it.
#
# THE PROBE LIST is fixed per row, so a re-run on the same gemset is
# byte-stable.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-card-gem-row-methods-ruby.rb <row-id> \
#     > fixtures/captured/<row-slug>-ruby-oracle.json

require "json"
require_relative "oracle-capture-pinned-card-gem-methods-ruby.rb"

ROW_ID = ARGV[0]
raise "usage: oracle-capture-card-gem-row-methods-ruby.rb <row-id>" if ROW_ID.nil?

# The row's file set and per-def dispositions, read from the rig's own
# instrument so the capture and the instrument cannot disagree.
DISPOSITION_TOOL = File.expand_path("../../tools/treewalk-family-row-disposition.mjs", __dir__)
unless File.exist?(DISPOSITION_TOOL)
  raise "the disposition tool is missing at #{DISPOSITION_TOOL}; the capture cannot be trusted without it"
end

# The row's file set and per-def dispositions, read from the rig's own
# instrument so the capture and the instrument cannot disagree.
#
# The instrument is a NODE script, so it is run with node - not with
# ruby. A first cut shelled out through `ruby -e` with a JavaScript
# payload, which of course died with a JavaScript syntax error; the
# capture now runs the tool the way the tool is meant to be run.
def row_file_set(row_id)
  raw = IO.popen(
    ["node", DISPOSITION_TOOL, row_id, "--json"],
    err: %i[child out],
    &:read
  )
  parsed = JSON.parse(raw)
  parsed.first
end

# ── the probe list ──────────────────────────────────────────────────────────
#
# A probe is a name, the pinned method it exercises, the arguments it
# passes, and the collaborators the method needs as doubles. The probe
# list is the row's own, and it is FIXED: the same list, the same
# arguments, every run.
#
# The default probe for a method: call it with no arguments over a
# recording receiver, and record what it asked for. Most of the card gem's
# instance methods read their own attributes, so a no-argument call
# records the attribute reads, which is the method's own behaviour and
# not a fabrication.
PROBES = {
  # The mark row: Card::Mark's class methods.
  "reg-treewalk-c2-mark-rb" => [
    {
      "name" => "cardish with a String mark",
      "method" => "cardish",
      "args" => ["Example"],
      "collaborators" => { "fetch" => :recording },
    },
    {
      "name" => "id_or_name with one Integer mark",
      "method" => "id_or_name",
      "args" => [[42]],
      "collaborators" => { "id_from_mark" => :recording },
    },
    {
      "name" => "id_or_name with a Symbol mark",
      "method" => "id_or_name",
      "args" => [[:example]],
      "collaborators" => { "id_from_mark" => :recording },
    },
    {
      "name" => "id_or_name with a String mark",
      "method" => "id_or_name",
      "args" => [["Example"]],
      "collaborators" => { "id_from_mark" => :recording },
    },
    {
      "name" => "id_or_name with two marks",
      "method" => "id_or_name",
      "args" => [["Example", "Other"]],
      "collaborators" => { "id_from_mark" => :recording },
    },
    {
      "name" => "id_from_mark with an Integer",
      "method" => "id_from_mark",
      "args" => [42],
      "collaborators" => {},
    },
  ],
}.freeze

# The recording receiver: a method_missing double that records every
# message it receives and answers with another recorder.
#
# THE CALLS ARE RECORDED ON THE RECEIVER THAT RECEIVED THEM, and the
# probe reads the receiver's OWN list. A first cut kept a separate
# `receiver` variable and read that, so the list was always empty: the
# probe called the method on a DIFFERENT instance than the one holding
# the recorder. The recording has to be on the object the method runs
# on.
class ProbeReceiver
  attr_reader :calls

  def initialize
    @calls = []
  end

  def method_missing(sym, *args, &block)
    @calls << {
      "call" => sym.to_s,
      "args" => args.map { |a| a.is_a?(Symbol) || a.is_a?(String) || a.nil? || a.is_a?(Numeric) || a == true || a == false ? a : a.class.name },
    }
    ProbeReceiver.new
  end

  def respond_to_missing?(_sym, _include_private = false)
    true
  end
end

# The pinned method's OWN SIBLINGS. A method in a module calls its
# module's other methods by name, and those are on the SAME receiver. So
# the receiver carries the row's whole def set: every def of the row's
# file, extracted by line and defined on the receiver's class. Then a
# method that calls its sibling calls the PINNED sibling.
#
# The pinned CONSTANTS the card gem's methods reference are stood up too,
# because they do: the card gem's methods say `cardish.is_a? Card`, a
# `Card::Name[mark]` lookup, a `Codename.id! mark`, a `Name.id_from_string!
# mark`. Without those constants the pinned body raises before it does
# anything, and the probe would record a raise that says nothing about
# the method.
#
# Each constant is a RECORDING DOUBLE: a reference to it is recorded, and
# the call on it is recorded with the call's name. The recording is what
# makes the probe a measurement of the pinned method rather than a
# measurement of the harness.
#
# A STAND-UP THAT CANNOT BE DONE IS RECORDED, not replaced with a
# plausible value: the probe records the raise and the row receipt reads
# it.
# A constant the pinned methods reference, stood up as a recording
# double. `Card` is a CLASS (the methods ask `is_a? Card`), so it is a
# class; `Codename` and `Name` are MODULES, so they are modules. The
# difference matters: `is_a? Card` raises a TypeError if Card is not a
# class.
def stand_up_constants
  card = Class.new(ProbeReceiver)
  def card.[](*args)
    ProbeReceiver.new
  end

  codename = Module.new
  def codename.method_missing(sym, *args, &block)
    ProbeReceiver.new
  end

  def codename.respond_to_missing?(_sym, _include_private = false)
    true
  end

  name = Module.new
  def name.method_missing(sym, *args, &block)
    ProbeReceiver.new
  end

  def name.respond_to_missing?(_sym, _include_private = false)
    true
  end

  # Card::Name is a NESTED constant: the card gem's methods say
  # `Card::Name[mark]`, so Name must hang off Card, not off Object.
  card.const_set(:Name, name) unless card.const_defined?(:Name)
  card.const_set(:Codename, codename) unless card.const_defined?(:Codename)
  Object.send(:remove_const, :Card) if Object.const_defined?(:Card)
  Object.const_set(:Card, card)
  Object.send(:remove_const, :Codename) if Object.const_defined?(:Codename)
  Object.const_set(:Codename, codename)
  Object.send(:remove_const, :Name) if Object.const_defined?(:Name)
  Object.const_set(:Name, name)
end

def define_row_defs(klass, row)
  row["defs"].each do |d|
    source = begin
      PinnedCardGem.pinned_method(d["file"], d["name"])
    rescue StandardError
      nil
    end
    next if source.nil? || source["source"].to_s.empty?

    begin
      klass.class_eval(source["source"], source["file"], source["startLine"])
    rescue StandardError, SyntaxError
      # A def whose body will not parse on its own (a def that opens a
      # block the file closes) is left undefined; the probe that needs it
      # records the NoMethodError.
      nil
    end
  end
end

# One probe's result: the calls the pinned method made, or the raise it
# produced.
def run_probe(probe, method_source, row)
  klass = Class.new(ProbeReceiver)
  # The constants are stood up FIRST, and the receiver's class gets them
  # BEFORE any pinned body is defined. The pinned body is evaluated
  # INSIDE the receiver's class, so a bare `Card` in it resolves
  # LEXICALLY - to the receiver's own namespace, not to Object - and a
  # body defined before the constant exists raises NameError at CALL
  # time with "uninitialized constant Card::Name" even though the
  # constant was set afterwards. A capture that raises for that reason
  # measures the harness, not the method.
  # The receiver's class gets the SAME Card object Object has, so a
  # `Card::Name` in the pinned body resolves to the same Name the deck
  # would see. The set is UNGUARDED on purpose: a guard that skips the
  # set because an ancestor already answers `const_defined?` leaves the
  # receiver pointing at a DIFFERENT Card, and the pinned body then
  # raises "uninitialized constant Card::Name" for a reason that is
  # about the harness and not about the method.
  klass.const_set(:Card, Object.const_get(:Card))
  klass.const_set(:Codename, Object.const_get(:Codename))
  klass.const_set(:Name, Object.const_get(:Name))
  define_row_defs(klass, row)
  # The pinned method under test is defined LAST, so it wins over any
  # earlier definition of the same name.
  klass.class_eval(method_source["source"], method_source["file"], method_source["startLine"])
  instance = klass.new
  begin
    result = instance.public_send(probe["method"], *probe["args"])
    {
      "probe" => probe["name"],
      "method" => probe["method"],
      "rubyFile" => method_source["file"],
      "rubyStartLine" => method_source["startLine"],
      "rubyEndLine" => method_source["endLine"],
      "outcome" => "returned",
      "calls" => instance.calls,
      "resultClass" => result.class.name,
    }
  rescue StandardError, NotImplementedError => e
    {
      "probe" => probe["name"],
      "method" => probe["method"],
      "rubyFile" => method_source["file"],
      "rubyStartLine" => method_source["startLine"],
      "rubyEndLine" => method_source["endLine"],
      "outcome" => "raised",
      "raised" => e.class.name,
      "raisedMessage" => e.message.to_s.lines.first.to_s.strip,
      "raisedBacktrace" => e.backtrace.first(6),
      "calls" => instance.calls,
    }
  end
end

row = row_file_set(ROW_ID)
probes = PROBES[ROW_ID]
if probes.nil?
  raise "no probe list for #{ROW_ID} in this capture; a row with no probes is a row with no measurement"
end

# The constants are stood up ONCE, before any probe runs. A capture that
# stood them up per probe replaced Object::Card each time, and a receiver
# class bound to an EARLIER Card then resolved `Card::Name` against a
# Card that no longer had Name - so the probe raised "uninitialized
# constant Card::Name" for a reason that was about the harness.
stand_up_constants

results = probes.map do |probe|
  source = begin
    PinnedCardGem.pinned_method(
      row["defs"].find { |d| d["name"] == probe["method"] }&.fetch("file", nil) || "",
      probe["method"]
    )
  rescue StandardError => e
    { "file" => "unknown", "startLine" => 0, "endLine" => 0, "source" => "", "error" => e.message }
  end
  if source["source"].to_s.empty?
    {
      "probe" => probe["name"],
      "method" => probe["method"],
      "outcome" => "not-extractable",
      "error" => source["error"] || "the pinned method could not be extracted",
    }
  else
    run_probe(probe, source, row)
  end
end

output = {
  "row" => ROW_ID,
  "rubyFiles" => row["rubyFiles"],
  "rubySources" => row["rubySources"],
  "defCount" => row["defCount"],
  "counts" => row["counts"],
  "probeCount" => results.length,
  "probes" => results,
  "defs" => row["defs"].map do |d|
    {
      "name" => d["name"],
      "file" => d["file"],
      "line" => d["line"],
      "disposition" => d["disposition"],
      "portBinding" => d["portBinding"],
      "inlineSite" => d["inlineSite"],
      "headerCitation" => d["headerCitation"],
      "reachability" => d["reachability"],
      "pinnedCallSites" => d["pinnedCallSites"],
      "pinnedCallCount" => d["pinnedCallCount"],
    }
  end,
}
puts JSON.pretty_generate(output)
puts
