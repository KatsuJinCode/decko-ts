# The seed-SOURCE census: which mod's fixture directory a fresh deck
# actually seeds from, and how many rows each candidate corpus carries.
#
# Ruby reads its seed source off two config lines plus one mutation, and
# the mutation lives in a MOD GEM - not in Decko core:
#
#   card-1.110.0/lib/cardio/railtie.rb:6   config.seed_mods = [:core]
#   card-1.110.0/lib/cardio/railtie.rb:7   config.seed_type = :real
#   card-mod-defaults-0.20.0/lib/card/mod/defaults.rb:1
#     Cardio::Railtie.config.seed_mods.unshift :defaults
#
# `unshift` runs when the gem is BUNDLED, so by the time db:setup runs
# the array is [:defaults, :core] - the railtie's own order is not the
# seed order. Cardio::Seed then reads INDEX 0:
#
#   card-1.110.0/lib/cardio/seed.rb:8-9     def default_path
#                                            db_path Cardio.config.seed_type, 0
#   card-1.110.0/lib/cardio/seed.rb:62      def db_path env, index
#                                            Mod.fetch(Cardio.config.seed_mods[index])
#                                              .subpath "data", "fixtures", env.to_s
#
# So a fresh deck seeds the gem at index 0. This script derives that
# order from the source (it does not hardcode it), then counts the rows
# each candidate corpus would load, per table, per env. That is the
# whole entry-12 divergence made checkable with no path outside the
# checkout: the engine's boot seed names ONE corpus, and this file says
# which corpus Ruby names and what each one weighs.
#
# Run: ruby tools/oracle/seed-corpus-census.rb <gems-dir> [out.json]
#   gems-dir defaults to the pinned gemset path. Emits JSON on stdout
#   when no out path is given. No Decko runtime is required: this reads
#   gem files off disk, which is the point - the answer must be
#   reproducible from the pin alone.

require "json"
require "yaml"

GEMS_DIR = ARGV[0] ||
  "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
OUT = ARGV[1]

CORE = "card-1.110.0"

# --------------------------------------------------------------------------
# 1. the base order, from the railtie assignment
# --------------------------------------------------------------------------
railtie = File.read(File.join(GEMS_DIR, CORE, "lib/cardio/railtie.rb"))
base_match = railtie.match(/config\.seed_mods\s*=\s*\[(.*?)\]/)
abort "no config.seed_mods assignment in the railtie" unless base_match
seed_mods = base_match[1].split(",").map { |s| s.strip.delete_prefix(":").to_sym }
# kept separately: the railtie's own order is NOT the seed order once a
# gem mutates the array, and the diff between the two is the finding.
railtie_base_order = seed_mods.dup

type_match = railtie.match(/config\.seed_type\s*=\s*:(\w+)/)
seed_type = (type_match && type_match[1]) || "real"

# --------------------------------------------------------------------------
# 2. every mutation of that array, in bundle order (card- core first, then
#    the mods by name) - applying each mutation exactly as written
# --------------------------------------------------------------------------
mutations = []
Dir.glob(File.join(GEMS_DIR, "*/lib/**/card/mod/*.rb")).sort.each do |path|
  rel = path.sub("#{GEMS_DIR}/", "")
  File.readlines(path).each_with_index do |line, i|
    # NOTE: capture into a local IMMEDIATELY. `$~` is frame-local and any
    # intervening String method (String#sub among them) clears it, so
    # reading Regexp.last_match(1) after building the record hash yields
    # nil. Measured on ruby 3.4.11: a hash literal whose `file:` value is
    # `path.sub(...)` and whose `mod:` value is `Regexp.last_match(1)`
    # records mod: nil.
    unshift = line.match(/seed_mods\.unshift\s+:(\w+)/)
    push    = line.match(/seed_mods\.<<\s+:(\w+)/)
    assign  = line.match(/seed_mods\s*=\s*\[(.*?)\]/)
    if unshift
      mutations << { file: rel, line: i + 1, op: "unshift", mod: unshift[1] }
    elsif push
      mutations << { file: rel, line: i + 1, op: "<<", mod: push[1] }
    elsif assign
      names = assign[1].split(",").map { |s| s.strip.delete_prefix(":").to_sym }
      mutations << { file: rel, line: i + 1, op: "=", mod: names.first.to_s }
    end
  end
