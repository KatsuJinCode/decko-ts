// recent-core-no-search-fallback-without-history-seat.test.ts -- the
// *recent :core dispatch's failure-shape pins and the nested-render seat.
//
// Ruby: set/self/recent.rb:28-33 -- *recent's html :core is a SELF-set
// override of the search core ("FIXME: this should not be a CQL search
// card", self/recent.rb:9-12): recent_acts + acts_layout, the deck-wide
// recent-acts accordion. The card's stored db_content is a CQL search spec
// (the live row: {"sort":"update","dir":"desc","view":"change","limit":"50"})
// which the override must never EXECUTE.
//
// The live-demo bug this pins: the port's core dispatch (views.ts, the
// SELF-Xrecent arm) fell through to the search-type arm whenever the
// render-time history seat (RenderEngine#prepareHistoryRender, render.ts)
// did not run for the render -- so a *recent CORE rendered the EXECUTED
// search's card_list (entries as links) instead of the accordion (entries
// opening inline) on any lane where the seat was absent. The first
// hardening answered "" on that state; the seat-miss root cause stayed:
// the sync nested-render lanes (format.ts nest -> subformat.renderView)
// dispatch WITHOUT the async prepare half, so a *recent core nested inside
// another card's content arrived with no reader.
//
// The three shapes pinned here:
//   1. SEATED ROOT lane (the page path): engine.render("*recent", "core")
//      arms the ROOT gate (root IS *recent, "core" is core-reaching) and
//      the accordion bytes render -- the act accordion whose entry header
//      is the act card's name, which is what makes Brandon's Changes
//      entries open inline.
//   2. NESTED lane (the fix): a host card whose content nests
//      {{*recent|core}} renders through the sync tree with no prepare of
//      its own -- the prepare-time closure scan (render.ts
//      renderClosureNestsRecentCard -> the NESTED-*RECENT SEAT) arms the
//      deck-wide reader BEFORE the sync dispatch, so the nested core
//      renders the SAME accordion bytes. This was the silent-"" (and
//      before that, the wrong-surface) state.
//   3. UNSEATED sync dispatch: a render path that still arrives at the
//      arm without the reader (a lane the closure scan cannot see, e.g. a
//      programmatic subformat render) REFUSES LOUDLY -- the raise names
//      the missing seat. Never empty, never the search list.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderFormat, str } from "../../../src/card/render/format.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import { ActWriter } from "../../../src/card/history/write-path.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename/type/actor infrastructure (the set keys, the type-name
  // algebra, and the actor link bytes read these)
  await seedCard(s, { id: 1, name: "Decko Bot", typeId: 2 }); // the acts' actor
  await seedCard(s, { id: 2, name: "RichText" }); // the cardtypes' type card
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*anon", codename: "anonymous", typeId: 14 });
  await seedCard(s, { id: 16, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 17, name: "*all+*read", leftId: 10, rightId: 16, typeId: 14, dbContent: "[[Anyone]]" });
  await seedCard(s, { id: 18, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedReference(s, 17, 18, "anyone");
  // The Search cardtype (the codename feeds the search-arm codehash) and
  // the *recent card itself -- the live row's shape: Search-typed, CQL body
  // (self/recent.rb:9-12's FIXME).
  await seedCard(s, { id: 30, name: "Search", codename: "search_type", typeId: 2 });
  await seedCard(s, {
    id: 4029,
    name: "*recent",
    typeId: 30,
    dbContent: '{"sort":"update","dir":"desc","view":"change","limit":"50"}',
  });
  // The NEST HOST: a card whose content nests the *recent core -- the
  // production shape the sync nested-render lane serves (format.ts nest ->
  // subformat.renderView dispatches with no async prepare of its own).
  await seedCard(s, {
    id: 4030,
    name: "Recent Host",
    typeId: 2,
    dbContent: "{{*recent|core}}",
  });

  // One act through the REAL write path (act + non-draft create action +
  // change rows), so the seated lanes' accordion has an entry whose header
  // is the act card's name -- and the EXECUTED search would return the same
  // card (the old fall-through's bytes rendered it as a result item; the
  // dispatch must never render it through the search arm).
  const request = () =>
    new ActWriter({ driver: s.counting, actorId: 1, ipAddress: "127.0.0.1", now: () => new Date(Date.parse("2026-10-16T00:00:00.000Z")) });
  await request().createCard({
    name: "Dated Journal Entry 20131229 0264",
    key: "dated_journal_entry_20131229_0264",
    type_id: 2,
    db_content: "journal body",
  });

  // The history views (:action_summary et al) live in the mod loader, the
  // same install the history-views oracle test uses.
  loader = new ModLoader([{ manifest: cardModHistory }]);
  loader.load();
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("*recent :core never executes its CQL (self/recent.rb:28-33)", () => {
  it("the seated root lane (the page path) renders the recent-acts accordion, not the search", async () => {
    const html = await storage!.engine.render("*recent", "core");
    // The accordion + the act entry header (the act card's name) - the
    // inline-opening bytes.
    expect(html).toContain('class="accordion"');
    expect(html).toContain("Dated Journal Entry 20131229 0264");
    // Never the executed search.
    expect(html).not.toContain("search-result-list");
  });

  it("the nested lane ({{*recent|core}} in a host's content) renders the accordion -- the closure scan seats the reader before the sync dispatch", async () => {
    // The host's core render walks the nest synchronously (format.ts nest
    // -> subformat.renderView); the async prepare's closure scan must have
    // armed the deck-wide reader BEFORE that dispatch, so the nested core
    // carries the same accordion bytes the rooted page carries.
    const html = await storage!.engine.render("Recent Host", "core");
    expect(html).toContain('class="accordion"');
    expect(html).toContain("Dated Journal Entry 20131229 0264");
    expect(html).not.toContain("search-result-list");
  });

  it("an unseated sync dispatch refuses loudly -- never empty, never the search list", async () => {
    // Seat + prepare through the full render (set keys, type code, verdicts
    // -- the state the sync lanes read), then take the reader away: a
    // render path that still reaches the arm without the seat is a NEW
    // unseated lane, and the arm must name the missing seat rather than
    // answer a silent surface (the old "" and, before it, the executed
    // search's card_list).
    await storage!.engine.render("*recent", "core");
    (storage!.engine as unknown as { historyReader: unknown }).historyReader = undefined;
    const card = storage!.engine.fetchRenderCard("*recent");
    expect(card).toBeDefined();
    const fmt = new RenderFormat(card!, storage!.engine, {});
    expect(() => str(fmt.renderView("core"))).toThrow(
      /prepareHistoryRender\('recent'\)/,
    );
  });
});
