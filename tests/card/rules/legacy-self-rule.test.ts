// A legacy compound row (its compound name stored in the name column, no
// side ids) still has its *self rules found, as Ruby's rule cache finds them
// by ids (card-1.110.0 lib/card/rule/cache.rb lookup_key: anchor id + "self"
// + setting). The name walk cannot compose "<legacy row>+*self" through the
// lexicon, and its by-name miss caches a placeholder that a later fetch by
// id would read; without the id path the lookup falls through to *all plus.
//
// The pin runs on the raw ground-truth deck, where the semantics probe found
// the case (ABCglobal administration+associations, card 2833, and its
// +*self+*read / +*update rules 8556 / 8557). The deck is machine-local; a
// missing copy fails the test loudly rather than skipping it.

import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "../render/raw-corpus-seeding.js";
import { findRule } from "../../../src/card/rules/lookup.js";
import { ruleWalkPatternInput } from "../../../src/card/actions/rule-content-walk.js";
import { DeckoName } from "../../../src/card/name.js";

describe("legacy compound rows and their *self rules (raw ground-truth deck)", () => {
  it("finds the *self rules of a side-less compound row by ids", { timeout: 300_000 }, async () => {
    expect(existsSync(RAW_CORPUS_DB), `raw corpus copy missing: ${RAW_CORPUS_DB}`).toBe(true);
    const raw = new Database(RAW_CORPUS_DB, { readonly: true });
    const ids = (raw.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>).map((r) => r.id);
    raw.close();
    const storage = await createRawStructureSeededStorage(new Set(ids));
    try {
      const f = storage.fetcher;
      f.installNameEnvironment();
      await f.warmLexicon(ids);
      const row = await f.fetchById(2833);
      expect(row?.leftId).toBeUndefined();
      const input = await ruleWalkPatternInput(f, {
        name: DeckoName.parse("ABCglobal administration+associations"),
        id: 2833,
        isNew: false,
        typeId: row?.typeId ?? null,
      });
      // The name walk alone misses (the lexicon composes through side ids).
      expect(await f.fetchByName("ABCglobal administration+associations+*self+*read")).toBeUndefined();
      const read = await findRule(f, input, "*read");
      expect(read?.rule.id).toBe(8556);
      expect(read?.rule.name?.s).toBe("ABCglobal administration+associations+*self+*read");
      expect((await findRule(f, input, "*update"))?.rule.id).toBe(8557);
      // A setting the card has no *self rule for keeps the walk's answer.
      expect((await findRule(f, input, "*delete"))?.setName).not.toContain("*self");
      // Without the card's id there is nothing to anchor the id path on.
      expect((await findRule(f, { ...input, id: undefined }, "*read"))?.rule.id).not.toBe(8556);
    } finally {
      storage.close();
    }
  });
});