end
mutations.each do |m|
  case m[:op]
  when "unshift" then seed_mods.unshift(m[:mod].to_sym)
  when "<<"      then seed_mods << m[:mod].to_sym
  when "="       then seed_mods.replace([m[:mod].to_sym])
  end
end

# --------------------------------------------------------------------------
# 3. the gem each index resolves to, and that corpus's row counts
# --------------------------------------------------------------------------
def corpus_counts(gems_dir, gem, env)
  # A mod gem's corpus is <gem>/data/fixtures/<env>. Core's is under its
  # mod/ DIRECTORY: card-1.110.0/mod/core/data/fixtures/<env> - not
  # card-1.110.0/data/..., which does not exist.
  dir = if gem == :core
          File.join(gems_dir, CORE, "mod", "core")
        else
          Dir.glob(File.join(gems_dir, "card-mod-#{gem}-*")).first
        end
  return nil unless dir

  fixture_dir = File.join(dir, "data", "fixtures", env)
  # An ABSENT fixture directory is nil, NOT a corpus with zero rows. The
  # distinction is load-bearing: an empty table map reads as "this corpus
  # exists and has no rows", which is a different fact from "there is no
  # corpus here" (core ships data/fixtures/real but no
  # data/fixtures/test - measured). A census that cannot tell those apart
  # would let a caller act on a corpus that does not exist.
  return nil unless Dir.exist?(fixture_dir)

  tables = {}
  Dir.glob(File.join(fixture_dir, "*.yml")).sort.each do |f|
    name = File.basename(f, ".yml")
    # FixtureSet labels are `<table>_<NNN>:` at column 0; count them without
    # materialising the records.
    count = File.readlines(f).count { |l| l.start_with?("#{name}_") && l =~ /^\S+:\s*$/ }
    tables[name] = count
  end
  { "gem" => File.basename(dir), "fixture_dir" => "data/fixtures/#{env}", "tables" => tables }
end

envs = %w[real test]
# String keys throughout: the report is JSON-shaped and the TypeScript
# writer reads it by string key. (Mixing symbol keys here is what made the
# first generated file emit `index: ,` and `mod: nil`.)
indexed = seed_mods.each_with_index.map do |name, i|
  row = { "index" => i, "mod" => name.to_s }
  envs.each { |e| row[e] = corpus_counts(GEMS_DIR, name, e) }
  row
end

report = {
  "generated_from" => GEMS_DIR,
  # the order the railtie assigns, BEFORE any gem mutates it
  "railtie_base_order" => railtie_base_order.map(&:to_s),
  "seed_type" => seed_type,
  "seed_mods_order" => seed_mods.map(&:to_s),
  "mutations" => mutations,
  "default_path_index" => 0,
  "default_path_source" => seed_mods[0].to_s,
  "indexed_corpora" => indexed,
}

# the consumers of seed_mods.first - the argument those two type_plus_right
# /set modules pass upstream (card-mod-script set/type_plus_right/set/
# script.rb:8, card-mod-style set/type_plus_right/set/style.rb:14)
first_consumers = []
Dir.glob(File.join(GEMS_DIR, "*/set/**/*.rb")).sort.each do |path|
  File.readlines(path).each_with_index do |line, i|
    next unless line.include?("seed_mods.first")
    first_consumers << { file: path.sub("#{GEMS_DIR}/", ""), line: i + 1,
                         text: line.strip }
  end
end
report["seed_mods_first_consumers"] = first_consumers

out = JSON.pretty_generate(report)
if OUT.nil?
  puts out
  exit
end

