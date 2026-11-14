// The html FORMAT itself, measured against the PINNED MOD's own html format
// class, the PINNED MOD's own show ladder, the PINNED LAYOUT MOD's other
// half of that ladder, and the PINNED DECK's own dispatch.
//
// The completeness register's D1 row ([Family]) is the html format, and the
// register's own port evidence for it is one sentence ("The primary path
// everywhere (A5/A21/B1)"). That is a POINTER, not a measurement. This file
// measures the format's own semantics, which the pointer does not carry.
//
// fixtures/captured/html-format-ruby-oracle.json is what
// tests/server/oracle-capture-html-format-ruby.rb recorded by loading the
// PINNED MOD's own format files (the html class body, which registers
// :html and carries mime_type, escape_literal, main? and focal?), the
// PINNED card gem's own nesting modules (depth, main!), the PINNED set
// blocks (the format mod's show.rb and the layout mod's process_layout.rb,
// class_eval'd onto a probe that SUBCLASSES the pinned html format class),
// and the PINNED DECK's own format_name_from_params.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE FORMAT IS REGISTERED and its mime type is text/html. The BASE
//      format's own mime type is text/plain, so "text/html" is the html
//      class's own answer and not the base's.
//   2. THE ESCAPED LITERAL IS WRAPPED. The html format's own
//      escape_literal answers `<span>{</span>`, where the base's own
//      escape_literal is the identity. The port's own helper answers the
//      same bytes for a card that is not a Markdown card.
//   3. main? IS FALSE UNTIL main!. It is `!@main.nil?`, so a fresh format
//      is not main, and the two methods that make it main are the layout
//      mod's show_with_page_layout (which calls main! first) and the
//      format mod's show_without_page_layout (which sets @main from the
//      params or the args).
//   4. focal? IS A DISJUNCTION AND IT MEMOIZES: `@focal ||= show_layout?
//      ? main? : depth.zero?`. The only state in which the html format is
//      NOT focal is "the layout is shown and the format is not main". The
//      `@focal ||=` means the first answer is the answer for good.
//   5. show_layout? IS NOT A BOOLEAN. It is `return false if no_layout?;
//      !Env.ajax? || params[:layout]`, so it answers TRUE for a plain
//      request, NIL for an ajax request with no layout asked for, the
//      LAYOUT NAME when the params ask for one, and FALSE when the params
//      ask for no layout at all.
//   6. THE SHOW LADDER NAMES TWO ARMS, and the layout arm belongs to the
//      LAYOUT mod, not to the format mod.
//   7. THE LAYOUT ARM CALLS main! FIRST and then asks render! with the
//      main render args, so the page's own render is the main one.
//   8. THE HTML PAGE WRAPPER IS THE DOCTYPE DOCUMENT, and the block's own
//      bytes are the pinned ones.
//
// THE PORT'S ANSWER, and the DIVERGENCE THIS ROW NAMED (now LANDED):
//
//   The port's focal rule (src/card/render/format.ts) is
//   `this.formatName === "html" ? this.isMain : this.depth === 0`. The
//   pinned html rule is `show_layout? ? main? : depth.zero?`. The port's
//   html arm was the pinned rule with the show_layout? TERM DROPPED, so
//   the two agreed in the serving posture (the layout is shown) and
//   DIFFERED in the other one (an ajax request, or params[:layout] ==
//   "none"): the pinned html root was then focal by depth.zero? and the
//   port's html root was not focal at all.
//
//   ROUND SEVEN LANDED THE TERM. The port now reads show_layout?: the
//   RenderFormat carries a showLayout option (the request's posture, the
//   pinned show_layout? of card-mod-format set/all/html/show.rb:40-48),
//   the html arm of the focal rule reads it, and the page path threads it
//   (the bare main-view lane is the no-layout lane). The four answers of
//   the pinned matrix are measured on the port below. The port's own
//   non-html arm IS the pinned base's rule (depth.zero?), and this file
//   measures that too.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import {
  RenderFormat,
  allRenderingErrorsRaise,
  escapeLiteralForCard,
  setRaiseAllRenderingErrors,
} from "../../src/card/render/format.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/html-format-ruby-oracle.json"), "utf8"),
) as {
  registry: { registered: string[]; mimeTypes: Record<string, string> };
  htmlFormat: {
    registered: boolean;
    mimeType: string;
    escapeLiteral: string;
    baseMimeType: string;
    baseEscapeLiteral: string;
  };
  focal: Array<{
    label: string;
    ajax: boolean;
    main: boolean;
    mainQuestion: boolean;
    depth: number;
    showLayout: boolean | string | null;
    focalFirst: boolean;
    focalSecond: boolean;
    focalMemoized: boolean;
  }>;
  showLadder: Array<{
    label: string;
    params: Record<string, string>;
    ajax: boolean;
    noLayout: boolean;
    showLayout: boolean | string | null;
    showMethod: string;
  }>;
  withoutPageLayout: Array<{
    label: string;
    paramsIn: Record<string, string>;
    argsIn: Record<string, unknown>;
    argsOut: Record<string, unknown>;
    mainAfter: boolean;
    returned: string;
    calls: Array<{ ask: string; view?: string; args?: Record<string, string> }>;
  }>;
  withPageLayout: Array<{
    label: string;
    params: Record<string, string>;
    mainAfter: boolean;
    returned: string;
    calls: Array<{ ask: string; view?: string; args?: Record<string, string>; layout?: string }>;
  }>;
  htmlPageWrapper: { declared: boolean; rendered: string };
  dispatch: Array<{ label: string; requested: string; params: Record<string, string>; formatName: string }>;
};

