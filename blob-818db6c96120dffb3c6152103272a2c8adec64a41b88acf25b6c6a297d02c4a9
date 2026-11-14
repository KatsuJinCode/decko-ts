// Adversarial input abuse on the save path's name validation, pinned
// against the Ruby events the action layer ports
// (card-1.110.0 mod/core/set/all/name_events.rb — read directly at
// decko-ruby-perf/card as the oracle source):
//
//   event :validate_name, :validate, on: :save, changed: :name do
//     validate_legality_of_name          # :35-47
//     return if errors.any?
//     validate_uniqueness_of_name        # :19-26
//   end
//   event :validate_key, after: :validate_name, on: :save do
//     if key.empty? then errors.add :key, t(:core_error_blank_key) ...
//   end
//
// The abuse cases here are the ones where the INPUT is hostile but the
// engine's answer must still be Ruby's answer — a graceful validation
// error, never a raw storage-engine exception:
//
// - EXTREME LENGTH (500+ chars): refused by validate_legality_of_name, whose
//   `name.length` counts CODEPOINTS (Ruby String#length), not UTF-16 units.
//   A 200-emoji name is 200 Ruby characters — legal — where a UTF-16 length
//   check would refuse it as "400 characters".
// - PURE PUNCTUATION ("!!!", "???"): the name is legal (3 characters, not
//   blank, no banned chars) but its computed key is the EMPTY string —
//   validate_key refuses the first one, so no two punctuation-only names can
//   ever collide on the cards.key unique index and no save can reach that
//   index with an empty key (Ruby has the same unique index; the refusal is
//   what keeps saves from ever tripping it).
// - CARD-NUMBER MARKS ("~123"): Card::Name.new resolves an id mark through
//   the lexicon (lib/card/name.rb from_id_from_string), so "~<id>" is never
//   stored verbatim; a missing id raises Card::Name.bad_mark's NotFound.
// - URL-HOSTILE CHARACTERS (/, ?, #, %) and HTML in names: legal names
//   (no banned characters by default); their KEY collapses the punctuation,
//   and the stored name keeps the hostile characters verbatim for the URL /
//   render layers to handle.

