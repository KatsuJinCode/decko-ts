// The :action_expanded and :action_summary history views at the two
// addresses the enumeration audit's gaps name
// (docs/runs/enumeration-audit-2026-10-25.md, A1 rows `:action_expanded`
// and `:action_summary`):
//
//   /History_Probe_Renamed/action_expanded?action_id=N&look_in_trash=true
//   /History_Probe_Renamed/action_summary?action_id=N&look_in_trash=true
//
// The capture bytes are the spec: fixtures/captured/history-views.json
// records both views' renders for the six-act probe family (the same
// fixture card-mod-history-views.test.ts pins on the bare engine lane and
// bunny-edge-engine-history-page-seam.test.ts pins inside the served
// page shell). What neither pin covers is the ADDRESS the audit names:
// both views requested through the page path WITH the toggle's
// look_in_trash=true query param, the exact query string the captured
// toggle anchors emit (card-mod-history actions.rb:58-79:
// `href="/<card>/action_<other>?action_id=N&amp;look_in_trash=true"`).
//
// The harness is the page-seam suite's (the same seeded six-act family
// through the real ActWriter write path, the same served shell), so the
// pins below are the captured inner bytes inside the full page chrome.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  CONFIGURED_DECK_SERVED_DELTAS,
} from "./fixtures/configured-deck-served-deltas.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../src/card/mod-loader.js";
import cardModHistory from "../../src/card/mod-loader/mods/card-mod-history.js";
import { ActWriter, cardFieldStateFromRow } from "../../src/card/history/write-path.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../fixtures/captured/history-views.json", import.meta.url)),
    "utf8",
  ),
) as { rendered: Record<string, string> };

/** The capture's normalization masks (card-mod-history-views.test.ts's
 *  normalize; both sides of every comparison run through it). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/act-id-\d+/g, "act-id-N")
    .replace(/revision-\d+/g, "revision-N")
    .replace(/act_id=\d+/g, "act_id=N")
    .replace(/action_id=\d+/g, "action_id=N")
    .replace(/action_id&quot;:\d+/g, "action_id&quot;:N")
    .replace(/revert_actions%5B%5D=\d+/g, "revert_actions%5B%5D=N")
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="N"')
    .replace(
      /(less than a minute|less than \d+ seconds|\d+ seconds?|about \d+ (hours?|days?|months?|years?)|\d+ (minutes?|hours?|days?|months?|years?)) ago/g,
      "TIME_AGO ago",
    );
}

/** The fixture fragment with its OUTER slot wrapper stripped (the page
 *  seam suite's helper verbatim: the page path's main slot carries the
 *  show_with_page_layout voo opts where the bare lane carries none, so
 *  the comparison excludes the outer slot div by construction). */
function innerFragment(key: string): string {
  const fragment = FIXTURE.rendered[key];
  const openEnd = fragment.indexOf(">") + 1;
  return fragment.slice(openEnd, fragment.length - "</div>".length);
}

