// view-dispatch-same-pattern-collision-order.test.ts - the same-pattern
// view-dispatch order pins: when TWO set modules under the SAME anchorless
// pattern token (ALL) register the same view, Ruby dispatches the
// LATER-registered module (card-1.110.0
// config/initializers/01_core_extensions/module.rb:15-22 add_set_modules
// includes the all-set module list in load order — each later `include`
// sits directly above the class, so the last-loaded module's method wins —
// fed by registrar.rb:42-49 process_base_modules + registrar.rb:79-84
// process_base_format_modules), and each all-set registration is visible
// only to the FORMAT CLASS it declared (set/format.rb:120-144: the format
// module is filed under its own format class; an email_text registration
// never enters the html method table).
//
// The collision census names the same-token collisions this file pins:
//   compact_missing {All::Error, All::EmailHtml, All::EmailText}
//   unknown         {All::Error, All::EmailHtml, All::EmailText}
//   last_action     {All::EmailText, All::History::Views}
//   one_line_content {All::Html::Views} (+ Type::Image on image cards)
//
// Resolution against the gems (which module Ruby wins with):
//   compact_missing/unknown  html       -> All::Error        (error.rb:1-8,
//                                bare `format do` -> the base format class;
//                                the email registrations are invisible to
//                                html renders)
//   compact_missing/unknown  email_text -> All::EmailText    (email_text.rb:
//                                2-8, included in EmailTextFormat itself,
//                                beating the root-class All::Error arm)
//   compact_missing/unknown  email_html -> All::EmailHtml    (email_html.rb:
//                                33-39, same shape)
//   last_action              html       -> All::History::Views (views.rb:3+
//                                46-53, `format :html`; the email_text
//                                registration is invisible to html)
//   last_action              email_text -> All::EmailText      (email_text.rb:
//                                10-13 — the real _render_last_action_verb
//                                delegation; the verb is card-mod-follow's
//                                base-format notify arm)
//   one_line_content         html       -> non-image cards: All::Html::Views'
//                                wrap arm (html/views.rb:29-32); image
//                                cards: the Type::Image icon core
//                                (card-mod-carrierwave-0.20.0
//                                set/type/image.rb:17-20 `format do view
//                                :one_line_content { _render_core size:
//                                :icon }` — a NONBASE set, visible only on
//                                Image cards). The carrierwave manifest
//                                registers it on Type::Image, so the
//                                all-set chain never carries image bytes.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import { RenderFormat } from "../../../src/card/render/format.js";
import { ActWriter } from "../../../src/card/history/write-path.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import cardModEmail from "../../../src/card/mod-loader/mods/card-mod-email.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";

function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="N"')
    .replace(
      /(less than a minute|less than \d+ seconds|\d+ seconds?|about \d+ (hours?|days?|months?|years?)|\d+ (minutes?|hours?|days?|months?|years?)) ago/g,
      "TIME_AGO ago",
    );
}

// ---------------------------------------------------------------------------
// one_line_content: All::Html::Views, and Type::Image on image cards
// (mod order: format before carrierwave — default-mod-deck.ts)
// ---------------------------------------------------------------------------