# Emitting TypeScript, not JSON, to match the sibling generated module
# (src/card/mod-loader/set-include-graph.ts) so the engine can read the
# census at runtime and a test can assert on it without a JSON import.
rows = indexed.map do |c|
  emit = lambda do |corpus|
    if corpus.nil?
      "null"
    else
      tables = (corpus["tables"] || {}).map { |k, v| "#{k}: #{v}" }.join(", ")
      "{\n      gem: #{corpus["gem"].inspect},\n      fixtureDir: #{corpus["fixture_dir"].inspect},\n      tables: {#{tables}},\n    }"
    end
  end
  <<~TS.chomp
      {
        index: #{c["index"]},
        mod: #{c["mod"].inspect},
        real: #{emit.call(c["real"])},
        test: #{emit.call(c["test"])},
      },
  TS
end

muts = mutations.map do |m|
  "  { file: #{m[:file].inspect}, line: #{m[:line]}, op: #{m[:op].inspect}, mod: #{m[:mod].inspect} },"
end

consumers = first_consumers.map do |c|
  "  { file: #{c[:file].inspect}, line: #{c[:line]}, text: #{c[:text].inspect} },"
end

ts = <<~TS
  // GENERATED by tools/oracle/seed-corpus-census.rb from the pinned gemset
  // (#{report["generated_from"]}); do not edit. Regenerate:
  //
  //   ruby tools/oracle/seed-corpus-census.rb \\
  //     #{report["generated_from"]} src/card/auth/seed-corpus-census.ts
  //
  // WHY THIS EXISTS: Ruby decides which gem's fixture directory a fresh
  // deck seeds from off `Cardio.config.seed_mods[0]`, and the gem at index
  // 0 is NOT the one the railtie assigns. See the header of
  // src/card/auth/seed-source.ts for the four lines that decide it.

  /** One gem's fixture directory, with the FixtureSet row count per table. */
  export interface SeedCorpus {
    readonly gem: string;
    readonly fixtureDir: string;
    readonly tables: Readonly<Record<string, number>>;
  }

  export interface SeedCorpusIndexEntry {
    readonly index: number;
    readonly mod: string;
    /** null = no data/fixtures/<env> directory for this mod (not "zero
     *  rows"); see the generator note in tools/oracle/seed-corpus-census.rb. */
    readonly real?: SeedCorpus | null;
    readonly test?: SeedCorpus | null;
  }

  export interface SeedModsMutation {
    readonly file: string;
    readonly line: number;
    readonly op: string;
    readonly mod: string;
  }

  /** A `seed_mods.first` reader: the site, and the call it makes. */
  export interface SeedModsFirstConsumer {
    readonly file: string;
    readonly line: number;
    readonly text: string;
  }

  /** The order card-1.110.0's railtie assigns, before any gem mutates it. */
  export const RAILTIE_BASE_SEED_MODS_ORDER: readonly string[] = #{report["railtie_base_order"].inspect};

  /** `config.seed_type` (railtie.rb:7) - the env directory a deck seeds. */
  export const SEED_TYPE: string = #{report["seed_type"].inspect};

  /** The order AFTER every gem's mutation is applied - what db:setup reads. */
  export const SEED_MODS_ORDER: readonly string[] = #{report["seed_mods_order"].inspect};

  /** Every mutation of that array found in the gemset, with its site. */
  export const SEED_MODS_MUTATIONS: readonly SeedModsMutation[] = [
  #{muts.join("\n  ")}
  ];

  /** Cardio::Seed#default_path reads index 0 (seed.rb:8-9). */
  export const DEFAULT_PATH_INDEX = #{report["default_path_index"]};

  /** ...so the gem a fresh deck seeds from is this one, not core. */
  export const DEFAULT_PATH_SOURCE: string = #{report["default_path_source"].inspect};

  /** Per-index corpus census, real and test envs. */
  export const SEED_CORPUS_INDEX: readonly SeedCorpusIndexEntry[] = [
  #{rows.join("\n  ")}
  ];

  /** The `seed_mods.first` readers - the argument they pass upstream. */
  export const SEED_MODS_FIRST_CONSUMERS: readonly SeedModsFirstConsumer[] = [
  #{consumers.join("\n  ")}
  ];
TS

File.write(OUT, ts)
warn "wrote #{OUT}"