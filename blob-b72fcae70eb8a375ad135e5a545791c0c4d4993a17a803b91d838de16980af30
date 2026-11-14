# psych-stress.rb -- Psych's own output for strings that exercise every
# quoting and wrapping rule the pod YAML writer ports.
#
#   ruby tools/persistence/psych-stress.rb <out-dir>
#
# Writes <out-dir>/psych-stress.json (the inputs) and psych-stress.yml (the
# same list of pod-shaped hashes as Hash#to_yaml writes it).
require "yaml"
require "json"

out = ARGV[0] or abort "usage: psych-stress.rb <out-dir>"
long = "word " * 30
strings = [
  "plain", "two words", "", " leading", "trailing ", "y", "n", "yes", "No", "true", "null", "~",
  "123", "1_000", "0x1F", "08", "012", "1.5", ".5", "1e5", "-.inf", ".nan", "12:30", "12:30:45",
  "2024-01-31", "2024-02-30", "2024-01-31 10:20:30", ":sym", ":\"q\"", "-", "- item", "-x", "a: b",
  "a:b", "#hash", "a #b", "a#b", "? q", "?q", "[x]", "{x}", "x, y", "*star", "&anchor", "!tag",
  "|pipe", ">gt", "'quote", "\"dq", "%pct", "@at", "`tick", "<p>tag</p>", "<p class=\"c\">x</p>",
  "---", "...", "--- x", "line\n", "line\n\n", "a\nb", "a\nb\n", "a\n\nb", "a \nb", "a\n b",
  "\tTab", "a\tb", "a\r\nb", "crlf\r\n", "é", "café", "nb sp", "emoji \u{1F600}",
  "bom﻿", "del\u007f", "nel\u0085x", "ls x", long, long.strip, long.strip + "\n" + long,
  "  " + long, "a  " + long, long.strip.tr(" ", "-"), "x" + ("  y" * 40), "<<", "yes please",
  "\"quoted\" start", "back\\slash", "colon: " + long, "Ünïcödé text", "日本語のテキスト",
  "1 2 3", "+1", "-1", "0", "00", "0b101", "1,000", "1:2:3", "=", "/path", "\\", "a'b", "it's \"x\""
]
items = strings.map { |s| { name: "Stress", content: s } }
items << { name: ["Left", :right], type: :rich_text, codename: :stress, content: "x", fields: { description: "d", "plain key" => "v" } }
File.binwrite(File.join(out, "psych-stress.json"), JSON.pretty_generate(strings))
File.binwrite(File.join(out, "psych-stress.yml"), items.to_yaml)
warn "[psych] #{items.size} items"
