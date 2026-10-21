# Extract card-mod-session-0.20.0's set-file DECLARATIONS from the gem source,
# for the register entry 29 parity pins.
#
# The gem has no lib-side computation worth executing here: set/type/session.rb
# and set/all/location_history.rb declare two set modules, four events and
# ZERO views. So the ground truth is the declaration lines themselves, read
# out of the gem's own files - not a transcription of them into this script.
#
# For each set file the script emits:
#   - every `event :<name>, <args...>` declaration, with the raw argument text
#     after the name (the stage / :finalize / on: / before: clauses), so the
#     port's per-event at/on/before records are compared against Ruby's words
#   - every `view :<name>` declaration (expected: none)
#   - every `include_set` line (the include chain, which the port's manifest
#     has no slot for)
#
# Usage:
#   ruby oracle-capture-session-declarations.rb <gem>/set/all/location_history.rb <gem>/set/type/session.rb
#
# Output on stdout: one JSON object per file.

require "json"

def set_path_of(file)
  file.tr("\\", "/").split("/set/").last.sub(/\.rb\z/, "")
end

out = ARGV.map do |path|
  source = File.read(path)
  lines = source.lines
  events = []
  views = []
  includes = []
  lines.each_with_index do |line, index|
    next if line.strip.start_with?("#")

    if (m = line.match(/^\s*event\s+:([a-z_0-9]+)\s*(?:,\s*(.+))?$/))
      events << {
        "line" => index + 1,
        "name" => m[1],
        # the raw argument text after the event name, verbatim
        "args" => (m[2] ? m[2].strip.sub(/\s+do\s*(\|[^|]*\|\s*)?\z/, "") : ""),
      }
    elsif (m = line.match(/^\s*view\s+:([a-z_0-9]+)/))
      views << { "line" => index + 1, "name" => m[1] }
    elsif (m = line.match(/^\s*include_set\s+(.+)$/))
      includes << { "line" => index + 1, "target" => m[1].strip }
    end
  end
  {
    "file" => File.basename(path),
    "set_path" => set_path_of(path),
    "events" => events,
    "views" => views,
    "includes" => includes,
  }
end

puts JSON.pretty_generate(out)