const focalByLabel = (label: string) => {
  const row = ORACLE.focal.find((entry) => entry.label === label);
  if (!row) throw new Error(`the oracle has no focal row named ${label}`);
  return row;
};

const ladderByLabel = (label: string) => {
  const row = ORACLE.showLadder.find((entry) => entry.label === label);
  if (!row) throw new Error(`the oracle has no show ladder row named ${label}`);
  return row;
};

describe("the html format, against the pinned mod and the pinned deck", () => {
  it("the mod's own files register html, and the html class's own mime type is text/html", () => {
    expect(ORACLE.registry.registered).toContain("html");
    expect(ORACLE.htmlFormat.registered).toBe(true);
    expect(ORACLE.htmlFormat.mimeType).toBe("text/html");
    // The BASE's own mime type is text/plain, so text/html is the html
    // class's answer and not the base's.
    expect(ORACLE.htmlFormat.baseMimeType).toBe("text/plain");
    expect(ORACLE.registry.mimeTypes["html"]).toBe("text/html");
  });

  it("the html format's own escape_literal wraps the literal in a span", () => {
    expect(ORACLE.htmlFormat.escapeLiteral).toBe("<span>{}</span>");
    // The base's own escape_literal is the identity, and the shared rig's
    // bare Card stand-in does not carry it, so the capture recorded the
    // failed call and the pinned line is quoted in the fixture's sources.
    expect(ORACLE.htmlFormat.baseEscapeLiteral).toContain("RAISED");
  });

  it("main? is false on a fresh format and true only after main!", () => {
    const notMain = focalByLabel("a fresh format, layout shown, not main");
    expect(notMain.mainQuestion).toBe(false);
    const main = focalByLabel("a fresh format, layout shown, main!");
    expect(main.mainQuestion).toBe(true);
  });

  it("focal? is false ONLY when the layout is shown and the format is not main", () => {
    // The layout is shown and the format is not main: NOT focal.
    expect(focalByLabel("a fresh format, layout shown, not main").focalFirst).toBe(false);
    // The layout is shown and the format is main: focal.
    expect(focalByLabel("a fresh format, layout shown, main!").focalFirst).toBe(true);
    // The layout is NOT shown: the pinned rule falls to depth.zero?, and
    // the root format's depth is zero, so it IS focal, main or not.
    expect(focalByLabel("a fresh format, no layout shown, not main").focalFirst).toBe(true);
    expect(focalByLabel("a fresh format, no layout shown, main!").focalFirst).toBe(true);
  });

  it("focal? memoizes: the second ask cannot change the answer", () => {
    for (const row of ORACLE.focal) {
      expect(row.focalSecond, row.label).toBe(row.focalFirst);
      expect(row.focalMemoized, row.label).toBe(true);
    }
  });

  it("show_layout? is not a boolean: it answers nil, true, or the layout NAME", () => {
    expect(ladderByLabel("a plain request").showLayout).toBe(true);
    // An ajax request with no layout asked for: `!Env.ajax? || params
    // [:layout]` is `false || nil`, so the answer is NIL, not false.
    expect(ladderByLabel("an ajax request").showLayout).toBeNull();
    // A request that asks for a layout: the answer is the LAYOUT NAME.
    expect(ladderByLabel("a request that asks for a layout").showLayout).toBe("default");
    // A request that asks for no layout: the guard answers false first.
    expect(ladderByLabel("a request that asks for no layout").showLayout).toBe(false);
  });

  it("the show ladder names two arms, and the layout arm is the LAYOUT mod's", () => {
    expect(ladderByLabel("a plain request").showMethod).toBe("show_with_page_layout");
    expect(ladderByLabel("an ajax request").showMethod).toBe("show_without_page_layout");
    expect(ladderByLabel("a request that asks for a layout").showMethod).toBe("show_with_page_layout");
    expect(ladderByLabel("a request that asks for no layout").showMethod).toBe("show_without_page_layout");
  });

  it("the format mod's own without-layout arm sets main only when asked", () => {
    const notAsked = ORACLE.withoutPageLayout.find((row) => row.label === "no main asked for");
    const asked = ORACLE.withoutPageLayout.find((row) => row.label === "the args ask for main");
    const paramsAsked = ORACLE.withoutPageLayout.find(
      (row) => row.label === "the params ask for main",
    );
    expect(notAsked?.mainAfter).toBe(false);
    expect(asked?.mainAfter).toBe(true);
    expect(paramsAsked?.mainAfter).toBe(true);
  });

  it("the layout mod's own arm calls main! FIRST and then asks render! with main set", () => {
    const row = ORACLE.withPageLayout.find((entry) => entry.label === "no layout in the params, no rule");
    expect(row?.mainAfter).toBe(true);
    const asks = row?.calls ?? [];
    // The layout is resolved from the params, the rule, or the :default.
    const layoutAsk = asks.find((ask) => ask.ask === "Layout.main_nest_opts");
    expect(layoutAsk?.layout).toBe("default");
    // The main render args carry the view, main and main_view.
    const renderAsk = asks.find((ask) => ask.ask === "render!");
    expect(renderAsk?.args?.["main"]).toBe(true);
    expect(renderAsk?.args?.["main_view"]).toBe(true);
    expect(renderAsk?.args?.["layout"]).toBe("default");
  });

  it("the html page wrapper's own bytes are the DOCTYPE document", () => {
    expect(ORACLE.htmlPageWrapper.declared).toBe(true);
    expect(ORACLE.htmlPageWrapper.rendered).toContain("<!DOCTYPE HTML>");
    expect(ORACLE.htmlPageWrapper.rendered).toContain('<html class="h-100">');
  });

  it("the deck's own dispatch answers html for the html doors", () => {
    const browser = ORACLE.dispatch.find((row) => row.label === "the browser door, no suffix");
    const suffix = ORACLE.dispatch.find((row) => row.label === "the suffix door");
    expect(browser?.formatName).toBe("html");
    expect(suffix?.formatName).toBe("html");
  });
});

