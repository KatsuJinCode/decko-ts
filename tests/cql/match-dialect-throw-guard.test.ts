// The throw-on-untranslated regex guard (docs/decisions/0005-cql-match-semantics.md
// "Decision" items 1-2, the fork recount's remainder S2.3.d/f):
//
//   1. TRANSLATE inside compileMatchPattern what MySQL/PCRE accepts and JS
//      does not: the POSIX classes ([[:alpha:]] etc.), the MySQL word
//      boundaries ([[:<:]] / [[:>:]] -> \b), and \p{...} (compile with the
//      u flag ONLY when the pattern contains `\p{`).
//   2. Anything STILL untranslated must THROW — both real servers error on
//      an uninterpretable regex; a query that fails is debuggable, a query
//      that silently drops rows is corruption. The UDF already throws on a
//      non-compiling pattern (sqlite-regexp.ts); after the translation, a
//      pattern that was silently mismatching either matches Ruby (parity)
//      or throws.
//
// RED-FIRST (admin-views-2): the three oracle entries the old pin
// carried as KNOWN_DIVERGENCES (oracle-match-replay.test.ts) assert STRICT
// name-set parity here — red on the pre-guard engine (silent no-matches),
// green once the translation lands. The old pin test is upgraded in the
// same commit per its own instruction ("upgrade this test together with
// the UDF").

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { executeQuery, parseOptionsWithLexicon } from "../../src/cql/execute.js";
import { compileMatchPattern } from "../../src/cql/sqlite-regexp.js";
import type { DbLexicon } from "../../src/card/fetch/lexicon.js";
import type { CardsRow } from "../../src/server/schema.js";
import {
  createCqlTestStorage,
  seedOracleCaptureDeck,
  type CqlTestStorage,
} from "./cql-test-storage.js";
// seedMatchprobeDeck is defined (and exported) in the replay test module
import { seedMatchprobeDeck } from "./oracle-match-replay.test.js";

interface CapturedMatch {
  queries: Record<string, { query: Record<string, unknown>; result: string[] | string }>;
}

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

async function resultNames(lexicon: DbLexicon, rows: CardsRow[]): Promise<string[]> {
  const names: string[] = [];
  for (const row of rows) {
    const composed = await lexicon.name(row.id);
    if (composed !== undefined && composed.s !== "") names.push(composed.s);
  }
  return names.sort();
}

describe("throw-on-untranslated regex guard — the translation layer", () => {
  it("translates the POSIX classes MySQL accepts ([[:alpha:]] etc.)", () => {
    const alpha = compileMatchPattern("[[:alpha:]]+");
    expect(alpha).toBeInstanceOf(RegExp);
    expect(alpha!.test("abc")).toBe(true);
    expect(alpha!.test("123")).toBe(false);
    // the full POSIX family the decision names (case-insensitive flag)
    expect(compileMatchPattern("[[:digit:]]+")!.test("42")).toBe(true);
    expect(compileMatchPattern("[[:alnum:]]+")!.test("a9")).toBe(true);
    expect(compileMatchPattern("[[:space:]]")!.test("a b")).toBe(true);
  });

  it("translates the MySQL word boundaries [[:<:]] / [[:>:]] to \\b", () => {
    const wordStart = compileMatchPattern("[[:<:]]come");
    expect(wordStart).toBeInstanceOf(RegExp);
    expect(wordStart!.test("welcome")).toBe(false); // mid-word: no boundary
    expect(wordStart!.test("come here")).toBe(true);
    const wordEnd = compileMatchPattern("some[[:>:]]");
    expect(wordEnd).toBeInstanceOf(RegExp);
    expect(wordEnd!.test("someday")).toBe(false); // "some" mid-word: no end boundary
    expect(wordEnd!.test("awesome")).toBe(true); // the word ends right after "some"
  });

  it("compiles \\p{...} patterns with the u flag (and only then)", () => {
    const han = compileMatchPattern("\\p{Han}+");
    expect(han).toBeInstanceOf(RegExp);
    expect(han!.test("搜索")).toBe(true);
    expect(han!.test("plain")).toBe(false);
    // a general category compiles as-is (the Script= retry must not fire)
    const letter = compileMatchPattern("\\p{L}+");
    expect(letter).toBeInstanceOf(RegExp);
    expect(letter!.test("abc")).toBe(true);
  });

  it("STILL THROWS on a pattern no translation can save (never silent rows)", () => {
    // an unmatched quantifier is invalid in BOTH dialects
    expect(compileMatchPattern("*nonsense")).toBeNull();
    expect(() => {
      const compiled = compileMatchPattern("*nonsense");
      if (compiled === null) throw new Error(`invalid REGEXP pattern: *nonsense`);
    }).toThrow("invalid REGEXP pattern");
  });
});

describe("oracle entries the old pin carried as divergences — regex dialect closed", () => {
  it("raw_mysql57_wordstart / raw_unicode_class match Ruby's sets (pure-regex entries)", async () => {
    const fixture = JSON.parse(
      readFileSync(`${REPO_ROOT}/fixtures/captured/cql-mysql-match.json`, "utf8"),
    ) as CapturedMatch;
    const storage: CqlTestStorage = await createCqlTestStorage();
    try {
      await seedOracleCaptureDeck(storage);
      await seedMatchprobeDeck(storage);
      const parse = parseOptionsWithLexicon(storage.fetcher.lexicon);

      const failures: string[] = [];
      // raw_posix_alpha is NOT claimed here: its residual diff is a DECK
      // MODEL row-composition question, not the regex dialect — the
      // capture deck's id-29 row (RStar-typed junction, left 3 / right 21,
      // name+content NULL) composed "Cardtype+*type+*structure" at capture
      // time while the TS model (left 3, right 21, no RStar naming)
      // composes "Cardtype+*type" (probe evidence in the receipt,
      // tmp probes 5-6 of decko-oracle-app). The POSIX TRANSLATION itself
      // is proven by the compile unit test above.
      for (const name of ["raw_mysql57_wordstart", "raw_unicode_class"]) {
        const captured = fixture.queries[name];
        const rubyNames = [...(captured.result as string[])].sort();
        const result = await executeQuery(storage.fetcher.driver, captured.query, { parse });
        if ("count" in result) throw new Error(`${name}: unexpected count result`);
        const tsNames = await resultNames(storage.fetcher.lexicon, result.rows);
        const same =
          tsNames.length === rubyNames.length && tsNames.every((n, i) => n === rubyNames[i]);
        if (!same) {
          failures.push(`${name}: ruby=${JSON.stringify(rubyNames)} ts=${JSON.stringify(tsNames)}`);
        }
      }
      expect(failures).toEqual([]);
    } finally {
      storage.close();
    }
  });
});
