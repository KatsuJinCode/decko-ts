// The card-mod-format coverage recount's remaining missing views (the
// 2026-09-29 recount lists 21 for this mod; :smart_label landed on
// lane-follow2 9b980a5 and is covered by card-mod-format-smart-label.test.ts,
// and four stay unported with named reasons — see the receipt
// REPO_DIR an internal work log). This suite
// ports FIFTEEN:
//
//   set/self/home.rb:2-4          :home_url            (home_path's sibling)
//   set/all/text.rb:14-17         :text_without_nests  (base format)
//   set/all/html/frame.rb:2-7     :flash
//   set/all/html/views.rb:20-22   :short_content
//   set/all/html/views.rb:42-53   :content_panel
//   set/all/html/views.rb:34-40   :content_with_title
//   set/all/html/menu.rb:2-6      :menu_block
//   set/all/html/menu.rb:16-18    :edit_link
//   set/all/html/menu.rb:20-23    :edit_button
//   set/all/html/menu.rb:25-27    :full_page_link
//   set/all/html/menu.rb:29-31    :board_link
//   set/all/html/menu.rb:35-37    :help_link
//   set/all/demo.rb:8-12          :view_list
//   set/type/cardtype.rb:53-55    :configure_link      (Cardtype set)
//   set/all/html/error.rb:37-51   :conflict
//
// Every expectation is written from the GEM SOURCE
// (card-mod-format-0.20.0), line
// cited per test. The views whose bytes the live oracle deck pins are
// re-asserted against fixtures/captured/format-remaining-views.json by the
// oracle-pinned describe block; the source-derived pins stand on their own
// where no capture exists.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { setDeckEnvironment } from "../../../src/card/render/deck-origin.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  bindModLoaderToEngine,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import { ActWriter, cardFieldStateFromRow } from "../../../src/card/history/write-path.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";

