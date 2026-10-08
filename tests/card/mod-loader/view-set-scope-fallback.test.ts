// THE REGRESSION GUARD for the measured dispatch defect: registering a
// set-scoped mod view corrupted rendering DECK-WIDE.
//
// MEASURED (mod-a batch 3, re-measured here): with card-mod-email
// loaded and set/right/html_message's :content registered, a plain
// RichText card's :content flipped from the shared card-slot wrapper
//   <div id="plain_probe-content-view" class="card-slot content-view ...">plain body</div>
// to the email's
//   <div class='simple-core'>...
// :content is the engine's main content renderer, so ONE registration
// line broke every card.
//
// RUBY TRUTH, and why the fallback was the bug (card-1.110.0):
//   Card::Set::Format#register_set_format (set/format.rb:133-144) branches
//   on all_set?:
//     - ALL set  -> Set.modules[:base_format], then
//       Card::Set::Registrar#process_base_format_modules (registrar.rb:79-84)
//       does `format_class.add_set_modules`, i.e. the module is mixed into
//       the BASE format class EVERY card's format inherits from. Its views
//       are therefore visible to every card - correctly flat.
//     - nonbase set -> Set.modules[:nonbase_format][klass][shortname]. A
//       card picks those up ONLY through
//       Card::Set::Pattern::All#set_format_modules (pattern/all.rb:49-55):
//         concrete_patterns[0..-2].reverse.map { |p| p.format_module_list klass }
//       and Pattern::Base#format_module_list (pattern/base.rb:35-38) is
//       `modules[:nonbase_format][klass][module_key]` - the card's OWN
//       pattern module keys. A plain RichText card's Type pattern has
//       module_key "Type::RichText", so "Type::BootswatchSkin::HtmlFormat"
//       and "Right::HtmlMessage::HtmlFormat" are NEVER in its list.
//   So Ruby on a chain-miss resolves to the BASE format class, and the
//   base format class carries the compiled-in views plus the set/all/*
//   ones - never a set/type/*, set/right/* or set/abstract/* view.
//
// THE TWO FALLBACKS THAT BROKE IT, both named here because only the
// second one actually fired at render time (measured, see the two
// assertions that name them):
//   1. SetModuleViewTable#chainFor's empty-chain fallback
//      (src/card/mod-loader/mod-registrar.ts) said "the only matches are
//      from set/all/* modules" while the code returned EVERY registering
//      module. Not on the live render path - ModLoader#viewChain does not
//      call chainFor - but it is the same defect and the same Ruby
//      violation, so it is narrowed too.
//   2. ModLoader.load's flat last-wins registration
//      (src/card/mod-loader.ts) wrote EVERY set module's view into the
//      shared HTML_VIEWS base-format record, and RenderEngine#
//      computeResolvedView falls through to that record when the chain is
//      empty. THIS is what flipped the plain card's :content.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  setDefaultModLoader,
} from "../../../src/card/mod-loader.js";
import { HTML_VIEWS } from "../../../src/card/render/views.js";
import type { ViewFn } from "../../../src/card/render/format.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import { normalizeSlotIds } from "../../../src/testing/diff.js";

// Two purpose-built manifests carrying the three gem views at the set
// paths the gems declare. Bodies are the gems' bodies, one-line each
// (card-mod-bootstrap-0.20.0 set/type/bootswatch_skin/html_views.rb:57-73
// and card-mod-email-0.20.0 set/right/html_message.rb:8-12 +
// html_message/content_with_link.haml:1-5), so a failure here can only
// be the SCOPE, never the bytes.
const scopedMods: DeckoModManifest = {
  name: "scopedprobe",
  gemName: "card-mod-scopedprobe",
  group: "gem",
  setModules: [
    {
      // The gem declares these two in set/type/bootswatch_skin/
      // html_views.rb - a file NESTED inside the anchor's directory. The
      // probe registers them at the anchor's own set path instead,
      // because this engine's setModuleShortname still derives a module
      // name from the WHOLE path and a nested file therefore lands on a
      // name no card token can look up (the KNOWN DIVERGENCE note in
      // mod-registrar.ts#setModuleShortname; a separate change, measured
      // at 71 -> 53 new mod-loader failures). Registering at the anchor
      // path keeps THIS file about the invariant it exists to pin - a
      // set-scoped registration does not reach a card outside the set -
      // and the gem-path spelling is covered where the view is
      // unregistered, in card-mod-bootstrap.ts's NOT PORTED note.
      //
      // Bodies are the gems' (html_views.rb:57-63 :bar_left,
      // :69-73 :bar_bottom), so a failure here can only be the SCOPE.
      setPath: "type/bootswatch_skin",
      formats: {
        html: {
          views: [
            {
              view: "bar_left",
              viewFn: (() => "<div class='media-left m-0'>PROBE</div>") as ViewFn,
            },
            // html_views.rb:69-73 `view :bar_bottom do wrap_with :code do
            // render_core end end` -> the inner render_core is
            // "<code>#{core}</code>" with the card's core bytes.
            {
              view: "bar_bottom",
              viewFn: (({ fmt }) => `<code>${fmt.renderView("core")}</code>`) as ViewFn,
            },
          ],
        },
      },
    },
    {
      // set/right/html_message.rb:9-11 `view :content do haml
      // :content_with_link, simple_core: super() end` over
      // content_with_link.haml:1-5.
      setPath: "right/html_message",
      formats: {
        html: {
          views: [
            {
              view: "content",
              viewFn: (({ fmt }) =>
                `<div class='simple-core'>\n${fmt.renderView("core")}\n</div>` +
                `\n<div class='email-html-link py-2 text-end'>\n` +
                `<a href='/${fmt.urlKey()}/email_page?layout=none'>\n` +
                `<em>sample email page</em>\n</a>\n</div>`) as ViewFn,
            },
          ],
        },
      },
    },
  ],
};

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
/** The compiled-in shared bodies, captured BEFORE the load so the flat-table
 *  assertion below can say "unchanged" rather than "absent" — the flat record
 *  is SEEDED from HTML_VIEWS (ModLoader's constructor default), so :content
 *  legitimately has a base value. */
