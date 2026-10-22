// cap-N6 - the page a search for a missing name must render.
//
// The pins are committed Ruby SOURCE, not a capture: the search page's empty
// answer is rendered by a view probe against a non-search card, so the
// committed probe arms for :no_search_results are render-ERROR arms
// (`view (no_search_results) not supported for Decko Bot`,
// reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
// probe-view:493 and :509) and carry none of the bytes this row is about.
// Every Ruby file below is therefore vendored verbatim from
// decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-search-0.20.0/ and sha256
// pinned, and the graded strings are READ OUT of those files rather than
// retyped, so a gem change fails the pin and the grade together.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  keywordEcho,
  emptyAnswerShape,
  navboxCreateOffer,
  searchForMissingName,
  escapeHtml,
  KEYWORD_ECHO_WRAPPER_CLASSES,
  KEYWORD_ECHO_SPAN_CLASS,
  SEARCH_EMPTY_ANSWER_CHECKS,
} from "../lib/search-empty-answer.mjs";

const VENDOR = new URL("../../../fixtures/vendor/card-mod-search-0.20.0/", import.meta.url);
const readVendor = (rel) => readFileSync(new URL(rel, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const VENDORED = {
  "set/self/recent.rb":
    "f5554c2b7bd8ad4120a6be29b56d2cd7922fc438e223dffd71b82c30d725914d",
  "set/abstract/0_search/views.rb":
    "d3316f488eac0568602ff3540cf33a1113fbb141069dbce6da25be33bab344ce",
  "set/abstract/search_views.rb":
    "638f0f0705e8b98d7d8daab1f0e1c12bdaab405208cf2eb79592d3efbe9b3d69",
  "set/self/search.rb":
    "56a0f66f39319fc8cf23e18925f98374660ee981f2dc5631cb35d76908f165f6",
  "set/self/search/results_for_keyword.haml":
    "81696b15def2ba3c03160d15110e1ec5cdeabdb0f69812cfdd844c609d05a710",
  "set/all/autocomplete/autocomplete_item.haml":
    "e646feeb8c67a65f963c5dd4556ca76d454ca3a5ddca610fe3b6c3f735a1fc15",
};

test("the vendored Ruby search sources are the gem's bytes, sha256 pinned", () => {
  for (const [rel, digest] of Object.entries(VENDORED)) {
    assert.equal(sha256(readVendor(rel)), digest, `${rel} drifted from card-mod-search-0.20.0`);
  }
});

test("the graded strings are read out of the pinned Ruby, not retyped", () => {
  // results_for_keyword.haml: the wrapper classes, the label call, the span,
  // and the `= h` escape. All five lines are the contract.
  const haml = readVendor("set/self/search/results_for_keyword.haml").toString("utf8");
  assert.match(haml, /^\s*\.my-3\.p-2\.bg-light\s*$/m);
  assert.match(haml, /= t :search_results_for/);
  assert.match(haml, /%span\.search-keyword/);
  assert.match(haml, /= h search_keyword/);
  assert.match(haml, /^- if search_keyword\.present\?$/m);

  // The locale the label call resolves through is the gem's own en.yml
  // (`search_results_for: Results for`); the vendored haml names the CALL,
  // and the test below grades the resolved string.
  assert.match(haml, /= t :search_results_for/);

  // 0_search/views.rb: the empty set routes to no_search_results, and that
  // view is a div whose entire content is the class name.
  const views = readVendor("set/abstract/0_search/views.rb").toString("utf8");
  assert.match(views, /def with_results/);
  assert.match(views, /search_with_params\.empty\? \? render_no_search_results : yield/);
  assert.match(views, /view :no_search_results do\s*\n\s*wrap_with :div, "", class: "search-no-results"\s*\n\s*end/);

  // card_list_item: one search-result-item wrapper per result row. This is
  // what "no result rows" is counted against.
  assert.match(views, /<div class="search-result-item item-#\{item_view\}">/);

  // search.rb: the core wraps the keyword echo in front of the results, and
  // the typeahead's three item kinds include the :add offer.
  const search = readVendor("set/self/search.rb").toString("utf8");
  assert.match(search, /\[render_results_for_keyword, super\(\)\]/);
  assert.match(search, /search_box_items :search_item, :add_item, :goto_items/);

  // autocomplete_item.haml: the label template the offer renders.
  const item = readVendor("set/all/autocomplete/autocomplete_item.haml").toString("utf8");
  assert.match(item, /\.autocomplete-item\{ class: "autocomplete-item-#\{type\}" \}/);
  assert.match(item, /\.autocomplete-icon/);
  assert.match(item, /\.autocomplete-label/);
});

/** A page shaped exactly as Ruby's two pieces render it, built from the
 *  strings the pins above read out of the gem.
 *
 *  `quote` is the attribute quote the page carries. Both shapes are real:
 *  Haml writes the single quotes the PORT's own bytes carry
 *  (src/card/mod-loader/mods/card-mod-search.ts:1062), and the browser's DOM
 *  serialization - what the check actually reads - writes the double quotes
 *  the same attributes carry once the parser has seen them. The graded
 *  contract is the class NAMES, the label and the escaped term, so both
 *  shapes must grade green; a predicate that binds the quote character
 *  cannot see the page the check reads. */
function searchPage(term, { rows = 0, marker = true, echo = true, quote = "'" } = {}) {
  const parts = [];
  if (echo) {
    parts.push(
      `<div class=${quote}my-3 p-2 bg-light${quote}>\n  Results for\n  <span class=${quote}search-keyword${quote}>\n    ${escapeHtml(term)}\n  </span>\n</div>\n`,
    );
  }
  if (rows > 0) {
    parts.push(`<div class="card-list card-list-link search-result-list">`);
    for (let i = 0; i < rows; i += 1) parts.push(`<div class="search-result-item item-link"></div>`);
    parts.push(`</div>`);
  }
  if (marker) parts.push(`<div class="search-no-results"></div>`);
  // The navbar the old regex matched on, present in EVERY case.
  parts.push(`<ul class="dropdown-menu"><li><a href="/new/Cardtype">Add type</a></li></ul>`);
  return parts.join("");
}

/** The navbox's own items for a term that exists nowhere (search.rb:96-126). */
function typeaheadItems(term) {
  return [
    { action: "search", value: term, label: `<div class='autocomplete-item autocomplete-item-search'></div>` },
    {
      action: "add",
      value: term,
      label:
        `<div class='autocomplete-item autocomplete-item-add'>` +
        `<div class='autocomplete-icon'><i class="notranslate material-icons">add</i></div>` +
        `<div class='autocomplete-label'>${term}</div></div>`,
    },
  ];
}

test("a correctly answered empty search grades green, with the navbar present", () => {
  const term = "zz_no_such_card_harness";
  const verdict = searchForMissingName({
    page: { html: searchPage(term), status: 200 },
    offer: { items: typeaheadItems(term) },
    term,
  });
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.shape.hasNoResultsMarker, true);
  assert.equal(verdict.shape.resultRowCount, 0);
});

test("the old whole-page regex passes every one of these pages; this one does not", () => {
  // The exact predicate the row's finding names. Each page below carries the
  // navbar's Add type link, so /create|new card|\/new\//i is true on all five.
  const term = "zz_no_such_card_harness";
  const navbar = /\/new\/Cardtype/;
  const pages = {
    "answered correctly": searchPage(term),
    "silently matched everything": searchPage(term, { rows: 12, marker: false }),
    "never rendered a search": searchPage(term, { marker: false, echo: false }),
    "echoed the wrong term": searchPage("some_other_name"),
    "marker beside result rows": searchPage(term, { rows: 3 }),
  };
  const oldRegexPasses = Object.entries(pages).filter(([, html]) => navbar.test(html));
  assert.equal(oldRegexPasses.length, 5, "the navbar link is present on every page, which is the finding");

  const graded = Object.entries(pages).map(([label, html]) => [
    label,
    searchForMissingName({ page: { html, status: 200 }, offer: { items: typeaheadItems(term) }, term }).ok,
  ]);
  assert.deepEqual(graded, [
    ["answered correctly", true],
    ["silently matched everything", false],
    ["never rendered a search", false],
    ["echoed the wrong term", false],
    ["marker beside result rows", false],
  ]);
});

test("a search that degraded to the whole deck fails resultRowsRendered", () => {
  const term = "zz_no_such_card_harness";
  const verdict = searchForMissingName({
    page: { html: searchPage(term, { rows: 12, marker: false }), status: 200 },
    offer: { items: typeaheadItems(term) },
    term,
  });
  assert.ok(verdict.failures.includes("resultRowsRendered"));
  assert.ok(verdict.failures.includes("noEmptyResultsMarker"));
});

test("the marker and the rows are mutually exclusive, because with_results yields one or the other", () => {
  const shape = emptyAnswerShape(searchPage("t", { rows: 3 }));
  assert.equal(shape.hasNoResultsMarker, true);
  assert.equal(shape.resultRowCount, 3);
});

test("a term carrying markup is graded against Haml's escaped form", () => {
  const term = 'no<such>&"name"';
  const echo = keywordEcho(searchPage(term));
  assert.equal(echo.term, escapeHtml(term));
  assert.equal(echo.term.includes("<such>"), false);
  const verdict = searchForMissingName({
    page: { html: searchPage(term), status: 200 },
    offer: { items: typeaheadItems(term) },
    term,
  });
  assert.equal(verdict.ok, true);

  // A page that echoed the RAW term instead of the escaped one is a real
  // divergence from `= h search_keyword`, and it is caught.
  const raw = searchPage(term).replace(escapeHtml(term), term);
  const rawVerdict = searchForMissingName({
    page: { html: raw, status: 200 },
    offer: { items: typeaheadItems(term) },
    term,
  });
  assert.ok(rawVerdict.failures.includes("echoTerm"));
});

test("the keyword echo's label and wrapper are read from the pinned haml", () => {
  const echo = keywordEcho(searchPage("anything"));
  assert.equal(echo.label, "Results for");
  assert.deepEqual(echo.wrapperClasses, ["my-3", "p-2", "bg-light"]);
  assert.equal(keywordEcho("<div class='other'></div>"), null);
});

test("a page that echoes nothing fails noKeywordEcho", () => {
  const verdict = searchForMissingName({
    page: { html: searchPage("t", { echo: false }), status: 200 },
    offer: { items: typeaheadItems("t") },
    term: "t",
  });
  assert.ok(verdict.failures.includes("noKeywordEcho"));
});

test("the browser's DOM serialization grades green: the attribute quote is not the contract", () => {
  // THE DEFECT THIS PINS. The check reads the page through the browser, so
  // what it sees is the DOM serialization, and every DOM serializer writes
  // attribute values in double quotes whatever the server wrote. The port's
  // own bytes carry Haml's single quotes
  // (src/card/mod-loader/mods/card-mod-search.ts:1062), and the predicate
  // that bound the single-quoted shape never matched the page the check
  // reads: the signed-in run of 2026-10-22 recorded the echo leg as
  // failures ["noKeywordEcho"] with echo null on a page that carried the
  // wrapper, the label and the escaped term
  // (.runtime/edge-signed-in/tranche6-base/report.md.raw/
  // 264-navbox-empty-answer.html). Both shapes must grade green, and the
  // class names are the contract.
  const term = "zz_no_such_card_harness";
  for (const quote of ["'", '"']) {
    const echo = keywordEcho(searchPage(term, { quote }));
    assert.notEqual(echo, null, `the ${quote}-quoted echo must be found`);
    assert.equal(echo.label, "Results for");
    assert.equal(echo.term, escapeHtml(term));
    const verdict = searchForMissingName({
      page: { html: searchPage(term, { quote }), status: 200 },
      offer: { items: typeaheadItems(term) },
      term,
    });
    assert.deepEqual(verdict.failures, [], `the ${quote}-quoted page must grade green`);
    assert.equal(verdict.ok, true);
  }
});

test("the graded class names are the vendored haml's own", () => {
  // The constants the predicate grades by are READ OUT of the pinned gem
  // file here, so a gem change fails the pin and the grade together.
  const haml = readVendor("set/self/search/results_for_keyword.haml").toString("utf8");
  const wrapper = /^\s*\.([\w-]+(?:\.[\w-]+)+)\s*$/m.exec(haml);
  assert.notEqual(wrapper, null, "the haml's wrapper class line must be there");
  const span = /%span\.([\w-]+)/.exec(haml);
  assert.notEqual(span, null, "the haml's span class must be there");
  assert.deepEqual([...KEYWORD_ECHO_WRAPPER_CLASSES], wrapper[1].split("."));
  assert.equal(KEYWORD_ECHO_SPAN_CLASS, span[1]);
  // A wrapper carrying a DIFFERENT class is not the echo.
  assert.equal(keywordEcho(`<div class="my-3 p-2"></div>`), null);
});

test("a 404 or an error page is not a search answer", () => {
  const verdict = searchForMissingName({
    page: { html: searchPage("t"), status: 404 },
    offer: { items: typeaheadItems("t") },
    term: "t",
  });
  assert.ok(verdict.failures.includes("pageStatus"));
});

test("the navbox offer is graded as the add item, not as a word on the page", () => {
  const term = "zz_missing";
  // No :add item at all.
  const none = navboxCreateOffer([{ action: "search", value: term }], term);
  assert.ok(none.failures.includes("noAddItem"));
  // An :add item whose value is a different term.
  const wrongValue = navboxCreateOffer(typeaheadItems("other"), term);
  assert.ok(wrongValue.failures.includes("addValue"));
  // An :add item carrying the plain search item's label class.
  const wrongClass = navboxCreateOffer(
    [{ action: "add", value: term, label: `<div class='autocomplete-item autocomplete-item-search'><div class='autocomplete-label'>${term}</div></div>` }],
    term,
  );
  assert.ok(wrongClass.failures.includes("addLabelNotAddClass"));
  // A goto item for a name that does not exist (search.rb:124-126).
  const goto = navboxCreateOffer([...typeaheadItems(term), { action: "goto", value: term }], term);
  assert.ok(goto.failures.includes("gotoItemForMissingName"));
  // The correct offer.
  assert.equal(navboxCreateOffer(typeaheadItems(term), term).ok, true);
});

test("a page whose navbox offers nothing fails even though the page looks right", () => {
  const term = "zz_missing";
  const verdict = searchForMissingName({
    page: { html: searchPage(term), status: 200 },
    offer: { items: [{ action: "search", value: term }] },
    term,
  });
  assert.ok(verdict.failures.includes("noAddItem"));
  assert.equal(verdict.ok, false);
});

test("the check names name their own legs", () => {
  for (const name of Object.values(SEARCH_EMPTY_ANSWER_CHECKS)) {
    assert.equal(typeof name, "string");
    assert.ok(name.length > 20);
  }
  assert.match(SEARCH_EMPTY_ANSWER_CHECKS.empty, /no result rows/);
});