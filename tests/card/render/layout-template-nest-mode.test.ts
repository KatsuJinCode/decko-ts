// The layout cardtype's :core view renders its body under nest mode
// :template (lane templatenest-coderay).
//
// Ruby, card-mod-layout-0.20.0 set/type/layout_type.rb:12-18:
//
//   format :html do
//     view :core do
//       with_nest_mode :template do
//         process_content ::CodeRay.scan(_render_raw, :html).div
//       end
//     end
//   end
//
// :template changes what a nest RENDERS, it does not stop the chunker.
// format/nesting/mode.rb:45-50 routes the view to :template_nest, and
// card-mod-edit set/all/template_nest.rb:2-12 answers a non-field nest
// with the nest's own syntax re-emitted verbatim:
//
//   "{{#{voo.nest_syntax}}}"
//
// `nest_syntax` is the in-bracket text the chunk captured
// (card-mod-content lib/card/content/chunk/nest.rb:23), so for a body
// whose nests survive the scanner unchanged the re-emission is byte-
// identical to the input. That is the whole of the 217 KB the engine used
// to expand here: page 22747's "Default Layout" body nests {{:header|core}},
// {{_main|titled}} and {{:footer|content}}, and Ruby printed all three
// back inside the CodeRay block (oracle 15,429 B) while the engine
// rendered three fully-expanded slot divs (232,915 B).
//
// The mode is FORMAT STATE, not a view flag: format/nesting/mode.rb:17-19
// inherits it from the parent format and with_nest_mode restores it in an
// ensure, so a nest rendered in :template mode cannot leak the mode to its
// siblings. These tests pin the state machine itself, not just the one
// card, so a future :edit or :compact addition has somewhere to land.
//
// THE `{{_main}}` EXCEPTION (adjudicated 2026-10-01, lane
// nest-mode-control-adjudication). The negative control used to assert that
// the whole 22747 body - `{{:header|core}}`, `{{_main|titled}}` and
// `{{:footer|content}}` alike - comes back nest-EXPANDED in :normal mode.
// That was never Ruby's behavior on any surface, so the assertion was
// passing on port behavior rather than on the oracle:
//
//   * `{{_main}}` is diverted before the ordinary nest dispatch
//     (content.rb:24), so it can never "expand" the way `{{:header}}` does.
//   * It emits `main.rendered` (main.rb:12), which mid-render is the card's
//     OWN RAW SOURCE - the splice re-prints the authored nests rather than
//     consuming them. Oracle: page-lane shard-000000 entry 470 carries
//     record.content verbatim inside `<div id="main">`.
//   * With no main format at all it does not even get that far: `main` is
//     nil and main.rb:12 raises. Oracle: view-lane shard-000000 entry 470
//     records `CAPTURE_ERROR: NoMethodError: undefined method `rendered'
//     for nil` for both :content and :open.
//
// The control is therefore split in two, one arm per captured surface.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RenderFormat } from "../../../src/card/render/format.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

/** The corpus card 22747 layout body, byte-for-byte (bench-corpus-raw
 *  sqlite3 `SELECT content FROM cards WHERE id = 22747`). */
const CARD_22747_BODY =
  '<body class="d-flex flex-column h-100">\n' +
  "  <header>{{:header|core}}</header>\n" +
  '  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n' +
  '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n' +
  "</body>";

// :template_nest lives in the MOD DECK (card-mod-edit set/all/
// template_nest.rb), and a RenderEngine binds its loader in its constructor
// (render.ts:459 getDefaultModLoader). Without the deck booted, the view
// the nest mode substitutes is simply not registered and every assertion
// below would fail on UnsupportedViewError instead of on the mode. The
// deck is process-wide, so it is bound once for the file and unbound when
// the file ends - the same shape tests/card/mod-loader/
// view-dispatch-superview.test.ts uses, so no sibling test inherits it.
// It must be afterAll, not afterEach: each test builds its own storage
// (and therefore its own RenderEngine, which binds the loader at
// construction), so unbinding between tests would leave every test after
// the first one without a deck.
beforeAll(() => {
  defaultDeckLoader();
});

afterAll(() => {
  setDefaultModLoader(undefined);
});

