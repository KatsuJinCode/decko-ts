// date-delegated-core-rescue-scope-pins.test.ts — a `render_<view>` called
// from inside a view body is its OWN rescue scope, so a raising delegated
// render still lets the enclosing view's `wrap` emit its card-slot div.
//
// MECHANISM (gem source, REPO_ROOT/archive/decko-fork-study/decko/):
//
//   1. Every `render!` in Ruby is independently rescued.
//      card/lib/card/format/render.rb:7-14
//          def render! view, view_options={}
//            voo = View.new self, view, view_options, @voo
//            with_voo voo { voo.process { |final_view| wrap_and_render final_view } }
//          end
//      :96-100
//          def wrap_and_render view
//            current_view(view) { with_wrapper { final_render view } }
//          rescue StandardError => e
//            rescue_view e, view
//          end
//      The rescue is INSIDE `render!`, and the wrapper is inside the begin
//      — so an error raised while rendering a view does not skip that
//      view's own wrapper, and the error is labelled with the view
//      `wrap_and_render` was called with.
//
//   2. `render_core` from inside a view body is a NEW `render!`.
//      card/lib/card/format/method_delegation.rb:6-12 RENDER_METHOD_RE
//      matches `render_core`; :41-47 `method_missing` -> :14-18 `api_render`
//      -> `render! view, ...`. A new rescue scope opens.
//
//   3. The Date cardtype declares ONE view, `:core`, and that is where the
//      raise lives.
//      mod/date/set/type/date.rb:6-8
//          view :core do
//            ::Date.parse(card.content).strftime "%B %-d, %Y"
//          end
//
//   4. The `:content` view a Date card is rendered through is the all-set
//      one, and it WRAPS the delegated core.
//      mod/format/set/all/html/views.rb:10-18
//          view :content, cache: :yes do
//            wrap do
//              [render_menu(optional: :hide), render_core,
//               render_edit_button(optional: :hide, edit: :inline)]
//            end
//          end
//
//   => a nested `+Date` whose content will not parse renders its
//   `content-view` card-slot div, wrapping
//     <span class="render-error alert alert-danger">Error rendering:
//     <name>+Date (core view)</span>
//   (html/error.rb:99-101 wraps format/error.rb:80-86's `rendering_error`,
//   which interpolates the DELEGATED view).
//
// THE DEFECT. The port raised `Date::Error` at the view-DISPATCH seam for
// the {open, content} views (the old src/card/render.ts PARSE_DISPATCH_VIEWS
// gate) — one level too high, so the `:content` view body never ran, its
// `wrap` never fired, the card-slot div was never emitted, and nest()'s
// catch produced the unwrapped span labelled "(content view)". Corpus bytes
// it did not match: card 34322 `Maturana ...+Date` (-938), 27918 `Jamie
// McHugh ...+Date` (-908), 35469 `White Fragility ...+Date` (-606),
// 9788 `Sample Card 098+Date` (-1727).
//
// THE LOUD HALF IS NOT WEAKENED. format/error.rb:65-67
//   `loud_error?` = `focal? || Card.config.raise_all_rendering_errors`;
// nesting/subformat.rb:41-43 `focal?` = `depth.zero?`;
// cardio/railtie.rb:38 sets raise_all_rendering_errors false. A delegated
// render on a DEPTH-0 format therefore RE-RAISES (format/error.rb:69-73),
// which is why a bare `format.render(:content)` of a bad-content Date card
// is a capture_error and not a page. Asserted below both ways: the nested
// surface is quiet AND wrapped, the top-level surface throws.

import { describe, it, expect } from "vitest";
import { allRenderingErrorsRaise, setRaiseAllRenderingErrors } from "../../../src/card/render/format.js";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";

const DATE_CARD = "broken date card";
const HOST_CARD = "host nests the broken date";
/** The corpus's own content for card 34322 `Maturana ...+Date` is "1980"
 *  (verified against tmp/raw-ground-truth/bench-corpus-raw.sqlite3), which
 *  Ruby's Date.parse rejects — `parseRubyDateContent` returns null for
 *  every all-digit string by design (src/card/render/errors.ts:227-230,
 *  "2016", "1980" both verified). "1980" is used here so the pin exercises
 *  the same rejection the corpus does. */
const BAD_DATE_CONTENT = "1980";

