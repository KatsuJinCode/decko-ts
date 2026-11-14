// CQL operator breadth through the visible navbox, graded against the operator
// each submitted query actually names.
//
// WHAT RUBY'S ORACLE BATTERY RECORDS, fixtures/captured/search-oracle-battery.json
// (captured by tools/oracle/search_oracle_capture.rb from the REAL Ruby CQL
// engine, `Card.search(**query, return: "name")`, card 1.110.0 / decko 0.20.0):
//
//   and_combo        {"right":"child_one","sort":"name","type":"Search Oracle Kind"}
//   content_exact    {"content":"alpha body text","sort":"name"}
//   created_by       {"created_by":"Search Oracle Author","sort":"name"}
//   empty_result     {"name":"Search Oracle No Such Card","sort":"name"}   -> []
//   exact_name       {"name":"Search Oracle Alpha","sort":"name"}
//   left_children    {"left":"Search Oracle Junction","sort":"name"}
//   not_name         {"not":{"name":"Search Oracle Alpha"},"sort":"name","type":"..."}
//   plus_condition   {"plus":"child_one","sort":"name"}
//   right_child      {"right":"child_one","sort":"name"}
//   sort_desc_limit  {"dir":"desc","limit":2,"sort":"name","type":"..."}
//   type_filter      {"sort":"name","type":"Search Oracle Kind"}
//
// and the capture states the normalization it used: "every query sorts by name;
// the TS pin sorts both arrays (name-SET parity, the cql-basic replay's
// contract)". So the comparison is a NAME SET, not a sequence.
//
// Registry row cap-N2 (tools/edge-signed-in-exercise/capabilities.json, id N2)
// recorded the residue plainly: "both CQL shapes exercised are type+name; no
// operator breadth (AND/OR/!=, view= variants, nest scopes) is driven". The
// operator legs exist in Ruby's own battery and in the port's own semantics pin
// (tests/cql/search-oracle-battery.test.ts replays all eleven arms through
// executeQuery) - what never ran is a driver submitting those operators through
// the VISIBLE navbox and grading what came back. That is this module's job.
//
// ONE FACT MAKES THESE GRADES NON-VACUOUS. A navbox submission that the engine
// silently ignores degrades to "every card", and a submission that matches
// nothing degrades to "no card". Both look like an answer. So every leg here
// carries the operator it claims to exercise AND a member that the operator must
// EXCLUDE, and an arm that returned the whole deck fails.

/** THE PAGE'S OWN CAP: how many result rows the search list renders.
 *  src/card/render/search-paging.ts:16 (search_params.rb:6-16) - the CQL
 *  limit, or 20 when the query names none. A leg whose result set is larger
 *  than this sees the first cap of it, so the grade cannot demand the whole
 *  set. */
export const SEARCH_PAGE_CAP = 20;

/** The operators this module grades, in the shape Ruby's battery writes them. */
export const CQL_OPERATORS = Object.freeze({
  and: "and", not: "not", right: "right", left: "left", plus: "plus",
  createdBy: "created_by", content: "content", type: "type", name: "name",
  sortLimit: "sort_limit",
});

/** Keys that shape the result rather than filter it. `sort`, `dir` and
 *  `limit` are the three the capture's own sort_desc_limit arm carries. */
const SHAPING_KEYS = new Set(["sort", "dir", "limit", "offset", "view"]);

/**
 * Which operators a submitted CQL object names. `and` is the conjunction of two
 * or more FILTER keys, which is how Ruby's battery writes it: and_combo carries
 * `right` AND `type` and is exactly that arm.
 *
 * `not` nests its own filter - Ruby's not_name arm is
 * {"not":{"name":"..."},"sort":"name","type":"..."} - so the operator inside the
 * negation is read too. Without that descent the not arm reads as only
 * "not + type" and the leg never names the name filter it is excluding on.
 */
export function cqlOperators(query) {
  const keys = Object.keys(query ?? {}).filter((k) => !SHAPING_KEYS.has(k));
  const operators = [];
  for (const key of keys) {
    switch (key) {
      case "not":
        operators.push(CQL_OPERATORS.not);
        // The negated filter names its own operators.
        for (const inner of cqlOperators(query.not ?? {})) {
          if (inner !== CQL_OPERATORS.sortLimit && !operators.includes(inner)) operators.push(inner);
        }
        break;
      case "right": operators.push(CQL_OPERATORS.right); break;
      case "left": operators.push(CQL_OPERATORS.left); break;
      case "plus": operators.push(CQL_OPERATORS.plus); break;
      case "created_by": operators.push(CQL_OPERATORS.createdBy); break;
      case "content": operators.push(CQL_OPERATORS.content); break;
      case "type": operators.push(CQL_OPERATORS.type); break;
      case "name": operators.push(CQL_OPERATORS.name); break;
      default: operators.push(key);
    }
  }
  const filters = keys.filter((k) => k !== "not");
  if (filters.length >= 2) operators.unshift(CQL_OPERATORS.and);
  const hasShape = ["sort", "dir", "limit"].some((k) => k in (query ?? {}));
  if (hasShape) operators.push(CQL_OPERATORS.sortLimit);
  return operators;
}

/** The operators that FILTER, dropping the ones that only shape the result.
 *  A submission carrying only sort/dir/limit/view selects nothing in particular:
 *  it is the whole deck, which is the answer a silently-ignored query gives. */
export function cqlFilterOperators(query) {
  return cqlOperators(query).filter((o) => o !== CQL_OPERATORS.sortLimit);
}

