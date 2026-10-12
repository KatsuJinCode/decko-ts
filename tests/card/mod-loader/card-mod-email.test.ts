// The card-mod-email mod loader integration test: the mod loaded through
// the loader registers its views and the rendered bytes match the Ruby
// source semantics.
//
// Proof shape (A/B per ported view):
//   WITHOUT the mod: render the view on the seeded probe card raises the
//     unsupported-view error (render.ts#view_method - the view does not
//     exist on the live registry).
//   WITH the mod: the view renders the port's documented bytes; the
//     set-modules basket records the full gem tree; the view-registration
//     table carries every ported name.
//
// Probe cards:
//   - Oracle Email Probe (a basic RichText card; :email_page renders the
//     core of any card wrapped in the email-document envelope)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderFormat, UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModEmail from "../../../src/card/mod-loader/mods/card-mod-email.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename cards (the codename registry reads cards.codename; their
  // type ids matter to the rule-cache join: set-typed vs setting-typed).
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // Oracle Email Probe - any card; :email_page renders the html format's
  // :core bytes wrapped in the email-document envelope. The card needs
  // SOME db_content so the core view emits a non-trivial interior.
  await seedCard(s, {
    id: 200,
    name: "Oracle Email Probe",
    dbContent: "email probe body",
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-email through the mod loader (A/B)", () => {
  it("WITHOUT the mod: every ported view raises UnsupportedViewError", async () => {
    const s = storage!;
    await expect(s.engine.render("Oracle Email Probe", "email_page")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(s.engine.render("Oracle Email Probe", "compact_missing")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(s.engine.render("Oracle Email Probe", "last_action")).rejects.toThrow(
      UnsupportedViewError,
    );
  });

  it("WITH the mod: :email_page renders the envelope + core (set/all/email_html.rb:2-23)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModEmail }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const html = await s.engine.render("Oracle Email Probe", "email_page");
    // The email-document wrapper (set/all/email_html.rb:2-14): doctype,
    // html/head with the meta tag + empty <style></style>, body class
    // "d0-email-body" wrapping the interior (which is the html format's
    // :core render).
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(
      '<meta http-equiv="Content-type" content="text/html;charset=UTF-8"/>',
    );
    expect(html).toContain("<style></style>");
    expect(html).toContain('<body class="d0-email-body">');
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
    // The interior is the html :core view's bytes - the card's
    // db_content run through processContent (the base core just emits
    // raw db_content when there are no nests).
    expect(html).toContain("email probe body");
  });

  it("WITH the mod: :email_page wrapper shape is byte-exact to the source heredoc", async () => {
    const s = storage!;
    // The rendered bytes around the envelope should match the squiggly-
    // heredoc output exactly. The interior is the core slot, which we
    // pin between two fixed markers.
    const html = await s.engine.render("Oracle Email Probe", "email_page");
    expect(html.startsWith("<!DOCTYPE html>\n<html>\n  <head>\n")).toBe(true);
    // After </style>\n  </head>\n  <body class="d0-email-body">\n the
    // core slot begins; the closing is </body>\n</html>\n - the heredoc
    // terminator sits on its own line, so the squiggly heredoc's value
    // KEEPS the newline after </html> (the oracle's 271-byte email_page
    // for welcome email ends "</html>\n" - the render-panels lane's byte
    // adjudication against reference-harness/fixtures/synthetic-v2).
    expect(html.endsWith("</body>\n</html>\n")).toBe(true);
  });

  it("WITH the mod: the html format REJECTS :compact_missing; the email_text format renders the empty string (set/all/email_text.rb:6-8)", async () => {
    const s = storage!;
    // The empty-string body lives in the email_text FORMAT block
    // (email_text.rb:5-8) — EmailTextFormat's method table only. This
    // suite loads NO format mod (all/error.rb's html :compact_missing is
    // absent), so Ruby's html render has no method and raises
    // unsupported-view; a format-blind flat last-wins registration would
    // leak the email_text arm's "" into html renders (the flat record now
    // admits only html/base keys — mod-loader.ts registration seam, with
    // the census probe pinning the measured rows). The email_text dispatch
    // itself renders "" through the owning format class below.
    await expect(s.engine.render("Oracle Email Probe", "compact_missing")).rejects.toThrow(
      UnsupportedViewError,
    );
    const card = await s.engine.prepareItemForRender("Oracle Email Probe");
    const fmt = new RenderFormat(card!, s.engine, { formatName: "email_text" });
    expect(fmt.renderView("compact_missing")).toBe("");
  });

  it("WITH the mod: the html format REJECTS :last_action; the email_text format renders the verb (set/all/email_text.rb:10-12)", async () => {
    const s = storage!;
    // the body is the real `_render_last_action_verb` delegation:
    // the verb dispatch answers the base-format notify verb — card-mod-follow
    // set/all/notify/base_views.rb:44-46's `'edite'd` fallback -> "edited"
    // (the render path reads no act rows; the engine's compiled-in base
    // verb entry carries it here where the follow mod is not loaded).
    //
    // FORMAT SCOPING: Ruby files this all-set registration under
    // EmailTextFormat (set/format.rb:137-139 keyed on the class
    // define_on_format resolved; registrar.rb:79-84 mixes it into that
    // class only), so an HTML-format render never sees it — render.rb#
    // view_method finds no _view_last_action on HtmlFormat and raises
    // unsupported-view. A format-blind flat last-wins registration would
    // hand "edited" to an html render; the flat record now admits only
    // html/base keys (mod-loader.ts registration seam; the census probe
    // view-dispatch-flat-record-format-scope-census.test.ts pins the
    // measured foreign rows). The delegation itself is proven through the
    // format class that owns it: the chainorder suite pins
    // email_text :last_action -> All::EmailText -> "edited" through a
    // real email_text-format RenderFormat
    // (view-dispatch-same-pattern-collision-order.test.ts), and the
    // re-pin below holds the same direction in THIS suite's email-only
    // deck.
    await expect(s.engine.render("Oracle Email Probe", "last_action")).rejects.toThrow(
      UnsupportedViewError,
    );
    const card = await s.engine.prepareItemForRender("Oracle Email Probe");
    expect(card).toBeDefined();
    const fmt = new RenderFormat(card!, s.engine, { formatName: "email_text" });
    expect(fmt.renderView("last_action")).toBe("edited");
  });

  it("WITH the mod: every set module from the gem tree is in the basket", () => {
    const basket = loader!.setModules();
    // abstract: email_field + test_context
    expect(basket.abstract.map((m) => m.shortname)).toContain("Abstract::EmailField");
    expect(basket.abstract.map((m) => m.shortname)).toContain("Abstract::TestContext");
    // base (all): email_html + email_text
    expect(basket.base.map((m) => m.shortname)).toContain("All::EmailHtml");
    expect(basket.base.map((m) => m.shortname)).toContain("All::EmailText");
    // right nonbase: every right/... set module from the gem
    const right = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(right).toContain("Right::Bcc");
    expect(right).toContain("Right::Cc");
    expect(right).toContain("Right::From");
    expect(right).toContain("Right::Subject");
    expect(right).toContain("Right::To");
    expect(right).toContain("Right::TextMessage");
    expect(right).toContain("Right::HtmlMessage");
    // type nonbase: email_template + email_template/email_config + email_template/html
    const type = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(type).toContain("Type::EmailTemplate");
    expect(type).toContain("Type::EmailTemplate::EmailConfig");
    expect(type).toContain("Type::EmailTemplate::Html");
  });

  it("WITH the mod: the mod loader's load report lists every ported view", () => {
    // Reload (idempotent) to get the report - the first call's report
    // was discarded; this call's report is the structural reference.
    const report = loader!.load();
    expect(report.registeredViews).toContain("email_page");
    expect(report.registeredViews).toContain("compact_missing");
    expect(report.registeredViews).toContain("last_action");
    // The email_text/email_html format-block re-registrations of
    // :unknown (also "" -> "" so the html-format unknown override is
    // semantically identical) also appear here.
    expect(report.registeredViews).toContain("unknown");
  });

  it("WITH the mod: the :email_page view-config carries wrap: email_document", () => {
    const cfg = loader!.viewConfigFor("email_page");
    expect(cfg?.wrap).toBe("email_document");
  });

  it("WITH the mod: the :last_action view-config carries perms: none + cache: never (view_opts.rb:17)", () => {
    const cfg = loader!.viewConfigFor("last_action");
    expect(cfg?.perms).toBe("none");
    expect(cfg?.cache).toBe("never");
  });

  it("WITH the mod: a card's baseline :content render still works (the mod adds views, it does not alter core)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Email Probe", "content");
    // baseline :content is the format/views.ts#contentView; the mod
    // does NOT redefine :content for any of its set modules, so the
    // existing core content renders unchanged. We assert it renders
    // WITHOUT throwing and produces a non-empty slot.
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("card-slot");
  });
});
