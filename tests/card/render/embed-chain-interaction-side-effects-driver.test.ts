// Embed-chain INTERACTIONS: what happens to a rendered page when something
// it embeds moves underneath it - the two-things-at-once class. One driver
// per interaction, each against the REAL write path (CardActionEngine:
// createCard/updateCard/deleteCard, so the save's reference refresh, rule
// cache expiry and freshness stamp all run exactly as a committed save's)
// and the real render lanes (engine.render fresh, and the kept-page live
// lane a second request rides).
//
//   S1  A embeds B embeds C; C is EDITED  -> A's fresh render and A's next
//       kept-page (ajax slot refresh) render carry C's new content; C
//       GAINING a new embed surfaces through A too (the save's reference
//       refresh reaches the chain's root); the *title card edited while a
//       page stands changes that page's next render.
//   S2  The page <title> reads the *title card's OWN content (Ruby
//       Rule.global_setting = Card[:title].db_content, rule.rb:5-9; joined
//       as `safe_name - setting`, card-mod-format set/all/html/head.rb:21-24).
//       A *self-scoped *title rule on an embedded card is INERT - pinned
//       against the live Ruby oracle (2026-10-18 session over synthetic-v2:
//       `Embed ChainB+*self+*title` created, B's titled view carries no
//       custom title), not assumed.
//   S2b An embedded card's *layout rule governs ITS OWN page only. Oracle
//       parity measured live: B's page renders the B-scoped layout, the
//       page that embeds B does not.
//   S3  B is DELETED while A's page stands -> the nest position renders the
//       unknown-view slot (fetch miss; retrieve.ts:255 `trash = 0` unless
//       look_in_trash, Ruby retrieve.rb:28-33). Oracle bytes pinned: the
//       `unknown-link slotter` anchor to `<name>/new_in_modal` with the
//       add_box icon - the create-it affordance the miss renders.
//   S4  A embeds ITSELF -> terminates at Ruby's monitor_depth (error.rb
//       max_depth 20): exactly 20 nest levels render, then the quiet span
//       `Man, you're too deep.  (Too many levels of nests at a time)` -
//       byte-identical to the oracle's.
//   S5  A and B embed EACH OTHER -> the same termination.
//   S6  RichText carrying a <script>: the SAVE strips the script tag -
//       the ts-stored db_content byte-equals the oracle's stored
//       db_content (both: ` window.__embedProbe=1 <div>...`); the RENDER
//       passes stored bytes verbatim (a seeded raw RichText with a script
//       renders it through, exactly like the oracle renders stored bytes).
//       Deep nested HTML renders as the string pass it is - bounded.
//
// Decko's nest grammar cannot nest braces ([^{}]* is the whole grammar,
// nest-syntax.ts), so the "nesting depth abuse" arm is the chain of stored
// cards past max_depth - covered by S4/S5's guard and the depth-sweep's
// 1..20 ceiling.
//
// Run via: npx vitest run tests/card/render/embed-chain-interaction-side-effects-driver.test.ts

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { liveRenderPage } from "../../../src/card/live/live-render.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";

const RICH_TEXT_ID = 2;
const SET_TYPE_ID = 1; // *all's own type = this deck's Set codename card id

/** Joe User writes; the deck's [[Anyone]] write rules permit. */
const JOE = { id: 9, name: "Joe User" };

