// The render-time ACT-SEARCH seam (src/card/history/updater-seam.ts) and the
// card-mod-history `updated_by` view it feeds
// (card-mod-history-0.20.0 set/all/history_board.rb:10-16, :76-99).
//
// Where the sibling bar/box suite pins the BYTES of the 0-updater and
// 1-updater arms, this file pins the seam CONTRACT those bytes depend on —
// the query's filters, the DISTINCT, the view gate, and the arms beyond
// one updater (2 updaters, 4+ "N others").
//
// Every expectation here is derived from Ruby, not from this port:
//
// - the SQL shape (updater_of -> tie_act -> ActQuery#update_action_on ->
//   ActionQuery#update_action_on = action_type 1; the chain is
//   card-1.110.0 lib/card/query/card_query/relational_attributes.rb:32-34,
//   82-84; lib/card/query/act_query.rb:17-19;
//   lib/card/query/action_query.rb:26-33, and TYPE_OPTIONS
//   %i[create update delete] (card-mod-history lib/card/action.rb:42) with
//   `action_type=` writing the index (action.rb:89-91) -> update IS 1):
//     SELECT DISTINCT c0.* FROM cards c0
//     JOIN card_acts cx1 ON c0.id = cx1.actor_id
//     JOIN card_actions cn2 ON cx1.id = cn2.card_act_id
//     JOIN cards c3 ON cn2.card_id = c3.id AND c3.trash is false
//     WHERE (cn2.action_type = 1 AND c3.id = '605') AND c0.trash is false
// - the DISTINCT: one card with TWO update actions by the SAME actor
//   yields exactly ONE updater row.
// - the multi-updater sentence: two DISTINCT updaters render
//   `Updated by <a ...>A</a> and <a ...>B</a>`; Rails'
//   to_sentence (activesupport-7.2.3.2 conversions.rb) gives
//   [] -> "", [a] -> "a", [a,b] -> "a and b", [a,b,c] -> "a, b, and c".
// - the "N others" arm: updater_links with max_count 3 shows
//   3 - 1 = 2 links plus link_to_card(card.fetch(:editors), "N others"),
//   whose href keeps the reference's literal `*`, unescaped:
//   `<a class="known-card" href="/<card>+*editors">2 others</a>`.
//
// NO-WRITE: this harness is the direct-INSERT seeding path (no engine
// writes).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedAct,
  seedAction,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { updaterOf } from "../../../src/card/mod-loader/mods/card-mod-history.js";
import { DECKOBOT_CODENAME } from "../../../src/card/auth/actor.js";

let storage: RenderTestStorage | undefined;
let anonEngine: RenderEngine | undefined;

const BOT = 1;
const JOHN = 1231;

/** The link bytes `nest updater, view: :link` renders for a known plain
 *  card (links.rb:111-116 + title.rb's wrapped title) - the same shape
 *  creditLinkHtml emits. */
function link(name: string): string {
  return (
    `<a class="known-card" href="/${name.replace(/ /g, "_")}">` +
    `<span class="card-title" title="${name}">${name}</span></a>`
  );
}

/** Seed one update act + action by `actorId` on `cardId`. actId/actionId
 *  are explicit so the DISTINCT and the filters have a fixed shape. */
