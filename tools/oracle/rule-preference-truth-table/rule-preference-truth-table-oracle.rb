# rule-preference-truth-table-oracle.rb -- static-ruby oracle for the
# `rule?` predicate.
#
# WHAT RUNS: the gem's own source lines, extracted VERBATIM from
# prototype/lib/card/rule/all.rb (the tree's copy of card's
# lib/card/rule/all.rb) by line range (1-indexed, inclusive) and evaluated
# onto a minimal card double:
#
#   all.rb:33-35   def rule?                standard_rule? || preference?
#   all.rb:37-40   def standard_rule?       right SettingID && left SetID
#   all.rb:42-47   def preference?          parts>2 && right SettingID &&
#                                            name[0..-3] SetID && valid_preferer?
#   all.rb:51-54   def valid_preferer?      self[-2] UserID || codename :all
#
# (the `private` at all.rb:49 stays in the gem file; it is a visibility
# modifier with no behavior, so the extracted regions step around it.)
#
# The BEHAVIOR is the gem's. The ENVIRONMENT is stubbed, and every stub is
# listed here:
#
#   Cardname        - the REAL installed cardname-0.20.0 gem (the exact
#                     version the decko 0.20.0 gems run against), loaded
#                     with its core_ext. Two ActiveSupport shims let it
#                     load standalone, both exact-semantics:
#     cattr_accessor  - AS class macro (reader+writer over one ivar);
#                       cardname.rb:29 declares seven config accessors.
#     Object#blank?   - AS core_ext/object/blank for plain objects:
#                       respond_to?(:empty?) ? !!empty? : !self.
#   Card.fetch_type_id - all.rb's fetch is DB-backed (fetch/card_class.rb:92:
#                     fetch(mark, skip_modules: true)&.type_id). Stubbed over
#                     the corpus facts table produced by
#                     generate-facts-from-corpus.mjs (read-only corpus walk).
#                     A miss returns nil --
#                     Ruby's fetch-returns-nil path.
#   CardDouble#[]    - valid_preferer?'s `self[-2, skip_modules: true]`
#                     (all.rb:52): a fetch of the second-to-last name part.
#                     skip_modules is ignored -- it gates module loading,
#                     not which card fetches.
#   CardDouble#codename - returns the corpus codename as a SYMBOL (decko
#                     codenames are symbols; all.rb:53 compares == :all).
#   SettingID/SetID/UserID - the corpus's own codename-card ids
#                     (typeConstantIds in the facts file), never hardcoded.
#
# Each JSONL line on stdout carries the gemSource line range so the
# provenance discipline can cite exactly which verbatim bytes produced it.
#
# Usage:
#   ruby rule-preference-truth-table-oracle.rb <all.rb-path> <facts-json> [> out.jsonl]

require "json"

all_rb_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <all.rb-path> <facts-json>"
facts_path = ARGV[1] or abort "usage: ruby #{File.basename(__FILE__)} <all.rb-path> <facts-json>"
abort "gem source not found: #{all_rb_path}" unless File.file?(all_rb_path)
src_lines = File.readlines(all_rb_path)
facts = JSON.parse(File.read(facts_path))

# 1-indexed inclusive region extraction (verbatim).
region = lambda do |a, b|
  src_lines[(a - 1)...b].join
end

# --- the stubbed environment -------------------------------------------------

class Class
  # ActiveSupport's cattr_accessor (exact semantics: singleton reader+writer
  # over one ivar) -- cardname.rb:29 needs it to load standalone.
  def cattr_accessor(*names)
    names.each do |n|
      iv = "@#{n}"
      define_singleton_method(n) { instance_variable_get(iv) }
      define_singleton_method("#{n}=") { |v| instance_variable_set(iv, v) }
    end
  end
end

class Object
  # ActiveSupport core_ext/object/blank (exact semantics for the shapes
  # cardname hits: strings and nil).
  def blank?
    respond_to?(:empty?) ? !!empty? : !self
  end

  def present?
    !blank?
  end
end

require "cardname"     # the REAL installed cardname-0.20.0 gem
require "core_ext"     # its Object#to_name

type_constant_ids = facts.fetch("typeConstantIds")
# decko's own constant names (all.rb:38,39,44,45,53 use SettingID/SetID/UserID).
SettingID = type_constant_ids.fetch("setting")
SetID     = type_constant_ids.fetch("set")
UserID    = type_constant_ids.fetch("user")

FACTS = facts.fetch("facts")

# The name mark's canonical string (Cardname IS a String but its canonical
# form is #s; plain Strings pass through).
def mark_s(mark)
  mark.respond_to?(:s) ? mark.s : mark.to_s
end

class CardDouble
  attr_reader :name

  class << self
    # verbatim all.rb:38,39,44,45 call site -- Card.fetch_type_id(mark) =
    # fetch(mark, skip_modules: true)&.type_id (fetch/card_class.rb:92-95),
    # stubbed over the corpus facts table; nil on a miss = fetch-nil.
    def fetch_type_id(*mark)
      row = FACTS[mark_s(mark.first)]
      row&.fetch("typeId")
    end

    def mark_s(mark)
      mark.respond_to?(:s) ? mark.s : mark.to_s
    end
  end

  def initialize(name_str, facts:)
    @name = Cardname.new(name_str)
    @facts = facts
  end

  # verbatim all.rb:52 call site -- self[-2, skip_modules: true]. The index
  # fetches the card at that name part; skip_modules ignored (module-loading
  # gate, not fetch semantics). Returns nil for an unfetchable part.
  def [](index, *_opts)
    part = @name.parts[index]
    return nil if part.nil?

    row = @facts[part]
    return nil if row.nil?

    CardDouble.new(part, facts: @facts)
  end

  def type_id
    row&.fetch("typeId")
  end

  def codename
    # decko codenames are symbols; all.rb:53 compares == :all.
    row && row.fetch("codename")&.to_sym
  end

  private

  def row
    @facts[self.class.mark_s(@name)]
  end
end

# verbatim: all.rb:33-47 (rule? / standard_rule? / preference?) and
# all.rb:51-54 (valid_preferer?), skipping the `private` at :49.
CardDouble.class_eval region.call(33, 47) + "\n" + region.call(51, 54)

# The gem's methods are Card INSTANCE methods; the verbatim bodies also call
# the CLASS-level Card.fetch_type_id. Aliasing the double as Card lets both
# resolve exactly as written (all.rb:38,39,44,45).
Card = CardDouble

# --- drive the families -------------------------------------------------------

def emit(obj)
  puts JSON.generate(obj)
end

RUBY_SOURCE = "prototype/lib/card/rule/all.rb:33-47,51-54".freeze

facts.fetch("families").each do |family_key, members|
  members.each do |member|
    card = CardDouble.new(member.fetch("name"), facts: FACTS)
    emit(
      behaviorId: "rule?",
      kind: "predicate-truth-table",
      family: family_key,
      scenario: member.fetch("name"),
      gemSource: RUBY_SOURCE,
      parts: card.name.parts,
      standard_rule: card.standard_rule?,
      preference: card.preference?,
      valid_preferer: (card.preference? ? card.send(:valid_preferer?) : nil),
      rule: card.rule?,
    )
  end
end
