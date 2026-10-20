// WHERE A FRESH DECK SEEDS FROM - the port of Cardio::Seed's source
// SELECTION (which gem's fixture directory), ported for register entry 12
// (card-mod-defaults).
//
// WHY THIS IS ITS OWN MODULE
// card-mod-defaults registers no sets, views or events. Its whole
// contribution to a Decko deck is ONE line:
//
//   card-mod-defaults-0.20.0/lib/card/mod/defaults.rb:1
//     Cardio::Railtie.config.seed_mods.unshift :defaults
//
// ...and that line moves the seed source for the WHOLE DECK. That makes
// the source selection the only registrable surface this gem has, so it
// is the surface a port of this gem has to get right.
//
// THE FOUR LINES THAT DECIDE IT (card-1.110.0)
//
//   lib/cardio/railtie.rb:6    config.seed_mods = [:core]
//   lib/cardio/railtie.rb:7    config.seed_type = :real
//   lib/cardio/seed.rb:8-9     def default_path
//                                db_path Cardio.config.seed_type, 0
//   lib/cardio/seed.rb:62      def db_path env, index
//                                Mod.fetch(Cardio.config.seed_mods[index])
//                                  .subpath "data", "fixtures", env.to_s
//
// The trap, and the reason this module exists rather than a comment:
// THE ORDER IS NOT THE RAILTIE'S ORDER. `unshift` runs when the gem is
// bundled, so by the time db:setup runs the array is [:defaults, :core]
// - and default_path reads INDEX 0. A reader who takes seed_mods from
// the railtie gets :core and is reading the wrong corpus; the defaults
// gem is what actually seeds a fresh deck.
//
// Measured over the pinned gemset (tools/oracle/seed-corpus-census.rb,
// whose output is committed at seed-corpus-census.ts):
//
//   index  mod        real corpus            cards
//   0      defaults   card-mod-defaults-0.20.0   604  (+599 card_actions,
//                                                     1 card_acts,
//                                                     519 card_references)
//   1      core       card-1.110.0/mod/core        11  (+11 card_actions,
//                                                         1 card_acts,
//                                                         1 card_reference)
//
// ---------------------------------------------------------------------------
// THE DIVERGENCE, STATED RATHER THAN HIDDEN
// ---------------------------------------------------------------------------
// boot-seed.ts's layer A transcribes the ELEVEN-row core corpus. Ruby's
// layer A is the SIX-HUNDRED-FOUR-row defaults corpus at index 0. The
// port cites seed.rb's rule and then resolves index 1 - a different
// corpus, not a different transcription of the same one.
//
// That is recorded here as data (PORT_SEED_SOURCE vs RUBY_SEED_SOURCE)
// rather than left for the next reader to infer, because the two numbers
// are the entire entry and neither file's prose says so plainly.
//
// The 604-row corpus itself is NOT landed, and the reason is a product
// call rather than a technical one - see SKIPPED_CORPUS below and the
// boot-seed.ts header. Naming the corpus and its exact row counts is
// what makes that skip revisitable instead of a vague deferral.

import {
  DEFAULT_PATH_INDEX,
  DEFAULT_PATH_SOURCE,
  SEED_CORPUS_INDEX,
  SEED_MODS_FIRST_CONSUMERS,
  SEED_MODS_ORDER,
  SEED_TYPE,
  type SeedCorpus,
  type SeedCorpusIndexEntry,
} from "./seed-corpus-census.js";

export {
  DEFAULT_PATH_INDEX,
  DEFAULT_PATH_SOURCE,
  SEED_CORPUS_INDEX,
  SEED_MODS_FIRST_CONSUMERS,
  SEED_MODS_ORDER,
  SEED_TYPE,
};
export type { SeedCorpus, SeedCorpusIndexEntry };

/** The env directory Ruby seeds, spelled as its path segment
 *  (`db_path`'s `env.to_s`). The test env is `:test` (config/
 *  environments/test.rb:6), everything else the railtie's :real. */
export type SeedEnv = "real" | "test";

/** card-1.110.0/lib/cardio/seed.rb:62 `db_path env, index`, as data:
 *  the corpus a given (env, index) pair resolves to. An index with no
 *  mod, or a mod with no data/fixtures/<env> directory on disk, yields
 *  null - which is faithful, not a lookup failure: `Mod.fetch(...)`
 *  names a mod, and a mod with no corpus in that env simply has none.
 *  The census emits `null` there rather than an empty table map, because
 *  "this corpus exists and holds zero rows" and "there is no corpus here"
 *  are different facts and collapsing them would let a caller act on a
 *  corpus that does not exist. core is the live example: it ships
 *  data/fixtures/real but no data/fixtures/test. */
