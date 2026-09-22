// M4 — render-time validation: the Search card's :core view JSON-parses
// the card's content (card-mod-search-0.20.0 set/abstract/cql_search.rb
// #parse_json_cql). On JSON::ParserError Ruby raises
// `Card::Error::BadQuery, "Invalid JSON search query: #{query}"` and the
// html :open / :content views surface that raise verbatim. The corpus
// capture pins the exact sentinel bytes in
// fixtures/corpus/shard-000000.jsonl:
//   - id=77 (*home, content="yzzw") views.open   -> CAPTURE_ERROR: Card::Error::BadQuery: Invalid JSON search query: fr
//   - id=101 (wrjuvyhaoiwnvvnblfl, content="jjmdu...") views.open/content -> same class
//   - id=274 (*all) views.open/content -> same class
//   - id=305 (*help+*right) views.open/content -> same class
//   - id=470 (ppqhuslzzya) views.open/content -> same class
//   - id=817 (zbxggwfbwlmurtwz) views.open/content -> same class (long query)
//
// The replay handler (benchmarks/corpus-v2/replay-shard.test.ts — read-only
// per the stream contract) emits the CAPTURE_ERROR sentinel from
// `error.constructor.name`; the port must raise a class whose
// `constructor.name` is literally "Card::Error::BadQuery" and whose
// message echoes the raw query — exactly what Ruby recorded.

import { describe, expect, it } from "vitest";
import {
  BAD_QUERY_CLASS_NAME,
  BadQueryError,
  badQuery,
  emptyQueryError,
} from "../../../src/card/render/errors.js";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";

describe("Card::Error::BadQuery — search-card JSON parse failure (M4)", () => {
  // ----- the class itself ---------------------------------------------------

  it("class name is the Ruby literal 'Card::Error::BadQuery'", () => {
    // Pinned against the corpus CAPTURE_ERROR sentinel prefix — the
    // replay handler compares this string verbatim.
    expect(BadQueryError.name).toBe(BAD_QUERY_CLASS_NAME);
    expect(BAD_QUERY_CLASS_NAME).toBe("Card::Error::BadQuery");
  });

  it("constructor.name matches the corpus sentinel's class prefix", () => {
    const err = badQuery("yzzw");
    // The replay handler reads err.constructor.name (benchmarks/corpus-v2/
    // replay-shard.test.ts render handler fallback path) — that must be
    // the Ruby class string, not the TS-local binding name.
    expect(err.constructor.name).toBe("Card::Error::BadQuery");
    expect(err.name).toBe("Card::Error::BadQuery");
  });

  it("message echoes the raw query verbatim, matching the corpus format", () => {
    const err = badQuery("yzzw");
    expect(err.message).toBe("Invalid JSON search query: yzzw");
    const long = badQuery("a".repeat(64));
    expect(long.message).toBe(`Invalid JSON search query: ${"a".repeat(64)}`);
  });

  it("empty-query branch produces the distinct 'can't run search with empty content' message", () => {
    // cql_search.rb:36-38 — the empty case raises BEFORE JSON.parse, with
    // a different message; port parity means both branches throw the
    // SAME class (BadQuery) but with their own message text.
    const err = emptyQueryError();
    expect(err.constructor.name).toBe("Card::Error::BadQuery");
    expect(err.message).toBe("can't run search with empty content");
  });

  // ----- the render pipeline surfaces the raise ----------------------------

  it("rendering :open of a Search-type card with non-JSON content raises BadQueryError", async () => {
    const storage = await createRenderTestStorage();
    try {
      // The corpus card id=77: name "*home", codename "home", type_id
      // pointing at a non-JSON Search. The capture recorded the raise on
      // its :open view (which delegates to :core -> :card_list ->
      // executeSearch -> runSearch).
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 98, name: "Search", codename: "search_type", typeId: 2 });
      await seedCard(storage, {
        id: 77,
        name: "*home",
        codename: "home",
        typeId: 98,
        dbContent: "yzzw",
      });
      let captured: unknown;
      try {
        await storage.engine.render("*home", "open");
      } catch (err) {
        captured = err;
      }
      expect(captured).toBeInstanceOf(Error);
      const err = captured as Error & { query?: string };
      expect(err.constructor.name).toBe("Card::Error::BadQuery");
      expect(err.message).toBe("Invalid JSON search query: yzzw");
      expect(err.query).toBe("yzzw");
    } finally {
      storage.close();
    }
  });

  it("rendering :content of a Search-type card with non-JSON content raises BadQueryError", async () => {
    // Corpus pin: id=101 / id=274 / id=305 — both :open AND :content
    // views surface the raise (the :content view delegates to :core ->
    // :card_list -> executeSearch, identical code path to :open).
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 98, name: "Search", codename: "search_type", typeId: 2 });
      await seedCard(storage, {
        id: 101,
        name: "broken search one",
        typeId: 98,
        dbContent: "jjmduarnmhbvnahsoeyvmxkpec",
      });
      let captured: unknown;
      try {
        await storage.engine.render("broken_search_one", "content");
      } catch (err) {
        captured = err;
      }
      const err = captured as Error;
      expect(err.constructor.name).toBe("Card::Error::BadQuery");
      expect(err.message).toBe("Invalid JSON search query: jjmduarnmhbvnahsoeyvmxkpec");
    } finally {
      storage.close();
    }
  });

  it("rendering :open of a Search-type card with empty content raises the empty-query branch", async () => {
    // cql_search.rb:36-38 — empty content short-circuits to the
    // dedicated message; the port must distinguish this from the
    // invalid-JSON branch so the same Ruby parity holds.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 98, name: "Search", codename: "search_type", typeId: 2 });
      await seedCard(storage, {
        id: 200,
        name: "empty search",
        typeId: 98,
        dbContent: "",
      });
      let captured: unknown;
      try {
        await storage.engine.render("empty_search", "open");
      } catch (err) {
        captured = err;
      }
      const err = captured as Error;
      expect(err.constructor.name).toBe("Card::Error::BadQuery");
      expect(err.message).toBe("can't run search with empty content");
    } finally {
      storage.close();
    }
  });

  it("valid JSON search content renders without raising (sanity check)", async () => {
    // Pin that the new validation ONLY fires on parse failures — valid
    // CQL JSON must still render normally (the captured smoke fixture
    // oracle-replay.test.ts covers the happy path).
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 98, name: "Search", codename: "search_type", typeId: 2 });
      await seedCard(storage, {
        id: 300,
        name: "valid search",
        typeId: 98,
        dbContent: '{"left":"anything","limit":0}',
      });
      const html = await storage.engine.render("valid_search", "open");
      expect(typeof html).toBe("string");
      // No results, but the card_list shape renders.
      expect(html).toContain("valid_search-open-view");
    } finally {
      storage.close();
    }
  });

  // ----- the corpus-v2 replay sentinel contract ----------------------------

  it("the raised error reproduces the exact CAPTURE_ERROR sentinel bytes the corpus:77 capture recorded", () => {
    // Direct byte-equality pin: corpus:77:open expected
    //   CAPTURE_ERROR: Card::Error::BadQuery: Invalid JSON search query: fr
    // (the corpus id=77 capture's stored content was "fr"; the TS port
    // raises with whatever raw content it sees, byte-exact).
    const err = badQuery("fr");
    const sentinel = `CAPTURE_ERROR: ${err.constructor.name}: ${err.message}`;
    expect(sentinel).toBe(
      "CAPTURE_ERROR: Card::Error::BadQuery: Invalid JSON search query: fr",
    );
  });
});
