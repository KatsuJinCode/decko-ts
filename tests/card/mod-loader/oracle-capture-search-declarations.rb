# Extract card-mod-search-0.20.0's set-file DECLARATIONS from the gem source,
# for the register entry 28 census.
#
# The gem is 29 set files with 33 view declarations spread across html, json,
# csv, rss, data and BARE (`format do`) blocks. This script reports, per set
# file, every format block it opens and every `view :<name>, <options>` it
# declares inside, with the block's format key - "base" for the bare
# `format do` form - so the port's registrations can be compared against the
# gem's own lines.
#
# A view declaration's option list continues onto following lines while they
# are indented deeper than the `view` keyword and the declaration has not
# reached its `do`; the span is collected before the option WORDS are read.
#
# A `view` OUTSIDE any format block goes to the BASE format module
# (card-1.110.0 lib/card/set/format.rb:106-108 `def view(...); format {
# view(...) }; end`, the shortcut into define_on_format(:base)) - which is
# what self/recent.rb:4's bare `view :title` does. Those rows report "base",
# not null.
#
# Usage:
#   ruby oracle-capture-search-declarations.rb <gem>/set/... <gem>/set/...
#
# Output on stdout: one JSON object per file, in the order given.

require "json"

def option_words(span)
  args = span.strip.sub(/\A,/, "")
  parts = []
  depth = 0
  current = +""
  args.each_char do |ch|
    case ch
    when "{", "[", "(" then depth += 1
    when "}", "]", ")" then depth -= 1
    end
    if ch == "," && depth == 0
      parts << current.strip
      current = +""
    else
      current << ch
    end
  end
  parts << current.strip unless current.strip.empty?
  parts.map { |p| p[/\A([a-z_]+):/, 1] }.compact.sort
end

out = ARGV.map do |path|
  lines = File.readlines(path)
  formats = []
  views = []
  current_format = nil
  lines.each_with_index do |line, index|
    next if line.strip.start_with?("#")

    if line.match(/^\s*format\s+do\b/)
      current_format = "base"
      formats << { "line" => index + 1, "name" => "base" }
      next
    end
    if (m = line.match(/^\s*format\s+:([a-z_0-9]+)\s+do/))
      current_format = m[1]
      formats << { "line" => index + 1, "name" => current_format }
      next
    end
    if line.match(/^end\s*$/) && current_format
      current_format = nil
      next
    end
    # Both spellings occur: `view :name, ...` and `view(:name, ...) { }`
    # (abstract/0_search.rb:56 and :86 use the parenthesised form).
    if (m = line.match(/^(\s*)view\s*\(?\s*:([a-z_0-9]+)\s*\)?\s*(.*)$/))
      indent = m[1].length
      span = m[3].to_s
      j = index
      loop do
        break if span =~ /\bdo\s*(\|[^|]*\|\s*)?\z/
        nxt = lines[j + 1]
        break if nxt.nil?
        break if nxt.strip.empty? || nxt.strip.start_with?("#")
        break if nxt[/\A\s*/].length <= indent
        j += 1
        span = "#{span} #{nxt.strip}"
      end
      views << {
        "line" => index + 1,
        "name" => m[2],
        "format" => current_format || "base",
        "options" => option_words(span.sub(/\s+do\s*(\|[^|]*\|\s*)?\z/, "")),
      }
    end
  end
  {
    "file" => path.tr("\\", "/").split("/set/").last,
    "formats" => formats,
    "views" => views,
  }
end

puts JSON.pretty_generate(out)