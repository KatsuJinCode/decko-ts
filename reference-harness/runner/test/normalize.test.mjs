// Normalisation is limited to what two oracle runs actually vary in, and a
// meaningful change next to a masked value still fails.
//
//   node --test reference-harness/runner/test/

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { gradeRun } from "../grade-lib.mjs";
import { normalizeHtml, normalizeRender, sameJson, sortClassTokens } from "../normalize.mjs";
import { HARNESS } from "./helpers.mjs";

const slot = "0123456789abcdef0123";
const other = "fedcba9876543210fedc";
const same = (a, b) => normalizeHtml(a) === normalizeHtml(b);
const sameNoClassOrder = (a, b) => normalizeHtml(a, { classTokenOrder: false }) === normalizeHtml(b, { classTokenOrder: false });

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

describe("N1 masks only a real attribute token (finding 6)", () => {
  it("text in element content is never masked, whatever precedes it", () => {
    assert.ok(!same(`<p>Example data-slot-id="${slot}"</p>`, `<p>Example data-slot-id="${other}"</p>`), "a preceding word is not attribute position");
    assert.ok(!same(`<p>Example data-slot-id="${slot}"</p>`, `<p>Other data-slot-id="${slot}"</p>`), "the visible text itself still counts");
  });

  it("text inside a comment is never masked", () => {
    assert.ok(!same(`<!-- data-slot-id="${slot}" -->`, `<!-- data-slot-id="${other}" -->`));
    assert.ok(!same(`<div><!-- data-slot-id="${slot}" --></div>`, `<div><!-- data-slot-id="${other}" --></div>`));
  });

  it("text inside a quoted attribute value is never masked", () => {
    assert.ok(!same(`<div title=" data-slot-id='${slot}'">x</div>`, `<div title=" data-slot-id='${other}'">x</div>`), "a quoted value is value text, not an attribute");
    assert.ok(!same(`<div title="note: data-slot-id=${slot} done">x</div>`, `<div title="note: data-slot-id=${other} done">x</div>`));
  });

  it("text inside script and style bodies is never masked, even when shaped like a tag", () => {
    assert.ok(!same(`<script>var s = " data-slot-id='${slot}'";</script>`, `<script>var s = " data-slot-id='${other}'";</script>`));
    assert.ok(!same(`<style>.a::after { content: " data-slot-id='${slot}'" }</style>`, `<style>.a::after { content: " data-slot-id='${other}'" }</style>`));
    assert.ok(!same(`<script>document.write('<i data-slot-id="${slot}">')</script>`, `<script>document.write('<i data-slot-id="${other}">')</script>`), "a pseudo-tag in a script body");
    assert.ok(!same(`<script>if (a<b) x="${slot}";</script>`, `<script>if (a<b) x="${other}";</script>`), "a bare < in a body is not a tag boundary");
  });

  it("a real attribute is masked whatever whitespace precedes it, and on a raw text element itself", () => {
    assert.ok(same(`<div class="c"\n  data-slot-id="${slot}">x</div>`, `<div class="c"\n  data-slot-id="${other}">x</div>`), "newline between attributes");
    assert.ok(same(`<script data-slot-id="${slot}">var x = 1;</script>`, `<script data-slot-id="${other}">var x = 1;</script>`));
    assert.ok(!same(`<script data-slot-id="${slot}">var x = 1;</script>`, `<script data-slot-id="${other}">var y = 2;</script>`), "the body still counts");
  });

  it("everything outside the masked value is kept byte for byte", () => {
    const h = `<p>Example data-slot-id="${slot}"</p><!-- x>y --><!DOCTYPE html>\n<div title="t'a>b" data-x=00123456789012345678ab>a > b</div>`;
    assert.equal(normalizeHtml(h), h);
  });
});

