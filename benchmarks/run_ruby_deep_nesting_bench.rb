# run_ruby_deep_nesting_bench.rb -- the DEEP-NEXTING fixture battery of the
# #1282 scaling proof, Ruby side (live rerun on the same-named BenchDN decks
# the TS sweep measures (its results file is not in the public package),
# tests/card/render/deep-nesting-fixture-sweep.test.ts).
#
# Adapted from run_ruby_bench.rb (the 2026-09-19 parity recording harness,
# the recorded results file, not in the public package) with the same measurement
# discipline: ActiveSupport::Notifications query counting (SCHEMA separated),
# cold (Card.cache.reset) vs warm renders, medians over RENDER_N, full
# environment block, seed ONLY the bench prefix, cleanup to zero remaining.
# The differences are the SHAPE LIST (the deep/wide fixtures: chains at
# 1..200 nesting levels, fans at 1..200, whole trees) and the output path.
#
# Shapes past Card.config.max_depth (default 20) are a recorded RESULT (the
# "Man, you're too deep" UserError + the queries actually issued up to the
# raise), exactly as the 2026-09-19 recording handled depth 32.
#
# Run from a decko app directory (Git Bash):
#   RAILS_ENV=development bundle exec decko runner \
#     $REPO_ROOT/../decko-ts-lane-deep-nesting-fixtures/benchmarks/run_ruby_deep_nesting_bench.rb
#
# Env knobs:
#   BENCH_OUT         results path (default benchmarks/results/deep-nesting-fixtures-ruby.json)
#   BENCH_RENDER_N    measured renders per shape (default 9)
#   BENCH_WARMUP      unmeasured warmup renders per shape (default 2)
#   BENCH_BACKGROUND  background plain cards for table-size realism (default 400)
#   BENCH_PREFIX      bench card name prefix (default "BenchDN")
#   BENCH_DEPTHS      comma list of chain depths (default 1,2,4,8,10,16,20,50,100,200)
#   BENCH_FANOUTS     comma list of fan widths  (default 1,4,16,50,100,200)
#   BENCH_TREES       comma list of depth x fanout trees (default "4x4,3x10")
#   BENCH_SKIP_CLEANUP 1 leaves the seeded cards in place; only for a throwaway
#                     copy of a deck (deleting them one at a time takes longer
#                     than the measurement)
#   BENCH_HOST        host label recorded in the results (default: hostname)

require "json"
require "socket"
require "fileutils"

PREFIX      = ENV.fetch("BENCH_PREFIX", "BenchDN")
RENDER_N    = ENV.fetch("BENCH_RENDER_N", "9").to_i
WARMUP      = ENV.fetch("BENCH_WARMUP", "2").to_i
BACKGROUND  = ENV.fetch("BENCH_BACKGROUND", "400").to_i
DEPTHS      = ENV.fetch("BENCH_DEPTHS", "1,2,4,8,10,16,20,50,100,200").split(",").map(&:to_i).freeze
FANOUTS     = ENV.fetch("BENCH_FANOUTS", "1,4,16,50,100,200").split(",").map(&:to_i).freeze
TREES       = ENV.fetch("BENCH_TREES", "4x4,3x10").split(",").map do |spec|
  d, f = spec.split("x").map(&:to_i)
  [d, f]
end.freeze

# NOTE: __dir__ is NOT reliable under `decko runner`; derive the output root
# from the CWD (the app directory) unless BENCH_OUT is absolute.
OUT_PATH    = ENV.fetch("BENCH_OUT",
                        File.join(Dir.pwd, "benchmarks", "results",
                                  "deep-nesting-fixtures-ruby.json"))
FileUtils.mkdir_p(File.dirname(OUT_PATH))

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def ms_since(t0)
  ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0) * 1000).round(3)
end

def filler(rng, bytes)
  chars = ("a".."z").to_a
  Array.new(bytes) { chars.sample(random: rng) }.join
end

