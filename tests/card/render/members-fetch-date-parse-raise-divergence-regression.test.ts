// members-fetch-date-parse-raise-divergence-regression.test.ts — the
// ALWAYS-ON regression pin for the raise-divergence page class:
// `X+*members` List item marks raising NameNotFoundError, and Date-typed
// pages raising Date::Error, where Ruby rendered both.
//
// WHY THIS FILE EXISTS WHEN THE CLASS IS ALREADY FIXED
// -----------------------------------------------------
// The corpus-backed proofs for this class live in two specs that are BOTH
// gated on env flags and machine-local material and SKIP when it is absent:
//   - the raw-corpus-raise-leadview-pages suite (not in the public package)
//   - the raw-corpus-raise-leadview-sweep suite (not in the public package)
// Both skip when the gate is unset or the corpus file is missing, so an
// ordinary suite run reports them as skipped and a REGRESSION in either
// mechanism is silent on any machine without the corpus. This file
// pins the same two mechanisms hermetically — in-memory storage, no corpus,
// no env gate — so they are checked on every run.
//
// MECHANISM 1 — the members-fetch half.
//   `X+*members` List cards store their items as `~id` marks. DeckoName.parse
//   resolves a mark through the SYNCHRONOUS name environment
//   (src/card/name.ts:271 -> getNameEnvironment().lexicon.name(id)). Ruby's
//   Lexicon.name is cache-first WITH a synchronous db fallback
//   (lexicon.rb:71-76), so a mark always resolves for an id the deck holds.
//   This port's adapter is sync-over-async and can only serve warm cache
//   entries; TemporaryCache resets its whole store at 10,000 keys
//   (temporary.rb#within_key_counts, DEFAULT_MAX_TEMPORARY_CACHE_KEYS), and a
//   47k-card deck resets it repeatedly while warming. After a reset the
//   adapter missed, rubyBlank fired, and badMark threw NameNotFoundError
//   where Ruby resolved — the page died because the members list IS the main
//   card. The fix (src/card/fetch/lexicon.ts DbLexicon#peekDurableName, read
//   at src/card/fetch.ts:691) records every async name(id) read and serves
//   the evicted ids from that record. Pinned below: a mark that survives a
//   real cache reset, and the boundary that must STILL raise for an id the
//   deck never held (the port must not have become a blanket swallow).
//
// MECHANISM 2 — the date-parse half.
//   Date-typed cards whose content is the dashed two-digit-year form
//   ("19-03-19", "22-03-23"). Ruby parses those; JS `new Date("19-03-19")`
//   is Invalid Date, so the prepare-phase gate (src/card/render.ts:1347)
//   raised Date::Error and the page died where Ruby rendered. The fix
//   (parseRubyDateContent, src/card/render/errors.ts:153) implements Ruby's
//   00-68 / 69-99 two-digit-year window. Pinned below: the two exemplars'
//   exact content through both the parser and the renderer, and the reject
//   set that must keep raising (Ruby raises on bare-year digit strings too —
//   the boundary is a widened accept set, not a disabled gate).

import { describe, it, expect } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { parseRubyDateContent, isValidDateContent } from "../../../src/card/render/errors.js";
import { formatDateCore } from "../../../src/card/render/views.js";
import { DeckoName } from "../../../src/card/name.js";
import { NameNotFoundError } from "../../../src/card/name/errors.js";

/** The members the members-fetch cards list; ids are
 *  arbitrary here (the mechanism is the mark parse, not the deck). */
const MEMBERS = [
  { id: 393, name: "first member" },
  { id: 400, name: "second member" },
] as const;

/** An id the deck never held — Ruby's blank-name path still raises. */
const UNKNOWN_ID = 999_999;