describe("one_line_content same-token order (format + carrierwave mods)", () => {
  let storage: RenderTestStorage | undefined;
  let loader: ModLoader | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    await seedCard(s, { id: 2, name: "RichText" });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
    await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    // the image type card (codename "image") so the render engine resolves
    // typeCode === "image" via peekNameForId (the carrierwave suite's
    // *logo recipe)
    await seedCard(s, { id: 19, name: "*image", codename: "image", typeId: 2 });
    // plain probe: the wrap arm's short body
    await seedCard(s, {
      id: 300,
      name: "Dispatch Order Plain Probe",
      typeId: 2,
      dbContent: "plain probe body",
    });
    // image probe: web-URL source (imageSource keeps web URLs raw)
    await seedCard(s, {
      id: 301,
      name: "Dispatch Order Image Probe",
      typeId: 19,
      dbContent: "https://example.com/dispatch-probe.png",
    });

    loader = new ModLoader([
      { manifest: cardModFormat },
      { manifest: cardModCarrierwave },
    ]);
    loader.load();
    bindModLoaderToEngine(storage, loader);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));
  }, 60_000);

  afterAll(() => {
    loader?.reset();
    storage?.close();
  });

  it("the ALL-token one_line_content chain is the format mod's alone; the image view sits on Type::Image", () => {
    // Ruby: carrierwave defines :one_line_content only on Type::Image
    // (set/type/image.rb:17-20), so the all-set chain is html/views.rb's
    // and an image card reaches the image view through its type token.
    const modules = loader!.viewChain("ALL", "one_line_content", "html").map(
      (e) => e.setModule,
    );
    expect(modules).toEqual(["All::Html::Views"]);
    expect(loader!.viewChain("ALL TYPE-image", "one_line_content", "html").map((e) => e.setModule)).toEqual([
      "Type::Image",
      "All::Html::Views",
    ]);
  });

  it("non-image cards render the all-set wrap arm", async () => {
    // html/views.rb:29-32 wrap arm bytes — no
    // image bytes may reach a non-image card.
    const html = await storage!.engine.render(
      "Dispatch Order Plain Probe",
      "one_line_content",
    );
    expect(html).toBe('<div class="text-muted">plain probe body</div>');
  });

  it("image-typed cards dispatch the Type::Image icon core (image.rb:18-20)", async () => {
    // set/type/image.rb:17-20 `format do view :one_line_content do
    // _render_core size: :icon end` — the img tag the icon-size core
    // renders for a web-URL source (web URLs stay raw; Rails image_tag
    // puts alt before src).
    const html = await storage!.engine.render(
      "Dispatch Order Image Probe",
      "one_line_content",
    );
    expect(html).toBe(
      '<img alt="Dispatch Order Image Probe" src="https://example.com/dispatch-probe.png" />',
    );
  });

  it("html-arm registrations do not leak into email_text chains", () => {
    // Ruby: both one_line_content registrations live on html-side format
    // classes; an EmailTextFormat card never sees them (the empty chain
    // falls to the flat base record, which carries no one_line_content
    // html arm either).
    const chain = loader!.viewChain("ALL", "one_line_content", "email_text");
    expect(chain).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// the trios: compact_missing/unknown {All::Error, All::EmailHtml,
// All::EmailText} and last_action {All::EmailText, All::History::Views}
// (mod order: format, email, history, follow — default-mod-deck.ts)
// ---------------------------------------------------------------------------

describe("compact_missing/unknown/last_action same-token order (format + email + history + follow mods)", () => {
  let storage: RenderTestStorage | undefined;
  let loader: ModLoader | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    // codename/type/actor infrastructure (the last_action bytes read the
    // actor link; the read rule feeds the permission pass)
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
    await seedCard(s, {
      id: 17,
      name: "*all+*read",
      leftId: 10,
      rightId: 16,
      typeId: 14,
      dbContent: "[[Anyone]]",
    });
    await seedCard(s, { id: 18, name: "Anyone", codename: "anyone", typeId: 2 });
    await seedReference(s, 17, 18, "anyone");

    // the two-act family through the REAL write path: create + content
    // update (the last act is an UPDATE act -> the :edited anchor arm)
    const T0 = Date.parse("2026-09-28T06:00:00.000Z");
    let ticks = 0;
    const clock = () => new Date(T0 + ticks++ * 1000);
    const request = () =>
      new ActWriter({ driver: s.counting, actorId: 1, ipAddress: "127.0.0.1", now: clock });

    const created = await request().createCard({
      name: "Dispatch Order Trio Probe",
      key: "dispatch_order_trio_probe",
      type_id: 2,
      db_content: "first body",
    });
    const state = async () =>
      (await s.counting.query("SELECT * FROM cards WHERE id = ?", [created.cardId]))
        .rows[0]!;
    const before = await state();
    const { cardFieldStateFromRow } = await import(
      "../../../src/card/history/write-path.js"
    );
    const beforeState = cardFieldStateFromRow(before as never);
    await request().updateCard({
      cardId: created.cardId,
      before: beforeState,
      after: { ...beforeState, db_content: "second body" },
    });

    loader = new ModLoader([
      { manifest: cardModFormat },
      { manifest: cardModEmail },
      { manifest: cardModHistory },
      // the composed-deck order (default-mod-deck.ts:96-120) continues with
      // follow AFTER history - the base-format notify verb registration
      // (all/notify/base_views) rides it
      { manifest: cardModFollow },
    ]);
    loader.load();
    bindModLoaderToEngine(storage, loader);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));
  }, 60_000);

  afterAll(() => {
    loader?.reset();
    storage?.close();
  });

  it("compact_missing dispatches the format-true module per format", () => {
    expect(loader!.viewChain("ALL", "compact_missing", "html")[0]!.setModule).toBe(
      "All::Error",
    );
    expect(
      loader!.viewChain("ALL", "compact_missing", "email_text")[0]!.setModule,
    ).toBe("All::EmailText");
    expect(
      loader!.viewChain("ALL", "compact_missing", "email_html")[0]!.setModule,
    ).toBe("All::EmailHtml");
  });

  it("unknown dispatches the format-true module per format", () => {
    expect(loader!.viewChain("ALL", "unknown", "html")[0]!.setModule).toBe(
      "All::Error",
    );
    expect(loader!.viewChain("ALL", "unknown", "email_text")[0]!.setModule).toBe(
      "All::EmailText",
    );
    expect(loader!.viewChain("ALL", "unknown", "email_html")[0]!.setModule).toBe(
      "All::EmailHtml",
    );
  });

  it("last_action dispatches History in html and EmailText in email_text", () => {
    // html: views.rb:3+46-53 (format :html) — the email_text registration
    // is invisible to HtmlFormat. email_text: email_text.rb:10-13 wins in
    // its own format class (the naive forward-order AND blanket-reversal
    // orders each get one of these two wrong).
    expect(loader!.viewChain("ALL", "last_action", "html")[0]!.setModule).toBe(
      "All::History::Views",
    );
    expect(loader!.viewChain("ALL", "last_action", "email_text")[0]!.setModule).toBe(
      "All::EmailText",
    );
  });

  it("html :last_action renders the history last-update span (views.rb:46-53)", async () => {
    // the corrected bytes: the html registration's span (verb anchor +
    // time-ago + actor link), NOT the email_text stub's "" — the byte
    // change the order fix lands.
    const html = normalize(
      await storage!.engine.render("Dispatch Order Trio Probe", "last_action"),
    );
    expect(html).toBe(
      '\n      <span class="last-update">\n        ' +
        '<a class="last-edited slotter" rel="nofollow" href="/Dispatch_Order_Trio_Probe?view=history" data-remote="true">edited</a>' +
        " TIME_AGO ago by\n        " +
        '<a class="known-card" href="/Decko_Bot">Decko Bot</a>\n      </span>\n    ',
    );
  });

  it("email_text :last_action dispatches All::EmailText and renders the verb (email_text.rb:10-13)", async () => {
    // the registered fn IS the real `_render_last_action_verb` (email_text.rb:
    // 12) - the underscore render (skip_perms: true, method_delegation.rb:
    // 6-18) delegating to the last_action_verb dispatch. The verb
    // EmailTextFormat sees is card-mod-follow's BASE-format notify arm
    // (set/all/notify/base_views.rb:44-46, `"#{notification_act&.
    // main_action&.action_type || 'edite'}d"`) - the bare `format do`
    // block lands on Card::Format itself (registrar.rb:79-84), which
    // EmailTextFormat inherits; the history html verb (views.rb:55-65) is
    // format-scoped away. The chain answers: own-format registrations
    // first (none for the verb in email_text), then the BASE tail
    // (mod-loader.ts viewChain) headed by the follow module - NOT the
    // flat record, whose format-blind last-wins serves history's
    // html verb, which is exactly what this pin must not answer. The
    // probe card's last act is an UPDATE act; the notify arm is act-blind
    // on the render path, so the bytes are 'edite'+'d' - NOT the history
    // anchor's edited-link and NOT the update-act's "updated".
    const entry = loader!.viewChain("ALL", "last_action", "email_text")[0]!;
    expect(entry.setModule).toBe("All::EmailText");
    const verbChain = loader!.viewChain("ALL", "last_action_verb", "email_text");
    expect(verbChain[0]!.setModule).toBe("All::Notify::BaseViews");
    expect(verbChain[0]!.viewFn({ fmt: undefined as never } as never)).toBe("edited");
    const card = await storage!.engine.prepareItemForRender("Dispatch Order Trio Probe");
    expect(card).toBeDefined();
    const fmt = new RenderFormat(card!, storage!.engine, { formatName: "email_text" });
    expect(fmt.renderView("last_action")).toBe("edited");
  });

  it("html :last_action_verb dispatches the history arm over the base arm (own format beats base)", () => {
    // the BOTH-DIRECTIONS guard, verb side: the history verb is the html
    // registration (views.rb:55-65) and the follow notify verb is the
    // base tail - Ruby's MRO puts HtmlFormat closer than Card::Format,
    // so the html arm heads the chain (the same shadowing the :last_action
    // pin below holds for the span).
    const htmlVerb = loader!.viewChain("ALL", "last_action_verb", "html").map((e) => e.setModule);
    expect(htmlVerb[0]).toBe("All::History::Views");
    expect(htmlVerb).toContain("All::Notify::BaseViews");
  });

  it("compact_missing renders the html title span and the email_text empty body", async () => {
    // html renders the text-muted title span (set/all/html/error.rb:33-35,
    // the compact substitution's :compact_missing fallback, mode.rb:73);
    // email_text keeps its own "" body (email_text.rb:6-8) through
    // the format-aware chain — the format correction moves the MODULE, and
    // the html body change is the only byte delta.
    expect(
      await storage!.engine.render("Dispatch Order Trio Probe", "compact_missing"),
    ).toBe('<span class="text-muted">Dispatch Order Trio Probe</span>');
    const emailTextEntry = loader!.viewChain(
      "ALL",
      "compact_missing",
      "email_text",
    )[0]!;
    expect(emailTextEntry.setModule).toBe("All::EmailText");
    expect(emailTextEntry.viewFn({ fmt: undefined as never } as never)).toBe("");
  });
});
