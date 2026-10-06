# search_oracle_capture.rb — the VALID-JSON SEARCH ORACLE (row8-parity-gaps
# lane, 2026-10-03). Closes the semantics-parity hole named in
# deliverables/four-parity-proof-inventory-and-plan-2026-10-03.md §B:
# "the corpus capture records rendered views and card records, but no
# valid-JSON search result sets". This capture records, for a FIXED
# 11-query battery, the result sets the REAL Ruby CQL engine
# (Card.search) returns over a seeded corpus — plus the corpus rows
# themselves, so the TS pin can rebuild the same deck and compare.
#
# Run (from the oracle app):
#   RAILS_ENV=development bundle exec decko runner \
#     C:/localProjects/decko-ts-lane-row8-parity/tools/oracle/search_oracle_capture.rb
#
# Output: fixtures/captured/search-oracle-battery.json
# (deep-sorted keys, 2-space pretty, trailing newline, LF — the harness
# contract; binwrite keeps re-runs byte-stable).
#
# Determinism contract:
#   - Every battery query carries sort: "name" (SQLite BINARY collation on
#     both sides); the TS pin additionally sorts both arrays — the
#     comparison is name-SET parity with the sort/dir/limit SHAPES pinned
#     through the sets they select (the same normalization the cql-basic
#     replay uses; ORDER-BY byte order is the sql-generation tests' pin).
#   - Seeding is create-if-missing with FIXED bytes; re-runs converge.
#   - `match` is EXCLUDED: card 1.110 routes it through ConnectionAdapters
#     (MySQL REGEXP / PG ~*); SQLite raises. The sentinel lives in
#     fixtures/captured/cql-basic.json (match_sentinel) and the
#     cql-mysql-match rung — not duplicated here.
#   - The reference/plus CQL caveat: plain left/right/plus ties compile to
#     cards-table joins and run; the right_plus-with-array shape used by
#     Auth.find_account_by_email returns [] app-wide in this scratch app
#     (an app-level defect named in mail_oracles_capture.rb) — the battery
#     deliberately stays on the proven shapes.

require "json"

REPO_ROOT = "C:/localProjects/decko-ts-lane-row8-parity"
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "search-oracle-battery.json")

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

seed_log = {}

Card::Auth.as_bot do
  # ----- the corpus (create-if-missing, fixed bytes) ----------------------
  # A dedicated CARDTYPE so the type-filter query selects exactly this
  # corpus; distinctive names so nothing else in the deck collides.
  unless Card["Search Oracle Kind"]
    Card.create! name: "Search Oracle Kind", type: "Cardtype"
    seed_log["Search Oracle Kind"] = "created (cardtype)"
  else
    seed_log["Search Oracle Kind"] = "present"
  end

  corpus = [
    { name: "Search Oracle Alpha",  type: "Search Oracle Kind", content: "alpha body text" },
    { name: "Search Oracle Beta",   type: "Search Oracle Kind", content: "beta body" },
    { name: "Search Oracle Gamma",  type: "Search Oracle Kind", content: "alpha body gamma" },
    { name: "Search Oracle Junction", type: "Basic", content: "" },
    { name: "Search Oracle Junction+child_one",  type: "Search Oracle Kind", content: "first child" },
    { name: "Search Oracle Junction+child_two",  type: "Search Oracle Kind", content: "second child" },
    { name: "Search Oracle Author", type: "User", content: "" }
  ]
  corpus.each do |row|
    c = Card.fetch(row[:name], new: {})
    if c.new_card?
      Card.create! name: row[:name], type: row[:type], content: row[:content]
      seed_log[row[:name]] = "created"
    else
      # type correction first (an earlier run's debris can hold the name
      # with a different type — the Auth.with actor below needs the User
      # type's account-holder machinery)
      c.update! type: row[:type] if c.type_name != row[:type]
      c.update! content: row[:content] unless c.content == row[:content]
      seed_log[row[:name]] = "present"
    end
  end

  # The created_by arm needs a creator EXCLUSIVE to this corpus (the app
  # deck carries other actors' cards). "Search Oracle Author" is the
  # creator of exactly one card.
  author = Card["Search Oracle Author"]
  made = Card.fetch("Search Oracle Made", new: { type_id: Card::BasicID })
  if made.new_card?
    Card::Auth.with(author.id) do
      Card.create! name: "Search Oracle Made", type: "Basic", content: "made body"
    end
    seed_log["Search Oracle Made"] = "created by Search Oracle Author"
  else
    made.update! content: "made body" unless made.content == "made body"
    seed_log["Search Oracle Made"] = "present"
  end

  # ----- the frozen battery ------------------------------------------------
  QUERIES = {
    "exact_name"      => { name: "Search Oracle Alpha", sort: "name" },
    "type_filter"     => { type: "Search Oracle Kind", sort: "name" },
    "left_children"   => { left: "Search Oracle Junction", sort: "name" },
    "right_child"     => { right: "child_one", sort: "name" },
    "plus_condition"  => { plus: "child_one", sort: "name" },
    "content_exact"   => { content: "alpha body text", sort: "name" },
    "created_by"      => { created_by: "Search Oracle Author", sort: "name" },
    "not_name"        => { type: "Search Oracle Kind", not: { name: "Search Oracle Alpha" }, sort: "name" },
    "sort_desc_limit" => { type: "Search Oracle Kind", sort: "name", dir: "desc", limit: 2 },
    "and_combo"       => { type: "Search Oracle Kind", right: "child_one", sort: "name" },
    "empty_result"    => { name: "Search Oracle No Such Card", sort: "name" }
  }.freeze

  payload = {
    "captured_by" => "tools/oracle/search_oracle_capture.rb",
    "oracle" => {
      "ruby" => RUBY_VERSION,
      "card" => "1.110.0",
      "decko" => "0.20.0",
      "app" => "C:/localProjects/decko-oracle-app-2026-10-03 (dev sqlite)",
      "engine" => "Card.search(**query, return: \"name\") — the real CQL interpreter"
    },
    "normalization" =>
      "every query sorts by name; the TS pin sorts both arrays (name-SET parity, " \
      "the cql-basic replay's contract); match is excluded (SQLite raises — the " \
      "sentinel lives in cql-basic.json + the cql-mysql-match rung)",
    "seed_log" => seed_log,
    "corpus" => corpus.map do |row|
      { "name" => row[:name], "type" => row[:type], "content" => row[:content] }
    end + [{ "name" => "Search Oracle Made", "type" => "Basic", "content" => "made body",
             "created_by" => "Search Oracle Author" }],
    "queries" => QUERIES.map do |label, query|
      canonical = deep_sort(query)
      [label, { "query" => canonical, "result" => run_query(query) }]
    end.to_h
  }

  File.binwrite(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
  puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
  payload["queries"].each { |label, entry| puts "  #{label}: #{Array(entry['result']).size} result(s)" }
  $stdout.flush
end
