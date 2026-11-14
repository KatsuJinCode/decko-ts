# cql_match_capture.rb - MySQL rung: CQL `match` battery recorded to
# fixtures/captured/cql-mysql-match.json.
#
# Run (from tools/oracle/decko-oracle-app, with the scratch MariaDB server
# up - see docs/parity-method.md "MySQL rung"):
#   RAILS_ENV=development ORACLE_DB=mysql2 \
#     RUBY_DLL_PATH=REPO_ROOT/decko-ts/tools/oracle/mysql-client-scratch/lib \
#     bundle exec decko runner REPO_ROOT/decko-ts/tools/oracle/cql_match_capture.rb
#
# Why this rung exists: `match` is MySQL/PostgreSQL-only in card 1.110 (the
# query compiler routes it through ConnectionAdapters#match; the abstract
# default raises). The SQLite oracle records only the raise, so match parity
# had no oracle. This capture runs the SAME oracle app against a MySQL-
# protocol server (scratch MariaDB 11.4.5) and records Ruby's real result
# sets and rendered search bytes.
#
# Determinism contract (mirrors capture.rb):
# - probe seeds are create-if-missing and content-converging (re-runs converge)
# - every query pins sort: "name" (unordered CQL results are DB-scan order)
# - timestamps/creator ids are not captured; card_count is not captured
# - output JSON is pretty-printed with deeply sorted keys + trailing newline
# - rendered search output has data-slot-id AND data-card-id normalized:
#   slot ids are random per render (wrap.rb SecureRandom), card ids are
#   DB-local (MySQL ids differ from the SQLite oracle ids) - neither carries
#   match semantics; presence of the attributes is preserved.

require "json"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "cql-mysql-match.json")

# All probe names/content carry the unique token "Matchprobe" so the battery
# is self-contained: result sets cannot be perturbed by cards from other
# captures (the smoke seeds, core cards) sharing the deck.
SEEDS = [
  # plain word in name + plain words in content
  { name: "Matchprobe Alpha", type: "RichText",
    content: "the quick brown fox jumps over the lazy dog" },
  { name: "Matchprobe Beta", type: "RichText",
    content: "a calm brown cow grazes quietly" },
  # case-sensitivity probes: upper name, upper token in lower content,
  # all-lower name
  { name: "Matchprobe UPPER", type: "RichText",
    content: "shouting UPPERCASE token inside lowercase text" },
  { name: "matchprobe lower", type: "RichText",
    content: "quiet lowercase body" },
  # metacharacter literals in content (default match terms escape these)
  { name: "Matchprobe Punct", type: "RichText",
    content: "grep (regex) [braces] + plus.dot? no! a|b ^carat $end" },
  # wildcard discrimination: literal dot vs raw-regex dot vs word boundary;
  # "welwel" gives the (wel)\1 backreference probe a true match
  { name: "Matchprobe Dots", type: "RichText",
    content: "wel.come welxcome wellcome welwel version v2.0 beta" },
  # non-ASCII content: accented latin, uppercase accented, CJK. Deliberately
  # NO unaccented "naive" word here: the unaccented-query probe must be a
  # real accent-sensitivity test, not a literal hit.
  { name: "Matchprobe Unicode", type: "RichText",
    content: "words: naïve café Zürich NAÏVE repeat 日本語テキスト" },
  # compound family: parent content carries the token, child name carries
  # the token but child content does NOT. Match reads the ROW name column:
  # the junction row ("Matchprobe Compound+zeta", NULL name) is invisible,
  # but the standalone tag card "zeta" it creates matches by its own name -
  # the captured result is exactly ["zeta"].
  { name: "Matchprobe Compound", type: "RichText",
    content: "compound parent carries the token" },
  { name: "Matchprobe Compound+zeta", type: "RichText",
    content: "child body without the magic word" }
].freeze

# Search-type card whose query IS a match query; its rendered views are the
# byte oracle for rendering match results.
SEARCH_CARD = { name: "Matchprobe Search", type: "Search",
                content: JSON.generate("match" => "matchprobe",
                                       "sort" => "name") }.freeze

RENDER_VIEWS = %i[open content bar].freeze

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
CARD_ID_RE = /data-card-id=(["'])\d+\1/.freeze

def normalize(html)
  html # slot ids stored as Ruby wrote them; masked at compare time
      .gsub(CARD_ID_RE, 'data-card-id="RANDOMIZED"')
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def seed_card(attrs)
  existing = Card.fetch(attrs[:name], new: {})
  if existing.new_card?
    Card.create! attrs
    "created"
  elsif existing.content != attrs[:content] || existing.type_name != attrs[:type]
    existing.update! content: attrs[:content], type: attrs[:type]
    "updated"
  else
    "present"
  end
end

def run_query(query)
  Card.search(**query, return: "name")
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 200]}"
end