function edgeGet(pathAndQuery: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathAndQuery}`);
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
/** The seeded family's ids: action2 = the first content update
 *  ("first body" -> "second body"), the action the fixture's
 *  update_action shards rendered. */
let ids: { action2: string } | undefined;

/** The six-act family through the REAL write path (the page-seam suite's
 *  seedSeamDeck: the history rows plus the page-shell machinery the
 *  served assembly needs). */
async function seedSeamDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "Decko Bot", typeId: 2 });
  await seedCard(s, { id: 2, name: "RichText" });
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
  await seedCard(s, { id: 19, name: "child", typeId: 2 });

  const T0 = Date.parse("2026-09-28T06:00:00.000Z");
  let ticks = 0;
  const clock = () => new Date(T0 + ticks++ * 1000);
  const request = () =>
    new ActWriter({ driver: s.counting, actorId: 1, ipAddress: "127.0.0.1", now: clock });

  const created = await request().createCard({
    name: "History Probe",
    key: "history_probe",
    type_id: 2,
    db_content: "first body",
  });
  const probeId = created.cardId;
  const probeState = async () =>
    cardFieldStateFromRow(
      (await s.counting.query("SELECT * FROM cards WHERE id = ?", [probeId])).rows[0]! as never,
    );
  let before = await probeState();
  const upd1 = (await request().updateCard({
    cardId: probeId,
    before,
    after: { ...before, db_content: "second body" },
  }))!;
  before = await probeState();
  await request().updateCard({
    cardId: probeId,
    before,
    after: { ...before, name: "History Probe Renamed" },
    key: "history_probe_renamed",
  });
  before = await probeState();
  const upd2 = (await request().updateCard({
    cardId: probeId,
    before,
    after: { ...before, db_content: "<p>third body with inclusion {{History Probe Renamed+child}}</p>" },
  }))!;
  const childCreated = await request().createCard({
    name: null,
    key: null,
    type_id: 2,
    db_content: "child body",
    left_id: probeId,
    right_id: 19,
  });
  await s.counting.query(
    "INSERT INTO card_actions (card_id, card_act_id, action_type, draft) VALUES (19, ?, 0, 0)",
    [childCreated.actId],
  );
  const childId = childCreated.cardId;
  const childState = async () =>
    cardFieldStateFromRow(
      (await s.counting.query("SELECT * FROM cards WHERE id = ?", [childId])).rows[0]! as never,
    );
  const childBefore = await childState();
  await request().updateCard({
    cardId: childId,
    before: childBefore,
    after: { ...childBefore, db_content: "child body v2" },
  });
  await seedReference(s, probeId, childId, "history_probe_renamed+child", "I");
  ids = { action2: String(upd1.actionId) };
  void upd2;

  // the page-shell machinery (the page-seam suite's deck: layout rule,
  // Default Layout, header/footer nests, head settings)
  await seedCard(s, { id: 55, name: "*title", codename: "title", typeId: 14, dbContent: "Test Site" });
  await seedCard(s, { id: 103, name: "*favicon", codename: "favicon", typeId: 19, dbContent: "(my_bucket)/103/3649.jpg" });
  await seedCard(s, { id: 400, name: "*ace", codename: "ace", typeId: 14, dbContent: "{}" });
  await seedCard(s, { id: 401, name: "*tiny_mce", codename: "tiny_mce", typeId: 14, dbContent: "{}" });
  await seedCard(s, { id: 50, name: "Html", codename: "html", typeId: 5 });
  await seedCard(s, { id: 600, name: "*layout", codename: "layout", typeId: 14 });
  await seedCard(s, { id: 22746, name: "*all+*layout", leftId: 10, rightId: 600, typeId: 14, dbContent: "Default Layout" });
  await seedCard(s, {
    id: 22747,
    name: "Default Layout",
    typeId: 50,
    dbContent:
      `<body class="d-flex flex-column h-100">\n` +
      `  <header>{{:header|core}}</header>\n` +
      `  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n` +
      `  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n` +
      `</body>`,
  });
  await seedCard(s, {
    id: 22748,
    name: "*header",
    codename: "header",
    typeId: 50,
    dbContent: `<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>`,
  });
  await seedCard(s, {
    id: 22749,
    name: "*footer",
    codename: "footer",
    typeId: 50,
    dbContent: `<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>`,
  });

  loader = new ModLoader([{ manifest: cardModHistory }]);
  loader.load();
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}

async function getBody(pathAndQuery: string): Promise<{ status: number; body: string }> {
  const res = await handleEngineRequest(edgeGet(pathAndQuery), {
    fetcher: storage!.fetcher,
    render: storage!.engine,
    servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
  });
  return { status: res.status, body: await res.text() };
}

/** The captured toggle anchor bytes, verbatim from the fixture's own
 *  rendered fragments: each view's body carries the sibling view's
 *  ADDRESS, query string included (actions.rb:58-79). */
const EXPANDED_TOGGLE =
  '<a rel="nofollow" class="revision-N float-end slotter" ' +
  'href="/History_Probe_Renamed/action_summary?action_id=N&amp;look_in_trash=true" ' +
  'data-remote="true"><i class="notranslate material-icons">expand_less</i></a>';

describe("the :action_expanded and :action_summary views at the captured addresses", () => {
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedSeamDeck(storage);
  }, 60_000);
  afterAll(() => {
    loader?.reset();
    storage?.close();
  });

  it("GET /History_Probe_Renamed/action_expanded?action_id=N&look_in_trash=true serves the captured expanded diff bytes", async () => {
    const { status, body } = await getBody(
      `/History_Probe_Renamed/action_expanded?action_id=${ids!.action2}&look_in_trash=true`,
    );
    expect(status).toBe(200);
    expect(normalize(body)).toContain(normalize(innerFragment("probe#action_expanded(update_action)")));
  });

  it("GET /History_Probe_Renamed/action_summary?action_id=N&look_in_trash=true serves the captured summary diff bytes", async () => {
    const { status, body } = await getBody(
      `/History_Probe_Renamed/action_summary?action_id=${ids!.action2}&look_in_trash=true`,
    );
    expect(status).toBe(200);
    expect(normalize(body)).toContain(normalize(innerFragment("probe#action_summary(update_action)")));
  });

  it("the expanded body carries the captured toggle anchor, whose href IS the summary address (query string included)", async () => {
    const { status, body } = await getBody(
      `/History_Probe_Renamed/action_expanded?action_id=${ids!.action2}&look_in_trash=true`,
    );
    expect(status).toBe(200);
    expect(normalize(body)).toContain(EXPANDED_TOGGLE);
  });

  it("look_in_trash=true is byte-inert at both addresses (the captured bytes were recorded without it, and the views do not read it)", async () => {
    const summaryWith = await getBody(
      `/History_Probe_Renamed/action_summary?action_id=${ids!.action2}&look_in_trash=true`,
    );
    const summaryWithout = await getBody(
      `/History_Probe_Renamed/action_summary?action_id=${ids!.action2}`,
    );
    expect(summaryWith.status).toBe(200);
    expect(summaryWithout.status).toBe(200);
    expect(normalize(summaryWith.body)).toBe(normalize(summaryWithout.body));

    const expandedWith = await getBody(
      `/History_Probe_Renamed/action_expanded?action_id=${ids!.action2}&look_in_trash=true`,
    );
    const expandedWithout = await getBody(
      `/History_Probe_Renamed/action_expanded?action_id=${ids!.action2}`,
    );
    expect(expandedWith.status).toBe(200);
    expect(expandedWithout.status).toBe(200);
    expect(normalize(expandedWith.body)).toBe(normalize(expandedWithout.body));
  });
});
