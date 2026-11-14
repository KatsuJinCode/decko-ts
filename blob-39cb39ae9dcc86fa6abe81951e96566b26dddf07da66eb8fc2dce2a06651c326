# load-oracle-corpus.rb -- M1 corpus-scale parity: load bench-corpus-v2.sqlite3
# into a COPY of the Ruby oracle app database (never the captured fixtures'
# db/development.sqlite3), then verify Card.fetch + a render on a sample.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development \
#   DATABASE_URL=sqlite3:C:/localProjects/decko-ts/tools/oracle/decko-oracle-app/db/corpus-v2.sqlite3 \
#   bundle exec decko runner C:/localProjects/decko-ts/benchmarks/load-oracle-corpus.rb
#
# Safety contract:
# - The script creates the corpus DB itself as a byte copy of
#   db/development.sqlite3 (the backup IS the original, left untouched).
# - It REFUSES to run unless the connected database file is
#   db/corpus-v2.sqlite3, so a mistyped DATABASE_URL can never truncate the
#   fixtures app.
#
# Minimal load (documented honestly in docs/corpus-v2-report.md):
# - cards rows are inserted DIRECTLY, following the real Decko insert
#   convention for the name columns: simple cards store name+key; compound
#   cards store NULL name/key and resolve through left_id/right_id (the
#   2020-Lexicon convention the engine reads).
# - NO card_acts/card_actions/card_changes rows are written. Decko reads
#   current content from cards.db_content when no revision exists
#   (card-1.110 content/all.rb), so fetch+render work without history.
#   What a minimal load CANNOT support: history views, change counters,
#   drafts, and anything that joins through card_actions/card_changes.
# - card_references rows are loaded as-is (ids preserved).
#
# Output: benchmarks/results/corpus-v2/oracle-load-verification.json
# (sample fetches + renders; raises on any hard failure).

require "json"
require "fileutils"
require "sqlite3"

REPO_ROOT = File.expand_path("..", __dir__)
CORPUS_DB = File.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3")
RESULT_DIR = File.join(REPO_ROOT, "benchmarks", "results", "corpus-v2")
RESULT_PATH = File.join(RESULT_DIR, "oracle-load-verification.json")

APP_DB_DIR = File.join(REPO_ROOT, "tools", "oracle", "decko-oracle-app", "db")
FIXTURES_DB = File.join(APP_DB_DIR, "development.sqlite3")
CORPUS_APP_DB = File.join(APP_DB_DIR, "corpus-v2.sqlite3")

# ---- Rails file-cache isolation --------------------------------------------
# Rails dev default is :file_store, tmp/cache, and Card::Cache[Lexicon] keys
# (e.g. "L-7-9") carry NO database identity. Entries written while a runner
# was pointed at db/development.sqlite3 are served to corpus-DB runs (and
# vice versa) and poison compound-name fetches with foreign ids. Every
# corpus-side runner script therefore clears the shared cache at start AND
# at exit, so the cache always reflects only the DB of the most recent run.
CACHE_DIR = File.join(REPO_ROOT, "tools", "oracle", "decko-oracle-app", "tmp", "cache")

def clear_rails_cache!
  FileUtils.rm_rf(Dir.glob(File.join(CACHE_DIR, "*")))
end

clear_rails_cache!
at_exit { clear_rails_cache! }

# ---- guard: refuse to run against anything but the corpus copy -------------
connected_file = ActiveRecord::Base.connection_db_config.configuration_hash[:database]
expanded = File.expand_path(connected_file, ENV["RAILS_ROOT"] || Dir.pwd)
if File.basename(expanded) != "corpus-v2.sqlite3"
  raise "REFUSING: connected database is #{expanded}; this loader only runs " \
        "against db/corpus-v2.sqlite3 (set DATABASE_URL to a corpus-v2 copy)"
end

# ---- create the copy (the original development.sqlite3 stays untouched) ----
# Always a fresh byte copy: an existing db/corpus-v2.sqlite3 may be a stale
# empty placeholder (e.g. created accidentally by a mis-routed probe).
raise "fixtures app DB missing: #{FIXTURES_DB}" unless File.exist?(FIXTURES_DB)
puts "copying #{FIXTURES_DB} -> #{CORPUS_APP_DB} ..."
FileUtils.cp(FIXTURES_DB, CORPUS_APP_DB)