async function seedUpdate(
  s: RenderTestStorage,
  cardId: number,
  actorId: number,
  actId: number,
  actionId: number,
  type: 0 | 1 | 2 = 1,
): Promise<void> {
  await seedAct(s, { id: actId, cardId, actorId, actedAt: "2026-09-27 22:59:48.692" });
  await seedAction(s, { id: actionId, cardId, actId, actionType: type });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  // the deck's bot card: the codename rides the production constant — the
  // STORED deck codename ("decko_bot", real.yml:17-19; codename.rb:107-110
  // derives DeckoBotID from the stored string) — never a restated literal
  await seedCard(s, { id: BOT, name: "Decko Bot", codename: DECKOBOT_CODENAME });
  await seedCard(s, { id: JOHN, name: "Editor Two" });
  await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3, typeName: "Cardtype" });

  // 100: never updated (create only)
  await seedCard(s, { id: 100, name: "Never Updated", typeId: 2, typeName: "RichText", creatorId: BOT });
  await seedUpdate(s, 100, BOT, 1000, 10000, 0);

  // 101: TWO update acts by the SAME actor - the DISTINCT proof
  await seedCard(s, { id: 101, name: "Twice Updated", typeId: 2, typeName: "RichText", creatorId: BOT });
  await seedUpdate(s, 101, BOT, 1001, 10001, 1);
  await seedUpdate(s, 101, BOT, 1002, 10002, 1);

  // 102: two DISTINCT updaters
  await seedCard(s, { id: 102, name: "Two Updaters", typeId: 2, typeName: "RichText", creatorId: BOT });
  await seedUpdate(s, 102, BOT, 1003, 10003, 1);
  await seedUpdate(s, 102, JOHN, 1004, 10004, 1);

  // 103: delete + create actions only - neither is an UPDATE action
  await seedCard(s, { id: 103, name: "Deleted Card", typeId: 2, typeName: "RichText", creatorId: BOT });
  await seedUpdate(s, 103, BOT, 1005, 10005, 0);
  await seedUpdate(s, 103, BOT, 1006, 10006, 2);

  // 104: one update by a TRASHED actor - c0.trash is false drops it
  await seedCard(s, { id: 104, name: "Trashed Updater", typeId: 2, typeName: "RichText", creatorId: BOT, trash: true });
  await seedCard(s, { id: 105, name: "Trashed Updater Host", typeId: 2, typeName: "RichText", creatorId: BOT });
  await seedUpdate(s, 105, 104, 1007, 10007, 1);

  // 106: a TRASHED host with a real updater - c3.trash is false drops the
  // whole join, so the host's own view renders the empty div
  await seedCard(s, { id: 106, name: "Trashed Host", typeId: 2, typeName: "RichText", creatorId: BOT, trash: true });
  await seedUpdate(s, 106, BOT, 1008, 10008, 1);

  // 107: five DISTINCT updaters - the "N others" arm
  await seedCard(s, { id: 107, name: "Five Updaters", typeId: 2, typeName: "RichText", creatorId: BOT });
  for (let i = 0; i < 5; i++) {
    const actorId = 200 + i;
    await seedCard(s, { id: actorId, name: `Actor ${i}` });
    await seedUpdate(s, 107, actorId, 1010 + i, 10010 + i, 1);
  }

  s.engine.viewer = { signedIn: true, actorId: BOT };
  anonEngine = new RenderEngine(new FetchEngine(s.counting));
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("act-search seam: Card.search(updater_of: {id: card.id})", () => {
  it("returns one row per ACTOR card, not per update act (the DISTINCT)", async () => {
    const s = storage!;
    expect((await updaterOf(s.counting, 100)).length).toBe(0);
    expect((await updaterOf(s.counting, 101)).map((r) => r.id)).toEqual([BOT]);
    expect((await updaterOf(s.counting, 102)).map((r) => r.id)).toEqual([BOT, JOHN]);
  });

  it("counts only UPDATE actions - create and delete do not make an updater", async () => {
    const s = storage!;
    expect((await updaterOf(s.counting, 103)).length).toBe(0);
  });

  it("drops a trashed ACTOR (c0.trash is false)", async () => {
    expect((await updaterOf(storage!.counting, 105)).length).toBe(0);
  });

  it("drops the whole join for a trashed HOST (c3.trash is false)", async () => {
    expect((await updaterOf(storage!.counting, 106)).length).toBe(0);
  });

  it("is read-only: the seam's own reader issues SELECTs only", async () => {
    const s = storage!;
    s.counting.reset();
    await s.engine.render("Twice Updated", "box_bottom");
    const wrote = s.counting.statements.filter(
      (sql) => !/^\s*SELECT/i.test(sql) && !/^\s*WITH/i.test(sql),
    );
    expect(wrote, wrote.join("\n")).toEqual([]);
    expect(
      s.counting.statements.some((sql) => sql.includes("JOIN card_acts") && sql.includes("JOIN card_actions")),
    ).toBe(true);
  });
});