async function seedInteractionDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  // type + set substrate (*all must be typed with the Set codename card's
  // id for the read-rule cache join; see render-test-storage.ts).
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 1, name: "Set", codename: "set", typeId: 2 });
  // ---- settings ----
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 921, name: "*create", codename: "create", typeId: 2 });
  await seedCard(storage, { id: 922, name: "*update", codename: "update", typeId: 2 });
  await seedCard(storage, { id: 923, name: "*delete", codename: "delete", typeId: 2 });
  await seedCard(storage, { id: 925, name: "*self", codename: "self", typeId: 2 });
  await seedCard(storage, { id: 926, name: "*default", codename: "default", typeId: 2 });
  // ---- *all (typed SET) + the page lane's layout rule + write rules ----
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  // *all+*default - the new-card type template the create path reads.
  await seedCard(storage, { id: 928, leftId: 900, rightId: 926, typeId: 2 });
  await seedCard(storage, {
    id: 910,
    leftId: 900,
    rightId: 901,
    typeId: 2,
    dbContent: "Probe Layout",
  });
  await seedCard(storage, { id: 911, name: "Probe Layout", typeId: 2, dbContent: "{{_main|titled}}" });
  const anyoneId = 10_000_004; // the bootstrap's Anyone codename card
  for (const [ruleId, settingId] of [[931, 921], [932, 922], [933, 923]] as const) {
    await seedCard(storage, {
      id: ruleId,
      leftId: 900,
      rightId: settingId,
      typeId: SET_TYPE_ID,
      dbContent: "[[Anyone]]",
    });
    await seedReference(storage, ruleId, anyoneId, "anyone");
  }
  // ---- the embed chain A -> B -> C ----
  await seedCard(storage, { id: 101, name: "ChainA", typeId: RICH_TEXT_ID, dbContent: "A body {{ChainB}}" });
  await seedCard(storage, { id: 102, name: "ChainB", typeId: RICH_TEXT_ID, dbContent: "B body {{ChainC}}" });
  await seedCard(storage, { id: 103, name: "ChainC", typeId: RICH_TEXT_ID, dbContent: "C v1 body" });
  await seedReference(storage, 101, 102, "chainb", "I");
  await seedReference(storage, 102, 103, "chainc", "I");
  // ---- the loop pair ----
  await seedCard(storage, { id: 104, name: "LoopSelf", typeId: RICH_TEXT_ID, dbContent: "self {{LoopSelf}}" });
  await seedCard(storage, { id: 105, name: "LoopA", typeId: RICH_TEXT_ID, dbContent: "A sees {{LoopB}}" });
  await seedCard(storage, { id: 106, name: "LoopB", typeId: RICH_TEXT_ID, dbContent: "B sees {{LoopA}}" });
  // ---- the script/HTML card + its wrapper ----
  await seedCard(storage, {
    id: 107,
    name: "ScriptEmbed",
    typeId: RICH_TEXT_ID,
    dbContent: '<script>window.__embedProbe=1</script><div><div><div>deep safe text</div></div></div>',
  });
  await seedCard(storage, { id: 108, name: "ScriptPage", typeId: RICH_TEXT_ID, dbContent: "wraps {{ScriptEmbed}}" });
  await seedReference(storage, 108, 107, "scriptembed", "I");
  return storage;
}

function writer(storage: RenderTestStorage): CardActionEngine {
  return new CardActionEngine(storage.fetcher, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: (() => {
      let t = 0;
      return () => new Date(Date.parse("2026-10-18T00:00:00Z") + t++ * 1000);
    })(),
  });
}

/** The page lane's boot: a fresh RenderEngine over the live store (no mod
 *  loader - the base view record serves; the same shape depth-sweep's
 *  render rides). */
const boot = async (driver: SQLDatabaseDriver) => {
  const { FetchEngine } = await import("../../../src/card/fetch.js");
  const { RenderEngine } = await import("../../../src/card/render.js");
  return { render: new RenderEngine(new FetchEngine(driver)) };
};