conn = ActiveRecord::Base.connection

# ---- truncate the copy's deck tables ---------------------------------------
conn.execute("DELETE FROM card_changes")
conn.execute("DELETE FROM card_actions")
conn.execute("DELETE FROM card_acts")
conn.execute("DELETE FROM card_references")
conn.execute("DELETE FROM cards")
%w[cards card_actions card_changes card_acts card_references].each do |t|
  conn.execute("DELETE FROM sqlite_sequence WHERE name = '#{t}'")
end

# ---- bulk load from the corpus file (ATTACH + INSERT..SELECT) --------------
raise "corpus DB missing: #{CORPUS_DB}" unless File.exist?(CORPUS_DB)
conn.execute("ATTACH DATABASE '#{CORPUS_DB.gsub("'", "''")}' AS corpus")

# Decko name convention: simple cards carry name+key columns; compound cards
# (both sides present) carry NULL name/key and compose through the sides.
conn.execute(<<~SQL)
  INSERT INTO cards (id, name, key, codename, left_id, right_id,
                     current_revision_id, created_at, updated_at,
                     creator_id, updater_id, read_rule_class, read_rule_id,
                     references_expired, trash, type_id, db_content)
  SELECT c.id,
         CASE WHEN c.left_id IS NOT NULL AND c.right_id IS NOT NULL
              THEN NULL ELSE c.name END,
         CASE WHEN c.left_id IS NOT NULL AND c.right_id IS NOT NULL
              THEN NULL ELSE c.key END,
         c.codename, c.left_id, c.right_id,
         NULL, c.created_at, c.updated_at,
         c.creator_id, c.updater_id, c.read_rule_class, c.read_rule_id,
         NULL, c.trash, c.type_id, c.content
  FROM corpus.cards c
SQL
conn.execute(<<~SQL)
  INSERT INTO card_references (id, referer_id, referee_key, referee_id,
                               ref_type, is_present)
  SELECT id, referer_id, referee_key, referee_id, ref_type, is_present
  FROM corpus.card_references
SQL
loaded_cards = conn.select_value("SELECT COUNT(*) FROM cards").to_i
loaded_refs = conn.select_value("SELECT COUNT(*) FROM card_references").to_i
corpus_cards = conn.select_value("SELECT COUNT(*) FROM corpus.cards").to_i
corpus_refs = conn.select_value("SELECT COUNT(*) FROM corpus.card_references").to_i
conn.execute("DETACH DATABASE corpus")
puts "loaded: cards #{loaded_cards}/#{corpus_cards}, refs #{loaded_refs}/#{corpus_refs}"
raise "card count mismatch" unless loaded_cards == corpus_cards
raise "ref count mismatch" unless loaded_refs == corpus_refs

# ---- key column: compute with the engine's OWN key algorithm ---------------
# The corpus stores key=name as an echo, but decko's key form (cardname
# String#key) lowercases, underscores, and SINGULARIZES each word
# ("*all plus" -> "*all_plu", "children" -> "child"), so fetching by name
# requires the engine-computed form. Simple cards only -- compound rows
# carry NULL name/key and resolve through side ids (the real write path's
# convention). 49,829 key computations, one pass.
#
# NOTE: the update MUST go through conn.update. ActiveRecord's #execute
# treats its second argument as the log name, so an execute(sql, [binds])
# call prepares the statement with NULL binds -- a silent 0-row no-op
# (observed: the whole key pass vanished while "succeeding").
simple_ids = conn.select_all("SELECT id, name FROM cards WHERE name IS NOT NULL").rows
updated = 0
simple_ids.each do |(id, name)|
  key = name.to_name.key
  affected = conn.update("UPDATE cards SET key = '#{conn.quote_string(key)}' WHERE id = #{id}")
  raise "key update hit #{affected} rows for id #{id}" unless affected == 1
  updated += 1
end
spot = conn.select_one("SELECT key FROM cards WHERE id = 33")
raise "spot check failed (row 33 key should be the singularized form): #{spot.inspect}" if
  spot.nil? || spot["key"] != "*children".to_name.key
dupes = conn.select_all(
  "SELECT key, COUNT(*) c FROM cards WHERE trash = 0 AND key IS NOT NULL " \
  "GROUP BY key HAVING c > 1 LIMIT 5")
raise "live key collision after Ruby key computation: #{dupes.inspect}" unless dupes.empty?
puts "keys computed for #{updated} simple rows (engine algorithm), no live key collisions"

# ---- verification sample: 20 cards through the real Card API ---------------
# Names come from the corpus file (the app DB intentionally stores NULL name
# for compound rows; the corpus DB carries the full composed name for every
# card -- that is exactly what corpus v2 adds). Deterministic selection:
# core machinery + junctions of several depths + star-rule cards.
corpus = SQLite3::Database.open(CORPUS_DB, readonly: true)
live_names = corpus.execute(
  "SELECT id, name FROM cards WHERE trash = 0 AND name IS NOT NULL ORDER BY id")
corpus.close

name_by_id = {}
live_names.each { |(id, name)| name_by_id[id] = name }
depth_of = ->(id) { (name_by_id[id] || "").split("+").length }

live_ids = live_names.map(&:first)
sample_ids = []
sample_ids << 15 if live_ids.include?(15)                       # Anonymous (machinery)
sample_ids << 1 if live_ids.include?(1)                         # oldest live card
sample_ids.concat(live_ids.select { |i| depth_of.call(i) == 2 }.first(3))
sample_ids.concat(live_ids.select { |i| depth_of.call(i) == 3 }.first(3))
sample_ids.concat(live_ids.select { |i| depth_of.call(i) >= 4 }.first(2))
sample_ids.concat(live_ids.select { |i| (name_by_id[i] || "").start_with?("*") }.first(2))
sample_ids.concat(live_ids.select { |i| (name_by_id[i] || "").end_with?("+*read") }.first(2))
sample_ids.concat(live_ids.select { |i| depth_of.call(i) == 1 }.last(3))
sample_ids = sample_ids.uniq.first(20)

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
# Slot ids are stored exactly as Ruby wrote them (value and quote style);
# graders mask the random value at compare time (reference-harness N1).
def normalize(html)
  html
end

def card_attributes(card)
  {
    "id" => card.id,
    "name" => card.name.to_s,
    "key" => card.key,
    "type" => card.type_name.to_s,
    "type_code" => card.type_code.to_s,
    "codename" => card.codename&.to_s,
    "content" => card.content,
    "left" => card.name.simple? ? nil : card.name.left_name.to_s,
    "right" => card.name.simple? ? nil : card.name.right_name.to_s
  }
end

results = { "loaded" => { "cards" => loaded_cards, "references" => loaded_refs },
            "connected_database" => expanded, "sample" => [] }
failures = []

sample_ids.each do |cid|
  expected_name = name_by_id[cid]
  row = { "corpus_id" => cid, "expected_name" => expected_name }
  begin
    raise "no reconstructed name for corpus id #{cid}" if expected_name.nil?
    card = Card.fetch(expected_name)
    raise "Card.fetch returned nil for #{expected_name}" if card.nil?
    raise "fetched id #{card.id} != corpus id #{cid}" if card.id != cid
    row["record"] = card_attributes(card)
    fmt = card.format
    row["render_title_head"] = normalize(fmt.render(:title))[0, 300]
    row["fetch_ok"] = true
  rescue StandardError => e
    row["fetch_ok"] = false
    row["error"] = "#{e.class}: #{e.message[0, 300]}"
    failures << row
  end
  results["sample"] << row
  puts "sample #{cid}: #{row['fetch_ok'] ? 'ok' : 'FAIL'} #{expected_name.inspect}"
end

junction_ok = results["sample"].count { |r| r["fetch_ok"] && r["expected_name"].include?("+") }
results["summary"] = {
  "sample_size" => results["sample"].size,
  "fetch_ok" => results["sample"].count { |r| r["fetch_ok"] },
  "junctions_ok" => junction_ok,
  "failures" => failures.size
}

FileUtils.mkdir_p(RESULT_DIR)
File.write(RESULT_PATH, JSON.pretty_generate(results) + "\n")
puts "WROTE #{RESULT_PATH}"
raise "load verification FAILED for #{failures.size} sample cards" unless failures.empty?
puts "LOAD VERIFICATION PASSED (#{results['summary']['fetch_ok']}/#{results['summary']['sample_size']} sample cards, #{junction_ok} junctions)"
