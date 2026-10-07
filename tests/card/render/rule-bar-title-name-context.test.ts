// Mechanism 2 of the live-wire page-render defect verdict
// (REPO_DIR an internal work log, 2026-09-28):
// the engine does not APPLY name-context title shortening on rule bars whose
// context has MORE THAN ONE part. Probe evidence (pos600
// `ASCSR2010gallery02+*self`, identical on pos6/827/1030/1240):
//
//   SNAP: <span class="card-title" title="+*default"><span>+</span>*default</span>
//   ENG : <span class="card-title" title="ASCSR2010gallery02+*self+*default">...
//   LIVE: <span class="card-title" title="+*default">...
//
// with all three sides DECLARING the same slot-JSON name_context
// ("ascsr2010gallery02,*self") — the engine declares the context and then
// renders the full name anyway.
//
// Ruby mechanism (context_names.rb:49-54 title_in_context):
//   newtitle = title.from(*context_names)  # -> Cardname#name_from
//   ... key == compressed.absolute_name(from).key ? compressed : self
// `absolute_name(from)` receives the WHOLE context list as an ARRAY, and
// `absolute` turns it into ONE name — Cardname.new(["a","*self"]) JOINS the
// array with the joint (cardname class_methods.rb:52-58 stringify:
// `obj.map(&:to_s) * joint`, via Object#to_name in core_ext.rb). The
// compressed "+*default" absolutizes back to
// "ASCSR2010gallery02+*self+*default" and the shortened form wins.
//
// Engine defect: DeckoName#nameFrom (src/card/name.ts) called
// `compressed.absoluteName(...compactFrom)` — spreading the context into
// SEPARATE arguments while absoluteName(context?) reads only the FIRST — so
// the round-trip key was "ascsr2010gallery02+*default" != the title's key and
// nameFrom fell back to the full name. Single-part contexts (the *all page's
// `title="+*create"`) survived, which is why only the compound-context pages
// diverged.
//
// Test surface: the oracle bytes are PAGE bytes (q1 renders full pages; the
// context accumulates through the titled view's `naming { render_header }` —
// views.ts titledView runs the header, then addNameContext, then the body).
// The probe layout from page-layout-nest-warmup-referencing-context.test.ts
// keeps the render to the main slot. The virtual `*home+*self+*default` rule
// bar (context [*home, *self] — the same two-part shape as the sampled
// pages) must render `title="+*default"`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;
const RICH_TYPE_ID = 4;
const HTML_TYPE_ID = 5;

async function seedDeck(): Promise<void> {
  const s = storage!;
  // Type cards (codename column feeds the codehash).
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 5, name: "HTML", codename: "html" });
  // Parties.
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  // Settings: the read grant, the default rule the bars render, the self
  // set pattern, and the head-path settings the page chrome parses.
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 21, name: "*default", codename: "default", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 39, name: "*self", codename: "self", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 41, name: "*type", codename: "type", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 42, name: "*layout", codename: "layout", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 43, name: "*title", codename: "title", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 44, name: "*favicon", codename: "favicon", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 45, name: "*ace", codename: "ace", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 46, name: "*tiny_mce", codename: "tiny_mce", typeId: SETTING_TYPE_ID });
  // The deck's readable grant: *all+*read -> [[Anyone]].
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The self-set family from r16: *home is HTML-typed; the stored
  // `HTML+*type+*default` rule (RichText-typed, empty content) is the
  // prototype's winning *default rule — the bar-right's nested one-line.
  await seedCard(s, { id: 70, name: "*home", codename: "home", typeId: HTML_TYPE_ID });
  await seedCard(s, { id: 71, leftId: 70, rightId: 39, typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, { id: 72, leftId: 5, rightId: 41, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 73, leftId: 72, rightId: 21, typeId: RICH_TYPE_ID, dbContent: "" });
  // The probe layout: main slot only (page-layout-nest-warmup pattern).
  await seedCard(s, {
    id: 80,
    leftId: 10,
    rightId: 42,
    typeId: SETTING_TYPE_ID,
    dbContent: "Context Probe Layout",
  });
  await seedCard(s, {
    id: 81,
    name: "Context Probe Layout",
    typeId: 2,
    dbContent: "{{_main|titled}}",
  });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  storage.fetcher.codenames.ensureLoaded();
  storage.fetcher.installNameEnvironment();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("rule bar title shortening: name_context (live-wire mechanism 2)", () => {
  it("renders title=\"+*default\" on the *home+*self page's default rule bar", async () => {
    const html = await renderPageBytes(storage!.engine, "*home+*self");
    const at = html.indexOf("Xhome-Xself-Xdefault-bar-view");
    expect(at).toBeGreaterThan(-1); // the bar renders at all
    // The oracle window (pos600 shape): the bar-left title carries the
    // CONTEXT-SHORTENED name with the leading joint span:
    //   <span class="card-title" title="+*default"><span>+</span>*default</span>
    expect(html).toContain(
      '<span class="card-title" title="+*default"><span>+</span>*default</span>',
    );
    // ... and never the full name on that bar's title attribute.
    expect(html).not.toContain('title="*home+*self+*default"');
  });
});