async function seedTemplateModeDeck(): Promise<{
  storage: RenderTestStorage;
  layoutFormat: RenderFormat;
}> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  // The Layout cardtype. card 22747's type_id is 11746, the Layout type
  // card; `type_code` is what routes a card to the CodeRay html core
  // (code-highlighting/index.ts#langForTypeCode), but it is stamped during
  // a render closure walk (render.ts:1566-1568), not by fetchById - so
  // the core-view routing itself is gated by the page-level test
  // tmp/raw-ground-truth/scripts/repro-22747-default-layout.test.ts, and
  // these tests exercise the mode the view turns on.
  await seedCard(storage, { id: 50, name: "Layout", codename: "layout_type", typeId: 2 });
  // The three nest targets. They resolve to real cards so that a NORMAL
  // nest would expand - which is what makes the template-mode assertion
  // below a real gate rather than a pass because the target is missing.
  await seedCard(storage, { id: 60, name: "*header", codename: "header", typeId: 2, dbContent: "<nav>HEAD</nav>" });
  await seedCard(storage, { id: 61, name: "*footer", codename: "footer", typeId: 2, dbContent: "<small>FOOT</small>" });
  await seedCard(storage, { id: 62, name: "*credit", codename: "credit", typeId: 2, dbContent: "<small>CREDIT</small>" });
  // The layout card itself, typed `layout_type` so its :core routes
  // through the CodeRay html core.
  await seedCard(storage, {
    id: 70,
    name: "Template Mode Layout",
    typeId: 50,
    dbContent: CARD_22747_BODY,
  });
  // The `:header`/`:footer` codename marks need the codename registry
  // (name.ts:257-261 reads it before the name environment). Without this
  // the :normal-mode control cannot even resolve `{{:header|core}}`.
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon([2, 50, 60, 61, 62, 70]);
  // The type-code stamp (render.ts:1566-1568) only exists on a card the
  // engine enriched through its own walk, so prepare the layout card the
  // way a render does rather than building a RenderCard from the record.
  const prepared = await storage.engine.prepareItemForRender("Template Mode Layout");
  if (prepared === undefined) throw new Error("layout card 70 not preparable after seed");
  return { storage, layoutFormat: new RenderFormat(prepared, storage.engine) };
}