# ---- query counting (same discipline as run_ruby_bench.rb) ------------------
SQL_COUNTS = { all: 0, non_schema: 0 }
SQL_SUBSCRIPTION = ActiveSupport::Notifications.subscribe("sql.active_record") do |*args|
  ev = args.last
  payload = ev.respond_to?(:payload) ? ev.payload : (args[4] || {})
  SQL_COUNTS[:all] += 1
  SQL_COUNTS[:non_schema] += 1 unless payload[:name] == "SCHEMA"
end

def reset_card_cache
  # The oracle app ran Card::Cache (responds to .reset); this app configures
  # a plain ActiveSupport::Cache::MemoryStore (only .clear). Handle both.
  Card.cache.respond_to?(:reset) ? Card.cache.reset : Card.cache.clear
end

def measured_cold(card_name, view)
  reset_card_cache
  SQL_COUNTS[:all] = 0
  SQL_COUNTS[:non_schema] = 0
  t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  html = Card.fetch(card_name)&.format&.render(view)
  wall_ms = ms_since(t0)
  { "query_count" => SQL_COUNTS[:non_schema],
    "query_count_all" => SQL_COUNTS[:all],
    "wall_ms" => wall_ms,
    "html_bytes" => html ? html.bytesize : 0 }
rescue StandardError => e
  { "query_count" => SQL_COUNTS[:non_schema],
    "query_count_all" => SQL_COUNTS[:all],
    "wall_ms" => ms_since(t0 || Process.clock_gettime(Process::CLOCK_MONOTONIC)),
    "html_bytes" => 0,
    "render_error" => "#{e.class}: #{e.message}" }
end

def measured_warm(card, view)
  SQL_COUNTS[:all] = 0
  SQL_COUNTS[:non_schema] = 0
  t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  html = card.format.render(view)
  wall_ms = ms_since(t0)
  { "query_count" => SQL_COUNTS[:non_schema],
    "query_count_all" => SQL_COUNTS[:all],
    "wall_ms" => wall_ms,
    "html_bytes" => html.bytesize }
end

def summarize(renders)
  qs = renders.map { |r| r["query_count"] }.sort
  ws = renders.map { |r| r["wall_ms"] }.sort
  {
    "queries_median" => qs[qs.length / 2],
    "queries_min" => qs.min,
    "queries_max" => qs.max,
    "wall_ms_median" => ws[ws.length / 2].round(3),
    "wall_ms_min" => ws.min.round(3),
    "wall_ms_max" => ws.max.round(3)
  }
end

# ---- fixture name formats (MUST match the TS sweep exactly) -----------------
def chain_name(d, i)   = format("%s_chain_open_d%02d_n%02d", PREFIX, d, i)
def fan_child_name(f, i) = format("%s_fan_f%02d_c%02d", PREFIX, f, i)
def fan_root_name(f)   = format("%s_fan_f%02d_root", PREFIX, f)
def tree_root_name(d, f) = format("%s_tree_d%02d_f%02d_root", PREFIX, d, f)
def tree_node_name(d, f, level, j)
  format("%s_tree_d%02d_f%02d_l%02d_n%04d", PREFIX, d, f, level, j)
end

# ---- seeding ----------------------------------------------------------------
def live_count
  Card.where(trash: false).count
end

def seed_card(name, type, content)
  # NOTE: Card.fetch(name, new: {}) returns nil in this app (probe-verified
  # 2026-10-03, even under Card::Auth.as_bot), and Card.exists? is not
  # defined on the Card class here; Card[name] is the retrieval that works.
  if Card[name]
    :present
  else
    Card.create! name: name, type: type, content: content
    :created
  end
end

seed_log = Hash.new(0)
t_seed0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
cards_before = live_count

rng = Random.new(0xDECD)
bg_content = "Background bench card body. " + filler(rng, 1400)

