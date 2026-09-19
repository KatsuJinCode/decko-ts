# run_ruby_bench.rb -- R1/R2 nesting-depth benchmark against the Ruby oracle
# (decko-commons/decko#1282 benchmark program, Ruby side).
#
# Seeds synthetic deep-nesting decks (inclusion chains and fans) into the
# existing oracle app, renders the root of each shape N times, and records
# (a) SQL query COUNT per render via ActiveSupport::Notifications on
# sql.active_record and (b) wall-clock ms. Writes one results JSON with full
# environment metadata. Cleans up all bench cards (to trash) afterwards and
# proves the live card set is back to its pre-bench size.
#
# Run from tools/oracle/decko-oracle-app (Git Bash):
#   RAILS_ENV=development bundle exec decko runner \
#     C:/localProjects/decko-ts/benchmarks/run_ruby_bench.rb
#
# Env knobs:
#   BENCH_OUT        results path (default benchmarks/results/ruby-nesting-r1-r2.json)
#   BENCH_RENDER_N   measured renders per shape (default 15)
#   BENCH_WARMUP     unmeasured warmup renders per shape (default 3)
#   BENCH_BACKGROUND background plain cards for table-size realism (default 400)
#   BENCH_PREFIX     bench card name prefix (default "BenchR1")
#
# Contract with the oracle app (docs/oracle-harness.md rules): the harness
# seeds ONLY cards carrying the distinctive prefix, touches no existing
# fixture cards, and renders as the runner's default user (Anonymous), which
# is the realistic page-render permission path (writes use Card::Auth.as_bot).

require "json"
require "socket"

PREFIX      = ENV.fetch("BENCH_PREFIX", "BenchR1")
RENDER_N    = ENV.fetch("BENCH_RENDER_N", "15").to_i
WARMUP      = ENV.fetch("BENCH_WARMUP", "3").to_i
BACKGROUND  = ENV.fetch("BENCH_BACKGROUND", "400").to_i
REPO_ROOT   = File.expand_path("../..", __dir__)
OUT_PATH    = ENV.fetch("BENCH_OUT",
                        File.join(REPO_ROOT, "benchmarks", "results",
                                  "ruby-nesting-r1-r2.json"))

DEPTHS = [1, 2, 4, 8, 16, 32].freeze
FANOUTS = [1, 4, 16].freeze

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

# ---- query counting --------------------------------------------------------
# ActiveSupport 7.2: an arity-1 block receives an Event object; anything else
# gets the legacy (name, start, finish, id, payload) args. Handle both.
SQL_COUNTS = { all: 0, non_schema: 0 }
SQL_SUBSCRIPTION = ActiveSupport::Notifications.subscribe("sql.active_record") do |*args|
  ev = args.last
  payload = ev.respond_to?(:payload) ? ev.payload : (args[4] || {})
  SQL_COUNTS[:all] += 1
  SQL_COUNTS[:non_schema] += 1 unless payload[:name] == "SCHEMA"
end

def measured_cold(card_name, view)
  # Cold mode: evict the process card cache, then fetch + render. This is the
  # full query path (the N+1-sensitive one). Card.cache.reset never raises.
  Card.cache.reset
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
    "wall_ms" => ms_since(t0),
    "html_bytes" => 0,
    "render_error" => "#{e.class}: #{e.message}" }
end

def measured_warm(card, view)
  # Warm mode: card cache already hot; render only. Shows the cache-served
  # steady state (expected ~0 queries at every depth -- itself a finding).
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

# ---- seeding ---------------------------------------------------------------
def live_count
  Card.where(trash: false).count
end

def seed_card(name, type, content)
  existing = Card.fetch(name, new: {})
  if existing.new_card? || existing.trash?
    Card.create! name: name, type: type, content: content
    :created
  else
    :present
  end
end

seed_log = Hash.new(0)
t_seed0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
cards_before = live_count

rng = Random.new(0xDEC0)
bg_content = "Background bench card body. " + filler(rng, 1400)

Card::Auth.as_bot do
  puts "seeding #{BACKGROUND} background cards ..." if BACKGROUND.positive?
  BACKGROUND.times do |i|
    seed_log[seed_card(format("%s_bg%05d", PREFIX, i), "RichText", bg_content)] += 1
  end

  # inclusion chains: root n01 includes n02 ... includes n0d (leaf, no nest).
  # Two nest styles: |open (page-like nesting) and |content (pure recursion).
  DEPTHS.each do |d|
    [["open", "|open"], ["content", "|content"]].each do |style, nest|
      d.times do |i|
        name = format("%s_chain_%s_d%02d_n%02d", PREFIX, style, d, i + 1)
        content =
          if i + 1 < d
            format("{{%s_chain_%s_d%02d_n%02d%s}}", PREFIX, style, d, i + 2, nest)
          else
            "leaf body " + filler(rng, 200)
          end
        seed_log[seed_card(name, "RichText", content)] += 1
      end
    end
  end
  # fans: root includes f children
  FANOUTS.each do |f|
    f.times do |i|
      seed_log[seed_card(format("%s_fan_f%02d_c%02d", PREFIX, f, i), "RichText",
                         "fan leaf " + filler(rng, 200))] += 1
    end
    seed_log[seed_card(format("%s_fan_f%02d_root", PREFIX, f), "RichText",
                       (0...f).map { |i| format("{{%s_fan_f%02d_c%02d|open}}", PREFIX, f, i) }
                              .join("\n"))] += 1
  end