describe("act-search seam: the render-time gate", () => {
  it("prepares the reader for exactly the views that reach updated_by", async () => {
    const s = storage!;
    for (const view of ["box", "box_bottom"]) {
      await s.engine.render("Twice Updated", view);
      const reader = s.engine.updaterRenderReader?.();
      expect(reader, `view ${view} must prepare the seam`).toBeDefined();
      expect(reader?.updaters.map((u) => u.cardId), `view ${view}`).toEqual([BOT]);
    }
    // :titled / :content / :core never reach updated_by, so they must not
    // run the query (the history seam's gate, same shape).
    for (const view of ["titled", "content", "core", "box_middle"]) {
      await s.engine.render("Twice Updated", view);
      expect(s.engine.updaterRenderReader?.(), `view ${view} must not prepare the seam`).toBeUndefined();
    }
  });

  it("does not leak one render's bundle into the next", async () => {
    const s = storage!;
    await s.engine.render("Twice Updated", "box_bottom");
    expect(s.engine.updaterRenderReader()).toBeDefined();
    await s.engine.render("Twice Updated", "titled");
    expect(s.engine.updaterRenderReader()).toBeUndefined();
  });

  it("is viewer-independent: the query carries no permission clause", async () => {
    const s = storage!;
    const bot = await s.engine.render("Twice Updated", "box_bottom");
    const anon = await anonEngine!.render("Twice Updated", "box_bottom");
    expect(anon).toBe(bot);
  });
});

describe("updated_by view bytes (history_board.rb:10-16, :76-99)", () => {
  /** The wrap div's inner HTML - box_bottom's other half (creator_credit)
   *  is pinned by the sibling bar/box suite. */
  function updatedBy(name: string): Promise<string> {
    return storage!.engine.render(name, "updated_by");
  }

  it("renders the EMPTY wrap when the card has no update act", async () => {
    expect(await updatedBy("Never Updated")).toBe(`<div class="text-muted"></div>`);
  });

  it("renders one link for one updater, however many update acts it has", async () => {
    expect(await updatedBy("Twice Updated")).toBe(
      `<div class="text-muted">Updated by ${link("Decko Bot")}</div>`,
    );
  });

  it("joins two updaters with to_sentence's two_words_connector", async () => {
    // Ruby: "Updated by <a>Decko Bot</a> and <a>Editor Two</a>"
    expect(await updatedBy("Two Updaters")).toBe(
      `<div class="text-muted">Updated by ${link("Decko Bot")} and ${link("Editor Two")}</div>`,
    );
  });

  it("renders the empty wrap when the only updater is trashed", async () => {
    expect(await updatedBy("Trashed Updater Host")).toBe(`<div class="text-muted"></div>`);
  });

  it("shows 2 links + an 'N others' link past max_count 3", async () => {
    // updater_links: number_of_updaters_to_show(5, 3) = 2, then
    // link_to_card(card.fetch(:editors), "3 others") and
    // to_sentence's last_word_connector ", and ". The href keeps the
    // reference's literal `*`, unescaped.
    expect(await updatedBy("Five Updaters")).toBe(
      `<div class="text-muted">Updated by ${link("Actor 0")}, ${link("Actor 1")}, and ` +
        `<a class="known-card" href="/Five_Updaters+*editors">3 others</a></div>`,
    );
  });

  it("reads as the box_bottom footer on the box path", async () => {
    const html = await storage!.engine.render("Twice Updated", "box_bottom");
    expect(html.endsWith(`<div class="text-muted">Updated by ${link("Decko Bot")}</div>`)).toBe(true);
  });
});