describe("embed-chain interactions (A embeds B embeds C, against the real write path)", () => {
  it("S1: C's edit reaches A's fresh render AND A's next kept-page render", async () => {
    const storage = await seedInteractionDeck();
    try {
      const before = await storage.engine.render("ChainA", "content");
      expect(before).toContain("C v1 body");

      // The edit: C v1 -> C v2, through the save path (a refusal throws).
      await writer(storage).updateCard({ cardId: 103, content: "C v2 body" });

      const fresh = await storage.engine.render("ChainA", "content");
      expect(fresh).toContain("C v2 body");
      expect(fresh).not.toContain("C v1 body");

      // The ajax lane: a page request for A, then the SAME page again -
      // the second request rides the kept entry unless the stamp moved.
      const page1 = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "content" });
      expect(page1.html).toContain("C v2 body");
      await writer(storage).updateCard({ cardId: 103, content: "C v3 body" });
      const page2 = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "content" });
      expect(page2.html).toContain("C v3 body");
      expect(page2.html).not.toContain("C v2 body");

      // C GAINS a new embed while pages stand: the save's reference refresh
      // must reach the whole chain, so A's next render carries ChainD too.
      await seedCard(storage, { id: 109, name: "ChainD", typeId: RICH_TEXT_ID, dbContent: "D leaf body" });
      await writer(storage).updateCard({ cardId: 103, content: "C v4 body {{ChainD}}" });
      const page3 = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "content" });
      expect(page3.html).toContain("C v4 body");
      expect(page3.html).toContain("D leaf body");

      // The *title card's own content changes while A's page stands: the
      // page <title> on the NEXT render carries it (the S2 mechanism, on
      // the kept-page lane).
      await writer(storage).updateCard({ cardId: 904, content: "Renamed Deck Title" });
      const page4 = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "titled" });
      expect(page4.html).toContain("<title>ChainA - Renamed Deck Title</title>");

      // C's RULE side changes (its type) while A's page stands: A's next
      // render carries C's new type machinery (the slot's class chain and
      // data-card-type attributes), not the old type.
      await seedCard(storage, { id: 110, name: "HTML", codename: "html", typeId: 2 });
      await writer(storage).updateCard({ cardId: 103, typeName: "HTML" });
      const page5 = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "content" });
      expect(page5.html).toContain("TYPE-html");
      expect(page5.html).not.toContain("TYPE-rich_text SELF-chain_c");
    } finally {
      storage.close();
    }
  });

  it("S2: the page title reads the *title card's own content (Ruby global_setting parity); B's *self *title rule is inert", async () => {
    const storage = await seedInteractionDeck();
    try {
      // Ruby rule.rb:5-9 global_setting(:title) = `Card[:title].db_content`
      // - the *title CODENAME card's own content, NOT an *all+*title rule
      // row (html/head.rb:21-24 joins `safe_name - global_setting(:title)`).
      // Positive control: edit the *title card through the write path WHILE
      // pages stand; the next fresh AND kept-page render must carry it.
      await writer(storage).updateCard({ cardId: 904, content: "Probe Global Title" });
      const page = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "titled" });
      expect(page.html).toContain("<title>ChainA - Probe Global Title</title>");

      // NOW B carries its own *self-scoped *title rule. Ruby never reads it:
      // title.rb standard_title reads voo.title (nest opts / code-set voo
      // assignments) and the page title reads global_setting only. The rule
      // is stored but no rendered title changes - the port must match that
      // (a *self *title rule is NOT a page-title or header-title rule).
      await writer(storage).createCard({ name: "ChainB+*self", typeName: "Set" });
      await writer(storage).createCard({
        name: "ChainB+*self+*title",
        content: "B Custom Title",
      });

      const bTitled = await storage.engine.render("ChainB", "titled");
      expect(bTitled).not.toContain("B Custom Title");
      const aPage = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "titled" });
      expect(aPage.html).toContain("<title>ChainA - Probe Global Title</title>");
      expect(aPage.html).not.toContain("B Custom Title");
    } finally {
      storage.close();
    }
  });

  it("S2b: B's *layout rule governs B's OWN page; the page that embeds B does not inherit it", async () => {
    const storage = await seedInteractionDeck();
    try {
      await seedCard(storage, { id: 912, name: "B Only Layout", typeId: 2, dbContent: "BLAYOUT{{_main|titled}}" });
      await writer(storage).createCard({ name: "ChainB+*self", typeName: "Set" });
      await writer(storage).createCard({
        name: "ChainB+*self+*layout",
        content: "B Only Layout",
      });

      // Positive control: B's own page uses B's rule's layout.
      const bPage = await liveRenderPage(storage.counting, "ChainB", boot, { requestedView: "titled" });
      expect(bPage.html).toContain("BLAYOUT");
      // The interaction under test: A's page keeps the *all+*layout layout.
      const aPage = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "titled" });
      expect(aPage.html).not.toContain("BLAYOUT");
      expect(aPage.html).toContain("A body");
    } finally {
      storage.close();
    }
  });

  it("S3: B deleted while A's page stands - A's next render shows the miss, never stale B", async () => {
    const storage = await seedInteractionDeck();
    try {
      const before = await storage.engine.render("ChainA", "content");
      expect(before).toContain("B body");

      // The ajax page request BEFORE the delete (the page is open).
      const page1 = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "content" });
      expect(page1.html).toContain("B body");

      await writer(storage).deleteCard({ cardId: 102 });

      // Fresh render + the kept-page lane's next request. The nest position
      // carries the oracle's unknown-view slot (2026-10-18 live oracle
      // session: deleted `Embed ChainB` renders the identical structure
      // with its own names): unknown-view slot, the unknown-link slotter
      // anchor to <name>/new_in_modal, the add_box icon, the card-title
      // span. Never stale B content.
      const fresh = await storage.engine.render("ChainA", "content");
      expect(fresh).not.toContain("B body");
      expect(fresh).toContain('class="card-slot unknown-view ALL TYPE-rich_text"');
      expect(fresh).toContain('<a rel="nofollow" class="unknown-link slotter" href="/ChainB/new_in_modal" data-remote="true">');
      expect(fresh).toContain('<i class="notranslate material-icons">add_box</i>');
      expect(fresh).toContain('<span class="card-title" title="ChainB">ChainB</span>');
      const page2 = await liveRenderPage(storage.counting, "ChainA", boot, { requestedView: "content" });
      expect(page2.html).not.toContain("B body");
      expect(page2.html).toContain("A body");
      expect(page2.html).toContain("unknown-link slotter");
    } finally {
      storage.close();
    }
  });

  it("S4: a card that embeds itself terminates at the depth guard with the oracle's quiet span", async () => {
    const storage = await seedInteractionDeck();
    try {
      const html = await storage.engine.render("LoopSelf", "content");
      // Termination parity with the live oracle (2026-10-18 session over
      // synthetic-v2, `Embed LoopSelf` = "self {{Embed LoopSelf}}"): exactly
      // 20 nest levels render, then the TooDeep quiet span replaces the
      // 21st - the oracle's own bytes:
      // <span class="render-error alert alert-danger">Man, you're too
      // deep.  (Too many levels of nests at a time)</span>.
      expect((html.match(/self /g) ?? []).length).toBe(20);
      expect(html).toContain(
        '<span class="render-error alert alert-danger">Man, you\'re too deep.  (Too many levels of nests at a time)</span>',
      );
      expect(html.length).toBeLessThan(200_000);
    } finally {
      storage.close();
    }
  });

  it("S5: two cards embedding each other terminate with the oracle's quiet span", async () => {
    const storage = await seedInteractionDeck();
    try {
      const html = await storage.engine.render("LoopA", "content");
      // The oracle's mutual loop renders 19 "A sees " levels (the outer
      // card's own text is the 20th) and the same quiet span.
      expect((html.match(/sees /g) ?? []).length).toBe(19);
      expect(html).toContain(
        '<span class="render-error alert alert-danger">Man, you\'re too deep.  (Too many levels of nests at a time)</span>',
      );
      expect(html.length).toBeLessThan(200_000);
    } finally {
      storage.close();
    }
  });

  it("S6: a RichText embed's <script> is stripped AT SAVE with the oracle's stored bytes; stored bytes render verbatim", async () => {
    const storage = await seedInteractionDeck();
    try {
      // The save-path arm: the same content the oracle session stored.
      // Oracle truth (2026-10-18 session, cards row for `Embed Script`):
      // db_content = " window.__embedProbe=1 <div><div><div>deep safe
      // text</div></div></div>" - the script tag never reached the deck.
      const saved = await writer(storage).createCard({
        name: "Script Saved",
        typeName: "RichText",
        content: "<script>window.__embedProbe=1</script><div><div><div>deep safe text</div></div></div>",
      });
      const row = await storage.counting.query<{ db_content: string }>(
        "SELECT db_content FROM cards WHERE id = ?",
        [saved.cardId],
      );
      expect(row.rows[0]?.db_content).toBe(
        " window.__embedProbe=1 <div><div><div>deep safe text</div></div></div>",
      );
      // The render of the SAVED card carries the stripped bytes.
      const savedHtml = await storage.engine.render("Script Saved", "content");
      expect(savedHtml).not.toContain("<script>");
      expect(savedHtml).toContain("deep safe text");

      // The render arm: stored bytes pass through verbatim - a SEEDED raw
      // RichText with a script tag renders it through, exactly like the
      // oracle renders whatever is stored (the sanitizer's job is the
      // save's, not the render's). Bounded: one pass, no recursion.
      const html = await storage.engine.render("ScriptPage", "content");
      expect(html).toContain("wraps");
      expect(html).toContain("deep safe text");
      const scriptHits = html.match(/<script>window\.__embedProbe/g) ?? [];
      expect(scriptHits.length).toBe(1);
      expect(html.length).toBeLessThan(100_000);
    } finally {
      storage.close();
    }
  });
});