export function rubySeedSource(env: SeedEnv, index: number): SeedCorpus | null {
  const entry = SEED_CORPUS_INDEX.find((e) => e.index === index);
  if (!entry) return null;
  return entry[env] ?? null;
}

/** seed.rb:8-9 `default_path` - index 0, the env the railtie configured. */
export function rubyDefaultSeedSource(env: SeedEnv = "real"): SeedCorpus | null {
  return rubySeedSource(env, DEFAULT_PATH_INDEX);
}

/** What the port actually seeds today: mod/core's `real` corpus, the
 *  ELEVEN rows boot-seed.ts transcribes as CORE_FIXTURE_SEED_CARDS.
 *  Named as an index into the same table Ruby's rule reads, so the two
 *  are directly comparable rather than being prose about prose. */
export const PORT_SEED_SOURCE: { readonly env: SeedEnv; readonly index: number } = {
  env: "real",
  index: 1,
};

/** Ruby's `seed_mods.first` - the gem whose name card-mod-script and
 *  card-mod-style pass as the argument to `super(...)` when they build a
 *  coded asset output (script.rb:8, style.rb:14). It is `defaults`, not
 *  `core`, for the reason above, which makes the defaults gem's one line
 *  reachable from the asset-output path as well as the seed path. */
export const RUBY_SEED_MODS_FIRST: string = SEED_MODS_ORDER[0] ?? "";

/** Row counts under one corpus, with the tables Ruby actually loads.
 *  Cardio::Seed::TABLES (seed.rb:4-5) is the load list; the census
 *  counts them all, and `card_changes` is 0 in both `real` corpora. */
export const SEED_TABLES: readonly string[] = [
  "cards", "card_actions", "card_acts", "card_changes", "card_references",
];

/** The named skip. The 604-row defaults corpus is a faithful, portable
 *  DATA port - nothing about it resists transcription - and it is not
 *  landed here for a reason that belongs to the operator, not the port:
 *  it is Decko's standard sample deck, and seeding it into every fresh
 *  port deck changes what every demo and deployment CONTAINS, which is a
 *  product decision wider than this tranche.
 *
 *  What IS landed is everything needed to make the decision one line: the
 *  ordering, the resolution rule, both corpora's exact row counts, and
 *  the explicit PORT_SEED_SOURCE vs RUBY_SEED_SOURCE comparison. When
 *  the corpus is wanted, `PORT_SEED_SOURCE.index` becomes 0 and the
 *  fixture loader needs the gem's data/fixtures/real/*.yml. */
export const SKIPPED_CORPUS: {
  readonly mod: string;
  readonly index: number;
  readonly cards: number;
  readonly reason: string;
  readonly unblock: string;
} = (() => {
  const corpus = rubySeedSource("real", DEFAULT_PATH_INDEX);
  return {
    mod: DEFAULT_PATH_SOURCE,
    index: DEFAULT_PATH_INDEX,
    cards: corpus?.tables.cards ?? 0,
    reason:
      "Decko's standard sample deck. Portable as data; landing it changes " +
      "what every fresh port deck contains, which is an operator product " +
      "call rather than a parity fix.",
    unblock:
      "Set PORT_SEED_SOURCE.index to DEFAULT_PATH_INDEX and load " +
      "card-mod-defaults-0.20.0/data/fixtures/real/*.yml through the " +
      "same direct-INSERT path boot-seed.ts uses for the core corpus " +
      "(seed.rb:20-22 FixtureSet.create_fixtures - direct rows, no acts).",
  };
})();

/** What the port seeds vs what Ruby seeds, as comparable rows. Used by the
 *  census test and available to anything that wants to report the gap
 *  without re-deriving it. */
export function seedSourceComparison(): {
  readonly port: { readonly mod: string; readonly cards: number } | null;
  readonly ruby: { readonly mod: string; readonly cards: number } | null;
  readonly sameCorpus: boolean;
} {
  const portEntry = SEED_CORPUS_INDEX.find((e) => e.index === PORT_SEED_SOURCE.index);
  const rubyCorpus = rubyDefaultSeedSource();
  const portCorpus = portEntry?.[PORT_SEED_SOURCE.env];
  return {
    port: portCorpus
      ? { mod: portEntry!.mod, cards: portCorpus.tables.cards ?? 0 }
      : null,
    ruby: rubyCorpus ? { mod: DEFAULT_PATH_SOURCE, cards: rubyCorpus.tables.cards ?? 0 } : null,
    sameCorpus: portEntry?.mod === DEFAULT_PATH_SOURCE,
  };
}