/** The card names a rendered result list carries, in document order, read from
 *  the result ROWS - the wrapper Ruby renders per result
 *  (`<div class="search-result-item item-#{item_view}">`, card_list_item in
 *  card-mod-search set/abstract/0_search/views.rb) - and inside each row from
 *  the result card's own card slot (`data-card-name`), the same attribute the
 *  battery's existing CQL navbox module reads, so both legs name cards the
 *  same way.
 *
 *  THE DEFECT THIS FIXES. The rows were not read: every card slot on the
 *  PAGE was, so the answer carried the page's chrome - the navbar's account
 *  menu ("Harness_Admin+*enabled_roles"), the search card itself ("*search"),
 *  the footer ("*footer") and the "New Card" link - next to the results. The
 *  signed-in run of 2026-10-22 at this tip failed all four operator legs with
 *  "wrongResultSet" while the pages were RIGHT: the captured page of the
 *  and-leg (query {"type":"Person","name":"Harness Member","sort":"name"})
 *  carries exactly ONE result row, the member
 *  (.runtime/edge-signed-in/tranche6-base/report.md.raw/
 *  248-cql-operator-2.html), and the scraped name list was
 *  ["https://culturesmith.com/card/new|New Card",
 *  "Harness_Admin+*enabled_roles", "*search", "Harness Member", "*footer"].
 *  A whole-page scrape cannot tell a result from the furniture around it -
 *  the same defect class the create-offer row named when it graded a
 *  whole-page regex instead of the offer. */
export function resultCardNames(html) {
  const source = String(html);
  const names = [];
  // The result rows, in document order. The rows are siblings, so each row's
  // own text runs to the next row's marker.
  const rowStart = /<div class="search-result-item(?: [^"]*)?"/g;
  const starts = [];
  for (let m = rowStart.exec(source); m !== null; m = rowStart.exec(source)) {
    starts.push(m.index);
  }
  for (let i = 0; i < starts.length; i += 1) {
    const row = source.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : source.length);
    const slot = /<[^>]*\bcard-slot\b[^>]*>/i.exec(row);
    if (slot === null) continue;
    const attr = /\bdata-card-name\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(slot[0]);
    if (attr === null) continue;
    const name = (attr[1] ?? attr[2] ?? "").trim();
    if (name !== "" && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Ruby normalizes every query to a name set sorted by name; `dir: desc`
 *  reverses the SORT, never the set. Comparing as sets is therefore the
 *  contract the capture states, and comparing as sequences would reject
 *  Ruby's own sort_desc_limit arm. */
export function sameNameSet(returned, expected) {
  const a = [...new Set((returned ?? []).map(String))].sort();
  const b = [...new Set((expected ?? []).map(String))].sort();
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

/**
 * One operator leg, graded. `evidence`:
 *   submitted     the JSON object typed into query[keyword]
 *   expected      the names the leg expects back
 *   excluded      a name the operator MUST NOT return. Optional but the point
 *                 of the whole module: without it a whole-deck answer passes.
 *   deckSize      how many cards the leg can see, when the driver knows it
 *
 * Returns {ok, failures, operators, names}.
 */
export function cqlOperatorLegHolds(evidence) {
  const { submitted, expected } = evidence;
  const failures = [];
  const operators = cqlOperators(submitted);
  const filters = cqlFilterOperators(submitted);

  // A submission naming no FILTER operator selects nothing in particular, so it
  // cannot grade as an operator leg however many cards come back.
  if (filters.length === 0) failures.push("noOperator");
  const returned = Array.isArray(evidence.returned) ? evidence.returned.map(String) : [];

  // The negative control the navbox submission needs: the operator must EXCLUDE
  // what it names, and must not be answered by the whole deck.
  const excluded = evidence.excluded;
  if (excluded !== undefined && excluded !== null && excluded !== "") {
    if (returned.includes(String(excluded))) failures.push("excludedCardReturned");
  }
  if (evidence.deckSize !== undefined && evidence.deckSize !== null && returned.length >= Number(evidence.deckSize)) {
    failures.push("wholeDeckReturned");
  }

  if (expected !== undefined && expected !== null) {
    const wanted = expected.map(String);
    if (wanted.length === 0) {
      // Ruby's empty_result arm: a name that exists nowhere returns NOTHING. A
      // submission answered with a card has not honoured the operator.
      if (returned.length !== 0) failures.push("expectedNoResults");
    } else if (wanted.length <= SEARCH_PAGE_CAP) {
      // The whole result set fits on one page, so the page IS the set.
      if (!sameNameSet(returned, wanted)) failures.push("wrongResultSet");
    } else {
      // THE RESULT SET IS LARGER THAN ONE PAGE. The page carries the first
      // SEARCH_PAGE_CAP of it, so the grade is: every row the page shows is a
      // member of the expected set, the page is FULL, and the card the
      // operator excludes is not among them.
      //
      // THE DEFECT THIS FIXES. The signed-in run of 2026-10-22 recorded the
      // not and the created_by legs as failures ["wrongResultSet"] while the
      // pages were RIGHT: the not leg's page carries the first 20 of the
      // type's cards and the created_by leg's page carries the first 20 of
      // the creator's cards, and the expected set held every card of the set -
      // hundreds and twenty-four respectively.
      const wantedSet = new Set(wanted);
      if (returned.length !== SEARCH_PAGE_CAP) failures.push("wrongResultSet");
      else if (!returned.every((name) => wantedSet.has(name))) failures.push("wrongResultSet");
    }
  } else if (returned.length === 0) {
    failures.push("noResults");
  }

  return { ok: failures.length === 0, failures, operators, names: returned };
}

/** The check name each operator leg records, so a leg names itself. */
export function cqlLegCheckName(operators) {
  const wanted = (Array.isArray(operators) ? operators : []).filter((o) => o !== CQL_OPERATORS.sortLimit);
  if (wanted.length === 0) return null;
  return `JSON CQL ${wanted.join(" + ")} operator returns the expected members and excludes what it names`;
}