describe("N1 and the raw text elements xmp and plaintext", () => {
  it("inside <xmp> a slot-id look-alike is DISPLAYED text, never masked", () => {
    assert.ok(!same(`<xmp><b data-slot-id="${slot}"></b></xmp>`, `<xmp><b data-slot-id="${other}"></b></xmp>`), "inside xmp the content counts");
    assert.equal(normalizeHtml(`<xmp><b data-slot-id="${slot}"></b></xmp>`), `<xmp><b data-slot-id="${slot}"></b></xmp>`, "the xmp body is copied byte for byte");
  });

  it("xmp closes at </xmp>: a real attribute after it is masked, and a real difference there still counts", () => {
    assert.ok(same(`<xmp><i data-slot-id="${slot}"></i></xmp><div data-slot-id="${slot}">x</div>`, `<xmp><i data-slot-id="${slot}"></i></xmp><div data-slot-id="${other}">x</div>`), "markup resumes after xmp");
    assert.ok(!same(`<xmp>a</xmp><div data-slot-id="${slot}">x</div>`, `<xmp>b</xmp><div data-slot-id="${other}">x</div>`), "a visible difference after xmp is never masked away");
  });

  it("inside <plaintext> everything to EOF is displayed text — pseudo-tags, a pseudo end tag, and a self-closing slash are all text", () => {
    assert.ok(!same(`<plaintext><b data-slot-id="${slot}"></b>`, `<plaintext><b data-slot-id="${other}"></b>`), "plaintext has no end tag; the body runs to EOF");
    assert.ok(!same(`<plaintext>${slot}</plaintext><div data-slot-id="${slot}">`, `<plaintext>${other}</plaintext><div data-slot-id="${other}">`), "</plaintext> is text, not a close tag");
    assert.ok(!same(`<plaintext/>${slot}`, `<plaintext/>${other}`), "browsers ignore the self-closing slash on plaintext");
  });

  it("negative control: a real attribute inside a normal tag is still masked", () => {
    assert.ok(same(`<div data-slot-id="${slot}">x</div>`, `<div data-slot-id="${other}">x</div>`));
    assert.ok(same(`<b data-slot-id="${slot}">x</b>`, `<b data-slot-id="${other}">x</b>`), "the tag, outside xmp, masks");
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

describe("N2: key order, a canonical form", () => {
  it("object key order never counts; array order always does", () => {
    assert.ok(sameJson({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }));
    assert.ok(!sameJson({ names: ["A", "B"] }, { names: ["B", "A"] }));
    assert.ok(!sameJson({ a: 1 }, { a: "1" }), "type counts");
    assert.ok(!sameJson({ a: null }, {}), "a null field is not an absent one");
  });
});

describe("N3: class-token order, a canonical form", () => {
  it("compares class tokens as a set, in either quote style", () => {
    assert.ok(same(`<div class="card-new card-abstract">x</div>`, `<div class="card-abstract card-new">x</div>`));
    assert.ok(same(`<div class='b a c'>x</div>`, `<div class='a b c'>x</div>`));
    assert.ok(!same(`<div class="a b">x</div>`, `<div class='a b'>x</div>`), "the quote character is kept, exactly as N1 keeps it");
  });

  it("the token set, the count and the tokens themselves all still count", () => {
    assert.ok(!same(`<div class="a b">x</div>`, `<div class="a b c">x</div>`), "a missing token");
    assert.ok(!same(`<div class="a b">x</div>`, `<div class="a b b">x</div>`), "a repeated token");
    assert.ok(!same(`<div class="a b">x</div>`, `<div class="a B">x</div>`), "token case");
    assert.ok(!same(`<div class="a b">x</div>`, `<div class="">x</div>`), "an emptied value");
    assert.ok(!same(`<div class="a b">x</div>`, `<div class="a b c">x</div>`), "a different set, not an order");
  });

  it("only a real class attribute token is reordered", () => {
    assert.ok(!same(`<p>class="b a"</p>`, `<p>class="a b"</p>`), "element text is content, not an attribute");
    assert.ok(!same(`<!-- class="b a" -->`, `<!-- class="a b" -->`), "inside a comment");
    assert.ok(!same(`<div title='class="b a"'>x</div>`, `<div title='class="a b"'>x</div>`), "inside another attribute's value");
    assert.ok(!same(`<script>var c = "b a";</script>`, `<script>var c = "a b";</script>`), "inside a script body");
    assert.ok(!same(`<div data-class="b a">x</div>`, `<div data-class="a b">x</div>`), "an attribute whose name merely ends in class");
    assert.ok(!same(`<div class=b a>x</div>`, `<div class=a b>x</div>`), "an unquoted value");
  });

  it("the attribute name itself, and everything around it, still count", () => {
    assert.ok(!same(`<div class="b a">x</div>`, `<div CLASS="a b">x</div>`), "attribute name case is a byte difference in the tag");
    assert.ok(same(`<div id="q" class="b a" data-x="1">x</div>`, `<div id="q" class="a b" data-x="1">x</div>`));
    assert.ok(!same(`<div class="b a" data-x="1">x</div>`, `<div class="b a" data-x="2">x</div>`), "a difference beside the class still counts");
    assert.ok(!same(`<div class="b a">y</div>`, `<div class="a b">z</div>`), "a difference in the element content still counts");
  });

  it("class is matched case-insensitively, as HTML attribute names are", () => {
    assert.ok(same(`<div CLASS="b a">x</div>`, `<div CLASS="a b">x</div>`));
    assert.ok(same(`<div Class="b a">x</div>`, `<div Class="a b">x</div>`));
  });

  it("a closing tag's text is never touched", () => {
    assert.equal(normalizeHtml(`</div class="b a">`), `</div class="b a">`);
  });

  it("with the rule off, class-token order is compared byte for byte", () => {
    assert.ok(!sameNoClassOrder(`<div class="card-new card-abstract">x</div>`, `<div class="card-abstract card-new">x</div>`));
    assert.ok(sameNoClassOrder(`<div class="a b">x</div>`, `<div class="a b">x</div>`));
    assert.ok(sameNoClassOrder(`<div data-slot-id="${slot}">x</div>`, `<div data-slot-id="${other}">x</div>`), "N1 is unaffected");
  });

  it("a value with one token, none, or unusual whitespace", () => {
    assert.equal(sortClassTokens(""), "");
    assert.equal(sortClassTokens("solo"), "solo");
    assert.equal(sortClassTokens("  a  b  "), "a b", "separator runs collapse");
    assert.equal(sortClassTokens("a\nb"), "a b", "a newline separator is a separator, not content");
    assert.equal(sortClassTokens("b a a"), "b a a", "a repeated token leaves the value exactly as it is");
  });

  it("normalizeRender applies N3 to the html of a render result only", () => {
    assert.deepEqual(normalizeRender({ html: `<i class="b a"></i>`, status: 200 }), { html: `<i class="a b"></i>`, status: 200 });
    assert.deepEqual(normalizeRender({ html: `<i class="b a"></i>`, status: 200 }, { classTokenOrder: false }), { html: `<i class="b a"></i>`, status: 200 });
    assert.ok(!sameJson(normalizeRender({ html: `<i class="a b"></i>`, status: 200 }), normalizeRender({ html: `<i class="a b"></i>`, status: 404 })));
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

  it("a grade names the normalisation rules it ran under", () => {
    assert.deepEqual(gradeRun({ fixture, actual: path.join(fixture, "expected") }).normalization, ["N1", "N2", "N3"]);
    assert.deepEqual(gradeRun({ fixture, actual: path.join(fixture, "expected"), classTokenOrder: false }).normalization, ["N1", "N2"]);
  });

  it("N3 changes nothing on the committed expected bytes, which are already in sorted class-token order", () => {
    // The committed expected outputs were captured on Windows. The engine that
    // matched them byte for byte is graded unchanged by N3, so the rule only
    // ever has to carry a DIFFERENT environment's ordering (tools/ruby-version-variance/).
    const on = gradeRun({ fixture, actual: path.join(fixture, "expected") });
    const off = gradeRun({ fixture, actual: path.join(fixture, "expected"), classTokenOrder: false });
    assert.equal(off.verdict, "pass", "the expected outputs also pass with N3 off, so N3 hides nothing here");
    assert.equal(on.summary.rendering.pass, off.summary.rendering.pass);
  });
});
