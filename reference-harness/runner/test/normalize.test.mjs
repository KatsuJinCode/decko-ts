// Normalisation is limited to what two oracle runs actually vary in, and a
// meaningful change next to a masked value still fails.
//
//   node --test reference-harness/runner/test/

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { gradeRun } from "../grade-lib.mjs";
import { normalizeHtml, normalizeRender, sameJson } from "../normalize.mjs";
import { HARNESS } from "./helpers.mjs";

const slot = "0123456789abcdef0123";
const other = "fedcba9876543210fedc";
const same = (a, b) => normalizeHtml(a) === normalizeHtml(b);

describe("N1: slot ids, the one mask", () => {
  it("masks a 20-hex slot id in either quote style", () => {
    assert.ok(same(`<div class="card-slot" data-slot-id="${slot}">x</div>`, `<div class="card-slot" data-slot-id="${other}">x</div>`));
    assert.ok(same(`<div data-card-type-code='Topic' data-slot-id='${slot}'>x</div>`, `<div data-card-type-code='Topic' data-slot-id='${other}'>x</div>`));
  });

  it("keeps the quote style: single against double quotes still differs", () => {
    assert.ok(!same(`<div data-slot-id='${slot}'>x</div>`, `<div data-slot-id="${slot}">x</div>`));
  });

  it("does not mask a value of another length or case", () => {
    assert.ok(!same(`<div data-slot-id="${slot}a">x</div>`, `<div data-slot-id="${other}a">x</div>`), "21 digits");
    assert.ok(!same(`<div data-slot-id="${slot.slice(1)}">x</div>`, `<div data-slot-id="${other.slice(1)}">x</div>`), "19 digits");
    assert.ok(!same(`<div data-slot-id="${slot.toUpperCase()}">x</div>`, `<div data-slot-id="${other.toUpperCase()}">x</div>`), "upper case");
  });

  it("does not mask other attributes or text that resembles a slot id", () => {
    assert.ok(!same(`<div data-card-id="${slot}">x</div>`, `<div data-card-id="${other}">x</div>`));
    assert.ok(!same(`<div data-slot-ids="${slot}">x</div>`, `<div data-slot-ids="${other}">x</div>`));
    assert.ok(!same(`<p>data-slot-id="${slot}"</p>`, `<p>data-slot-id="${other}"</p>`), "in text, not attribute position");
    assert.ok(!same(`<p>${slot}</p>`, `<p>${other}</p>`), "bare hex in text");
  });

  it("a content change beside a masked slot id still differs", () => {
    assert.ok(!same(`<div data-slot-id="${slot}">Topic 001</div>`, `<div data-slot-id="${other}">Topic 002</div>`));
    assert.ok(!same(`<div class="a" data-slot-id="${slot}">x</div>`, `<div class="b" data-slot-id="${other}">x</div>`));
  });

  it("normalises only the html of a render result", () => {
    assert.deepEqual(normalizeRender({ html: `<i data-slot-id="${slot}"></i>`, status: 200 }), { html: `<i data-slot-id="SLOT"></i>`, status: 200 });
    assert.ok(!sameJson(normalizeRender({ html: "<i></i>", status: 200 }), normalizeRender({ html: "<i></i>", status: 404 })));
  });
});