let sharedContentBefore: ViewFn | undefined;
let sharedBarBottomBefore: ViewFn | undefined;
let sharedBarLeftBefore: ViewFn | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  sharedContentBefore = HTML_VIEWS["content"];
  sharedBarBottomBefore = HTML_VIEWS["bar_bottom"];
  sharedBarLeftBefore = HTML_VIEWS["bar_left"];
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  // The bootswatch_skin TYPE card is seeded as a codename so the probe's
  // typeId resolves the type NAME (the same shape
  // card-mod-bootstrap.test.ts:94-105 uses).
  await seedCard(s, { id: 500, name: "*bootswatch_skin", codename: "bootswatch_skin", typeId: 13 });
  await seedCard(s, { id: 600, name: "Skin Probe", typeId: 500, dbContent: "skin css" });
  // A card carrying the *html_message right (the Right::HtmlMessage set),
  // so the email view's dispatch half can be observed too. The compound
  // card is a JUNCTION row (left + right), the shape
  // card-mod-api_key.test.ts:712-722 seeds.
  await seedCard(s, { id: 300, name: "*html_message", codename: "html_message", typeId: 13 });
  await seedCard(s, { id: 302, name: "Message Probe", typeId: 2, dbContent: "note body" });
  await seedCard(s, { id: 303, leftId: 302, rightId: 300, typeId: 2 });
  await seedCard(s, { id: 601, name: "Plain Probe", dbContent: "plain body" });
  loader = new ModLoader([{ manifest: scopedMods }]);
  loader.load();
  setDefaultModLoader(loader);
  // The engine captured getDefaultModLoader() in ITS constructor, which
  // ran before this file's beforeAll bound the default; assign the field
  // so computeResolvedView consults the chain.
  s.engine.modLoader = loader;
}, 60_000);

afterAll(() => {
  setDefaultModLoader(undefined);
  loader?.reset();
  storage?.close();
});