Card::Auth.as_bot do
  puts "seeding #{BACKGROUND} background cards ..." if BACKGROUND.positive?
  BACKGROUND.times do |i|
    seed_log[seed_card(format("%s_bg%05d", PREFIX, i), "RichText", bg_content)] += 1
  end

  # inclusion chains (open style): root n01 includes n02 ... includes n0d.
  DEPTHS.each do |d|
    d.times do |i|
      content =
        if i + 1 < d
          format("{{%s|open}}", chain_name(d, i + 2))
        else
          "leaf body " + filler(rng, 200)
        end
      seed_log[seed_card(chain_name(d, i + 1), "RichText", content)] += 1
    end
  end

  # fans: root includes f children
  FANOUTS.each do |f|
    f.times do |i|
      seed_log[seed_card(fan_child_name(f, i), "RichText",
                         "fan leaf " + filler(rng, 200))] += 1
    end
    seed_log[seed_card(fan_root_name(f), "RichText",
                       (0...f).map { |i| format("{{%s|open}}", fan_child_name(f, i)) }
                              .join("\n"))] += 1
  end

  # whole trees: root -> f^1 -> ... -> f^depth leaves
  TREES.each do |(d, f)|
    d.downto(1).each do |level|
      count = f**level
      count.times do |ji|
        j = ji + 1
        content =
          if level < d
            (1..f).map { |k| format("{{%s|open}}", tree_node_name(d, f, level + 1, (j - 1) * f + k)) }
                  .join("\n")
          else
            "tree leaf " + filler(rng, 200)
          end
        seed_log[seed_card(tree_node_name(d, f, level, j), "RichText", content)] += 1
      end
    end
    root_children = (1..f).map { |k| format("{{%s|open}}", tree_node_name(d, f, 1, k)) }.join("\n")
    seed_log[seed_card(tree_root_name(d, f), "RichText", root_children)] += 1
  end
end
seed_seconds = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t_seed0).round(1)

# ---- measurement ------------------------------------------------------------
results = []
DEPTHS.each do |d|
  results << { "shape" => "chain", "nest_style" => "open", "view" => "open",
               "depth" => d, "root" => chain_name(d, 1) }
end
FANOUTS.each do |f|
  results << { "shape" => "fan", "nest_style" => "open", "view" => "open",
               "fanout" => f, "root" => fan_root_name(f) }
end
TREES.each do |(d, f)|
  results << { "shape" => "tree", "nest_style" => "open", "view" => "open",
               "tree_dims" => "d#{d}xf#{f}", "root" => tree_root_name(d, f) }
end

measured = []
results.each do |shape|
  card = Card.fetch(shape["root"])
  raise "bench root missing: #{shape['root']}" if card.nil?
  rec = shape.dup
  warm_error = nil
  WARMUP.times do
    begin
      card.format.render(shape["view"].to_sym)
    rescue StandardError => e
      warm_error = e
      break
    end
  end
  if warm_error
    rec["render_error"] = "#{warm_error.class}: #{warm_error.message}"
    cold_renders = RENDER_N.times.map { measured_cold(shape["root"], shape["view"].to_sym) }
    rec["cold_renders_partial"] = cold_renders
  else
    rec["renders"] = RENDER_N.times.map { measured_warm(card, shape["view"].to_sym) }
    rec["summary"] = summarize(rec["renders"])
    cold_renders = RENDER_N.times.map { measured_cold(shape["root"], shape["view"].to_sym) }
    rec["cold_renders"] = cold_renders
    rec["cold_summary"] = summarize(cold_renders)
  end
  measured << rec
  puts format("  %-5s depth=%-4s fanout=%-4s tree=%-7s warm_q=%-5s cold_q=%-5s warm_ms=%-9s cold_ms=%s%s",
              shape["shape"], shape["depth"].to_s, shape["fanout"].to_s,
              shape["tree_dims"].to_s,
              rec.dig("summary", "queries_median") || "n/a",
              rec.dig("cold_summary", "queries_median") ||
                rec.dig("cold_renders_partial", 0, "query_count").to_s,
              rec.dig("summary", "wall_ms_median") || "n/a",
              rec.dig("cold_summary", "wall_ms_median") || "n/a",
              rec["render_error"] ? "  ERROR(cap)" : "")
  $stdout.flush
end