const FIXTURE_PATH = "../../../fixtures/captured/format-remaining-views.json";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // actor/type/codename infrastructure (set keys, type names, actor links)
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
  // the *home card (self/home set anchor) - :home_url/:home_path dispatch
  await seedCard(s, { id: 21, name: "*home", codename: "home", typeId: 14 });
  // a Cardtype-typed type card + a probe card of that type (:configure_link);
  // Ruby's Cardtype card carries codename "cardtype" (bench-corpus id 5),
  // which the codename-keyed Type::Cardtype scope needs seeded
  await seedCard(s, { id: 22, name: "Cardtype", codename: "cardtype", typeId: 2 });
  await seedCard(s, { id: 23, name: "Cardtype Probe Type", typeId: 22 });
  // a Toggle-typed probe (:short_content's toggle arm reads the type core)
  await seedCard(s, { id: 24, name: "Toggle", typeId: 2 });

  // the probes the view renders read
  await seedCard(s, { id: 500, name: "Format Views Probe", dbContent: "probe body" });
  await seedCard(s, { id: 501, name: "Short Probe", dbContent: "1234567" });
  await seedCard(s, { id: 502, name: "Lines Probe", dbContent: "line1\nline2\nline3" });
  await seedCard(s, { id: 503, name: "Empty Probe", dbContent: "" });
  await seedCard(s, { id: 504, name: "Five Probe", dbContent: "12345" });
  await seedCard(s, { id: 505, name: "Nest Probe", dbContent: "before {{Nope Missing}} after" });
  await seedCard(s, {
    id: 506,
    name: "Text Probe",
    dbContent: "Caf&eacute; &amp; <b>bold</b> tail",
  });
  await seedCard(s, { id: 507, name: "Toggle Views Probe", typeId: 24, dbContent: "1" });
  // typed by the "Cardtype" CARD (id 22) - set/type/cardtype.rb's set is
  // "cards whose type card is Cardtype", the set keys walk the type card
  await seedCard(s, { id: 508, name: "Configure Probe", typeId: 22 });
  // Conflict Probe is created through the ActWriter below - the real write
  // path seeds the cards row together with its actions. Its id is the
  // AUTOINCREMENT id the deck hands out, which is above the stock read
  // substrate's ids (BOOTSTRAP_READ_SUBSTRATE_IDS, render-test-storage.ts), so
  // it is read back from createCard rather than assumed.

  // conflict's last_action/act data through the REAL write path (the
  // history-views suite's pattern): create + one content update.
  const T0 = Date.parse("2026-09-28T06:00:00.000Z");
  let ticks = 0;
  const clock = () => new Date(T0 + ticks++ * 1000);
  const request = () =>
    new ActWriter({ driver: s.counting, actorId: 1, ipAddress: "127.0.0.1", now: clock });
  const probeState = async (cardId: number) =>
    cardFieldStateFromRow(
      (await s.counting.query("SELECT * FROM cards WHERE id = ?", [cardId])).rows[0]! as never,
    );
  const created = await request().createCard({
    name: "Conflict Probe",
    key: "conflict_probe",
    type_id: 2,
    db_content: "first body",
  });
  const conflictProbeId = created.cardId;
  let before = await probeState(conflictProbeId);
  await request().updateCard({
    cardId: conflictProbeId,
    before,
    after: { ...before, db_content: "second body" },
  });

  // both manifests: cardModHistory (the :act render_act dispatches to +
  // the history seam) and cardModFormat (the manifest-registered views:
  // :flash :short_content :view_list :configure_link)
  loader = new ModLoader([
    { manifest: cardModHistory },
    { manifest: cardModFormat },
  ]);
  loader.load();
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  // the engine captures the default loader at construction - bind ours so
  // the chain-only (type/*, set/*) registrations resolve
  bindModLoaderToEngine(storage, loader);
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The capture's id/slot normalizations, applied to both sides of every
 *  comparison (the oracle-pinned block only). The revision-span digits are
 *  DB-local action ids. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/act-id-\d+/g, "act-id-N")
    .replace(/revision-\d+/g, "revision-N")
    .replace(/act_id=\d+/g, "act_id=N")
    .replace(/action_id=\d+/g, "action_id=N")
    .replace(/(new-current-revision-id">)\d+/g, "$1N")
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="N"')
    .replace(
      /(less than a minute|less than \d+ seconds|\d+ seconds?|about \d+ (hours?|days?|months?|years?)|\d+ (minutes?|hours?|days?|months?|years?)) ago/g,
      "TIME_AGO ago",
    );
}

const PROBE = "Format Views Probe";

describe("card-mod-format remaining views — source-derived pins", () => {
  it("home_url is the requestless deck root with no configured origin (set/self/home.rb:2-4; card_url '' = Env.origin + root, Env.origin empty unless deck_origin is set)", async () => {
    const s = storage!;
    expect(await s.engine.render("*home", "home_url")).toBe("/");
  });

  it("home_url carries the configured deck origin (set/self/home.rb:2-4 card_url ''; serializable.rb:20-22 Env.origin = deck_origin)", async () => {
    const s = storage!;
    setDeckEnvironment({ origin: "http://deck.example" });
    try {
      expect(await s.engine.render("*home", "home_url")).toBe("http://deck.example/");
    } finally {
      setDeckEnvironment(undefined);
    }
  });

  it("home_url stays set-scoped like home_path — any other card raises the unsupported-view error", async () => {
    const s = storage!;
    await expect(s.engine.render(PROBE, "home_url")).rejects.toThrow(UnsupportedViewError);
  });

  it("text_without_nests drops nests and keeps the surrounding literals (set/all/text.rb:14-17 + 8-13: content_object.strip_nests)", async () => {
    const s = storage!;
    expect(await s.engine.render("Nest Probe", "text_without_nests")).toBe("before  after");
  });

  it("text_without_nests strips tags and decodes entities (text.rb:4-6 to_text: HTMLEntities.decode strip_tags(html))", async () => {
    const s = storage!;
    expect(await s.engine.render("Text Probe", "text_without_nests")).toBe(
      "Café & bold tail",
    );
  });

  it("flash is the empty string headless (frame.rb:2-7: params[:flash] || Env.success.flash — no env surface, focal gate unreachable)", async () => {
    const s = storage!;
    expect(await s.engine.render(PROBE, "flash")).toBe("");
  });

  it("short_content counts characters for a one-line body (views.rb:20-22 + 112-122: content.size <= 5 ? content : N characters)", async () => {
    const s = storage!;
    expect(await s.engine.render("Short Probe", "short_content")).toBe(
      '<div class="text-muted">7 characters</div>',
    );
  });

  it("short_content counts lines once the body spans two newlines (views.rb:118-121)", async () => {
    const s = storage!;
    expect(await s.engine.render("Lines Probe", "short_content")).toBe(
      '<div class="text-muted">3 lines</div>',
    );
  });

  it("short_content renders empty bodies as 'empty' and passes <=5-char bodies through (views.rb:113-117)", async () => {
    const s = storage!;
    expect(await s.engine.render("Empty Probe", "short_content")).toBe(
      '<div class="text-muted">empty</div>',
    );
    expect(await s.engine.render("Five Probe", "short_content")).toBe(
      '<div class="text-muted">12345</div>',
    );
  });

  it("short_content on a Toggle reads the toggle core (toggle.rb:35-37 short_content override: render_core)", async () => {
    const s = storage!;
    const html = await s.engine.render("Toggle Views Probe", "short_content");
    // the engine's toggle core renders the Ruby locale bytes for content
    // "1" ("yes" - format_toggle_yes; the views.ts toggle core emitter)
    expect(html).toBe('<div class="text-muted">yes</div>');
  });

  it("edit_link is the menu's edit anchor byte-for-byte (menu.rb:16-18 -> 151-154 + 167-179: link_to_view :edit, edit_link_opts modal: :lg)", async () => {
    const s = storage!;
    const editLink = await s.engine.render(PROBE, "edit_link");
    expect(editLink).toBe(
      '<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip"' +
        ' data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg"' +
        ` href="/Format_Views_Probe/edit" data-remote="true"><i class="notranslate material-icons">edit</i> </a>`,
    );
    // the pinned :menu renders the same bytes as its second member
    const menu = await s.engine.render(PROBE, "menu");
    expect(menu).toContain(editLink);
  });

  it("edit_button is the btn-outline-primary edit anchor (menu.rb:20-23: voo.edit != :inline -> :edit)", async () => {
    const s = storage!;
    expect(await s.engine.render(PROBE, "edit_button")).toBe(
      '<a rel="nofollow" class="btn btn-sm btn-outline-primary me-2 slotter"' +
        ` href="/Format_Views_Probe/edit" data-remote="true">Edit</a>`,
    );
  });

  it("full_page_link is the full-page anchor with the known-card class (menu.rb:25-27 + 119-122: link_to_card full_page_card)", async () => {
    const s = storage!;
    const full = await s.engine.render(PROBE, "full_page_link");
    expect(full).toBe(
      '<a class="full-page-link known-card" href="/Format_Views_Probe">' +
        '<i class="notranslate material-icons">open_in_full</i> </a>',
    );
  });

  it("board_link carries modal-replace slotter mode (menu.rb:29-31 + 85-95: in_modal defaults true -> data-slotter-mode)", async () => {
    const s = storage!;
    expect(await s.engine.render(PROBE, "board_link")).toBe(
      '<a rel="nofollow" class="board-link slotter" title="Advanced" data-bs-toggle="tooltip"' +
        ' data-bs-placement="bottom" data-slotter-mode="modal-replace"' +
        ` href="/Format_Views_Probe/board" data-remote="true"><i class="notranslate material-icons">space_dashboard</i> </a>`,
    );
  });

  it("help_link is the menu's help popover anchor byte-for-byte (menu.rb:35-37 + 97-107: help_popover_opts + add_class _card-menu-popover)", async () => {
    const s = storage!;
    const helpLink = await s.engine.render(PROBE, "help_link");
    const menu = await s.engine.render(PROBE, "menu");
    // menu.rb:54-56 menu_items order: [help_link, edit_link, board_link];
    // the menu's wrap_with(:div) precedes the help anchor
    expect(menu).toContain(helpLink);
    expect(helpLink).toContain('class="help-link ps-1 _popover_link _card-menu-popover"');
    expect(helpLink).toContain('data-bs-toggle="popover"');
  });

  it("menu_block wraps the menu and &nbsp; in the menu-block div (menu.rb:2-6)", async () => {
    const s = storage!;
    const menu = await s.engine.render(PROBE, "menu");
    expect(await s.engine.render(PROBE, "menu_block")).toBe(
      `<div class="menu-block position-relative py-2">${menu}
&nbsp;</div>`,
    );
  });

  it("view_list renders the seven demo views in order, h3-headed, p-wrapped, no separators (demo.rb:8-16)", async () => {
    const s = storage!;
    const html = await s.engine.render(PROBE, "view_list");
    const views = ["content", "titled", "labeled", "bar", "box", "open", "closed"];
    let rest = html;
    for (const v of views) {
      const prefix = `<p><h3>${v}</h3>`;
      expect(rest.startsWith(prefix), `expected ${prefix} at ${rest.slice(0, 40)}`).toBe(true);
      const closeAt = rest.indexOf("</p>");
      expect(closeAt).toBeGreaterThan(prefix.length);
      rest = rest.slice(closeAt + 4);
    }
    expect(rest).toBe("");
  });

  it("content_panel wraps menu+core in card-body inside the class-upped slot (views.rb:42-53)", async () => {
    const s = storage!;
    const html = await s.engine.render(PROBE, "content_panel");
    // before(:content_panel): prepare_content_slot + class_up "card-slot", "card"
    // -> classy appends class_ups at the END of the slot class list
    expect(html).toContain('class="card-slot content_panel-view');
    expect(html).toContain(' d0-card-content card"');
    const menu = await s.engine.render(PROBE, "menu");
    const core = await s.engine.render(PROBE, "core");
    expect(html).toContain(`<div class="card-body">${menu}
${core}</div>`);
  });

  it("content_with_title carries the text-format core in the slot title attribute (views.rb:34-40: wrap true, title: card.format(:text).render_core)", async () => {
    const s = storage!;
    const html = await s.engine.render(PROBE, "content_with_title");
    expect(html).toContain('class="card-slot content_with_title-view');
    expect(html).toContain(' d0-card-content"');
    expect(html).toContain('title="probe body"');
    const menu = await s.engine.render(PROBE, "menu");
    const core = await s.engine.render(PROBE, "core");
    expect(html).toContain(`${menu}
${core}</div>`);
  });

  it("configure_link builds the rules-board link for a Cardtype-typed card (cardtype.rb:53-55 + 65-75)", async () => {
    const s = storage!;
    const html = await s.engine.render("Configure Probe", "configure_link");
    expect(html).toBe(
      '<a class="configure-type-link ms-3 known-card"' +
        ' href="/Configure_Probe/board?board%5Btab%5D=rules_tab&amp;set=Configure+Probe%2B%2Atype">' +
        '<span class="card-title" title="Configure Configure Probes">Configure Configure Probes</span></a>',
    );
  });

  it("configure_link stays Cardtype-scoped — other types raise the unsupported-view error", async () => {
    const s = storage!;
    await expect(s.engine.render(PROBE, "configure_link")).rejects.toThrow(UnsupportedViewError);
  });

  it("conflict wraps the warning alert, revision id, actor link and the act in the error-view slot (error.rb:37-51)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Conflict Probe", "conflict"));
    expect(html).toContain('class="card-slot conflict-view');
    expect(html).toContain('error-view"');
    expect(html).toContain('<div class="alert alert-warning" role="alert">');
    expect(html).toContain("<strong>Conflict!</strong>");
    expect(html).toContain('<span class="new-current-revision-id">');
    expect(html).toContain(" has also been making changes.</div>");
    expect(html).toContain("<div>Please examine below, resolve above, and re-submit.</div>");
    expect(html).toContain('<a class="known-card" href="/Decko_Bot">Decko Bot</a>');
    // render_act: the act accordion item resolves the card's last act
    expect(html).toContain("act-id-N");
  });
});

