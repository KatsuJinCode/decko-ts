// Register A19 (decko-completeness-register-2026-10-18.md:763): the
// QueryReference chunk — quoted names inside Search cards' JSON tracked as
// reference rows with code "Q".
//
// RUBY ORACLE (read this session; the port's behavior pins against these):
// - chunk.rb:89 `register_list :query, [:QueryReference]` + chunk.rb:84-91:
//   QueryReference rides the :query list ALONE. search_type.rb:6-8
//   `def chunk_list; :query; end` engages it for Search cards.
// - query_reference.rb:50-53 registration: prefix `(?<=[:,\[])\s*"` (a
//   quote after a colon, comma, or open bracket — lookbehind does not
//   consume), full `/\A\s*"([^"]+)"/`.
// - query_reference.rb:63-67 full_match: a match whose text is a QUERY
//   KEYWORD (query.rb MODIFIERS + OPERATORS + attributes + CONJUNCTIONS +
//   desc/asc/count, compared `tr(" ", "_").downcase`) is rejected BEFORE a
//   chunk exists.
// - query_reference.rb:75 interpret: @name = match[1]; :106 reference_code
//   "Q". reference.rb:13-20 referee_name absolutizes against card.name;
//   all.rb:80-96 interpret_reference: skip nil, skip self, Lexicon.id,
//   unknown compounds grow "P" part rows.
// - all.rb:65-71 swap_names walks content_object — the card's OWN chunk
//   list: a Search referer swaps ONLY QueryReference chunks
//   (query_reference.rb:86-89 rebuilds "#{@name}"); a non-Search referer's
//   :default/:references parse has no QueryReference class, so its quoted
//   text never swaps and never writes Q rows.
//
// The port bug this file pins the fix for: the general reference walk
// (refresh-references-out.ts scanReferenceChunks) used to merge the Q
// prefix into EVERY card's parse, so a non-Search card's `"quoted"` text
// wrote Q rows and renamed on swap — chunk-list membership Ruby never
// grants it.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  CARDTYPE_ID,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { DeckoName } from "../../../src/card/name.js";
import {
  isQueryKeyword,
  referenceRowsOut,
  scanQueryReferenceChunks,
  type ReferenceRow,
} from "../../../src/card/actions/refresh-references-out.js";
import {
  swapNames,
  swapQueryReferenceNames,
} from "../../../src/card/actions/update-referer-content.js";

async function rowsFor(
  storage: ActionsTestStorage,
  refererId: number,
  refererName: string,
  content: string,
): Promise<ReferenceRow[]> {
  return referenceRowsOut(
    storage.driver,
    storage.engine.lexicon,
    refererId,
    DeckoName.parse(refererName),
    content,
  );
}

function rowSig(rows: ReferenceRow[]): string[] {
  return rows.map((r) => `${r.refType}:${r.refereeKey}:${r.refereeId ?? "null"}`);
}

const SEARCH_TYPE_ID = 30;
const Q_HOST_ID = 901;
const PLAIN_HOST_ID = 902;

