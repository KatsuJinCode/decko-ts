# oracle-capture-card-gem-class-declarations-ruby.rb - the shared rig for
# the [Family] rows' CLASS-DECLARATION captures.
#
# WHAT THIS IS. One row in this family - the Card class itself - is not
# about methods at all. Its subject is the class BODY of
# card-1.110.0/lib/card.rb: the mixin roster (`extend` / `include`), the
# action_specific_attributes list, the ActiveRecord associations
# (`has_many`), and the three Rails callback chains
# (`define_callbacks :select_action, :show_page, :act`).
#
# A def-based instrument measures NOTHING on that row - the file defines no
# methods at all - so a def-based instrument cannot grade it, and a row
# graded by an instrument that cannot see its subject is a row graded by
# nothing. This rig measures the class body's DECLARATIONS instead.
#
# THE FOUR PIECES:
#
#   1. the PINNED GEMSET read BY LINE, for the same reason the method rig
#      reads by line: the card gem cannot be loaded standalone
#      (card-1.110.0/lib/card.rb opens `class Card < Cardio::Record`, and
#      Cardio::Record is an ActiveRecord model, so requiring it pulls Rails
#      in and needs a database).
#   2. the CLASS BODY extracted by line, with its start and end line
#      numbers, so a reader can check the bytes against the pinned file.
#   3. the DECLARATION LEDGER: every `extend`, `include`, `has_many`,
#      `attr_accessor`, `cattr_accessor`, `define_callbacks` and
#      `alias_method` in that body, each with its own line number and its
#      own arguments, read from the pinned bytes.
#   4. the PORT side: the port's own counterpart for each declaration,
#      read the same way - by binding, not by mention.
#
# THE PORT SIDE IS THE HONEST PART, and it is the same rule the family's
# method rig applies. For each declaration the capture records:
#
#   PORTED        the port binds a counterpart under a name derived from
#                 the declaration.
#   PORTED-INLINE the port carries the behaviour at a call site, and the
#                 citing port file's OWN COMMENT cites this Ruby source.
#   NAMED-SKIP    the declaration is Rails-only or ActiveRecord-only, and
#                 the port is not Rails, so the counterpart is a different
#                 mechanism. The citation is the reason.
#   GAP           neither, and the declaration's behaviour is reachable in
#                 the deck.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-card-gem-class-declarations-ruby.rb \
#     > fixtures/captured/card-gem-class-declarations-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a
# trailing newline. The declaration list is fixed by the pinned file, so a
# re-run on the same gemset is byte-stable.

require "json"

module PinnedCardGemClass
  GEMSET_ENV = "DECKO_RUBY_GEMSET"
  DEFAULT_GEMSET = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"

  # The declaration forms this rig reads. Each entry is a name and a
  # pattern; the pattern captures the declaration's ARGUMENTS.
  DECLARATIONS = {
    "extend" => /^\s*extend\s+(.+)$/,
    "include" => /^\s*include\s+(.+)$/,
    "has_many" => /^\s*has_many\s+:(\w+)/,
    "attr_accessor" => /^\s*attr_accessor(?:\(\*(.+)\))?/,
    "cattr_accessor" => /^\s*cattr_accessor\s+(.+)$/,
    "define_callbacks" => /^\s*define_callbacks\s+(.+)$/,
    "alias_method" => /^\s*alias_method\s+:(\w+),\s*:(\w+)/,
    "delegate" => /^\s*delegate\s+(.+)$/,
  }.freeze

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

  # The class BODY of the pinned file: from the `class Card < ...` line to
  # its matching `end`, by line. The body is what the row's subject is.
  def class_body(relative)
    lines = read_pinned(relative).lines
    start = nil
    indent = nil
    lines.each_with_index do |line, index|
      next unless line.match?(/^\s*class\s+\w+/)

      start = index
      indent = line[/\A\s*/].length
      break
    end
    raise "no class declaration found in #{relative}" if start.nil?

    finish = nil
    ((start + 1)...lines.length).each do |index|
      line = lines[index]
      next if line.strip.empty?

      if line[/\A\s*/].length == indent && line.strip == "end"
        finish = index
        break
      end
    end
    raise "no closing end found for the class body in #{relative}" if finish.nil?

    {
      "file" => relative,
      "startLine" => start + 1,
      "endLine" => finish + 1,
      "source" => lines[start..finish].join,
    }
  end

  # The declaration ledger: every declaration in the class body, with its
  # own line number and its own arguments, read from the pinned bytes.
  def declaration_ledger(relative)
    body = class_body(relative)
    lines = body["source"].lines
    out = []
    lines.each_with_index do |line, index|
      DECLARATIONS.each do |kind, pattern|
        m = line.match(pattern)
        next unless m
        # A `class << self` block's own declarations are read too, but the
        # ledger says so, so a reader can tell a class-level declaration
        # from a singleton-class one.
        out << {
          "kind" => kind,
          "line" => body["startLine"] + index,
          "text" => line.strip,
          "arguments" => m.captures.compact,
        }
        break
      end
    end
    out
  end
end
