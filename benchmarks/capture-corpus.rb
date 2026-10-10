# capture-corpus.rb -- M1 corpus-scale parity: full-payload oracle capture.
#
# Captures Ruby decko behavior for EVERY live card in the loaded corpus deck
# (db/corpus-v2.sqlite3, populated by benchmarks/load-oracle-corpus.rb):
#   - :title and :closed renders for all live cards
#   - :open and :content renders for live cards with non-empty content
#   - the card-attributes record (same 8 fields as tools/oracle/capture.rb)
# Output: fixtures/corpus/shard-NNNNNN.jsonl (one JSON object per card,
# compact, deeply sorted keys, rendered bytes exactly as Ruby wrote them).
#
# RESUMABLE: shards of 1,000 cards in ascending id order. A shard is
# complete iff its file exists and its line count equals the shard's card
# count; incomplete/missing shards are rebuilt from scratch. Re-running the
# script skips complete shards -- the resume command is identical to the
# run command. CAPTURE_BUDGET_MINUTES (default 85) stops the run cleanly
# after the current shard once the budget is spent.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development \
#   DATABASE_URL=sqlite3:C:/localProjects/decko-ts/tools/oracle/decko-oracle-app/db/corpus-v2.sqlite3 \
#   bundle exec decko runner C:/localProjects/decko-ts/benchmarks/capture-corpus.rb

require "json"
require "sqlite3"

REPO_ROOT = File.expand_path("..", __dir__)
CORPUS_DB = File.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3")
SHARD_DIR = File.join(REPO_ROOT, "fixtures", "corpus")
LOG_PATH = File.join(REPO_ROOT, "benchmarks", "results", "corpus-v2", "capture-log.txt")
SHARD_SIZE = 1_000
BUDGET_SECONDS = (ENV["CAPTURE_BUDGET_MINUTES"] || 85).to_i * 60

# ---- Rails file-cache isolation (see load-oracle-corpus.rb) ----------------
# Lexicon cache entries carry no DB identity; clear so this run reflects
# only the corpus DB, and again at exit so later fixtures runs start clean.
CACHE_DIR = File.join(REPO_ROOT, "tools", "oracle", "decko-oracle-app", "tmp", "cache")

def clear_rails_cache!
  FileUtils.rm_rf(Dir.glob(File.join(CACHE_DIR, "*")))
end

clear_rails_cache!
at_exit { clear_rails_cache! }

# ---- guard: only ever run against the corpus copy ---------------------------
connected_file = File.expand_path(
  ActiveRecord::Base.connection_db_config.configuration_hash[:database].to_s,
  ENV["RAILS_ROOT"] || Dir.pwd)
if File.basename(connected_file) != "corpus-v2.sqlite3"
  raise "REFUSING: connected database is #{connected_file}; capture only runs " \
        "against db/corpus-v2.sqlite3 (set DATABASE_URL)"
end

# ---- live card list: full names from the corpus file, ids ascending ---------
raise "corpus DB missing: #{CORPUS_DB}" unless File.exist?(CORPUS_DB)
corpus = SQLite3::Database.open(CORPUS_DB, readonly: true)
live = corpus.execute(
  "SELECT id, name, content IS NOT NULL AND content != '' FROM cards " \
  "WHERE trash = 0 AND name IS NOT NULL ORDER BY id")
corpus.close
total_views = live.size * 2 + live.count { |r| r[2] == 1 } * 2
puts "live cards to capture: #{live.size} (min views: #{total_views})"

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
# Slot ids are stored exactly as Ruby wrote them (value and quote style);
# graders mask the random value at compare time (reference-harness N1).
def normalize(html)
  html
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def capture_error(e)
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 200]}"
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

VIEWS_ALL = %i[title closed].freeze
VIEWS_WITH_CONTENT = %i[open content].freeze

def render_views(card, has_content)
  views = {}
  (VIEWS_ALL + (has_content ? VIEWS_WITH_CONTENT : [])).each do |view|
    views[view.to_s] = normalize(card.format.render(view))
  rescue StandardError => e
    views[view.to_s] = capture_error(e)
  end
  views
end

FileUtils.mkdir_p(SHARD_DIR)
FileUtils.mkdir_p(File.dirname(LOG_PATH))
started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
stopped_for_budget = false

live.each_slice(SHARD_SIZE).with_index do |slice, idx|
  shard_ids = slice.map { |r| r[0] }
  shard_name = format("shard-%06d.jsonl", idx)
  shard_path = File.join(SHARD_DIR, shard_name)

  expected = slice.size
  if File.exist?(shard_path) &&
     File.foreach(shard_path).count == expected
    puts "skip #{shard_name} (complete: #{expected} cards)"
    next
  end

  tmp_path = "#{shard_path}.tmp"
  t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  view_count = 0
  File.open(tmp_path, "w") do |f|
    slice.each do |(cid, name, has_content)|
      # Fetch is as fallible as render (e.g. a Search-type card whose content
      # is not valid JSON raises Card::Error::BadQuery from
      # card-mod-search's cql_search.rb during item resolution). A per-card
      # error is RECORDED as data so one bad card cannot kill the run.
      row =
        begin
          card = Card.fetch(name)
          if card.nil?
            { "id" => cid, "name" => name,
              "error" => capture_error(RuntimeError.new("Card.fetch returned nil")) }
          else
            views = render_views(card, has_content == 1)
            view_count += views.size
            { "id" => card.id, "name" => name,
              "record" => card_attributes(card), "views" => views }
          end
        rescue StandardError => e
          { "id" => cid, "name" => name, "error" => capture_error(e) }
        end
      f.write(JSON.generate(deep_sort(row)) + "\n")
    end
  end
  File.rename(tmp_path, shard_path)

  elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0
  line = format("%s shard=%s cards=%d views=%d seconds=%.1f total_elapsed=%.1f",
                Time.now.strftime("%H:%M:%S"), shard_name, slice.size,
                view_count, elapsed,
                Process.clock_gettime(Process::CLOCK_MONOTONIC) - started)
  puts line
  File.open(LOG_PATH, "a") { |lf| lf.puts(line) }

  # keep the long-running process lean (47k fetched cards otherwise
  # accumulate in the in-process card cache)
  begin
    Card.cache.reset
  rescue StandardError => e
    puts "cache reset unavailable (#{e.class}); continuing" if idx == 0
  end

  if Process.clock_gettime(Process::CLOCK_MONOTONIC) - started > BUDGET_SECONDS
    remaining = live.size - ((idx + 1) * SHARD_SIZE)
    if remaining.positive?
      puts "budget spent (#{BUDGET_SECONDS}s); stopping cleanly with " \
           "#{(idx + 1) * SHARD_SIZE}/#{live.size} cards captured"
      stopped_for_budget = true
      break
    end
  end
end

done = Dir.children(SHARD_DIR).count { |f| f =~ /\Ashard-\d{6}\.jsonl\z/ }
puts "DONE shards=#{done} cards_captured≈#{done * SHARD_SIZE} " \
     "stopped_for_budget=#{stopped_for_budget}"
puts "resume command: re-run this script unchanged (complete shards are skipped)"
