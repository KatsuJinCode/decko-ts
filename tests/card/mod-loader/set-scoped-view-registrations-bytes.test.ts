// BYTE PINS for the set-scoped :content view of Right::HtmlMessage,
// rendered through the REAL mod manifest (card-mod-email) rather than a
// purpose-built stub, so the pin covers the registration wiring as well
// as the body.
//
// THE OTHER HALF of the pair with
// tests/card/mod-loader/view-set-scope-fallback.test.ts: that file proves a
// set-scoped registration does NOT reach a card outside the set; this one
// proves the registration DOES reach the cards that are in the set. Both
// are required - a narrowing that unregistered the views would pass the
// first and fail this one.
//
// The expected body is the gem's own template: card-mod-email-0.20.0
// set/right/html_message.rb:9-11 renders
// set/right/html_message/content_with_link.haml:1-5, and the assertion
// below spells those bytes out.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  bindModLoaderToEngine,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import { HTML_VIEWS } from "../../../src/card/render/views.js";
import type { ViewFn } from "../../../src/card/render/format.js";
import cardModEmail from "../../../src/card/mod-loader/mods/card-mod-email.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
/** The compiled-in shared body, captured BEFORE the load so the
 *  flat-table assertion can say "unchanged" rather than "absent" - the
 *  flat record is SEEDED from HTML_VIEWS (ModLoader's constructor
 *  default), so :content legitimately has a base value. */
let sharedContentBefore: ViewFn | undefined;
let sharedBarBottomBefore: ViewFn | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  sharedContentBefore = HTML_VIEWS["content"];
  sharedBarBottomBefore = HTML_VIEWS["bar_bottom"];
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  // The *html_message right card, then a compound card that carries it
  // (the junction row shape card-mod-api_key.test.ts:712-722 seeds).
  await seedCard(s, { id: 300, name: "*html_message", codename: "html_message", typeId: 13 });
  await seedCard(s, { id: 302, name: "Message Probe", typeId: 2, dbContent: "note body" });
  await seedCard(s, { id: 303, leftId: 302, rightId: 300, typeId: 2 });
  await seedCard(s, { id: 601, name: "Plain Probe", dbContent: "plain body" });
  loader = new ModLoader([{ manifest: cardModEmail }]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-email's set/right/html_message :content", () => {
  it("a card carrying the right renders the gem body", async () => {
    const s = storage!;
    // html_message.rb:9-11 `view :content do haml :content_with_link,
    // simple_core: super() end` over content_with_link.haml:1-5:
    //   .simple-core
    //     = simple_core
    //   .email-html-link.py-2.text-end
    //     %a{ href: path(view: :email_page, layout: :none) }
    //       %em sample email page
    // HAML byte conventions the engine already pins: static classes in
    // SOURCE order, single-quoted attrs, one newline per `= x` line.
    // The href: Card::Path#base makes `view:` a path SEGMENT
    // ("#{mark}/#{view}"), leaving only `layout: :none` for the query.
    //
    // The full string below is the gem's TEMPLATE shape. In the override,
    // Ruby's super() resolves one step up the format MRO to the BASE
    // :content view (the slot-wrapped content-view slot, voo inherited),
    // not the bare core - so the simple-core div wraps a standard
    // content-view slot div rather than raw card content. The interior
    // here is the fixture junction's own (empty) content. The set-class
    // chain keys on the LEFT card's type (TYPE-rich_text,
    // TYPE_PLUS_RIGHT-rich_text-Xhtml_message), so the same +*html
    // message field on a differently typed left card would key
    // differently. The href's mark is the engine's `urlKey()` spelling of
    // the compound name.
    // data-slot-id is randomized per render - normalized below.
    const html = await s.engine.render("Message Probe+*html_message", "content");
    const normalized = html.replace(
      /data-slot-id=(["'])[0-9a-fA-F]+\1/g,
      'data-slot-id="RANDOMIZED"',
    );
    expect(normalized).toBe(
      "<div class='simple-core'>\n" +
        '<div id="message_probe-Xhtml_message-content-view" class="card-slot content-view ALL ALL_PLUS TYPE-rich_text RSTAR RIGHT-Xhtml_message TYPE_PLUS_RIGHT-rich_text-Xhtml_message SELF-message_probe-Xhtml_message d0-card-content" data-card-id="303" data-card-name="Message Probe+*html_message" data-card-type-id="2" data-card-type-name="RichText" data-card-link-name="Message_Probe+*html_message" data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;content&quot;,&quot;show&quot;:[&quot;content&quot;]}"></div>\n' +
        "</div>\n" +
        "<div class='email-html-link py-2 text-end'>\n" +
        "<a href='/Message_Probe+*html_message/email_page?layout=none'>\n" +
        "<em>sample email page</em>\n" +
        "</a>\n" +
        "</div>\n",
    );
  });

  it("a plain card's :content is the shared card-slot wrapper under the same load", async () => {
    const s = storage!;
    const plain = await s.engine.render("Plain Probe", "content");
    expect(plain.startsWith('<div id="plain_probe-content-view" class="card-slot content-view')).toBe(true);
    expect(plain).not.toContain("simple-core");
  });

  it("the registration sits on the gem's set module, and NOT on the flat record", () => {
    const table = loader!.viewChainTable();
    const flat = loader!.viewsTable();
    // set/right/html_message.rb is NOT nested inside an anchor
    // directory, so the shortname here is the module a card's RIGHT
    // token names (safeKeyToModuleShortname, set-keys-to-modules.ts).
    const registered = table.viewFor("Right::HtmlMessage", "content");
    expect(registered).toBeDefined();
    // The scope property: a RIGHT-set view must not become the base
    // format class's method (set/format.rb:142-144 all_set? branch).
    expect(flat["content"]).not.toBe(registered);
    expect(flat["content"]).toBe(sharedContentBefore);
    expect(flat["bar_bottom"]).toBe(sharedBarBottomBefore);
  });

  it("the load report names the view (it is registered, not dropped)", () => {
    const report = loader!.load();
    expect(report.registeredViews).toContain("content");
  });
});