end
seed_seconds = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t_seed0).round(1)

# ---- measurement ------------------------------------------------------------
results = []
shapes_all = []
DEPTHS.each do |d|
  [["open", :open], ["content", :content]].each do |style, view|
    shapes_all << { kind: "chain", style: style, depth: d,
                    root: format("%s_chain_%s_d%02d_n01", PREFIX, style, d),
                    view: view.to_s }
  end
end
FANOUTS.each do |f|
  shapes_all << { kind: "fan", style: "open", fanout: f,
                  root: format("%s_fan_f%02d_root", PREFIX, f), view: "open" }
end

shapes_all.each do |shape|
  card = Card.fetch(shape[:root])
  raise "bench root missing: #{shape[:root]}" if card.nil?
  rec = { "shape" => shape[:kind], "nest_style" => shape[:style],
          "view" => shape[:view] }
  rec["depth"] = shape[:depth] if shape[:depth]
  rec["fanout"] = shape[:fanout] if shape[:fanout]
  rec["root"] = shape[:root]
  # Decko guards render recursion: Card.config.max_depth (default 20) raises
  # Card::Error::UserError "Man, you're too deep." Shapes beyond the cap are
  # a recorded RESULT (engine behavior the port must replicate), not a crash.
  warm_error = nil
  WARMUP.times do
    begin
      card.format.render(shape[:view].to_sym)
    rescue StandardError => e
      warm_error = e
      break
    end
  end
  if warm_error
    rec["render_error"] = "#{warm_error.class}: #{warm_error.message}"
    # still record the cold path up to the raise (queries actually issued)
    cold_renders = RENDER_N.times.map { measured_cold(shape[:root], shape[:view].to_sym) }
    rec["cold_renders_partial"] = cold_renders
  else
    rec["renders"] = RENDER_N.times.map { measured_warm(card, shape[:view].to_sym) }
    rec["summary"] = summarize(rec["renders"])
    cold_renders = RENDER_N.times.map { measured_cold(shape[:root], shape[:view].to_sym) }
    rec["cold_renders"] = cold_renders
    rec["cold_summary"] = summarize(cold_renders)
  end
  results << rec
  puts format("  %-5s depth=%-3s fanout=%-3s style=%-8s warm_q=%-5s cold_q=%-5s warm_ms=%-9s cold_ms=%s%s",
              shape[:kind], shape[:depth].to_s, shape[:fanout].to_s,
              shape[:style],
              rec.dig("summary", "queries_median") || "n/a",
              rec.dig("cold_summary", "queries_median") ||
                rec.dig("cold_renders_partial", 0, "query_count").to_s,
              rec.dig("summary", "wall_ms_median") || "n/a",
              rec.dig("cold_summary", "wall_ms_median") || "n/a",
              rec["render_error"] ? "  ERROR(cap)" : "")
end

# ---- cleanup ----------------------------------------------------------------
# NOTE: match on NAME, not key: Decko's key algorithm inserts underscores at
# letter/digit boundaries ("BenchR1_x" -> "bench_r1_x"), so a key prefix
# LIKE 'benchr1%' matches nothing (verified by probe).
t_clean0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
bench_names = Card.where(trash: false).where("name LIKE ?", "#{PREFIX}%")
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

ActiveSupport::Notifications.unsubscribe(SQL_SUBSCRIPTION)

# ---- environment metadata (the no-cross-environment-claims rule) ------------
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

db_path = ActiveRecord::Base.connection_db_config.database
payload = {
  "benchmark" => "ruby-nesting-r1-r2",
  "commitments" => %w[R1 R2],
  "date" => Time.now.utc.iso8601,
  "engine" => "ruby-decko-oracle",
  "environment" => {
    "host" => Socket.gethostname,
    "os" => RUBY_PLATFORM,
    "ruby" => RUBY_VERSION,
    "rails" => defined?(Rails) ? Rails.version.to_s : nil,
    "card_gem" => Gem.loaded_specs["card"]&.version.to_s,
    "decko_gem" => Gem.loaded_specs["decko"]&.version.to_s,
    "cpu" => cpu_model,
    "ram_bytes" => total_ram_bytes,
    "db_engine" => "sqlite3",
    "db_path" => db_path.to_s,
    "db_size_bytes" => File.size(db_path),
    "live_cards_in_db_after_cleanup" => cards_after
  },
  "config" => {
    "render_n" => RENDER_N, "warmup" => WARMUP,
    "background_cards" => BACKGROUND, "prefix" => PREFIX,
    "nest_syntax" => "{{name|open}} / {{name|content}}",
    "corpus_scale_note" =>
      "shape depth is the controlled variable; BENCH_BACKGROUND controls " \
      "table-size realism. The sanitized corpus (47,235 live cards) is the " \
      "R3 production-scale target; rerun with higher BENCH_BACKGROUND to " \
      "test scale sensitivity."
  },
  "cards_live_before_seed" => cards_before,
  "cards_live_after_cleanup" => cards_after,
  "seed_seconds" => seed_seconds,
  "cleanup_seconds" => cleanup_seconds,
  "bench_cards_deleted" => deleted,
  "bench_cards_remaining_live" => remaining_live,
  "shapes" => results
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "cleanup: deleted=#{deleted} remaining_live=#{remaining_live}"
puts "wrote #{OUT_PATH}"
raise "bench cards still live after cleanup!" unless remaining_live.zero?