describe("set-scoped view registrations must not leak to cards outside the set", () => {
  it("a plain RichText card's :content is the SHARED card-slot wrapper", async () => {
    const s = storage!;
    const html = await s.engine.render("Plain Probe", "content");
    expect(html.startsWith('<div id="plain_probe-content-view" class="card-slot content-view')).toBe(true);
    expect(html).toContain("plain body");
    expect(html).not.toContain("simple-core");
    expect(html).not.toContain("email-html-link");
  });

  it("a plain RichText card's :bar_bottom is the SHARED body, not <code>CORE</code>", async () => {
    const s = storage!;
    const plain = await s.engine.render("Plain Probe", "bar_bottom");
    expect(plain).not.toBe("<code>plain body</code>");
    expect(plain).not.toContain("simple-core");
  });

  it("a plain RichText card's :bar_left carries no media-left skin class", async () => {
    const s = storage!;
    const plain = await s.engine.render("Plain Probe", "bar_left");
    expect(plain).not.toContain("media-left");
  });

  it("the flat base-format record keeps its SHARED bodies after a set-scoped registration", () => {
    // The mechanism, stated as an assertion on the table itself rather
    // than on rendered bytes: the flat last-wins record the render engine
    // falls through to is seeded from HTML_VIEWS, and a set-scoped view
    // must not be written into it (set/format.rb:142-144 all_set? branch).
    // "Unchanged", not "absent" - the record legitimately carries the
    // compiled-in shared bodies.
    const flat = loader!.viewsTable();
    expect(flat["content"]).toBe(sharedContentBefore);
    expect(flat["bar_bottom"]).toBe(sharedBarBottomBefore);
    expect(flat["bar_left"]).toBe(sharedBarLeftBefore);
  });

  it("the chain table still RECORDS the set-scoped registrations (nothing unregistered)", () => {
    // The right reason: the views are registered and reachable for the
    // cards that ARE in the set - the fallback is narrowed, the views are
    // not unregistered. The set paths here are deliberately NOT nested
    // inside an anchor's directory, so the loader's shortname is the
    // module the card's token names (the nested-file divergence is a
    // separate, named defect - see mod-registrar.ts#setModuleShortname).
    const table = loader!.viewChainTable();
    expect(table.viewFor("Right::HtmlMessage", "content")).toBeDefined();
    expect(table.viewFor("Type::BootswatchSkin", "bar_bottom")).toBeDefined();
    expect(table.viewFor("Type::BootswatchSkin", "bar_left")).toBeDefined();
  });

  it("a bootswatch_skin card DOES take the skin's :bar_bottom and :bar_left", async () => {
    const s = storage!;
    // BYTE-PIN HISTORY (the surface-recount's one honest weakening, restored
    // strict): this pin was created at 26ef575 as
    // toBe("<code>skin css</code>") — true for the pre-port engine, whose
    // bootswatch_skin :core answered the raw dbContent. The an earlier pass
    // compile-engines merge ported the gem's core: html_views.rb:22
    // `view :core, template: :haml` renders core.haml — the Use as current
    // button (html_views.rb:50-54, core.haml:5), the Customize button, the
    // Skin configuration accordion — NOT the raw body, and html_views.rb:
    // 69-73 `view :bar_bottom do wrap_with :code do render_core end end`
    // wraps THAT. The old literal bytes were therefore un-Ruby bytes; the
    // merge re-shaped the pin to startsWith/endsWith/contains instead of
    // re-deriving them. With the libsass byte-parity adapter landed
    // (compile-engines-pin.test.ts + libsass-byte-parity-adapter.test.ts,
    // byte-exact against fixtures/captured/compile-engines.json) the
    // compile side is settled, so the strict form is back: the wrap
    // contract is pinned BYTE-EXACT (slot ids normalized, see below) as
    // "<code>" + the independently rendered :core + "</code>" — any
    // contamination (shared body, double wrap, scope leak) breaks
    // equality — plus one guard pinning the core
    // to the haml port rather than a dbContent revert. The :core bytes
    // themselves stay owned by bootstrap-code-file-pages.test.ts (the 21
    // skin pages byte-pinned through the same bootswatchSkinCoreHtml
    // builder): this file's charter is the SCOPE, and the probe bodies are
    // one-liners so a failure here can only be the scope, never the bytes.
    const bottom = await s.engine.render("Skin Probe", "bar_bottom");
    const core = await s.engine.render("Skin Probe", "core");
    expect(core).toContain("Use as current");
    // The chrome carries data-slot-id="SecureRandom.hex(10)" per render
    // (slot-html.ts:62-66 newSlotId, Ruby-faithful to wrap.rb), so raw
    // toBe across two renders is false by construction; the strict form
    // is byte-exact through the recording layer's own normalization
    // (src/testing/diff.ts:22-38, docs/parity-method.md "The
    // normalization rule"): both sides canonicalized, every other byte
    // exact.
    expect(normalizeSlotIds(bottom)).toBe(`<code>${normalizeSlotIds(core)}</code>`);
    const left = await s.engine.render("Skin Probe", "bar_left");
    expect(left).toContain("media-left");
  });

  it("a card carrying the *html_message right DOES take the email's :content", async () => {
    // The other half of the pair: the view is not merely recorded, it
    // dispatches for a card in the set. card-mod-email-0.20.0
    // set/right/html_message.rb:9-11 over content_with_link.haml:1-5.
    const s = storage!;
    const html = await s.engine.render("Message Probe+*html_message", "content");
    expect(html).toContain("simple-core");
    expect(html).toContain("email-html-link");
  });

  it("the empty-chain fallback resolves ONLY set/all/* modules", () => {
    // The defect, pinned directly on the table: with a
    // nonbase module registered for the view and no card chain, Ruby
    // resolves to the base format class - which does not carry it.
    const table = loader!.viewChainTable();
    expect(table.chainFor([], "content").map((e) => e.setModule)).toEqual([]);
    expect(table.chainFor([], "bar_bottom").map((e) => e.setModule)).toEqual([]);
  });
});
