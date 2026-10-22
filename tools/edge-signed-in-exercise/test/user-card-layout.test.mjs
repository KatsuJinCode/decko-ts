// cap-N9 - visiting a User card through the layout its own rule names.
//
// THE PIN. card-mod-layout-0.20.0's process_layout.rb, card_layout.rb and
// unknown_layout.rb are vendored verbatim and sha256-pinned. The graded
// strings - the page_layout arms, the raise text, the main-nest lookup - are
// READ OUT of those files rather than retyped.
//
// WHAT THIS TEST IS FOR. The row's recorded finding is "rendered.markers are
// all false with order [-1,-1,-1] and an empty layoutOrder ... Until a probe
// decides whether the fixture markers are wrong or the layout genuinely does
// not render them, the layout-render leg is unproven". The tests below are that
// probe's instrument: they take the ONE piece of evidence the run produced -
// markers absent, page 200 - and show that it maps to two different failures,
// and that the predicate tells them apart by name.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  layoutChunks,
  resolvePageLayout,
  layoutKind,
  userCardLayout,
  USER_LAYOUT_CHECKS,
  NO_MAIN_NEST_MESSAGE,
  MAIN_NEST_NAME,
} from "../lib/user-card-layout.mjs";

const VENDOR = new URL("../../../fixtures/vendor/card-mod-layout-0.20.0/", import.meta.url);
const readVendor = (rel) => readFileSync(new URL(rel, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const VENDORED = {
  "set/all/process_layout.rb":
    "950e1800cae3f3d20ed99c90fac2287b4d2a349046b37c3cfaf3374b60b38c85",
  "lib/card/layout/card_layout.rb":
    "e86e9222d95cad570dd2f0578709d6d74b054f55fc94c695093b8251b54d0e38",
  "lib/card/layout/unknown_layout.rb":
    "28a4ab3900de3ad8a75d08fec005b8a9ac49d3eef24a18898cc2466875a65b68",
};

test("the vendored Ruby layout sources are the gem's bytes, sha256 pinned", () => {
  for (const [rel, digest] of Object.entries(VENDORED)) {
    assert.equal(sha256(readVendor(rel)), digest, `${rel} drifted from card-mod-layout-0.20.0`);
  }
});

test("the resolution chain this row grades is read out of the pinned Ruby", () => {
  const process = readVendor("set/all/process_layout.rb").toString("utf8");
  // process_layout.rb:29-31 - the arms, IN ORDER. This ordering is the whole
  // contract: a rule that resolves only when params and layout_for_view are
  // both absent is not being honoured.
  assert.match(process, /def page_layout view\s*\n\s*params\[:layout\] \|\| layout_for_view\(view\) \|\| layout_name_from_rule \|\| :default/);
  // :34-36 - the rule arm reads the rule card's FIRST NAME.
  assert.match(process, /def layout_name_from_rule\s*\n\s*card\.rule_card\(:layout\)&\.try :first_name/);

  const cardLayout = readVendor("lib/card/layout/card_layout.rb").toString("utf8");
  // card_layout.rb:15-18 - the raise, with the layout name interpolated. This
  // is the (a) case's exact text: a layout with no main nest does not render
  // quietly, it raises.
  assert.match(cardLayout, /raise\(Card::Error, "no main nest found in layout \\"#\{@layout\}\\""\)/);
  // :12-14 - the layout's OWN content is what renders.
  assert.match(cardLayout, /def render\s*\n\s*@format\.process_content layout_card\.content, chunk_list: :references/);
  // :27 - the main nest is the FIRST chunk marked main, not any chunk.
  assert.match(cardLayout, /content\.each_chunk\.find\(&:main\?\)/);

  const unknown = readVendor("lib/card/layout/unknown_layout.rb").toString("utf8");
  // unknown_layout.rb:7-18 - an unresolvable layout name renders a HEADING
  // naming the unknown layout, plus the available list. That is a dark page,
  // not a 200 with the layout's parts on it.
  assert.match(unknown, /content_tag :h1, t\(:layout_unknown_layout, name: @layout\)/);
  assert.match(unknown, /t :layout_available_layouts/);
});

test("the main nest name is the gem's own _main sink", () => {
  assert.equal(MAIN_NEST_NAME, "_main");
});

test("the raise text the predicate names is the gem's own", () => {
  // The module exports a TEMPLATE, because Ruby interpolates the layout name at
  // raise time. The template is the gem's own argument with the interpolation
  // replaced by a placeholder - and the comparison runs in that direction,
  // because the gem is the source and the template is derived from it.
  const line = readVendor("lib/card/layout/card_layout.rb").toString("utf8").split("\n").find((l) => l.includes("raise("));
  const marker = 'raise(Card::Error, "';
  const afterMarker = line.slice(line.indexOf(marker) + marker.length);
  // Cut at the LAST quote before the closing paren: the message contains
  // escaped quotes, and stopping at the first would capture half of it.
  const raw = afterMarker.slice(0, afterMarker.lastIndexOf('")'));
  const quote = String.fromCharCode(34);
  const backslash = String.fromCharCode(92);
  const gemArgument = raw.split(backslash + quote).join(quote);
  // The gem interpolates @layout; the template carries a placeholder in its
  // place and nothing else differs.
  assert.equal(gemArgument.replace("#{@layout}", "<name>"), NO_MAIN_NEST_MESSAGE);
  assert.ok(gemArgument.includes("#{@layout}"), "and the gem really does interpolate the layout name");
});

test("the layout's chunks are read the way Ruby walks them, main nest first-match", () => {
  // A layout of the shape the row's fixture built: header text, the main nest
  // with a view, footer text.
  const content = "Harness header\n{{_main|view: open}}\nHarness footer";
  const chunks = layoutChunks(content);
  assert.equal(chunks.length, 1, "only the nest is a chunk; the text around it is layout content, not a chunk");
  assert.equal(chunks[0].name, "_main");
  assert.equal(chunks[0].view, "open");
  // The main nest is the `_main` SINK (main.rb:26-28), not a chunk option -
  // there is no `main:` option at all. The fixture layout above proves it:
  // nothing in {{_main|view: open}} says main, and it is main.
  assert.equal(chunks[0].main, true);
  // The FIRST main chunk wins (card_layout.rb:27 `find(&:main?)`), so a layout
  // carrying two _main nests uses the first.
  const twoMains = layoutChunks("{{_first|view: a}} text {{_main}}");
  assert.equal(twoMains.find((c) => c.main).name, "_main");
  // And a chunk that is NOT the sink is not main, whatever its options say.
  assert.equal(layoutChunks("{{_other|view: a, main: true}}")[0].main, false);
});

test("page_layout resolves by its arms, in Ruby's order", () => {
  // params beats layout_for_view beats the rule beats :default.
  assert.equal(resolvePageLayout({ ruleName: "R", paramsLayout: "P", layoutForView: "V" }).layoutName, "P");
  assert.equal(resolvePageLayout({ ruleName: "R", layoutForView: "V" }).layoutName, "V");
  assert.equal(resolvePageLayout({ ruleName: "R" }).layoutName, "R");
  assert.equal(resolvePageLayout({}).layoutName, ":default");
  // And the arm is named, so a 200-that-ignored-the-rule is distinguishable
  // from a correct page.
  assert.equal(resolvePageLayout({ ruleName: "R" }).arm, "rule");
  assert.equal(resolvePageLayout({ ruleName: "R", paramsLayout: "P" }).arm, "params");
  assert.equal(resolvePageLayout({ ruleName: "R" }).arm === "default", false);
});

test("the recorded run's evidence maps to two DIFFERENT failures, not one", () => {
  // The row's finding: markers all false, order [-1,-1,-1], page 200, rule
  // stored (status 303). Two causes, identical evidence under a marker check.
  const evidence = {
    html: "<div class='card-slot content-view'>the card body</div>",
    ruleName: "Harness_CF_User_Layout",
    layoutCardName: "Harness_CF_User_Layout",
    layoutCardType: "layout_type",
    bodyMarker: "the card body",
    layoutMarkers: ["Harness user layout header", "Harness user layout footer"],
  };

  // (a) THE FIXTURE'S LAYOUT WAS WRONG. The layout card fetched fine and its
  // type classifies, but its content nests no _main sink, so
  // card_layout.rb:15-18 RAISES. Ruby's answer is a raise, not a 200 with the
  // layout's strings on it - and the predicate names that case by name.
  const wrongFixture = userCardLayout({
    ...evidence,
    layoutChunks: layoutChunks("Harness header\n{{_body|view: open}}\nHarness footer"),
  });
  assert.ok(wrongFixture.failures.includes("layoutHasNoMainNest"), JSON.stringify(wrongFixture.failures));
  // The layout DID resolve, so the resolution legs are clean here - which is
  // precisely what separates this cause from the other.
  assert.equal(wrongFixture.failures.includes("ruleNotHonoured"), false);
  assert.equal(wrongFixture.resolution.arm, "rule");
  assert.equal(wrongFixture.kind, "card");

  // (b) THE LAYOUT GENUINELY DID NOT RENDER. The card's rule was ignored: the
  // page answered 200 and fell back to :default, so the layout card never ran.
  const ignored = userCardLayout({
    ...evidence,
    paramsLayout: ":default",
    layoutForView: null,
    layoutCardName: null,
    layoutChunks: [],
  });
  assert.ok(ignored.failures.includes("ruleNotHonoured"), JSON.stringify(ignored.failures));
  assert.ok(ignored.failures.includes("wrongLayoutResolved"));
  assert.equal(ignored.failures.includes("layoutHasNoMainNest"), false);

  // THE POINT OF THE WHOLE ROW: the same recorded evidence, two causes, and the
  // predicate says which. The two DO share the symptom the old check reported -
  // the layout's chunks are not on the page, which is why it read as one
  // finding ("rendered.markers are all false"). What differs is the CAUSE, and
  // each case carries a discriminating failure the other does not:
  //   (a) resolved by the card's rule, then raised on the missing main nest
  //   (b) never resolved by the rule at all
  const onlyWrongFixture = wrongFixture.failures.filter((f) => !ignored.failures.includes(f));
  const onlyIgnored = ignored.failures.filter((f) => !wrongFixture.failures.includes(f));
  assert.ok(onlyWrongFixture.includes("layoutHasNoMainNest"), JSON.stringify(wrongFixture.failures));
  assert.ok(onlyIgnored.includes("ruleNotHonoured"), JSON.stringify(ignored.failures));
  // And the shared symptom is exactly the one the old check collapsed.
  assert.ok(wrongFixture.failures.includes("layoutChunkNotRendered"));
  assert.ok(ignored.failures.includes("layoutChunkNotRendered"));
});

test("a correctly rendered layout grades green, with the body inside the main nest", () => {
  const layout = "Harness header\n{{_main|view: open}}\nHarness footer";
  const html = [
    "<div>Harness header</div>",
    "<div>the card body</div>",
    "<div>Harness footer</div>",
  ].join("");
  const verdict = userCardLayout({
    html,
    ruleName: "Harness_CF_User_Layout",
    layoutCardName: "Harness_CF_User_Layout",
    layoutCardType: "layout_type",
    bodyMarker: "the card body",
    layoutMarkers: ["Harness header", "Harness footer"],
    layoutChunks: layoutChunks(layout),
    mainNestChunkName: "_main",
  });
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.resolution.arm, "rule");
  assert.equal(verdict.kind, "card");
  assert.equal(verdict.placement.bodyInsideLayout, true);
  assert.equal(verdict.placement.chunksInLayoutOrder, true);
});

test("a page that answered 200 while resolving :default fails ruleNotHonoured", () => {
  // The failure the row could not previously distinguish from a correct page:
  // a 200, the body present, and the card's rule never read.
  const verdict = userCardLayout({
    html: "<div>the card body</div>",
    ruleName: "Harness_CF_User_Layout",
    paramsLayout: ":default",
    layoutCardName: null,
    bodyMarker: "the card body",
    layoutMarkers: [],
    layoutChunks: [],
  });
  assert.ok(verdict.failures.includes("ruleNotHonoured"));
  assert.ok(verdict.failures.includes("wrongLayoutResolved"));
});

test("a layout that fetches to nothing is an unknown layout, not a silent 200", () => {
  const verdict = userCardLayout({
    html: "<div>the card body</div>",
    ruleName: "No Such Layout",
    layoutCardName: null,
    bodyMarker: "the card body",
    layoutMarkers: [],
    layoutChunks: [],
  });
  assert.equal(verdict.kind, "unknown");
  assert.ok(verdict.failures.includes("unknownLayout"));
});

test("a layout that renders its parts but not AROUND the main slot fails bodyOutsideLayout", () => {
  // The row's own stated standard ("a layout that renders its parts but not
  // around the main slot is not the user layout"), which the old check said
  // and could not measure.
  const html = ["<div>the card body</div>", "<div>Harness header</div>", "<div>Harness footer</div>"].join("");
  const verdict = userCardLayout({
    html,
    ruleName: "L",
    layoutCardName: "L",
    layoutCardType: "layout_type",
    bodyMarker: "the card body",
    layoutMarkers: ["Harness header", "Harness footer"],
    layoutChunks: layoutChunks("Harness header\n{{_main|view: open}}\nHarness footer"),
    mainNestChunkName: "_main",
  });
  assert.ok(verdict.failures.includes("bodyOutsideLayout"));
  assert.equal(verdict.ok, false);
});

test("a layout rendered back-to-front fails layoutChunksOutOfOrder", () => {
  const html = ["<div>Harness footer</div>", "<div>the card body</div>", "<div>Harness header</div>"].join("");
  const verdict = userCardLayout({
    html,
    ruleName: "L",
    layoutCardName: "L",
    layoutCardType: "layout_type",
    bodyMarker: "the card body",
    layoutMarkers: ["Harness header", "Harness footer"],
    layoutChunks: layoutChunks("Harness header\n{{_main|view: open}}\nHarness footer"),
    mainNestChunkName: "_main",
  });
  assert.ok(verdict.failures.includes("layoutChunksOutOfOrder"));
});

test("a card with no body rendered is named, not averaged into the markers", () => {
  const verdict = userCardLayout({
    html: "<div>Harness header</div><div>Harness footer</div>",
    ruleName: "L",
    layoutCardName: "L",
    layoutCardType: "layout_type",
    bodyMarker: "the card body",
    layoutMarkers: ["Harness header", "Harness footer"],
    layoutChunks: layoutChunks("Harness header\n{{_main|view: open}}\nHarness footer"),
  });
  assert.ok(verdict.failures.includes("cardBodyNotRendered"));
  assert.equal(verdict.placement, null);
});

test("a layout that nests something other than _main has no main nest, and Ruby raises", () => {
  // The sink rule is exact: main_nest?(name) is name == "_main"
  // (main.rb:26-28). A layout whose only nest is {{_other}} therefore finds no
  // main chunk, and card_layout.rb:17 raises rather than rendering. A driver
  // that drove this fixture sees the RAISE, not a quiet 200 - which is how
  // cause (a) is told from cause (b) on a live page.
  const verdict = userCardLayout({
    html: "<div>Harness header</div><div>the card body</div><div>Harness footer</div>",
    ruleName: "L",
    layoutCardName: "L",
    layoutCardType: "layout_type",
    bodyMarker: "the card body",
    layoutMarkers: ["Harness header", "Harness footer"],
    layoutChunks: layoutChunks("Harness header\n{{_other|view: open}}\nHarness footer"),
  });
  assert.ok(verdict.failures.includes("layoutHasNoMainNest"), JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, false);
});

test("the four check names name their own legs", () => {
  assert.deepEqual(Object.keys(USER_LAYOUT_CHECKS).sort(), ["chunks", "kind", "mainNest", "resolution"]);
  assert.match(USER_LAYOUT_CHECKS.resolution, /:default fallback/);
  assert.match(USER_LAYOUT_CHECKS.mainNest, /inside the layout's main nest/);
});

test("the FIXTURE writes a body: a body that never landed is its own failure", () => {
  // THE DEFECT THIS PINS. The N9 fixture created the User card and filled
  // the create form's `card[content]` field with a plain fill. The User
  // type's content field is a RichText field, so the form carries a TinyMCE
  // editor and that field is the editor's HIDDEN textarea: filling it stores
  // nothing. The signed-in run of 2026-10-22 (the tranche-7 baseline) then
  // measured a body that was never written and named it
  // "cardBodyNotRendered" - a finding about the FIXTURE, not about the
  // layout. The captured page of that run
  // (.runtime/edge-signed-in/tranche7-base-1/report.md.raw/
  // 129-content-flows-user-layout-chain.html) shows the layout's header and
  // footer rendered around the main nest and the card's own content slot
  // rendering `<p></p>` - an empty body.
  //
  // The fix: the fixture sets the EDITOR (the way lib/typed-fixture.mjs sets
  // a fixture's editor) and the STORED content is read back before the leg
  // measures anything, so a body that never landed is named
  // "cardBodyNotStored" and is never mistaken for the layout's doing.
  const contentFlows = readFileSync(
    new URL("../checks-content-flows.mjs", import.meta.url),
    "utf8",
  );
  // The editor is set and saved, through the committed helper.
  assert.match(contentFlows, /matchingRichEditor/);
  assert.match(contentFlows, /editor\.setContent\(text\); editor\.save\(\)/);
  // The bare fill of the hidden textarea is gone.
  assert.equal(
    /if \(await contentField\.count\(\) > 0\) await contentField\.fill\(body\)\.catch/.test(contentFlows),
    false,
  );
  // The stored body is read back and the leg is gated on it.
  assert.match(contentFlows, /bodyLanded/);
  assert.match(contentFlows, /'cardBodyNotStored'/);
  assert.match(contentFlows, /!has\('cardBodyNotRendered'\) && !has\('bodyOutsideLayout'\)/);
  // The body marker is the card's OWN body card: a User card is a cardtype
  // instance, so its body is the type's structure, and the structure's own
  // cards carry the card's name in their titles ("<card name>+image"). The
  // card's BARE name cannot be the marker - it also appears in the page's
  // header, outside the layout, and the predicate takes the first occurrence.
  assert.match(contentFlows, /const bodyMarker = userSurface\.namedSlots\.length > 0 \? `\$\{userCard\}\+\$\{userSurface\.namedSlots\[0\]\}` : null;/);
  assert.match(contentFlows, /bodyMarker: bodyMarker,/);

  // The predicate itself: a body between the layout's chunks is green, and
  // the same page WITHOUT the body is the named fixture failure.
  const withBody = userCardLayout({
    html: "<p>Harness user layout header</p><div id='main'><div class='card-slot content-view'>Harness user body</div></div><p>Harness user layout footer</p>",
    ruleName: "L",
    layoutCardName: "L",
    layoutCardType: "layout_type",
    bodyMarker: "Harness user body",
    layoutMarkers: ["Harness user layout header", "Harness user layout footer"],
    layoutChunks: layoutChunks("Harness user layout header\n{{_main}}\nHarness user layout footer"),
  });
  assert.deepEqual(withBody.failures, [], JSON.stringify(withBody.failures));
  assert.equal(withBody.placement.bodyInsideLayout, true);
  const withoutBody = userCardLayout({
    html: "<p>Harness user layout header</p><div id='main'><div class='card-slot content-view'><p></p></div></div><p>Harness user layout footer</p>",
    ruleName: "L",
    layoutCardName: "L",
    layoutCardType: "layout_type",
    bodyMarker: null,
    layoutMarkers: ["Harness user layout header", "Harness user layout footer"],
    layoutChunks: layoutChunks("Harness user layout header\n{{_main}}\nHarness user layout footer"),
  });
  assert.ok(withoutBody.failures.includes("cardBodyNotRendered"));
});