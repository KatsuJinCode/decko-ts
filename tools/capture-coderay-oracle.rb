#!/usr/bin/env ruby
# Stream M1 (coderay-highlighting) oracle-bytes capture.
# Calls CodeRay.scan(content, :LANG).div directly on the same content
# strings the corpus cards store. Saves the resulting HTML to
# fixtures/captured/coderay/<filename>.html.
#
# Run from anywhere — paths are absolute.

require "json"
require "coderay"

OUT_DIR = "C:/localProjects/decko-ts/fixtures/captured/coderay"

CASES = [
  {
    name: "json-tinymce-corpus-53",
    lang: :json,
    shard: "000000",
    card_id: 53,
  },
  {
    name: "css-corpus-198",
    lang: :css,
    shard: "000000",
    card_id: 198,
  },
  {
    name: "html-layout-corpus-314",
    lang: :html,
    shard: "000000",
    card_id: 314,
  },
  {
    name: "html-layout-shard1-2339",
    lang: :html,
    shard: "000001",
    card_id: 2339,
  },
  {
    name: "html-layout-shard1-2347",
    lang: :html,
    shard: "000001",
    card_id: 2347,
  },
  {
    name: "html-layout-shard1-2575",
    lang: :html,
    shard: "000001",
    card_id: 2575,
  },
]

def load_content(shard, card_id)
  path = "C:/localProjects/decko-ts/fixtures/corpus/shard-#{shard}.jsonl"
  File.foreach(path) do |line|
    d = JSON.parse(line)
    if d["id"] == card_id
      return d["record"]["content"]
    end
  end
  raise "card #{card_id} not found in shard #{shard}"
end

require "fileutils"
FileUtils.mkdir_p(OUT_DIR)

CASES.each do |c|
  content = load_content(c[:shard], c[:card_id])
  html = CodeRay.scan(content, c[:lang]).div
  out_path = "#{OUT_DIR}/#{c[:name]}.html"
  # Binary write so Windows-mode LF->CRLF translation doesn't change the
  # bytes. CodeRay emits LF; the TS port matches LF; tests compare bytes.
  File.binwrite(out_path, html)
  puts "wrote #{out_path} (#{html.bytesize} bytes; lang=#{c[:lang]})"
end

puts "done"
