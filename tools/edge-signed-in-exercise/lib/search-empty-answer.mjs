// What a search for a name that exists nowhere must RENDER, so the create
// offer on that page is a real offer and not a navbar word.
//
// THE ROW. cap-N6 ("Search for a nonexistent name offers a create link",
// tools/edge-signed-in-exercise/capabilities.json id N6) carries one declared
// check, and the row's own finding is the whole shape of the problem:
//
//   "Whole-page create/new regex can match unrelated navbar."
//
// The check that name binds is tools/edge-signed-in-exercise.mjs:1096-1100:
//
//   await page.goto(`${stack.origin}/*search?query[keyword]=zz_no_such_card_harness`);
//   const hasCreate = /create|new card|\/new\//i.test(body);
//   record("search for a nonexistent name offers a create link", hasCreate, ...)
//
// That regex is satisfied by the deck's own Getting-started menu, which
// seeds `[[/new/Cardtype | Add type]]` (card-mod-defaults data/real.yml:38-43).
// So the check passes on a page where the search answered nothing, on a page
// where the search answered EVERYTHING, and on a page that never rendered a
// search at all. It cannot tell an offer from chrome, which is precisely what
// the finding says.
//
// cap-C6 (the same sentence in the create group) was closed in tranche 2 by
// reading the offer itself: the navbox typeahead's :add item, its value, its
// destination and its label. That is the right grade for the OFFER, and it is
// not what is missing here. What is missing is the PAGE the offer is offered
// ON. Ruby's search core for a keyword that matches nothing renders two
// specific things, and this module grades them.
//
// WHAT RUBY RENDERS FOR A KEYWORD THAT MATCHES NOTHING. Two pieces, both
// committed Ruby source, both vendored and sha256-pinned:
//
// 1. The keyword echo. card-mod-search-0.20.0 set/self/search.rb:48 renders
//    view :results_for_keyword, template: :haml, and the template is
//    set/self/search/results_for_keyword.haml, all five lines of it:
//
//      - if search_keyword.present?
//        .my-3.p-2.bg-light
//          = t :search_results_for
//          %span.search-keyword
//            = h search_keyword
//
//    Three graded facts live in those five lines. The wrapper carries the
//    classes my-3 p-2 bg-light. The label is `t :search_results_for`, which
//    config/locales/en.yml:4 defines as `Results for`. And the term itself is
//    `= h search_keyword` - Haml escapes it, so a term carrying markup is
//    rendered as TEXT and must be graded that way, not matched raw.
//
// 2. The empty-results marker. set/self/search.rb:48-51 wraps the core as
//    `[render_results_for_keyword, super()]`, the super() is the search
//    card_list, and card_list's html view is set/abstract/0_search/views.rb,
//    which routes through `with_results`:
//
//      def with_results
//        search_with_params.empty? ? render_no_search_results : yield
//      end
//
//    and its html arm is:
//
//      view :no_search_results do
//        wrap_with :div, "", class: "search-no-results"
//      end
//
//    So an empty result set is NOT an empty page. It is a div whose whole
//    content is the class name and nothing else, and it is rendered INSTEAD
//    of the result rows - never alongside them.
//
// WHY THIS IS THE MISSING NEGATIVE CONTROL. The failure modes the old regex
// cannot separate are exactly these, and each has a distinct fingerprint:
//
//   - the search silently matched nothing and said so   -> echo + no-results
//   - the search silently matched EVERYTHING (a broken  -> result rows, NO
//     query that degraded to the deck)                     no-results marker
//   - the page never rendered a search at all (an error  -> neither
//     page, a 404, the wrong card)
//
// All three carry the navbar's Add type link, so all three pass the old
// check. Only the first is a search that answered correctly. A page carrying
// result rows is a page whose search FAILED, and grading it green is how a
// search over-match stays invisible.
//
// ANTI-VACUITY. The term is compared against the term that was actually
// searched, not against a canned string, and the result rows are counted from
// the same wrapper Ruby emits per row (card_list_item wraps each nested item
// in `<div class="search-result-item item-#{item_view}">`, 0_search/views.rb).
// A page with no wrapper at all cannot pass by having nothing to count: the
// marker and the echo are both required.

/** The keyword echo block, as Ruby's results_for_keyword.haml renders it:
 *  the wrapper classes, the `t :search_results_for` label, and the term as
 *  Haml's `= h search_keyword` escaped it. */
export function keywordEcho(html) {
  const source = String(html ?? "");
  const block = /<div class='my-3 p-2 bg-light'>([\s\S]*?)<\/div>/i.exec(source);
  if (block === null) return null;
  const inner = block[1];
  const span = /<span class='search-keyword'>\s*([\s\S]*?)\s*<\/span>/i.exec(inner);
  return {
    wrapperClasses: ["my-3", "p-2", "bg-light"],
    label: (inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().match(/Results for/) ?? [null])[0],
    term: span === null ? null : span[1].replace(/\s+/g, " ").trim(),
    rawTerm: span === null ? null : span[1],
  };
}

