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
