// core-delegating-view-bodies-rescue-scope-pins.test.ts — the remaining
// four core-delegating view bodies are RESCUE-SCOPED delegations like
// contentView: a core that raises inside them returns the quiet
// render-error span labelled with the DELEGATED view ("(core view)"),
// not the nest-level label of the requested view.
//
// This is the continuation of date-delegated-core-rescue-scope-pins.test.ts
// (which pinned the seam for :content / :content_panel / :content_with_title
// — 3 of the 7 core-delegating bodies). The four bodies here:
//
//   views.ts:327   openContentView     base.rb:93-95
//                    view :open_content do _render_core end
//                  The underscore is NOT a direct dispatch:
//                  method_delegation.rb:6-12 RENDER_METHOD_RE matches
//                  `_render_core`; :41-47 method_missing -> api_render ->
//                  `render! view, ...` — the SAME rescue-scoped entry as
//                  `render_core` — and :47-53 render_args sets
//                  `args[:skip_perms] = true if underscore` (the only
//                  difference; carried through as the skip_perms opt).
//
//   views.ts:~4110 the BootswatchSkin :bar_bottom arm
//                  card-mod-bootstrap set/type/bootswatch_skin/html_views.rb:69-73
//                    view :bar_bottom do
//                      wrap_with :code do render_core end
//                    end
//
//   views.ts:~4265 titledContentView     base.rb:105-107
//                    view :titled_content, unknown: :blank do render_core end
//
//   views.ts:~4655 labeledContentView    base.rb:101-103
//                    view :labeled_content, unknown: :mini_unknown do
//                      render_core
//                    end
//
// MECHANISM (gem source, REPO_ROOT/archive/decko-fork-study/decko/):
// every `render!` is independently rescued — card/lib/card/format/render.rb
// :7-14 and :96-100 (`wrap_and_render ... rescue StandardError => e;
// rescue_view e, view`), reached from a view body's `render_core` /
// `_render_core` through method_delegation.rb:41-47 method_missing ->
// :14-18 api_render. The error span is labelled with the view wrap_and_render
// was called with (format/error.rb:80-86) — "(core view)" — while a raise
// that ESCAPES the view body is caught one level out by nest() and labelled
// with the REQUESTED view ("(open_content view)" etc.). The quiet/loud split
// is depth (error.rb:65-73 + subformat.rb:41-43): quiet at depth > 0, which
// every nest here is.
//
// THE ORACLE. No captured corpus page requests :open_content /
// :titled_content / :labeled_content / a raising skin :bar_bottom through
// these bodies (open_content is documented RENDERED-UNPINNED at its old
// site) — these pins are gem-construction pins, not byte pins: they hold the
// port to Ruby's rescue-scope SHAPE so the next corpus entry that reaches
// one of these bodies renders the wrapped/labelled bytes by construction.
// The wired bodies changed no measured byte: the 31-entry probe set of the
// open-clusters lane re-run at this tip moves nothing (receipt step 8).

import { describe, it, expect } from "vitest";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

const DATE_CARD = "broken date card";
const SKIN_CARD = "lux skin card";

async function seed(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  // The type card's CODENAME is what becomes `card.typeCode`
  // (src/card/render.ts:1038) — "date" drives the parse raise,
  // "bootswatch_skin" drives the :bar_bottom <code> arm.
  await seedCard(storage, { id: 90, name: "Date", codename: "date", typeId: 2 });
  await seedCard(storage, { id: 91, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: 2 });
  await seedCard(storage, { id: 500, name: DATE_CARD, typeId: 90, dbContent: "1980" });
  await seedCard(storage, { id: 501, name: SKIN_CARD, typeId: 91, dbContent: "{}" });
  // Hosts: one per pinned view (the prior lane's host/nest fixture shape).
  await seedCard(storage, {
    id: 510, name: "host open content", typeId: 2, dbContent: `{{${DATE_CARD}|open_content}}`,
  });
  await seedCard(storage, {
    id: 511, name: "host titled content", typeId: 2, dbContent: `{{${DATE_CARD}|titled_content}}`,
  });
  await seedCard(storage, {
    id: 512, name: "host labeled content", typeId: 2, dbContent: `{{${DATE_CARD}|labeled_content}}`,
  });
  await seedCard(storage, {
    id: 513, name: "host skin bar bottom", typeId: 2, dbContent: `{{${SKIN_CARD}|bar_bottom}}`,
  });
  storage.fetcher.installNameEnvironment();
  return storage;
}

/** The delegation label: format/error.rb:80-86 interpolates the view
 *  wrap_and_render was called with — the DELEGATED view, core. */
const CORE_LABEL = `Error rendering: ${DATE_CARD} (core view)`;

describe("the remaining core-delegating view bodies are rescue-scoped delegations", () => {
  let storage: RenderTestStorage;

  it("open_content (_render_core, base.rb:93-95) labels the span (core view), not (open_content view)", async () => {
    storage = await seed();
    try {
      const html = await storage.engine.render("host open content", "content");
      expect(html, "the delegated rescue answers inside the view").toContain(CORE_LABEL);
      expect(html, "the nest-level label must not appear").not.toContain("(open_content view)");
    } finally {
      storage.close();
    }
  });

  it("titled_content (render_core, base.rb:105-107) labels the span (core view), not (titled_content view)", async () => {
    storage = await seed();
    try {
      const html = await storage.engine.render("host titled content", "content");
      expect(html).toContain(CORE_LABEL);
      expect(html).not.toContain("(titled_content view)");
    } finally {
      storage.close();
    }
  });

  it("labeled_content (render_core, base.rb:101-103) labels the span (core view), not (labeled_content view)", async () => {
    storage = await seed();
    try {
      const html = await storage.engine.render("host labeled content", "content");
      expect(html).toContain(CORE_LABEL);
      expect(html).not.toContain("(labeled_content view)");
    } finally {
      storage.close();
    }
  });

  it("skin bar_bottom (html_views.rb:69-73) keeps the <code> wrap around the delegated answer", async () => {
    storage = await seed();
    try {
      const html = await storage.engine.render("host skin bar bottom", "content");
      // wrap_with :code is a VERBATIM tag wrapper around whatever the
      // delegation returns. The fixture skin's core does not raise (the
      // compiled skin core renders its buttons), so this pin holds the
      // SUCCESS-path shape: the core's own bytes sit inside <code></code>,
      // and the delegation never leaks a nest-level label. The raise-path
      // label for this arm is the SAME renderDelegated seam the three
      // pins above exercise — one line, one helper (quietRenderError),
      // no third path.
      const codeAt = html.indexOf("<code>");
      expect(codeAt, "the skin bar_bottom must dispatch the <code> arm").toBeGreaterThanOrEqual(0);
      const closeAt = html.indexOf("</code>", codeAt);
      expect(closeAt, "the <code> wrap closes").toBeGreaterThan(codeAt);
      expect(html.slice(codeAt, closeAt), "the delegated core renders inside the wrap").toContain("btn");
      expect(html).not.toContain("(bar_bottom view)");
    } finally {
      storage.close();
    }
  });
});
