# Extract card-mod-virtual-0.20.0's set-file DECLARATIONS from the gem source,
# for the register entry 33 census.
#
# The gem is one set file plus one lib file. Its declaration surface is
# therefore small enough to read straight out of the source: this script
# reports, per file, every `event :`, `view :`, `include_set` and the
# `def` names, so the port's manifest and its exports can be compared
# against the gem's own words instead of a transcription.
#
# Usage:
#   ruby oracle-capture-virtual-declarations.rb <gem>/set/abstract/virtual_cache.rb <gem>/lib/card/virtual.rb
#
# Output on stdout: one JSON object per file.

require "json"

def set_path_of(file)
  path = file.tr("\\", "/")
  if (m = path.match(%r{/set/(.+)\.rb\z}))
    return m[1]
  end
  nil
end

out = ARGV.map do |path|
  source = File.read(path)
  lines = source.lines
  events = []
  views = []
  includes = []
  defs = []
  lines.each_with_index do |line, index|
    next if line.strip.start_with?("#")

    if (m = line.match(/^\s*event\s+:([a-z_0-9]+)\s*(?:,\s*(.+))?$/))
      events << {
        "line" => index + 1,
        "name" => m[1],
        "args" => (m[2] ? m[2].strip.sub(/\s+do\s*(\|[^|]*\|\s*)?\z/, "") : ""),
      }
    elsif (m = line.match(/^\s*view\s+:([a-z_0-9]+)/))
      views << { "line" => index + 1, "name" => m[1] }
    elsif (m = line.match(/^\s*include_set\s+(.+)$/))
      includes << { "line" => index + 1, "target" => m[1].strip }
    elsif (m = line.match(/^\s*def\s+(?:self\.)?([a-z_0-9?!=]+)/))
      defs << { "line" => index + 1, "name" => m[1] }
    end
  end
  {
    "file" => File.basename(path),
    "set_path" => set_path_of(path),
    "events" => events,
    "views" => views,
    "includes" => includes,
    "defs" => defs,
  }
end

puts JSON.pretty_generate(out)