// The MySQL-rung probe deck, modeled (tools/oracle/cql_match_capture.rb
// SEEDS; ids 700+, above every modeled standard card, preserving the
// id-order sort windows the standard deck's entries depend on).
//
// The deck model lives here, not in a test file, because two suites read it:
// the SQLite-rung replay (tests/cql/oracle-match-replay.test.ts) and the
// MySQL-rung search-count verification (tests/cql/search-count-mysql.test.ts).
// ONE model, two rungs: the second suite's whole point is that the same deck
// and the same recorded queries answer the same way on the server class the
// original ran on, so a second copy of the model would make that comparison
// meaningless.

import { seedCards, type CqlSeedCard, type CqlTestStorage } from "./cql-test-storage.js";

export const MATCHPROBE_DECK_CARDS: CqlSeedCard[] = [
  { id: 700, name: "Matchprobe Alpha", typeId: 2, dbContent: "the quick brown fox jumps over the lazy dog" },
  { id: 701, name: "Matchprobe Beta", typeId: 2, dbContent: "a calm brown cow grazes quietly" },
  { id: 702, name: "Matchprobe UPPER", typeId: 2, dbContent: "shouting UPPERCASE token inside lowercase text" },
  { id: 703, name: "matchprobe lower", typeId: 2, dbContent: "quiet lowercase body" },
  { id: 704, name: "Matchprobe Punct", typeId: 2, dbContent: "grep (regex) [braces] + plus.dot? no! a|b ^carat $end" },
  { id: 705, name: "Matchprobe Dots", typeId: 2, dbContent: "wel.come welxcome wellcome welwel version v2.0 beta" },
  { id: 706, name: "Matchprobe Unicode", typeId: 2, dbContent: "words: naïve café Zürich NAÏVE repeat 日本語テキスト" },
  { id: 707, name: "Matchprobe Compound", typeId: 2, dbContent: "compound parent carries the token" },
  { id: 708, name: "zeta", typeId: 2 },
  { id: 709, name: "Matchprobe Compound+zeta", leftId: 707, rightId: 708, typeId: 2, dbContent: "child body without the magic word" },
  { id: 710, name: "Matchprobe Search", typeId: 98, dbContent: '{"match":"matchprobe","sort":"name"}' },
];

// db_content corrections on the modeled standard deck, required by two
// captured entries (nullness is the load-bearing property, read off the
// capture deck's own rows):
// - *all+*read matched raw_posix_alpha's [[:alpha:]]+ through CONTENT
//   (its name column is NULL) -> db_content non-null ("Anyone", the real
//   rule value per docs/parity-method.md).
// - *all+*default did NOT match it (absent from Ruby's result despite the
//   lowest ids) -> its db_content is NULL in the capture deck. NULL stays.
export const STANDARD_CONTENT_PATCH: Record<number, string> = {
  10: "Anyone",
  14: "Cardtype description body",
  19: "User description body",
  29: "Cardtype type rule body",
};

export async function seedMatchprobeDeck(
  storage: CqlTestStorage,
  timestamp = "2026-09-21 00:00:00.000",
): Promise<void> {
  await seedCards(storage.driver, MATCHPROBE_DECK_CARDS, timestamp);
  // patch standard-deck contents the captured entries depend on
  for (const [id, content] of Object.entries(STANDARD_CONTENT_PATCH)) {
    await storage.driver.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      content,
      Number(id),
    ]);
  }
}