describe("A19: the :query chunk list — QueryReference chunks and Q rows", () => {
  it("unit: the grammar and the keyword rejection (query_reference.rb:50-67)", () => {
    // lookbehind shapes: after :, , or [ (optional whitespace between).
    // The FIRST key after { has NO valid prefix — `{"a"` looks behind to a
    // brace — so "a" is not a chunk (Ruby's documented too-general-regex
    // limitation, query_reference.rb:31-36); `,"plain "` IS one.
    const spans = scanQueryReferenceChunks(
      '{"a":"Alfred","list":[ "Topic 001"],"plain "x" tail',
    ).map((c) => c.name);
    expect(spans).toEqual(["Alfred", "list", "Topic 001", "plain "]);
    // keyword?: `tr(" ", "_").downcase` against the query.rb tables — the
    // operator, modifier, and attribute names are syntax, never references
    expect(isQueryKeyword("in")).toBe(true);
    expect(isQueryKeyword("not in")).toBe(true);
    expect(isQueryKeyword("Not In")).toBe(true);
    expect(isQueryKeyword("sort_by")).toBe(true);
    expect(isQueryKeyword("found_by")).toBe(true);
    expect(isQueryKeyword("desc")).toBe(true);
    expect(isQueryKeyword("count")).toBe(true);
    expect(isQueryKeyword("Alfred")).toBe(false);
    expect(isQueryKeyword("Topic 001")).toBe(false);
  });

  it("a Search card's quoted names become Q rows (known referee carries its id)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      await seedCard(storage, {
        id: SEARCH_TYPE_ID, name: "Search", codename: "search_type", typeId: CARDTYPE_ID,
      });
      const topic = await seedCard(storage, { id: 905, name: "Topic 001", dbContent: "" });
      await seedCard(storage, { id: Q_HOST_ID, name: "Q Host", typeId: SEARCH_TYPE_ID });
      const rows = await rowsFor(
        storage,
        Q_HOST_ID,
        "Q Host",
        '{"link_to":"Topic 001","sort":"name","name":"Alfred"}',
      );
      // "sort"'s value "name" is a query keyword -> no chunk; "link_to"'s
      // key is a keyword too (keys and values both match the grammar — the
      // keyword filter is what removes the keys).
      expect(rowSig(rows)).toEqual([
        `Q:topic_001:${topic.id}`,
        "Q:alfred:null",
      ]);
    } finally {
      storage.close();
    }
  });

  it("an unknown compound referee grows the P part rows (all.rb:133-139)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      await seedCard(storage, {
        id: SEARCH_TYPE_ID, name: "Search", codename: "search_type", typeId: CARDTYPE_ID,
      });
      await seedCard(storage, { id: Q_HOST_ID, name: "Q Host", typeId: SEARCH_TYPE_ID });
      const rows = await rowsFor(
        storage,
        Q_HOST_ID,
        "Q Host",
        '{"refer_to":"Missing Person+Musings"}',
      );
      // Q for the compound (NULL id — unknown) + P for each side; the keys
      // carry the cardname key normalization's plural stem ("musings" ->
      // "musing", the DeckoName.key rule)
      expect(rowSig(rows)).toEqual([
        "Q:missing_person+musing:null",
        "P:missing_person:null",
        "P:musing:null",
      ]);
    } finally {
      storage.close();
    }
  });

  it("a non-Search card's quoted text writes NO rows (the chunk-list scope fix)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      const topic = await seedCard(storage, { id: 905, name: "Topic 001", dbContent: "" });
      await seedCard(storage, { id: PLAIN_HOST_ID, name: "Plain Host", dbContent: "" });
      // pre-fix this parse emitted Q rows for "Topic 001" and "Alfred":
      // QueryReference is in NO list a non-Search card parses
      // (chunk.rb:84-91 — :default and :references carry no QueryReference).
      const rows = await rowsFor(
        storage,
        PLAIN_HOST_ID,
        "Plain Host",
        'Say "Topic 001": "Alfred" and [["Topic 001"]]',
      );
      // the [[...]] link still references (the :default list's Link chunk)
      expect(rowSig(rows)).toEqual([`L:topic_001:${topic.id}`]);
    } finally {
      storage.close();
    }
  });

  it("a self-referencing search value writes no row (all.rb:90)", async () => {
    const storage = await createActionsTestStorage();
    try {
      await seedStandardDeck(storage);
      await seedCard(storage, {
        id: SEARCH_TYPE_ID, name: "Search", codename: "search_type", typeId: CARDTYPE_ID,
      });
      await seedCard(storage, { id: Q_HOST_ID, name: "Q Host", typeId: SEARCH_TYPE_ID });
      const rows = await rowsFor(
        storage,
        Q_HOST_ID,
        "Q Host",
        '{"name":"Q Host","link_to":"Topic 001"}',
      );
      expect(rowSig(rows).filter((sig) => sig.startsWith("Q:q_host"))).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("a Search referer's swap walks ONLY the :query list (all.rb:65-71 + search_type.rb:6)", () => {
    // quoted names swap with the quotes re-emitted (query_reference.rb:86-89);
    // the keyword value "name" stays; the keys ("link_to", "sort") never swap
    expect(
      swapQueryReferenceNames(
        '{"link_to":"Topic 001","sort":"name"}',
        DeckoName.parse("Topic 001"),
        DeckoName.parse("Topic 002"),
      ),
    ).toBe('{"link_to":"Topic 002","sort":"name"}');
    // relative forms swap part-wise (Name#swap through the name layer)
    expect(
      swapQueryReferenceNames(
        '{"link_to":"_left+Topic 001"}',
        DeckoName.parse("Topic 001"),
        DeckoName.parse("Topic 002"),
      ),
    ).toBe('{"link_to":"_left+Topic 002"}');
  });

  it("a non-Search referer's swap leaves quoted text untouched (no QueryReference in its lists)", () => {
    expect(
      swapNames(
        '<p>Say "Topic 001" and [[Topic 001]]</p>',
        DeckoName.parse("Topic 001"),
        DeckoName.parse("Topic 002"),
        DeckoName.parse("Plain Host"),
      ),
    ).toBe('<p>Say "Topic 001" and [[Topic 002]]</p>');
  });
});