describe("N3: collapse-id contexts, the second volatile value", () => {
  const accordion = (n) =>
    `<button class='accordion-button collapsed' data-bs-target='#card-mod_style-${n}-collapse-id' data-bs-toggle='collapse' type='button'>\nStyles\n</button>\n<div class='accordion-collapse collapse' id='card-mod_style-${n}-collapse-id'>`;
  const other = (n) => n.replace(/-?\d+/, (d) => String(Number(d) + 77777));

  it("normalizes the digits of a collapse id to first-appearance placeholders", () => {
    assert.ok(same(accordion(419010129), accordion(-900385456)));
    // two distinct ids on one page keep two distinct placeholders, in order
    const page = (a, b) => `<div id='card-mod_style-${a}-collapse-id'></div><div id='card-mod_style-${b}-collapse-id'></div>`;
    assert.equal(
      normalizeHtml(page(419010129, -900385456)).match(/N3#\d/g).join(","),
      "N3#1,N3#2",
    );
    assert.equal(
      normalizeHtml(page(-900385456, 419010129)).match(/N3#\d/g).join(","),
      "N3#1,N3#2",
      "the first appearance on a page becomes N3#1 whichever value it is",
    );
  });

  it("a button target and its panel id must still agree across the normalization", () => {
    // the engine pairing target X with panel Y is a real divergence
    assert.ok(!same(
      accordion(419010129),
      accordion(419010129).replace(/-collapse-id'/g, "-collapse-id'").replace("id='card-mod_style-419010129", "id='card-mod_style--900385456"),
    ));
  });

  it("does not touch literal-context collapse ids or unrelated numbers", () => {
    assert.ok(!same(
      "<div id='card-mod_format-files-collapse-id'></div>",
      "<div id='card-mod_format-depends_on-collapse-id'></div>",
    ), "the gem_info literal contexts are real bytes");
    assert.ok(!same("<p>419010129</p>", "<p>-900385456</p>"), "bare numbers in text");
    assert.ok(!same("<div id='card-Topic-419010129'></div>", "<div id='card-Topic--900385456'></div>"), "no collapse-id suffix, no rule");
  });

  it("a content change beside a normalized collapse id still differs", () => {
    assert.ok(!same(
      accordion(419010129) + "<h3>Styles</h3>",
      accordion(-900385456) + "<h3>Tasks</h3>",
    ));
  });
});

describe("N4: relative-time spans, the frozen-clock canonical form", () => {
  // the oracle's frozen capture clock says "less than a minute"; any live
  // engine clock says "20 days" for the same stored timestamp
  const credit = (span) =>
    `<div class="cred"><a class="known-card" href="/Decko_Bot">Decko Bot</a> ${span}</div>`;

  it("canonicalizes every Rails time_ago_in_words shape to one placeholder", () => {
    for (const span of [
      "less than a minute",
      "1 minute",
      "2 minutes",
      "44 minutes",
      "about 1 hour",
      "about 3 hours",
      "1 day",
      "20 days",
      "about 1 month",
      "3 months",
      "about 1 year",
      "over 2 years",
      "almost 3 years",
    ]) {
      assert.ok(same(credit(span), credit("20 days")), span);
    }
  });

  it("the surrounding sentence still counts: a change outside the span fails", () => {
    assert.ok(!same(credit("less than a minute ago"), credit("20 days")), 'the "ago" tail is an anchor: present on one side only');
    assert.ok(same(credit("less than a minute ago"), credit("20 days ago")), "identical tails on both sides agree");
    assert.ok(!same(
      "<span class=\"last-update\">\n        added less than a minute ago by\n      </span>",
      "<span class=\"last-update\">\n        updated 20 days ago by\n      </span>",
    ));
    assert.ok(!same(credit("less than a minute"), credit("less than a minute") + "<p>more</p>"));
  });

  it("canonicalizes only the span: bare dates and other numbers are real bytes", () => {
    assert.ok(!same("<p>2026-09-19</p>", "<p>less than a minute</p>"), "the date view's encoding is not a relative-time span");
    assert.ok(!same("<p>2026-09-19</p>", "<p>2026-09-20</p>"));
    assert.ok(!same("<p>in 20 days</p>", "<p>in 3 weeks</p>"), "only the Rails vocabulary matches, and weeks is not in it");
  });

  it("does not swallow numbers outside Rails' table or digits that merely contain them", () => {
    assert.ok(!same("<p>120 days</p>", "<p>20 days</p>"), "Rails emits at most 30 days; prose keeps its real bytes");
    assert.ok(!same("<p>x120 days</p>", "<p>x20 days</p>"), "no word boundary, no rule");
  });

  it("a page may hold several spans; each becomes the same placeholder and anchors still bind", () => {
    const page = (a, b) => `<div>${a}</div><div>${b}</div>`;
    assert.ok(same(page("less than a minute", "2 minutes"), page("20 days", "1 day")));
    assert.ok(!same(page("less than a minute", "2 minutes"), page("20 days", "x")));
  });
});

describe("N5: capture-host content in debug-page titles, the capture-machine canonical form", () => {
  // the real shape since the raise posture: the title carries the debug page
  // - heading, message paragraph, backtrace div
  const debugTitle = (message, frames) =>
    `<span class="render-error alert alert-danger">Error rendering: <span title="\n      &lt;h3&gt;Error message (visible to admin only)&lt;/h3&gt;\n      &lt;p&gt;&lt;strong&gt;${message}&lt;/strong&gt;&lt;/p&gt;\n      &lt;div&gt;${frames}&lt;/div&gt;\n    ">Ada Admin+*account</span> (verify_url view)</span>`;
  const frames = (host) =>
    `C:/${host}/lib/ruby/gems/3.3.0/gems/jwt-2.10.3/lib/jwt/jwa/hmac.rb:40:in &lt;code&gt;ensure_valid_key!&lt;br&gt;\nC:/${host}/reference-harness/oracle/adapter.rb:56:in &lt;code&gt;`;

  it("canonicalizes capture-host content in the message and title outside the div", () => {
    assert.ok(same(
      debugTitle("private method `closure_deletions' called for #&lt;Card:0x000073a1c2d3e4f0&gt;", frames("Ruby33-x64")),
      debugTitle("private method `closure_deletions' called for #&lt;Card:0x000073a1c2d3e4f8&gt;", frames("Ruby33-x64")),
    ), "heap addresses in the message are capture-machine noise");
    assert.ok(!same(
      debugTitle("uninitialized constant Card::Set::All::Html::Error::BetterErrors", frames("Ruby33-x64")),
      debugTitle("uninitialized constant Card::Set::All::Html::Error::Other", frames("Ruby33-x64")),
    ), "the message text itself is oracle semantics");
    const m = normalizeHtml(debugTitle("msg", frames("Ruby33-x64"))).match(/N5#path/g);
    assert.ok(!m, "frame lines inside the div are N6's, not N5's");
    const outside = `<span title="\n      &lt;h3&gt;Error message (visible to admin only)&lt;/h3&gt;\nC:/Ruby33-x64/loose.rb">card</span>`;
    assert.equal([...normalizeHtml(outside).matchAll(/N5#path/g)].length, 1, "title content outside the message and div still gets N5");
  });

  it("the anchors still count", () => {
    assert.ok(!same(debugTitle("HMAC key cannot be empty", frames("Ruby33-x64")), debugTitle("HMAC key cannot be empty", frames("Ruby33-x64")).replace("(verify_url view)", "(reset_password_url view)")));
    assert.ok(!same(debugTitle("HMAC key cannot be empty", frames("Ruby33-x64")), `<span class="render-error alert alert-danger">Error rendering: <span title="">Ada Admin+*account</span> (verify_url view)</span>`), "an engine that emits no debug page still differs structurally");
  });

  it("does not touch paths or addresses outside a debug title", () => {
    assert.ok(!same("<p>C:/Ruby33-x64/gems/jwt.rb</p>", "<p>C:/other/gems/jwt.rb</p>"));
    assert.ok(!same("<p>0xdeadbeef</p>", "<p>0xfeedface</p>"));
    assert.ok(!same("<p>title=\"C:/a.rb\"</p>", "<p>title=\"C:/b.rb\"</p>"), "an ordinary title attribute is not the debug page");
  });

  it("the rule keys on the debug page's own first bytes, not the span class alone", () => {
    const plainError = `<span title="something went wrong C:/Ruby33-x64/x.rb">card</span>`;
    assert.ok(!same(plainError, plainError.replace("Ruby33-x64", "other")), "no debug-page marker, no rule");
  });
});

describe("N6: backtrace frame lines, the host-VM stack canonical form", () => {
  // the real shapes: the oracle's frames are Ruby's (boot-inclusive, escaped
  // inside the title), the engine's are V8's; both join with the escaped
  // `<br>\n` separator
  const debugTitle = (frames) =>
    `<span class="render-error alert alert-danger">Error rendering: <span title="\n      &lt;h3&gt;Error message (visible to admin only)&lt;/h3&gt;\n      &lt;p&gt;&lt;strong&gt;HMAC key cannot be empty&lt;/strong&gt;&lt;/p&gt;\n      &lt;div&gt;${frames}&lt;/div&gt;\n    ">Ada Admin+*account</span> (verify_url view)</span>`;
  const rubyFrame = (gem, line, method) =>
    `C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/${gem}:${line}:in \`${method}&#39;`;
  const v8Frame = (fn, file) =>
    `at ${fn} (file:///C:/localProjects/decko-ts-corpusinst/src/card/render/${file})`;
  const join = (frames) => frames.join("&lt;br&gt;\n");

  it("canonicalizes each frame line to one marker whichever VM produced it, preserving the count", () => {
    const ruby = debugTitle(join([rubyFrame("jwt-2.10.3/lib/jwt/jwa/hmac.rb", 40, "ensure_valid_key!"), "&lt;internal:kernel&gt;:90:in `tap&#39;", "script/decko:6:in `&lt;main&gt;&#39;"]));
    const v8 = debugTitle(join([v8Frame("tokenUrlBody", "views.ts"), v8Frame("renderView", "format.ts"), v8Frame("renderPage", "run.mjs")]));
    assert.ok(same(ruby, v8), "three Ruby frames and three V8 frames carry the same compared content");
    assert.equal([...normalizeHtml(ruby).matchAll(/N6#frame/g)].length, 3, "three frames, three markers");
    assert.ok(!normalizeHtml(ruby).includes("hmac.rb") && !normalizeHtml(v8).includes("tokenUrlBody"), "no frame text survives");
  });

  it("the frame count is the checkable invariant: a different count still fails", () => {
    const three = debugTitle(join([v8Frame("a", "x.ts"), v8Frame("b", "y.ts"), v8Frame("c", "z.ts")]));
    const four = debugTitle(join([v8Frame("a", "x.ts"), v8Frame("b", "y.ts"), v8Frame("c", "z.ts"), v8Frame("d", "w.ts")]));
    assert.ok(!same(three, four), "8 engine frames against 63 Ruby frames still differ");
    assert.ok(!same(three, debugTitle(join([v8Frame("a", "x.ts"), v8Frame("b", "y.ts")]))), "a dropped frame");
    assert.ok(!same(three, three.replace("&lt;br&gt;\n", "")), "a lost separator changes the count");
  });

  it("the heading, the message and the div's anchors still count", () => {
    const ruby3 = () => join([rubyFrame("jwt-2.10.3/lib/jwt/jwa/hmac.rb", 40, "ensure_valid_key!"), "&lt;internal:kernel&gt;:90:in `tap&#39;", "script/decko:6:in `&lt;main&gt;&#39;"]);
    assert.ok(!same(debugTitle(ruby3()), debugTitle(ruby3()).replace("HMAC key cannot be empty", "other failure")), "the message is oracle semantics");
    assert.ok(!same(debugTitle(ruby3()), debugTitle(ruby3()).replace("(verify_url view)", "(reset_password_url view)")), "the span's anchors are oracle semantics");
    assert.ok(!same(debugTitle(ruby3()), debugTitle(ruby3()).replace("&lt;/div&gt;\n    ", "&lt;/div&gt;\n      ")), "the div's tail is oracle semantics");
    assert.ok(!same(debugTitle(ruby3()), debugTitle("")), "an engine emitting an empty div holds zero frames against three");
    assert.ok(!same(debugTitle(ruby3()), `<span class="render-error alert alert-danger">Error rendering: <span title="">Ada Admin+*account</span> (verify_url view)</span>`), "no debug page at all still differs structurally");
  });

  it("fires only inside the debug title's backtrace div", () => {
    assert.ok(!same("<p>at fn (file:///C:/a/x.ts:1:1)&lt;br&gt;\nat g (file:///C:/a/y.ts:2:2)</p>", "<p>at fn (file:///C:/b/x.ts:1:1)&lt;br&gt;\nat g (file:///C:/b/y.ts:2:2)</p>"), "frames outside a debug title are real bytes");
    const ordinaryTitle = (frames) => `<span title="${frames}">card</span>`;
    assert.ok(!same(ordinaryTitle(join([v8Frame("a", "x.ts"), v8Frame("b", "y.ts")])), ordinaryTitle(join([v8Frame("c", "x.ts"), v8Frame("d", "y.ts")]))), "no debug-page marker, no rule");
    const messageDiv = (msg) =>
      `<span title="\n      &lt;h3&gt;Error message (visible to admin only)&lt;/h3&gt;\n      &lt;p&gt;&lt;strong&gt;${msg}&lt;/strong&gt;&lt;/p&gt;\n      &lt;div&gt;${join([v8Frame("a", "x.ts")])}&lt;/div&gt;\n    ">card</span>`;
    assert.ok(!same(messageDiv("a &lt;div&gt; b"), messageDiv("a &lt;div&gt; c")), "a div-shaped token in the message is message text, not the backtrace div");
  });
});

describe("removed rules: these now count", () => {
  it("hexadecimal numbers in HTML are compared (the former address mask)", () => {
    assert.ok(!same("<p>0xdeadbeef</p>", "<p>0xfeedface</p>"));
    assert.ok(!same("#<Card::Format::HtmlFormat:0x000073a1c2d3e4f0>", "#<Card::Format::HtmlFormat:0x000073a1c2d3e4f8>"));
  });

  it("a write result's card id is compared (the former id drop)", () => {
    const r = (id) => ({ saved: true, errors: [], card: { name: "Note 1", id }, mail: [] });
    assert.ok(!sameJson(r(911), r(912)));
  });

  it("mail text is compared byte for byte (the former whitespace trim)", () => {
    const r = (text) => ({ saved: true, errors: [], card: null, mail: [{ to: ["a@example.test"], subject: "s", text }] });
    assert.ok(!sameJson(r("line\n"), r("line  \n")), "trailing spaces");
    assert.ok(!sameJson(r("a\nb"), r("a\r\nb")), "line ends");
    assert.ok(!sameJson(r("a"), r("\na\n")), "surrounding blank lines");
  });

  it("row deltas are compared raw: ids and timestamp text count", () => {
    const rows = (id, at) => ({ cards: { inserted: [{ id, name: "Note 1", updated_at: at }], updated: [], deleted: [] } });
    assert.ok(sameJson(rows(911, "2026-09-19 12:00:00"), rows(911, "2026-09-19 12:00:00")));
    assert.ok(!sameJson(rows(911, "2026-09-19 12:00:00"), rows(912, "2026-09-19 12:00:00")), "a new row's id");
    assert.ok(!sameJson(rows(911, "2026-09-19 12:00:00"), rows(911, "2026-09-19T12:00:00.000Z")), "the same instant in another text form");
  });
});

describe("N2: key order, the one canonical form", () => {
  it("object key order never counts; array order always does", () => {
    assert.ok(sameJson({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }));
    assert.ok(!sameJson({ names: ["A", "B"] }, { names: ["B", "A"] }));
    assert.ok(!sameJson({ a: 1 }, { a: "1" }), "type counts");
    assert.ok(!sameJson({ a: null }, {}), "a null field is not an absent one");
  });
});

describe("synthetic-v1: the masks are the measured nondeterminism", () => {
  const fixture = path.join(HARNESS, "fixtures", "synthetic-v1");
  const manifest = JSON.parse(readFileSync(path.join(fixture, "expected", "MANIFEST.json"), "utf8"));

  it("two stock oracle runs differ only where N1 masks, and N1 never masks an equal value", () => {
    const n = manifest.provenance.nondeterminism;
    assert.deepEqual(n.unexplained, []);
    assert.ok(n.masks.N1.differing_pairs > 0, "N1 matched values that really vary");
    assert.equal(n.masks.N1.differing_pairs, n.masks.N1.matched_pairs);
    assert.deepEqual(Object.keys(n.masks), ["N1"], "evidence exists for every mask and no other");
  });

  it("the oracle's own outputs, regraded as an engine's results, pass", () => {
    const report = gradeRun({ fixture, actual: path.join(fixture, "expected") });
    assert.deepEqual(report.problems, []);
    assert.equal(report.verdict, "pass");
    assert.equal(report.summary.rendering.graded, 1754);
    assert.equal(report.summary.semantics.graded, 2389);
    assert.equal(report.summary.persistence.graded, 16);
    assert.equal(report.summary.side_effects.graded, 19);
    assert.equal(report.read_writes.graded, 8);
  });
});
