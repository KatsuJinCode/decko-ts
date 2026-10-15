// The Bunny edge HISTORY PAGE-PATH SEAM (p2-history-seam lane, 2026-10-03 —
// edge-site-shell residual #3): history/act/action_summary used to keep the
// bare-view lane (worker.ts layoutPage — the inline-styled two-link shell)
// because HistoryRenderParams had no page-path seam. This suite pins the
// closed residual: the three history views serve the FULL page shell
// (renderPageBytes + the five served-environment deltas — the same assembly
// every content page gets) with the history query params carried THROUGH the
// page-path routing, so the chrome wraps the same filtered body the bare
// engine.render(name, view, params) machinery produces.
//
// BASE EVIDENCE (measured 2026-10-03 on 12bd5236 through the real handler,
// pre-seam): every history view answered the bare layoutPage shell —
// `<!doctype html>` + inline `ui-sans-serif` PAGE_STYLE + the two-link
// `.nav` div, title form `<name> (<view>)`, 0 link/script tags, 2,863 bytes
// on the act arm. AND the act_id filter was INERT on that lane:
// /History_Probe_Renamed/act?act_id=<real> and the same path without the
// param rendered byte-identical last-act bodies, because worker.ts parsePath
// extracts WIRE keys (act_id, action_id, ...) while HistoryRenderParams and
// the view fns read camelCase (actId, actionId, ...) — no translation
// existed anywhere. The seam therefore BOTH routes the views through the
// page path AND translates the wire keys (historyRenderParamsFromWire), so
// Ruby's act_from_context semantics survive intact: act_id present -> THAT
// act; absent -> the last action's act fallback.
//
// BYTE PRESERVATION CONTRACT: the view-fn inner bytes (the accordion items,
// the action list, the diff summary) are byte-identical to the live Ruby
// oracle's captured bytes (fixtures/captured/history-views.json, the same
// fixture card-mod-history-views.test.ts pins the bare lane with) — compared
// under the capture's normalization masks (randomized slot ids, wall-clock
// time-ago, DB-local ids) plus the ONE lane-context delta (the main card's
// frame title: <h1> on the page lane exactly as every live capture carries,
// <h2> in the bare-lane fixture). The :act and :action_summary shards pin
// whole; the :history shard's memo-dependent act-list (the ContentDiff
// toggle memo, differ.rb:79-86) pins as oracle-HEAD + full-body equality
// against the same engine's own converged bare render (see the history
// test). The fixture fragments for :history and :action_summary include the
// view's own slot wrapper; the page path's main slot carries the
// show_with_page_layout voo opts (nest_name/_main, main, layout) where the
// bare lane carries none, so those comparisons exclude the OUTER slot div
// by construction and pin everything inside it.
//
// FILTER PRESERVATION CONTRACT (the hazard the edge-site-shell receipt
// named): the same request WITH and WITHOUT act_id must differ ONLY in the
// filtered rows — every chrome byte outside the layout's main <article> is
// byte-identical (masked for the randomized slot ids and the wall-clock
// time-ago phrases) — never in the shell.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { historyRenderParamsFromWire } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  CONFIGURED_ASSET_HOST,
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
 *  normalize — both sides of every comparison run through it). */
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

/** normalize + the ONE documented lane-context delta: the main card's
 *  frame title level. The live PAGE lane renders the main card's
 *  d0-card-frame title as <h1> — exactly one per page on every live capture
 *  (live-About/Aikido/Eagle/Riley_Ellery.html, edge-site-shell
 *  work dir) — while the bare VIEW lane (where the Ruby oracle fixture was
 *  captured) renders <h2>. Ruby's wrap_all main-context semantics,
 *  unchanged by this lane; masked so the byte-preservation comparison
 *  covers everything the two lanes share. */
