# cql_capture.rb - RUNG 4: CQL operator battery recorded to
# fixtures/captured/cql-basic.json. Read-only over the smoke seeds; run
# capture.rb first so the seeded cards exist.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner C:/localProjects/decko-ts/tools/oracle/cql_capture.rb
#
# Operator coverage note: `match` is excluded everywhere - card 1.110 routes it
# through ConnectionAdapters#match, implemented only for MySQL (REGEXP) and
# PostgreSQL (~*); on SQLite it raises. It is recorded once as a sentinel.
# `left_plus`/`found_by` were dropped after probing showed the capture author
# (not the oracle) misread their syntax; wrong-authority facts do not belong in
# a fixture.

require "json"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "cql-basic.json")

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def run_query(query)
  Card.search(**query, return: "name")
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 200]}"
end

QUERIES = {
  "exact_name"          => { name: "Oracle Junction" },
  "left_children"       => { left: "Oracle Junction", sort: "name" },
  "right_child"         => { right: "child_one" },
  "plus_condition"      => { plus: "child_one", sort: "name" },
  "type_limit"          => { type: "Search", sort: "name", limit: 2 },
  "type_dir_desc"       => { type: "Search", sort: "name", dir: "desc", limit: 3 },
  "not_cardtypes"       => { not: { type: "Cardtype" }, type: "Search", sort: "name", limit: 3 },
  "content_exact"       => { content: "the nested child body" },
  "created_by_bot"      => { created_by: "Decko Bot", sort: "name", limit: 5 },
  "no_results"          => { name: "No Such Card At All" },
  "match_sentinel"      => { match: "Oracle" }
}.freeze

payload = {}
payload["queries"] = QUERIES.map do |label, query|
  canonical = deep_sort(query)
  [label, { "query" => canonical, "result" => run_query(query) }]
end.to_h

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
$stdout.flush