/** The empty-results marker, and the result rows that must NOT be beside it.
 *  `search-no-results` is the class name and nothing else (0_search/views.rb
 *  `wrap_with :div, "", class: "search-no-results"`); each result row is a
 *  `search-result-item` wrapper (card_list_item). */
export function emptyAnswerShape(html) {
  const source = String(html ?? "");
  return {
    hasNoResultsMarker: /<div class="search-no-results"><\/div>/i.test(source),
    resultRowCount: (source.match(/<div class="search-result-item /g) ?? []).length,
  };
}

/** The create offer the navbox makes for `term`, read from the typeahead items
 *  Ruby renders at set/self/search.rb:70-72 (:search_box_complete =
 *  search_box_items :search_item, :add_item, :goto_items). The :add item is
 *  emitted only when `exact.add_autocomplete_ok?` (set/all/autocomplete.rb:1-3:
 *  new_card? && name.valid? && !virtual? && ok?(:create)); its value is the
 *  term; and its label is the verbatim
 *  set/all/autocomplete/autocomplete_item.haml template
 *  (`.autocomplete-item.autocomplete-item-add` > `.autocomplete-icon` +
 *  `.autocomplete-label`). A name that does not exist is never a goto item
 *  (search.rb:108-126, gated on `go_to_exact_match? exact.known?`). */
export function navboxCreateOffer(items, term) {
  const list = Array.isArray(items) ? items : [];
  const add = list.find((item) => item?.action === "add") ?? null;
  const gotoSameName = list.find((item) => item?.action === "goto" && item?.value === term) ?? null;
  const failures = [];
  if (add === null) failures.push("noAddItem");
  if (add !== null) {
    if (add.value !== term) failures.push("addValue");
    if (typeof add.label !== "string") failures.push("addLabelMissing");
    else {
      if (!/class='[^']*autocomplete-item-add/.test(add.label)) failures.push("addLabelNotAddClass");
      if (!/<div class='autocomplete-icon'>/.test(add.label)) failures.push("addLabelIconMissing");
      const label = /<div class='autocomplete-label'>([\s\S]*?)<\/div>/.exec(add.label);
      if (label === null) failures.push("addLabelTextMissing");
      else if (label[1].replace(/\s+/g, " ").trim() !== term) failures.push("addLabelTextWrong");
    }
  }
  if (gotoSameName !== null) failures.push("gotoItemForMissingName");
  return { ok: failures.length === 0, failures, add };
}

/**
 * One graded answer for one searched term.
 *
 * `page`: {html, status}
 * `offer`: {items} - the typeahead items the navbox returned for the SAME term
 * `term`: the term that was actually searched
 *
 * Returns {ok, failures, echo, shape, offer}.
 */
export function searchForMissingName({ page, offer, term }) {
  const failures = [];
  const html = page?.html ?? "";

  const status = page?.status ?? null;
  // An unknown-card page renders :new with 200 for a viewer who may create
  // (card-mod-format set/all/html/error.rb:81-87); anything at all above 400
  // is not a search answer.
  if (status === null || status >= 400) failures.push("pageStatus");

  const echo = keywordEcho(html);
  if (echo === null) failures.push("noKeywordEcho");
  else {
    if (echo.label !== "Results for") failures.push("echoLabel");
    // Haml escapes the term (`= h search_keyword`), so the echoed text is the
    // ESCAPED form. A term that needs escaping is the test that this holds.
    const expected = escapeHtml(String(term ?? ""));
    if (echo.term !== expected) failures.push("echoTerm");
  }

  const shape = emptyAnswerShape(html);
  if (!shape.hasNoResultsMarker) failures.push("noEmptyResultsMarker");
  // The decisive negative control: a page that rendered result rows did not
  // match nothing, it failed to run the query, and the old whole-page regex
  // would have called that a pass.
  if (shape.resultRowCount !== 0) failures.push("resultRowsRendered");

  const navbox = navboxCreateOffer(offer?.items, term);
  for (const failure of navbox.failures) failures.push(failure);

  return { ok: failures.length === 0, failures, echo, shape, offer: navbox };
}

/** Rails' `h` for the five characters Haml's `=` escapes in text context. */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The check names each leg records, so a red names which claim failed. */
export const SEARCH_EMPTY_ANSWER_CHECKS = Object.freeze({
  echo: "the search page echoes the term it searched, escaped the way Ruby's results_for_keyword.haml escapes it",
  empty: "a search that matched nothing renders Ruby's search-no-results marker and no result rows",
  offer: "the navbox offers to create the missing name, as its own add item rather than a navbar word",
});