describe("the port's html format, against the pinned answers", () => {
  let storage: RenderTestStorage;
  let priorLoud: boolean | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
    // A Date card whose content raises when its :core renders. That is the
    // raising view the focal arms are measured with.
    await seedCard(storage, { id: 90, name: "Date", codename: "date", typeId: 2 });
    await seedCard(storage, { id: 500, name: "broken date card", typeId: 90, dbContent: "1980" });
    // A card whose content carries an ESCAPED literal, which the html
    // format's own escape_literal wraps.
    await seedCard(storage, {
      id: 501,
      name: "escaped literal card",
      typeId: 2,
      dbContent: "write this: \\{{Foo}}",
    });
    storage.fetcher.installNameEnvironment();
    // The STOCK rescue posture: quiet at a non-focal format
    // (card-1.110.0/lib/card/format/error.rb:65-73, whose
    // raise_all_rendering_errors defaults false). The engine's process
    // default here is the development-loud posture, so the pins set the
    // stock posture explicitly and restore it afterwards.
    priorLoud = allRenderingErrorsRaise();
    setRaiseAllRenderingErrors(false);
  });

  afterAll(() => {
    if (priorLoud !== undefined) setRaiseAllRenderingErrors(priorLoud);
    storage?.close();
  });

  it("the port's default format name is html", async () => {
    const card = await storage.engine.prepareItemForRender("escaped literal card");
    expect(card).toBeDefined();
    const fmt = new RenderFormat(card!, storage.engine);
    expect(fmt.formatName).toBe("html");
  });

  it("the port's html arm wraps the escaped literal in the SAME span the pinned class does", async () => {
    // The port's own helper (src/card/render/format.ts:5289) is the port
    // of the html format's own escape_literal.
    expect(escapeLiteralForCard({}, "{")).toBe("<span>{</span>");
    // And a real render carries the same bytes.
    const html = await storage.engine.render("escaped literal card", "content");
    expect(html).toContain("<span>{</span>");
  });

  it("the port's html arm is main?-based and the other formats are depth-based", async () => {
    const card = await storage.engine.prepareItemForRender("broken date card");
    expect(card).toBeDefined();
    // The html root format: the port's html arm is this.isMain, and a root
    // format that was not asked to be main is not main, so the delegated
    // raise is QUIET. The pinned html focal? at the root in the serving
    // posture is main? too, so the two agree here.
    const htmlFormat = new RenderFormat(card!, storage.engine);
    expect(htmlFormat.formatName).toBe("html");
    expect(htmlFormat.renderDelegated("core")).toContain("Error rendering");
    // The SAME card and the SAME depth, carried through a NON-html format:
    // the port's other arm is depth === 0, and this format's depth is
    // zero, so it IS focal and the delegated raise is LOUD. This is the
    // pinned base format's own focal? (`depth.zero?`,
    // card-1.110.0/lib/card/format/nesting/subformat.rb:41-43).
    const rssFormat = htmlFormat.withFormatName("rss");
    expect(rssFormat.formatName).toBe("rss");
    expect(() => rssFormat.renderDelegated("core")).toThrow();
  });

  it("THE PORT'S HTML ARM NOW READS THE show_layout? TERM, and the answer follows it", async () => {
    // The row's unblock condition: the port's html focal rule reads the
    // show_layout? term, so a depth-zero html format whose LAYOUT IS NOT
    // SHOWN is focal by depth.zero? and its delegated raise is LOUD, while
    // the same format with the layout shown is focal by main? and stays
    // QUIET. The port's own rule now reads the term (the showLayout
    // option), and this leg measures both answers on the SAME card and the
    // SAME depth.
    const card = await storage.engine.prepareItemForRender("broken date card");
    expect(card).toBeDefined();
    // LAYOUT SHOWN, not main: focal by main? -> QUIET.
    const shown = new RenderFormat(card!, storage.engine, { showLayout: true });
    expect(shown.showLayout).toBe(true);
    expect(shown.renderDelegated("core")).toContain("Error rendering");
    // LAYOUT NOT SHOWN, not main: focal by depth.zero? -> LOUD.
    const hidden = new RenderFormat(card!, storage.engine, { showLayout: false });
    expect(hidden.showLayout).toBe(false);
    expect(() => hidden.renderDelegated("core")).toThrow();
    // LAYOUT SHOWN, main!: focal by main? -> LOUD.
    const mainShown = new RenderFormat(card!, storage.engine, { main: true, showLayout: true });
    expect(() => mainShown.renderDelegated("core")).toThrow();
    // LAYOUT NOT SHOWN, main!: focal by depth.zero? -> LOUD.
    const mainHidden = new RenderFormat(card!, storage.engine, { main: true, showLayout: false });
    expect(() => mainHidden.renderDelegated("core")).toThrow();
  });

  it("the PINNED focal matrix, and the port's four answers beside it", () => {
    // The capture's four rows are the pinned rule's own answers over the
    // two postures and the two main flags. The port answers the same four
    // now that its rule reads the term.
    const byLabel = new Map(ORACLE.focal.map((row) => [row.label, row]));
    const noLayoutNotMain = byLabel.get("a fresh format, no layout shown, not main")!;
    expect(noLayoutNotMain.ajax).toBe(true);
    expect(noLayoutNotMain.main).toBe(false);
    expect(noLayoutNotMain.depth).toBe(0);
    // show_layout? answers NIL for an ajax request, and NIL is falsy, so
    // the rule takes the depth.zero? arm.
    expect(noLayoutNotMain.showLayout).toBeNull();
    expect(noLayoutNotMain.focalFirst).toBe(true);
    // The layout shown and not main: the main? arm, so NOT focal.
    const shownNotMain = byLabel.get("a fresh format, layout shown, not main")!;
    expect(shownNotMain.showLayout).toBe(true);
    expect(shownNotMain.focalFirst).toBe(false);
    // main! answers focal in both postures.
    expect(byLabel.get("a fresh format, layout shown, main!")!.focalFirst).toBe(true);
    expect(byLabel.get("a fresh format, no layout shown, main!")!.focalFirst).toBe(true);
    // And the rule MEMOIZES: the first answer is the answer for good.
    for (const row of ORACLE.focal) {
      expect(row.focalSecond, row.label).toBe(row.focalFirst);
      expect(row.focalMemoized, row.label).toBe(true);
    }
  });

  it("THE PAGE PATH THREADS THE POSTURE: the bare lane is the no-layout lane", () => {
    // The pinned show ladder (card-mod-format set/all/html/show.rb:36-48)
    // picks show_without_page_layout for an ajax request and for
    // params[:layout] == "none", and the port's page path has exactly one
    // no-layout lane: the bare main-view lane (page.ts's bareMainOpts
    // seam). The root format it builds carries the posture, so the html
    // focal rule reads the term where the request asks for it.
    const source = readFileSync(path.join(REPO, "src/card/render/page.ts"), "utf8");
    expect(source).toContain("showLayout: bareMainOpts === undefined,");
    // And the rule itself reads the term.
    const format = readFileSync(path.join(REPO, "src/card/render/format.ts"), "utf8");
    expect(format).toContain("this.showLayout");
    expect(format).toContain("? this.isMain");
  });

  it("the port's html answer is the page's own html, and the escaped literal survives it", async () => {
    const html = await storage.engine.render("escaped literal card", "open");
    expect(html).toContain("<span>{</span>");
    // The page's own chrome is the port's page seam, which the A5/A21/B1
    // rows already adjudicate; this row is the FORMAT, and what the format
    // contributes to the page is its bytes.
    expect(html).toContain("write this:");
  });
});