describe("members-fetch name marks survive a Temporary-cache reset", () => {
  it("resolves a ~id mark before AND after the 10k-key reset (the 21-page mechanism)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 5, name: "List", codename: "list", typeId: 2 });
      for (const m of MEMBERS) {
        await seedCard(storage, { id: m.id, name: m.name, typeId: 2 });
      }
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(MEMBERS.map((m) => m.id));

      // Before the reset the LIVE cache answers the mark. The lexicon keys
      // its cache by String(id) (DbLexicon#idToLex), so the temp store is
      // directly observable.
      for (const m of MEMBERS) {
        expect(storage.fetcher.lexiconCache.temp.read(String(m.id))).toBeDefined();
        expect(DeckoName.parse(`~${m.id}`).s).toBe(m.name);
      }

      // temporary.rb#within_key_counts: at 10,000 keys the whole store is
      // dropped. This is the exact event that killed the members-list pages.
      storage.fetcher.lexiconCache.temp.reset();
      expect(storage.fetcher.lexiconCache.temp.resetCount).toBeGreaterThan(0);

      // The live cache no longer holds the ids — WITHOUT this assertion the
      // next one would pass on cache.read and pin nothing.
      for (const m of MEMBERS) {
        expect(storage.fetcher.lexiconCache.temp.read(String(m.id))).toBeUndefined();
        // The durable record is what answers now.
        expect(storage.fetcher.lexicon.peekDurableName(m.id)).toBe(m.name);
      }

      // The mark still resolves, now from the durable record.
      for (const m of MEMBERS) {
        expect(DeckoName.parse(`~${m.id}`).s).toBe(m.name);
      }
    } finally {
      storage.close();
    }
  });

  it("still raises NameNotFoundError for an id the deck never held (Ruby blank-name parity)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 393, name: "first member", typeId: 2 });
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon([393]);
      storage.fetcher.lexiconCache.temp.reset();

      let captured: unknown;
      try {
        DeckoName.parse(`~${UNKNOWN_ID}`);
      } catch (err) {
        captured = err;
      }
      expect(captured).toBeInstanceOf(NameNotFoundError);
      // Ruby's literal message (lib/card/name.rb bad_mark).
      expect((captured as Error).message).toBe(`id doesn't exist: ${UNKNOWN_ID}`);
    } finally {
      storage.close();
    }
  });
});

describe("Date-typed pages: the dashed two-digit-year forms Ruby parses", () => {
  it("parses the two class exemplars' content (20190319, 20220323)", () => {
    // The dashed two-digit-year db_content forms that raised
    // Date::Error before the fix.
    expect(parseRubyDateContent("19-03-19")).not.toBeNull();
    expect(parseRubyDateContent("22-03-23")).not.toBeNull();
    expect(isValidDateContent("19-03-19")).toBe(true);
    expect(isValidDateContent("22-03-23")).toBe(true);
  });

  it("renders the oracle's strftime string for those contents", () => {
    // formatDateCore == ::Date.parse(content).strftime("%B %-d, %Y")
    // (card-mod-date-0.20.0 set/type/date.rb:7).
    expect(formatDateCore("19-03-19")).toBe("March 19, 2019");
    expect(formatDateCore("22-03-23")).toBe("March 23, 2022");
  });

  it("keeps Ruby's two-digit-year window (00-68 -> 2000s, 69-99 -> 1900s)", () => {
    expect(formatDateCore("68-01-02")).toBe("January 2, 2068");
    expect(formatDateCore("69-01-02")).toBe("January 2, 1969");
  });

  it("rejects what Ruby raises on — bare-year digit strings and impossible calendar days", () => {
    // Bare digit strings: Ruby raises ("2016", "1980", "0", "1" —
    // invalid date); JS would have silently produced year-epoch dates.
    for (const content of ["2016", "1980", "0", "1", "123456789"]) {
      expect(isValidDateContent(content), content).toBe(false);
    }
    // Real-calendar rejection (the round-trip check).
    for (const content of ["2019-13-01", "2021-02-29", "2019-05-0", "2019-00-10"]) {
      expect(isValidDateContent(content), content).toBe(false);
    }
    // Empty content raises in Ruby too.
    expect(isValidDateContent("")).toBe(false);
  });

  it("a Date-typed card whose content Ruby parses does NOT raise; alphabetic content still raises", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 17, name: "Date", codename: "date", typeId: 2 });
      await seedCard(storage, { id: 34188, name: "20190319", typeId: 17, dbContent: "19-03-19" });
      await seedCard(storage, { id: 1135, name: "broken date", typeId: 17, dbContent: "brcvtwrvz" });

      // The class exemplar shape: no raise, Ruby's strftime body.
      const good = await storage.engine.render("20190319", "open");
      expect(good).toContain("March 19, 2019");

      // The boundary stays: invalid content must still raise
      // Date::Error, Ruby's behavior for unparseable date strings.
      let captured: unknown;
      try {
        await storage.engine.render("broken_date", "open");
      } catch (err) {
        captured = err;
      }
      expect(captured).toBeInstanceOf(Error);
      expect((captured as Error).constructor.name).toBe("Date::Error");
      expect((captured as Error).message).toBe("invalid date");
    } finally {
      storage.close();
    }
  });
});