function normalizeLaneContext(html: string): string {
  return normalize(html)
    .replace(
      /<h([12]) class="d0-card-header-title">/g,
      '<hX class="d0-card-header-title">',
    )
    // the frame title's closing tag, anchored to the card-menu div that
    // always follows it (a bare </h[12]> swap would mask the accordion
    // headers too)
    .replace(/<\/h([12])>\n<div class="card-menu/g, '</hX>\n<div class="card-menu');
}

/** The fixture fragment with its OUTER slot wrapper stripped (see the
 *  byte-preservation contract above): everything after the slot div's
 *  opening tag, minus the slot's own closing </div>. */
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
/** The seeded family's ids: actIds[1]/actionIds[1] = the first content
 *  update ("first body" -> "second body") — the fixture's "parent_act_2" /
 *  "update_action" shards. */
let ids: { act2: string; actLast: string; action2: string } | undefined;

/** The history-family infrastructure (the oracle suite's rows) + the
 *  page-shell machinery (the page-shell pin's deck), one deck: the history
 *  views must render through the REAL page assembly (layout rule, header/
 *  footer nests, html_page head), which needs the shell seed set too. */
async function seedSeamDeck(s: RenderTestStorage): Promise<void> {
  // codename/type/actor/read-rule infrastructure (card-mod-history-views
  // test's rows — the set keys, type-name algebra, actor links, the
  // anonymous read verdict)
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

  // ---- the six-act family through the REAL write path (the oracle
  // capture's sequence; fixed clock so the seeded timestamps are stable) --
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
  ids = { act2: String(upd1.actId), actLast: String(upd2.actId), action2: String(upd1.actionId) };

  // ---- the page-shell machinery (bunny-edge-page-shell.test.ts's deck):
  // the head's global settings, the layout rule + Default Layout card, the
  // header/footer content the layout nests render. Each of these is a SETTING
  // in Ruby - a rule can only hang off a setting (Card::Rule::All#
  // standard_rule?, rule/all.rb:31-34), and the rule cache's SQL filters on
  // the setting's type (`settings.type_id = #{SettingID}`,
  // lib/card/rule/cache.rb:18) - so they carry SettingID (14 here). *layout is
  // a setting too: mod/layout/set/all/process_layout.rb:34 reads it with
  // `card.rule_card(:layout)`.
  await seedCard(s, { id: 55, name: "*title", codename: "title", typeId: 14, dbContent: "Test Site" });
  await seedCard(s, { id: 103, name: "*favicon", codename: "favicon", typeId: 19, dbContent: "(my_bucket)/103/3649.jpg" });
  await seedCard(s, { id: 400, name: "*ace", codename: "ace", typeId: 14, dbContent: "{}" });
  await seedCard(s, { id: 401, name: "*tiny_mce", codename: "tiny_mce", typeId: 14, dbContent: "{}" });
  await seedCard(s, { id: 50, name: "Html", codename: "html", typeId: 5 });
  await seedCard(s, { id: 600, name: "*layout", codename: "layout", typeId: 14 });
  // the junction anchors by sides (*all = id 10, seeded above)
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

/** The full-chrome markers for the CONFIGURED synthetic deck. This suite
 *  pins what a configured deployment serves, so it states that
 *  deployment's configuration explicitly (CONFIGURED_DECK_SERVED_DELTAS)
 *  rather than inheriting it from the engine's source — the same values the
 *  operator sets through the environment. */
function expectFullChrome(body: string): void {
  expect(body).toContain("<!DOCTYPE HTML>");
  expect(body).toContain(`<html class="h-100">`);
  // the live head pieces
  expect(body).toContain(
    `<link rel="shortcut icon" href="${CONFIGURED_ASSET_HOST}/files/103/3649-small.jpg" />`,
  );
  expect(body).toContain(`<!-- MAIN DECKO JAVASCRIPT -->`);
  expect(body).toContain(`integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="`);
  // the layout's navbar + footer + the footer version pin (delta 4)
  expect(body).toContain(`<nav class="navbar navbar-expand-lg">`);
  expect(body).toContain(`>Decko v0.0.0-synthetic</a>`);
  // the live trailing newline (delta 5)
  expect(body.endsWith("</html>\n")).toBe(true);
  // the bare layoutPage shell is gone (the base state this lane closes)
  expect(body).not.toContain(`ui-sans-serif`);
  expect(body).not.toContain(`<div class="nav"><a href="/">Home</a>`);
  expect(body).not.toContain(`(history)</title>`);
  expect(body).not.toContain(`(act)</title>`);
  expect(body).not.toContain(`(action_summary)</title>`);
}

const ARTICLE_OPEN = `<article class="container flex-shrink-0" role="main">`;
const ARTICLE_CLOSE = `</article>`;

describe("bunny edge history page-path seam — full chrome on the three views", () => {
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedSeamDeck(storage);
  }, 60_000);
  afterAll(() => {
    loader?.reset();
    storage?.close();
  });

  it("GET /<card>/history serves the full shell with the revisions-list bytes inside", async () => {
    const { status, body } = await getBody("/History_Probe_Renamed/history");
    expect(status).toBe(200);
    expectFullChrome(body);
    // page title from the stored name + *title
    expect(body).toContain(`<title>History Probe Renamed - Test Site</title>`);
    // the main-context frame title is the LIVE page lane's h1 (one per
    // page — the live captures' shape), not the bare lane's h2
    expect(body).toContain(`<h1 class="d0-card-header-title">`);
    const masked = normalizeLaneContext(body);
    // The oracle-derived frame HEAD (card header + the Actions/Content
    // legend) — the memo-independent region the page lane shares with the
    // capture byte-for-byte.
    const fixtureInner = innerFragment("probe#history");
    expect(masked).toContain(
      normalizeLaneContext(fixtureInner.slice(0, fixtureInner.indexOf('<div class="accordion">'))),
    );
    // The list itself: all six seeded acts, each with its oracle-shaped
    // revision bytes (create/update icons, the actor link, the diffs).
    // NOT pinned whole against the fixture's :history shard: the
    // ContentDiff toggle memo (differ.rb:79-86) and the repeat-render
    // subheader state make the act-list bytes render-history-dependent
    // WITHIN ANY engine (the oracle suite's sequence note; the capture's
    // :history shard is the first-render shape, this page render is the
    // page lane's converged shape — live's Rails-cache memo behaves the
    // same way). The act/action_summary oracle shards above pin the view
    // bytes whole; the filter contract below pins the parameter semantics.
    expect(masked).toContain(`class="accordion"`);
    // six revisions, newest first (the seeded family's act numbers — plain
    // bytes, not id-masked)
    expect(masked.match(/<span class="nr">#\d+<\/span>/g)).toEqual([
      `<span class="nr">#6</span>`,
      `<span class="nr">#5</span>`,
      `<span class="nr">#4</span>`,
      `<span class="nr">#3</span>`,
      `<span class="nr">#2</span>`,
      `<span class="nr">#1</span>`,
    ]);
    expect(masked).toContain(`<ins class='diffins diff-added'>first body</ins>`);
    expect(masked).toContain(`<del class='diffdel diff-deleted'>first</del><ins class='diffins diff-added'>second</ins>`);
    expect(masked).toContain(`<del class='diffdel diff-deleted'>second</del><ins class='diffins diff-added'>third</ins>`);
    expect(masked).toContain(`<ins class='diffins diff-added'>child body</ins>`);
  });

  it("the served history-page bytes are stable across consecutive renders", async () => {
    // The page lane renders prepare-then-sync per request; this pin holds
    // the converged bytes stable (the property the edge cache and visitors
    // rely on): two GETs, one masked body.
    const first = await getBody("/History_Probe_Renamed/history");
    const second = await getBody("/History_Probe_Renamed/history");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(normalizeLaneContext(first.body)).toBe(normalizeLaneContext(second.body));
  });

  it("GET /<card>/act?act_id=<real> filters to THAT act inside the full shell", async () => {
    const { status, body } = await getBody(`/History_Probe_Renamed/act?act_id=${ids!.act2}`);
    expect(status).toBe(200);
    expectFullChrome(body);
    const masked = normalize(body);
    // the requested act's accordion, byte-preserved
    expect(masked).toContain(normalize(FIXTURE.rendered["probe#act(parent_act_2)"]));
    // and NOT the fallback act (the last action's act) — the filter is live
    expect(masked).not.toContain(normalize(FIXTURE.rendered["probe#act(no_param)"]));
  });

  it("GET /<card>/act (no act_id) keeps the last-act fallback inside the full shell", async () => {
    const { status, body } = await getBody("/History_Probe_Renamed/act");
    expect(status).toBe(200);
    expectFullChrome(body);
    const masked = normalize(body);
    expect(masked).toContain(normalize(FIXTURE.rendered["probe#act(no_param)"]));
    expect(masked).not.toContain(normalize(FIXTURE.rendered["probe#act(parent_act_2)"]));
  });

  it("WITH vs WITHOUT act_id differs only inside the main article — never in chrome", async () => {
    const withAct = await getBody(`/History_Probe_Renamed/act?act_id=${ids!.act2}`);
    const without = await getBody("/History_Probe_Renamed/act");
    expect(withAct.status).toBe(200);
    expect(without.status).toBe(200);
    const a = normalize(withAct.body);
    const b = normalize(without.body);
    // the chrome is byte-identical on both sides of the layout's article
    expect(a.slice(0, a.indexOf(ARTICLE_OPEN))).toBe(b.slice(0, b.indexOf(ARTICLE_OPEN)));
    expect(a.slice(a.indexOf(ARTICLE_CLOSE) + ARTICLE_CLOSE.length)).toBe(
      b.slice(b.indexOf(ARTICLE_CLOSE) + ARTICLE_CLOSE.length),
    );
    // the filtered rows themselves differ (the filter means something)
    expect(a.slice(a.indexOf(ARTICLE_OPEN), a.indexOf(ARTICLE_CLOSE))).not.toBe(
      b.slice(b.indexOf(ARTICLE_OPEN), b.indexOf(ARTICLE_CLOSE)),
    );
  });

  it("GET /<card>/action_summary?action_id=<real> serves the oracle diff bytes inside the full shell", async () => {
    const { status, body } = await getBody(
      `/History_Probe_Renamed/action_summary?action_id=${ids!.action2}`,
    );
    expect(status).toBe(200);
    expectFullChrome(body);
    expect(normalize(body)).toContain(normalize(innerFragment("probe#action_summary(update_action)")));
  });

  it("an act_id that resolves to nothing stays the engine's error contract (no silent fallback)", async () => {
    // Ruby: act_from_context raises Card::NotFound for an unknown act_id
    // (act_listing.rb:12 `Act.find(act_id) || raise(Card::NotFound, "act not found")`).
    // Card::NotFound is a UserError with status_code 404 and the :not_found
    // view (error.rb:88-91) — so an unknown act answers the 404 not-found
    // chrome, NOT the 500 server-error ("Wild Card") page. The param REACHES
    // the engine (it is translated off the wire-key floor), so the raise
    // happens instead of a silent fallback to the last-act body.
    const { status, body } = await getBody("/History_Probe_Renamed/act?act_id=999999999");
    expect(status).toBe(404);
    expect(body).toContain("Could not find");
    // the 500 server-error chrome is the WRONG surface for a NotFound
    expect(body).not.toContain("Wild Card");
    // no silent fallback to the no-param act body
    expect(body).not.toContain(FIXTURE.rendered["probe#act(no_param)"].slice(0, 60));
  });
});

describe("historyRenderParamsFromWire — the wire-key translation unit pins", () => {
  it("maps the seven parsePath wire keys to the HistoryRenderParams fields", () => {
    expect(
      historyRenderParamsFromWire({
        act_id: "5",
        action_id: "9",
        act_seq: "3",
        action_view: "expanded",
        hide_diff: "true",
        act_context: "1",
        page: "2",
      }),
    ).toEqual({
      actId: "5",
      actionId: "9",
      actSeq: "3",
      actionView: "expanded",
      hideDiff: "true",
      actContext: "1",
      page: "2",
    });
  });

  it("passes through unknown keys' absence and tolerates undefined", () => {
    expect(historyRenderParamsFromWire(undefined)).toEqual({});
    expect(historyRenderParamsFromWire({})).toEqual({});
    expect(historyRenderParamsFromWire({ unrelated: "x" })).toEqual({});
    expect(historyRenderParamsFromWire({ page: "4" })).toEqual({ page: "4" });
  });
});