describe("card-mod-format remaining views — live-oracle pins", () => {
  it("matches the captured bytes for every captured view", async () => {
    const FIXTURE = JSON.parse(
      readFileSync(fileURLToPath(new URL(FIXTURE_PATH, import.meta.url)), "utf8"),
    ) as { rendered: Record<string, string> };
    const s = storage!;
    const checks: Array<[string, string, string]> = [
      [PROBE, "edit_link", `${PROBE}#edit_link`],
      [PROBE, "edit_button", `${PROBE}#edit_button`],
      [PROBE, "full_page_link", `${PROBE}#full_page_link`],
      [PROBE, "board_link", `${PROBE}#board_link`],
      [PROBE, "help_link", `${PROBE}#help_link`],
      [PROBE, "menu_block", `${PROBE}#menu_block`],
      [PROBE, "content_panel", `${PROBE}#content_panel`],
      [PROBE, "content_with_title", `${PROBE}#content_with_title`],
      ["Short Probe", "short_content", "Short Probe#short_content"],
      ["Configure Probe", "configure_link", "Configure Probe#configure_link"],
      // excluded: Conflict Probe#conflict - every conflict byte matches the
      // capture EXCEPT the nested :action_summary's expand toggle: the TS
      // render carries the toggle, the Ruby cold capture does not. The
      // toggle flag (summary_diff_omits_content?, actions.rb:65) reads the
      // engine-lifetime diff memo the history port owns - its own receipt
      // documents the same toggle as capture-order-dependent
      // ("differ.rb:79-86 ivar lives on the cached Action record"). The
      // cold/warm divergence inside the conflict render is that port's
      // open unit, named here rather than masked; the conflict view's own
      // bytes (slot, class-ups, alert, revision span, actor link, act
      // composition) are pinned by the source-derived test above.
      // view_list excluded: Ruby renders its arms with show: :menu (the
      // captured arms carry visible menus + the show-list slot JSON); the
      // engine has no show-option render seam, so the port renders the
      // arms at default visibility (disclosed in the manifest comment).
      // home_url excluded: the capture masks the host (the documented
      // no-host divergence), and the source-derived pin above covers it.
    ];
    const mismatches: string[] = [];
    for (const [card, view, key] of checks) {
      const expected = FIXTURE.rendered[key];
      if (expected === undefined) {
        mismatches.push(`${key}: fixture arm missing`);
        continue;
      }
      const actual = normalize(await s.engine.render(card, view));
      if (actual !== normalize(expected)) {
        mismatches.push(`${key}:\n  exp ${JSON.stringify(normalize(expected))}\n  act ${JSON.stringify(actual)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