# Each battery entry: canonical CQL + Ruby's name result set. Probes cover:
# plain words, case, metacharacters (escaped literal vs ~~ raw regex),
# word boundaries, POSIX/unicode classes, = exact-name, field-restricted
# match, array values, empty match, compound NULL-name rows, non-ASCII.
QUERIES = {
  "plain_word"            => { match: "matchprobe", sort: "name" },
  "plain_word_fox"        => { match: "fox", sort: "name" },
  "case_query_lower"      => { match: "uppercase", sort: "name" },
  "case_query_upper"      => { match: "UPPERCASE", sort: "name" },
  "case_query_mixed"      => { match: "UpPeRcAsE", sort: "name" },
  "case_name_lower"       => { match: "MATCHPROBE LOWER", sort: "name" },
  "punct_literal_parens"  => { match: "(regex)", sort: "name" },
  "punct_literal_brackets" => { match: "[braces]", sort: "name" },
  "punct_literal_plus"    => { match: "+ plus", sort: "name" },
  "dot_literal"           => { match: "wel.come", sort: "name" },
  "dot_raw_regex"         => { match: "~~wel.come", sort: "name" },
  "dot_raw_word_boundary" => { match: "~~\\bcome\\b", sort: "name" },
  "raw_digit_class"       => { match: "~~v[0-9]\\.0", sort: "name" },
  "raw_posix_alpha"       => { match: "~~[[:alpha:]]+", sort: "name", limit: 4 },
  "raw_unicode_class"     => { match: "~~\\p{Han}+", sort: "name" },
  "raw_backreference"     => { match: "~~(wel)\\1", sort: "name" },
  "raw_case_upper"        => { match: "~~MATCHPROBE", sort: "name" },
  "raw_mysql57_wordstart" => { match: "~~[[:<:]]come", sort: "name" },
  "equals_exact_name"     => { match: "=Matchprobe UPPER", sort: "name" },
  "equals_case_variant"   => { match: "=matchprobe upper", sort: "name" },
  "equals_nonexistent"    => { match: "=Matchprobe Nowhere", sort: "name" },
  "name_restricted"       => { name: ["match", "upper"], sort: "name" },
  "content_restricted"    => { content: ["match", "fox"], sort: "name" },
  "array_value_joined"    => { match: %w[quick brown], sort: "name" },
  "empty_match_noop"      => { match: "", sort: "name", limit: 3 },
  "compound_child_name_token" => { match: "zeta", sort: "name" },
  "nonascii_accented"     => { match: "café", sort: "name" },
  "nonascii_case_fold"    => { match: "CAFÉ", sort: "name" },
  "nonascii_unaccented_query" => { match: "naive", sort: "name" },
  "nonascii_cjk"          => { match: "日本語", sort: "name" },
  "nonascii_raw_dot_cjk"  => { match: "~~日本語.テキスト", sort: "name" }
}.freeze

payload = {}

# ---- seed ------------------------------------------------------------------
seed_log = {}
Card::Auth.as_bot do
  SEEDS.each { |attrs| seed_log[attrs[:name]] = seed_card(attrs) }
  seed_log[SEARCH_CARD[:name]] = seed_card(SEARCH_CARD)
end
payload["seed_log_digest"] = seed_log.keys.sort

# ---- server + mechanism facts (stable identifiers, not card data) ----------
conn = ActiveRecord::Base.connection
payload["mechanism"] = {
  "adapter_name" => conn.adapter_name.to_s,
  "server_version" => conn.select_value("SELECT @@version").to_s,
  "connection_collation" =>
    conn.select_value("SELECT @@collation_connection").to_s,
  "cards_table_collation" =>
    conn.select_one(
      "SELECT table_collation FROM information_schema.tables " \
      "WHERE table_schema = DATABASE() AND table_name = 'cards'"
    )["table_collation"].to_s,
  "match_method_source" => conn.method(:match).source_location.map(&:to_s),
  "adapter_match_output" => conn.match("'x'").to_s,
  "generated_sql_for_word" =>
    Card::Query.new(match: "matchprobe").sql_statement.instance_variable_get(:@query)
               .conditions.join(" ").to_s
}

# ---- CQL match battery ------------------------------------------------------
payload["queries"] = QUERIES.map do |label, query|
  canonical = deep_sort(query)
  [label, { "query" => canonical, "result" => run_query(query) }]
end.to_h

# ---- rendered search bytes --------------------------------------------------
search_card = Card.fetch(SEARCH_CARD[:name])
format = search_card.format
views = {}
RENDER_VIEWS.each do |view|
  views[view.to_s] = normalize(format.render(view))
rescue StandardError => e
  views[view.to_s] = "CAPTURE_ERROR: #{e.class}: #{e.message[0, 300]}"
end
payload["rendered_match_search"] = views

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "seed_log: #{JSON.generate(deep_sort(seed_log))}"
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
$stdout.flush