import { afterAll, describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  actionEngine,
  JOE,
  seedStandardDeck,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { CardActionError } from "../../../src/card/actions/types.js";

let lastStorage: ActionsTestStorage | undefined;
afterAll(() => {
  lastStorage?.close();
});

async function freshDeck(): Promise<{ storage: ActionsTestStorage; engine: CardActionEngine }> {
  const storage = await createActionsTestStorage();
  lastStorage = storage;
  await seedStandardDeck(storage);
  // The name environment is process-global ("first engine wins",
  // src/card/fetch.ts:199) — each deck here rebinds it explicitly so the
  // id-mark resolution ("~<id>") reads THIS storage's lexicon, not a prior
  // test's closed one.
  storage.engine.installNameEnvironment();
  return { storage, engine: actionEngine(storage, JOE) };
}

/** The create's verdict as (code, message), never a non-CardActionError throw. */
async function createVerdict(
  engine: CardActionEngine,
  name: string,
): Promise<{ kind: "ok"; storedName: string; cardId: number } | { kind: "refused"; code: string; message: string; userMessage?: string }> {
  try {
    const result = await engine.createCard({ name, content: "x" });
    return { kind: "ok", storedName: result.name?.s ?? "", cardId: result.cardId };
  } catch (e) {
    if (!(e instanceof CardActionError)) throw e;
    return { kind: "refused", code: e.code, message: e.message, userMessage: e.userMessage };
  }
}

describe("name abuse on create: validate_legality_of_name (name_events.rb:35-47)", () => {
  it("a 500-character name is refused as too long, nothing stored", async () => {
    const { storage, engine } = await freshDeck();
    try {
      const verdict = await createVerdict(engine, "a".repeat(500));
      expect(verdict).toEqual({
        kind: "refused",
        code: "name-illegal",
        message: "name is too long (500 characters)",
        userMessage: "NAME: is too long (255 character maximum; length is 500)",
      });
      expect(await storage.count("cards")).toBeGreaterThan(0); // deck stands, no new row below
      const rows = await storage.selectAll<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cards WHERE key LIKE 'aaa%'",
      );
      expect(Number(rows[0]?.n ?? 0)).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("a 255-character name (exactly at the limit) is legal", async () => {
    const { storage, engine } = await freshDeck();
    try {
      const verdict = await createVerdict(engine, `b${"a".repeat(254)}`);
      expect(verdict.kind).toBe("ok");
    } finally {
      storage.close();
    }
  });

  it("Ruby counts codepoints, not UTF-16 units: 200 emoji (400 UTF-16 units) is a legal name", async () => {
    const { storage, engine } = await freshDeck();
    try {
      // All-emoji name: every character falls outside the key alphabet, so
      // the computed key is empty and validate_key (not legality) is the
      // event that refuses it — at 200 codepoints, BELOW the 255 limit.
      const verdict = await createVerdict(engine, "\u{1F600}".repeat(200));
      expect(verdict).toEqual({
        kind: "refused",
        code: "validation-failed",
        message: "Validation failed: Key cannot be blank",
        userMessage: "KEY: cannot be blank",
      });
    } finally {
      storage.close();
    }
  });

  it("a name whose codepoint length exceeds 255 is refused with the codepoint count", async () => {
    const { storage, engine } = await freshDeck();
    try {
      // 300 emoji = 300 codepoints > 255: legality refuses, and the message
      // carries the CODEPOINT count (300), never the UTF-16 count (600).
      const verdict = await createVerdict(engine, "\u{1F600}".repeat(300));
      expect(verdict.kind).toBe("refused");
      if (verdict.kind === "refused") {
        expect(verdict.message).toBe("name is too long (300 characters)");
        expect(verdict.userMessage).toBe("NAME: is too long (255 character maximum; length is 300)");
      }
    } finally {
      storage.close();
    }
  });
});

describe("name abuse on create: pure punctuation and validate_key (name_events.rb:44-49)", () => {
  it("'!!!' is refused with Key-cannot-be-blank, and no row with an empty key is ever stored", async () => {
    const { storage, engine } = await freshDeck();
    try {
      const verdict = await createVerdict(engine, "!!!");
      expect(verdict).toEqual({
        kind: "refused",
        code: "validation-failed",
        message: "Validation failed: Key cannot be blank",
        userMessage: "KEY: cannot be blank",
      });
      const rows = await storage.selectAll<{ id: number; name: string | null }>(
        "SELECT id, name FROM cards WHERE key = ''",
      );
      expect(rows).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("'???' after '!!!': the second punctuation name cannot crash on the key unique index", async () => {
    const { storage, engine } = await freshDeck();
    try {
      // Both refused by validate_key; neither reaches storage, so the
      // cards.key unique index never sees two empty-key rows. The save's
      // answer is a CardActionError both times — never a raw SqliteError.
      for (const name of ["!!!", "???"]) {
        const verdict = await createVerdict(engine, name);
        expect(verdict.kind).toBe("refused");
        if (verdict.kind === "refused") expect(verdict.code).toBe("validation-failed");
      }
      const rows = await storage.selectAll<{ id: number }>("SELECT id FROM cards WHERE key = ''");
      expect(rows).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("an update renaming a card TO a punctuation-only name is refused the same way", async () => {
    const { storage, engine } = await freshDeck();
    try {
      const created = await engine.createCard({ name: "Rename Source", content: "x" });
      try {
        await engine.updateCard({ cardId: created.cardId, name: "!!!" });
        throw new Error("expected the rename to be refused");
      } catch (e) {
        expect(e).toBeInstanceOf(CardActionError);
        if (e instanceof CardActionError) {
          expect(e.code).toBe("validation-failed");
          expect(e.userMessage).toBe("KEY: cannot be blank");
        }
      }
    } finally {
      storage.close();
    }
  });
});

describe("name abuse on create: card-number marks (lib/card/name.rb from_id_from_string)", () => {
  it("'~<existing id>' is never stored verbatim — the mark resolves to that card's name and conflicts", async () => {
    const { storage, engine } = await freshDeck();
    try {
      const target = await engine.createCard({ name: "Mark Target", content: "x" });
      const rows = await storage.selectAll<{ id: number }>("SELECT id FROM cards WHERE key = 'mark_target'");
      const realId = rows[0]?.id;
      expect(realId).toBeDefined();
      expect(target.cardId).toBe(realId);
      // A second create naming "~<realId>": the name resolves THROUGH the
      // mark to "Mark Target", whose key is taken — the uniqueness error
      // names the resolved card, exactly as Ruby's core_error_name_exists
      // (name_events.rb:25) names existing_card.name.
      const verdict = await createVerdict(engine, `~${realId}`);
      expect(verdict.kind).toBe("refused");
      if (verdict.kind === "refused") {
        expect(verdict.code).toBe("name-conflict");
        expect(verdict.message).toContain("Mark Target");
      }
    } finally {
      storage.close();
    }
  });

  it("'~424242' (no such id) is a NotFound-class refusal, not a stored name and not a crash", async () => {
    const { storage, engine } = await freshDeck();
    try {
      let thrown: unknown;
      try {
        await engine.createCard({ name: "~424242", content: "x" });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeDefined();
      expect((thrown as Error).constructor.name).toBe("NameNotFoundError");
      expect((thrown as Error).message).toContain("424242");
      const rows = await storage.selectAll<{ id: number; name: string | null }>(
        "SELECT id, name FROM cards WHERE name = '~424242'",
      );
      expect(rows).toEqual([]);
    } finally {
      storage.close();
    }
  });
});

describe("name abuse on create: URL-hostile and HTML characters", () => {
  it.each([
    ["a/b", "a_b"],
    ["a?b", "a_b"],
    ["a#b", "a_b"],
    ["a%b", "a_b"],
  ])("%s is a legal name; stored verbatim, key collapses the punctuation to %s", async (name, key) => {
    const { storage, engine } = await freshDeck();
    try {
      const verdict = await createVerdict(engine, name);
      expect(verdict).toEqual({ kind: "ok", storedName: name, cardId: expect.any(Number) });
      const rows = await storage.selectAll<{ key: string | null }>(
        "SELECT key FROM cards WHERE name = ?",
        [name],
      );
      expect(rows[0]?.key).toBe(key);
    } finally {
      storage.close();
    }
  });

  it("a distinct name sharing the collapsed key is a graceful name-conflict, not a crash", async () => {
    const { storage, engine } = await freshDeck();
    try {
      const first = await createVerdict(engine, "a/b");
      expect(first.kind).toBe("ok");
      const second = await createVerdict(engine, "a?b");
      expect(second).toMatchObject({ kind: "refused", code: "name-conflict" });
      if (second.kind === "refused") {
        expect(second.message).toContain("a/b");
      }
    } finally {
      storage.close();
    }
  });

  it("an HTML tag as a name is stored verbatim (the render layer escapes it), the key collapses", async () => {
    const { storage, engine } = await freshDeck();
    try {
      const verdict = await createVerdict(engine, "<script>alert(1)</script>");
      expect(verdict.kind).toBe("ok");
      const rows = await storage.selectAll<{ name: string | null; key: string | null }>(
        "SELECT name, key FROM cards WHERE key LIKE 'script_alert_1_%'",
      );
      expect(rows[0]?.name).toBe("<script>alert(1)</script>");
    } finally {
      storage.close();
    }
  });
});