describe("layout_type :core view - nest mode is format state", () => {
  it("inherits the mode from the parent format and restores it after the block", async () => {
    const { storage, layoutFormat } = await seedTemplateModeDeck();
    try {
      expect(layoutFormat.nestMode).toBe("normal");
      // mode.rb:24-30 - the block runs under the new mode and the prior
      // mode is back afterwards whether or not the block raised.
      expect(layoutFormat.withNestMode("template", () => layoutFormat.nestMode)).toBe("template");
      expect(layoutFormat.nestMode).toBe("normal");

      let threw = false;
      try {
        layoutFormat.withNestMode("template", () => {
          throw new Error("boom");
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      expect(layoutFormat.nestMode).toBe("normal"); // ensure branch ran
    } finally {
      storage.close();
    }
  });

  it("a subformat inherits the parent's mode (mode.rb:17-19) but does not leak changes back", async () => {
    const { storage, layoutFormat } = await seedTemplateModeDeck();
    try {
      const child = await storage.engine.prepareItemForRender("*credit");
      if (child === undefined) throw new Error("*credit card 62 not preparable after seed");
      layoutFormat.withNestMode("template", () => {
        const sub = new RenderFormat(child, storage.engine, { parent: layoutFormat });
        expect(sub.nestMode).toBe("template"); // inherited
        sub.withNestMode("normal", () => {
          expect(sub.nestMode).toBe("normal"); // own state, own block only
        });
        expect(sub.nestMode).toBe("template"); // restored to the inherited value
      });
      expect(layoutFormat.nestMode).toBe("normal"); // parent never saw the child's change
    } finally {
      storage.close();
    }
  });

  it("modal_nest_view maps :template to :template_nest and leaves other views alone (mode.rb:45-50)", async () => {
    const { storage, layoutFormat } = await seedTemplateModeDeck();
    try {
      expect(layoutFormat.modalNestView("core")).toBe("core");
      layoutFormat.withNestMode("template", () => {
        expect(layoutFormat.modalNestView("core")).toBe("template_nest");
        expect(layoutFormat.modalNestView("titled")).toBe("template_nest");
        expect(layoutFormat.modalNestView("content")).toBe("template_nest");
      });
      expect(layoutFormat.modalNestView("titled")).toBe("titled");
    } finally {
      storage.close();
    }
  });
});

describe("layout_type :core view - the rendered body (the 217 KB)", () => {
  it("re-emits every nest as its own syntax, so the highlighted source survives whole", async () => {
    const { storage, layoutFormat } = await seedTemplateModeDeck();
    try {
      const body = layoutFormat.withNestMode("template", () =>
        layoutFormat.processContent(CARD_22747_BODY),
      );
      expect(body).toBe(CARD_22747_BODY);
      expect(body).not.toContain("<nav>HEAD</nav>");
      expect(body).not.toContain("<small>FOOT</small>");
    } finally {
      storage.close();
    }
  });

  it("consumes the outer nests in :normal mode and splices the MAIN card's own raw source at {{_main}} - the negative control", async () => {
    const { storage, layoutFormat } = await seedTemplateModeDeck();
    try {
      // :normal is the pre-change behavior: the chunker still finds every
      // nest, the nest still renders, and the authored `{{...}}` bytes at
      // the OUTER level are GONE. That substitution is what made page
      // 22747 232,915 B where Ruby emitted 15,429 B.
      //
      // `{{_main}}` is NOT an ordinary nest and never was:
      // card-1.110.0 content.rb:24 `return main_nest(opts) if
      // main_nest?(nest_name) && @nest_mode != :template`, and
      // nesting/main.rb:26-28 `main_nest?` is the exact test
      // `nest_name == "_main"`. main_nest is
      // `wrap_main { main.rendered || main_nest_render(opts) }`
      // (main.rb:10-14), so it emits whatever `main.rendered` holds, and
      // card-mod-format-0.20.0 html/wrap.rb:118-122 wraps it in
      // `<div id="main">`.
      //
      // On a page render the root format is flagged main
      // (card-mod-layout-0.20.0 set/all/process_layout.rb:19 `main!` in
      // show_with_page_layout; the port mirrors that at page.ts:281-284).
      // What its @rendered holds mid-render is the RAW SOURCE: `view :core`
      // is `process_content _render_raw` (card-mod-format-0.20.0
      // set/all/base.rb:85-87), the ARGUMENT is evaluated before chunking
      // starts, and the with_wrapper pass (card-1.110.0
      // format/wrapper.rb:15 `@rendered = yield`) lands the :raw view's
      // `structure_card&.content` (base.rb:75-77) there first. So
      // `{{_main}}` splices the card's OWN dbContent - its nests and wiki
      // links unexpanded.
      //
      // ORACLE: expected-v2/page-lane recapture-raw-shard-000000.jsonl
      // entry id 470 ("AsIn Layout", page_html 28,562 B) carries
      // record.content VERBATIM at offset 12061, immediately bounded by
      // `">\n      <div id="main">` before and `</div>` after, exactly
      // once in the file. That is the byte shape asserted below.
      const mainFormat = new RenderFormat(layoutFormat.card, storage.engine, { main: true });
      // The real render reaches this state THROUGH _render_raw, so the
      // test runs the call Ruby's :core view runs (the port's renderRaw
      // assigns `this.rendered` and returns the same bytes) rather than
      // hand-setting the field.
      expect(mainFormat.renderRaw()).toBe(CARD_22747_BODY);

      const body = mainFormat.processContent(CARD_22747_BODY);

      const splice = `<div id="main">${CARD_22747_BODY}</div>`;
      const at = body.indexOf(splice);
      expect(at).toBeGreaterThan(-1);
      // The splice is the raw source, byte for byte, not a re-render - the
      // authored nests come back inside it.
      expect(body.slice(at, at + splice.length)).toBe(splice);
      // The OUTER nests were consumed: none of the three authored marks
      // survives ahead of the splice. The `{{_main|titled}}` mark occurs
      // exactly once in the whole output - the copy the splice brought
      // back - so the outer one was consumed and never re-rendered.
      const outer = body.slice(0, at);
      for (const authored of ["{{:header|core}}", "{{_main|titled}}", "{{:footer|content}}"]) {
        expect(outer).not.toContain(authored);
      }
      expect(body.split("{{_main|titled}}").length - 1).toBe(1);
      expect(body).not.toBe(CARD_22747_BODY);
      // What the two ORDINARY nests expand TO is deliberately not asserted
      // here, and they expand to NOTHING in this fixture: measured output
      // for this exact case is `<header></header>` and
      // `<footer class="footer mt-auto py-3"></footer>`, i.e. the authored
      // marks are consumed and replaced by empty strings.
      //
      // Note that the seed does create the target cards - 60 `*header`
      // (dbContent `<nav>HEAD</nav>`) and 61 `*footer` (`<small>FOOT</small>`)
      // - and installs the name environment over them, so "the nest was
      // consumed" and "the nest expanded to its target's content" are NOT
      // the same observation here, and only the first is asserted. Asserting
      // the second would be asserting a fact this fixture does not have.
      // Consumption plus the `{{_main}}` splice is the control's subject; the
      // expansion bytes of a real page render are routed to
      // tmp/raw-ground-truth/scripts/repro-22747-default-layout.test.ts by
      // the seed's own comment above.
    } finally {
      storage.close();
    }
  });

  it("throws the captured NoMethodError at {{_main}} when the format has no main - the view-lane shape", async () => {
    const { storage, layoutFormat } = await seedTemplateModeDeck();
    try {
      // The same body on a format with NO main is Ruby's OTHER captured
      // surface, and Ruby THROWS on it rather than producing bytes. `main`
      // is `if main? then self elsif !root? then parent.main end`
      // (card-1.110.0 format/nesting/subformat.rb:18-24), and the html
      // format OVERRIDES `main?` as `!@main.nil?`
      // (card-mod-format-0.20.0 lib/card/format/html_format.rb:11-13) -
      // NOT the base `depth.zero?`. A root format never flagged main (a
      // bare `card.format.render(:content)`, which never calls main!) is
      // therefore not `main?`, and being `root?` it does not walk to a
      // parent either, so the `if` falls off the end and returns NIL.
      // main.rb:12 then evaluates `main.rendered` on nil.
      //
      // ORACLE: expected-v2/view-lane recapture-raw-shard-000000.jsonl
      // entry id 470 ("AsIn Layout") records, for BOTH of its views,
      //   CAPTURE_ERROR: NoMethodError: undefined method `rendered' for nil
      // Checked across all 48 view-lane shards (6,588 entries): those two
      // records are the ONLY `rendered`-for-nil sentinels in the lane, and
      // 470 is the only Html-typed card among the 12 whose content nests
      // `{{_main...}}` - the other 11 are all `type Layout`, whose :core
      // runs under `with_nest_mode :template` (card-mod-layout
      // set/type/layout_type.rb:13-17), so content.rb:24's
      // `@nest_mode != :template` gate never lets them reach main_nest and
      // they render bytes. 470 alone throws.
      let caught: unknown;
      try {
        layoutFormat.processContent(CARD_22747_BODY);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      // Class name and message are the captured sentinel's, byte for byte
      // - `rendered' is Ruby's own backtick-apostrophe spelling.
      expect((caught as Error).name).toBe("NoMethodError");
      expect((caught as Error).message).toBe("undefined method `rendered' for nil");
    } finally {
      storage.close();
    }
  });

  it("a nest whose syntax carries a tag is re-emitted with the tag stripped (nest.rb:13 strip_tags)", async () => {
    const { storage, layoutFormat } = await seedTemplateModeDeck();
    try {
      // nest.rb:13 `strip_tags match[1]` runs at CHUNK time, so
      // nest_syntax is already tag-free by the time :template_nest prints
      // it - the re-emission is the stripped form, not the authored form.
      // The name is compound so it is not field_only (that branch is
      // card-mod-edit's unported `nest template_link_set_name` path, named
      // in the receipt's remainder list - this test stays off it).
      const body = layoutFormat.withNestMode("template", () =>
        layoutFormat.processContent("<b>{{<i>Probe+Field</i>|core}}</b>"),
      );
      expect(body).toBe("<b>{{Probe+Field|core}}</b>");
    } finally {
      storage.close();
    }
  });

  it("a nest that resolves to no card still re-emits its syntax in :template mode", async () => {
    const { storage, layoutFormat } = await seedTemplateModeDeck();
    try {
      // template_nest.rb:11 answers from voo.nest_syntax alone, so a
      // :template-mode nest needs no card at all - not even an unknown
      // one. In :normal mode the same mark is consumed and replaced.
      const templated = layoutFormat.withNestMode("template", () =>
        layoutFormat.processContent("{{No Such Card At All+field|core}}"),
      );
      expect(templated).toBe("{{No Such Card At All+field|core}}");
      const normal = layoutFormat.processContent("{{No Such Card At All+field|core}}");
      expect(normal).not.toContain("{{No Such Card At All+field|core}}");
    } finally {
      storage.close();
    }
  });
});