# ---- cleanup ----------------------------------------------------------------
# Match on NAME (not key): Decko's key algorithm inserts underscores at
# letter/digit boundaries ("BenchDN_x" -> "bench_dn_x").
t_clean0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
SKIP_CLEANUP = ENV["BENCH_SKIP_CLEANUP"] == "1"
bench_names = SKIP_CLEANUP ? [] : Card.where(trash: false).where("name LIKE ?", "#{PREFIX}%")
                                      .pluck(:name)
deleted = 0
Card::Auth.as_bot do
  bench_names.each do |name|
    c = Card.fetch(name)
    next if c.nil?
    c.delete!
    deleted += 1
  end
end
cleanup_seconds = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t_clean0).round(1)
remaining_live = Card.where(trash: false)
                     .where("name LIKE ?", "#{PREFIX}%").count
cards_after = live_count

db_path = ActiveRecord::Base.connection_db_config.database
db_size = File.exist?(db_path.to_s) ? File.size(db_path.to_s) : nil

def cpu_model
  out = `powershell -NoProfile -Command "(Get-CimInstance Win32_Processor).Name"`.to_s.strip
  out.empty? ? nil : out.lines.first.strip
rescue StandardError
  nil
end

def total_ram_bytes
  out = `powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"`.to_s.strip
  out.to_i.positive? ? out.to_i : nil
rescue StandardError
  nil
end

payload = {
  "benchmark" => "deep-nesting-fixtures-ruby",
  "commitments" => %w[R1 R2],
  "date" => Time.now.utc.iso8601,
  "engine" => "ruby-decko-oracle",
  "environment" => deep_sort(
    "host" => ENV.fetch("BENCH_HOST") { Socket.gethostname },
    "os" => RUBY_PLATFORM,
    "ruby" => RUBY_VERSION,
    "rails" => defined?(Rails) ? Rails.version.to_s : nil,
    "decko_gem" => Gem.loaded_specs["decko"]&.version.to_s,
    "card_gem" => Gem.loaded_specs["card"]&.version.to_s,
    "cpu" => cpu_model,
    "ram_bytes" => total_ram_bytes,
    "db_engine" => "sqlite3",
    "db_path" => File.basename(db_path.to_s),
    "db_size_bytes" => db_size,
    "live_cards_in_db_before_seed" => cards_before,
    "live_cards_in_db_after_cleanup" => cards_after
  ),
  "config" => {
    # card-mod-batched-nests settings; "absent" when the gem is not loaded
    "batched_nests_gem" => defined?(Cardio::BatchedNests) ? true : false,
    "prefetch_nests" => Card.config.respond_to?(:prefetch_nests) ? Card.config.prefetch_nests : "absent",
    "prefetch_machinery" =>
      Card.config.respond_to?(:prefetch_machinery) ? Card.config.prefetch_machinery : "absent",
    "cleanup_skipped" => SKIP_CLEANUP,
    "background_cards" => BACKGROUND,
    "render_n" => RENDER_N,
    "warmup" => WARMUP,
    "prefix" => PREFIX,
    "depths" => DEPTHS,
    "fanouts" => FANOUTS,
    "trees" => TREES.map { |(d, f)| "d#{d}xf#{f}" },
    "nest_syntax" => "{{name|open}}",
    "ts_counterpart" => "benchmarks/results/deep-nesting-fixtures-ts.json",
    "note" => "fixture names shared with the TS sweep (BenchDN prefix); " \
              "content filler differs (random a-z vs deterministic) - query " \
              "axes are unaffected"
  },
  "seed_seconds" => seed_seconds,
  "cleanup_seconds" => cleanup_seconds,
  "bench_cards_deleted" => deleted,
  "bench_cards_remaining_live" => remaining_live,
  "shapes" => measured
}

File.write(OUT_PATH, JSON.pretty_generate(payload) + "\n")
puts "wrote #{OUT_PATH}"
puts "cleanup: #{deleted} deleted, #{remaining_live} remaining live (must be 0)"
unless SKIP_CLEANUP || remaining_live.zero?
  abort "bench cleanup failed: #{remaining_live} BenchDN cards still live"
end

ActiveSupport::Notifications.unsubscribe(SQL_SUBSCRIPTION)