async function seed(): Promise<ReturnType<typeof createRenderTestStorage>> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  // The type card's CODENAME is what becomes `card.typeCode`
  // (src/card/render.ts:1038) — "date" is the gate the dispatch seam reads.
  await seedCard(storage, { id: 90, name: "Date", codename: "date", typeId: 2 });
  await seedCard(storage, {
    id: 500,
    name: DATE_CARD,
    typeId: 90,
    dbContent: BAD_DATE_CONTENT,
  });
  await seedCard(storage, {
    id: 501,
    name: HOST_CARD,
    typeId: 2,
    dbContent: `{{${DATE_CARD}|content}}`,
  });
  storage.fetcher.installNameEnvironment();
  return storage;
}

describe("a delegated render_core is its own rescue scope (render.rb:7-14, :96-100)", () => {
  // Posture-explicit pins: the engine's process default is the
  // development-loud posture (raise_all_rendering_errors=true, the mod-port
  // raise contracts' world). The NESTED cases pin Ruby's STOCK rescue shape
  // — quiet at a non-focal depth (error.rb:65-78 loud_error? = focal? ||
  // config, stock default false, cardio/railtie.rb:38) — so they set the
  // stock posture explicitly; the TOP-LEVEL case pins the loud arm and sets
  // the loud posture explicitly. Every case restores the prior value.
  const withPosture = async (loud: boolean, body: () => Promise<void>) => {
    const prior = allRenderingErrorsRaise();
    setRaiseAllRenderingErrors(loud);
    try {
      await body();
    } finally {
      setRaiseAllRenderingErrors(prior);
    }
  };

  it("NESTED: the :content view still emits its card-slot div around the error", async () => {
    await withPosture(false, async () => {
      const storage = await seed();
      try {
        const html = await storage.engine.render(HOST_CARD, "content");
        // views.rb:10-18's `wrap` ran: the slot div is present, with the
        // `content-view` class views.ts#slotWrap builds.
        expect(html, "the content-view slot div must survive a raising core").toMatch(
          /class="card-slot content-view[^"]*"/,
        );
        expect(html).toContain("d0-card-content"); // before(:content) class_up
        // ...and the error span is INSIDE that div, not a bare replacement
        // for it. The div opens, then the span, then the div closes.
        const divAt = html.indexOf('class="card-slot content-view');
        const spanAt = html.indexOf("<span class=\"render-error");
        const closeAt = html.indexOf("</div>", spanAt);
        expect(divAt).toBeGreaterThanOrEqual(0);
        expect(spanAt).toBeGreaterThan(divAt);
        expect(closeAt).toBeGreaterThan(spanAt);
      } finally {
        storage.close();
      }
    });
  });

  it("NESTED: the error is labelled with the DELEGATED view, not the wrapper's", async () => {
    await withPosture(false, async () => {
      const storage = await seed();
      try {
        const html = await storage.engine.render(HOST_CARD, "content");
        expect(html).toContain("Error rendering: broken date card (core view)");
        // The pre-fix label. Asserted absent so a regression back to the
        // dispatch-seam raise is a named failure, not a silent one.
        expect(html).not.toContain("(content view)");
      } finally {
        storage.close();
      }
    });
  });

  it("TOP-LEVEL: a depth-0 render of the same card still RE-RAISES (error.rb:69-73)", async () => {
    await withPosture(true, async () => {
      const storage = await seed();
      try {
        // The loud arm of loud_error? (error.rb:65-73): under the
        // development posture (config true) every rescue re-raises. The
        // corpus pins that surface as CAPTURE_ERROR, and this pin keeps it
        // that way — moving the raise down a level must not turn a
        // capture_error into a rendered page.
        let captured: unknown;
        try {
          await storage.engine.render(DATE_CARD, "content");
        } catch (err) {
          captured = err;
        }
        expect(captured, "the focal render must still raise").toBeDefined();
        expect((captured as Error).constructor.name).toBe("Date::Error");
        expect((captured as Error).message).toBe("invalid date");
      } finally {
        storage.close();
      }
    });
  });

  it("a VALID Date content still renders the strftime body, unwrapped-error path untouched", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 90, name: "Date", codename: "date", typeId: 2 });
      await seedCard(storage, { id: 502, name: "good date card", typeId: 90, dbContent: "2023-01-15" });
      const html = await storage.engine.render("good date card", "content");
      expect(html).toContain("January 15, 2023");
      expect(html).not.toContain("render-error");
    } finally {
      storage.close();
    }
  });
});
