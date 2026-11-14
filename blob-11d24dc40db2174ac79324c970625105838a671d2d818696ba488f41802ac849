# Extract card-mod-tinymce_editor-0.20.0's set-file DECLARATIONS from the gem
# source, for the register entry 32 census.
#
# The gem declares 11 views across 6 format blocks in 5 files, and its
# remaining set files carry helper methods and basket pushes only. This
# script reports, per set file, the format blocks it opens and the
# `view :<name>` declarations inside them with their option words verbatim,
# so the port's manifest can be compared against the gem's own lines.
#
# Usage:
#   ruby oracle-capture-tinymce-declarations.rb <gem>/set/... <gem>/set/...
#
# Output on stdout: one JSON object per file, in the order given.

require "json"

out = ARGV.map do |path|
  lines = File.readlines(path)
  formats = []
  views = []
  current_format = nil
  lines.each_with_index do |line, index|
    next if line.strip.start_with?("#")

    if (m = line.match(/^\s*format\s+:([a-z_0-9]+)\s+do/))
      current_format = m[1]
      formats << { "line" => index + 1, "name" => current_format }
      next
    end
    if line.match(/^end\s*$/) && current_format
      current_format = nil
      next
    end
    if (m = line.match(/^(\s*)view\s+:([a-z_0-9]+)\s*(.*)$/))
      # A Ruby declaration's option list continues onto following lines
      # while they are indented deeper than the `view` keyword and the
      # declaration has not reached its `do`. Collect that span, then take
      # the OPTION WORDS: the top-level `word:` tokens of the argument list,
      # with the `wrap:` value dropped (the port's config schema carries
      # only the three scalar knobs; the wrap HASH rides the viewFn).
      indent = m[1].length
      span = m[3].to_s
      j = index
      loop do
        break if span =~ /\bdo\s*(\|[^|]*\|\s*)?\z/
        nxt = lines[j + 1]
        break if nxt.nil?
        break if nxt.strip.empty? || nxt.strip.start_with?("#")
        lead = nxt[/\A\s*/].length
        break if lead <= indent
        j += 1
        span = "#{span} #{nxt.strip}"
      end
      span = span.sub(/\s+do\s*(\|[^|]*\|\s*)?\z/, "").strip
      args = span.sub(/\A,/, "")
      # top-level comma split (braces and brackets nest)
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
      words = parts.map { |p| p[/\A([a-z_]+):/, 1] }.compact.reject { |w| w.start_with?("wrap") }
      views << {
        "line" => index + 1,
        "name" => m[2],
        "format" => current_format,
        "options" => words.sort.join(","),
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