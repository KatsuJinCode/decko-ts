// The N2 operator legs, pinned against the committed Ruby CQL oracle battery.
//
//   node --test tools/edge-signed-in-exercise/test/cql-operator-breadth.test.mjs
//
// PINNED AGAINST A COMMITTED RUBY CAPTURE:
//
// fixtures/captured/search-oracle-battery.json holds the frozen battery's
// result sets from the REAL Ruby CQL engine (Card.search, card 1.110.0 /
// decko 0.20.0) over a seeded corpus, captured by
// tools/oracle/search_oracle_capture.rb. Test 1 asserts the capture's own
// stated normalization ("every query sorts by name; ... name-SET parity"), so
// the set comparison this module uses is the capture's contract and not a
// convenience. Tests 2-4 walk Ruby's eleven arms and assert the module reads
// each one's operator out of the query Ruby actually submitted - the operator
// names are read from the file, never typed from memory.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CQL_OPERATORS,
  cqlFilterOperators,
  cqlLegCheckName,
  cqlOperatorLegHolds,
  cqlOperators,
  resultCardNames,
  sameNameSet,
} from "../lib/cql-operator-breadth.mjs";

const BATTERY = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/search-oracle-battery.json", import.meta.url), "utf8"),
);

test("the capture's own normalization is name-SET parity, sorted by name", () => {
  assert.match(BATTERY.normalization, /name-SET parity/);
  // Every arm that sorts carries sort: name, which is what makes the set
  // comparison the contract rather than an accident.
  for (const [name, arm] of Object.entries(BATTERY.queries)) {
    if (name === "sort_desc_limit") continue;
    assert.equal(arm.query.sort, "name", `${name} does not sort by name`);
  }
  // sort_desc_limit reverses the SORT and limits; its result set is the same
  // shape, so comparing it as a sequence is the thing to get wrong.
  const desc = BATTERY.queries.sort_desc_limit;
  assert.equal(desc.query.dir, "desc");
  assert.equal(desc.query.limit, 2);
  assert.deepEqual(desc.result, [...desc.result].sort().reverse());
  assert.equal(sameNameSet(desc.result, desc.result), true);
});

test("each of Ruby's eleven arms is read as the operator it exercises", () => {
  // Read from the capture, so a renamed operator key fails here.
  const read = (arm) => cqlOperators(BATTERY.queries[arm].query);
  assert.deepEqual(read("and_combo"), [CQL_OPERATORS.and, CQL_OPERATORS.right, CQL_OPERATORS.type, CQL_OPERATORS.sortLimit]);
  assert.deepEqual(read("right_child"), [CQL_OPERATORS.right, CQL_OPERATORS.sortLimit]);
  assert.deepEqual(read("left_children"), [CQL_OPERATORS.left, CQL_OPERATORS.sortLimit]);
  assert.deepEqual(read("not_name"), [CQL_OPERATORS.not, CQL_OPERATORS.name, CQL_OPERATORS.type, CQL_OPERATORS.sortLimit]);
  assert.deepEqual(read("plus_condition"), [CQL_OPERATORS.plus, CQL_OPERATORS.sortLimit]);
  assert.deepEqual(read("created_by"), [CQL_OPERATORS.createdBy, CQL_OPERATORS.sortLimit]);
  assert.deepEqual(read("content_exact"), [CQL_OPERATORS.content, CQL_OPERATORS.sortLimit]);
  assert.deepEqual(read("type_filter"), [CQL_OPERATORS.type, CQL_OPERATORS.sortLimit]);
  assert.deepEqual(read("exact_name"), [CQL_OPERATORS.name, CQL_OPERATORS.sortLimit]);
  assert.deepEqual(read("empty_result"), [CQL_OPERATORS.name, CQL_OPERATORS.sortLimit]);
});

test("the deprecated view= key is a SHAPING key, never a type filter", () => {
  // Ruby's CQL accepts `view` where `type` is meant; it is not a filter, so a
  // query carrying only view= names no operator and must fail rather than grade
  // as a type filter that silently returned nothing.
  assert.deepEqual(cqlOperators({ view: "Search", sort: "name" }), [CQL_OPERATORS.sortLimit]);
  assert.deepEqual(cqlOperators({ view: "Search", type: "User", sort: "name" }), [CQL_OPERATORS.type, CQL_OPERATORS.sortLimit]);
});

test("a query naming no FILTER operator cannot grade as a leg", () => {
  const verdict = cqlOperatorLegHolds({ submitted: { view: "Search", sort: "name" }, returned: [] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.failures.includes("noOperator"), true);
  // sort/dir/limit shape a result; they do not select anything.
  assert.deepEqual(cqlFilterOperators({ view: "Search", sort: "name" }), []);
  assert.equal(cqlLegCheckName(cqlFilterOperators({ view: "Search", sort: "name" })), null);
  // A whole-deck answer to a shaping-only query is exactly what a silently
  // ignored submission looks like, so it must not pass either.
  const wholeDeck = cqlOperatorLegHolds({ submitted: { view: "Search", sort: "name" }, returned: ["a", "b", "c"], deckSize: 3 });
  assert.equal(wholeDeck.failures.includes("noOperator"), true);
  assert.equal(wholeDeck.failures.includes("wholeDeckReturned"), true);
});

test("result cards are read from their own card slots, deduplicated in order", () => {
  const html =
    '<div id="main">' +
    '<div class="search-result-item"><div class="card-slot" data-card-id="1" data-card-name="Search Oracle Alpha"></div></div>' +
    '<div class="search-result-item"><div class="card-slot" data-card-id="2" data-card-name="Search Oracle Beta"></div></div>' +
    // A repeat of a card already seen must not inflate the set.
    '<div class="search-result-item"><div class="card-slot" data-card-id="1" data-card-name="Search Oracle Alpha"></div></div>' +
    // A slot with no card name is not a result.
    '<div class="search-result-item"><div class="card-slot" data-card-id="3"></div></div>' +
    '</div>';
  assert.deepEqual(resultCardNames(html), ["Search Oracle Alpha", "Search Oracle Beta"]);
});

test("each Ruby arm passes when the engine answers it and the driver submits it", () => {
  for (const [armName, arm] of Object.entries(BATTERY.queries)) {
    // The battery's own result set is what the leg expects back; the module is
    // handed exactly what Ruby returned, so a classification or comparison bug
    // shows up here rather than on a deck.
    const verdict = cqlOperatorLegHolds({
      submitted: arm.query,
      returned: arm.result,
      expected: arm.result,
      excluded: null,
    });
    assert.deepEqual(verdict.failures, [], `${armName}: ${verdict.failures.join(", ")}`);
    assert.equal(verdict.ok, true, armName);
  }
});

test("the NOT leg must exclude what it names - the whole point of the operator", () => {
  const arm = BATTERY.queries.not_name;
  // Ruby excludes "Search Oracle Alpha"; a driver that got the whole type back
  // has not applied the negation at all.
  const leaky = cqlOperatorLegHolds({
    submitted: arm.query,
    returned: [...arm.result, "Search Oracle Alpha"],
    expected: arm.result,
    excluded: "Search Oracle Alpha",
  });
  assert.equal(leaky.ok, false);
  assert.deepEqual(leaky.failures, ["excludedCardReturned", "wrongResultSet"]);

  const wholeDeck = cqlOperatorLegHolds({
    submitted: arm.query,
    returned: [...arm.result, "Search Oracle Alpha"],
    expected: arm.result,
    excluded: "Search Oracle Alpha",
    deckSize: arm.result.length + 1,
  });
  assert.equal(wholeDeck.failures.includes("wholeDeckReturned"), true);
});

test("the empty-result arm demands an empty answer, not a fallback one", () => {
  const arm = BATTERY.queries.empty_result;
  const verdict = cqlOperatorLegHolds({
    submitted: arm.query, returned: ["Search Oracle Alpha"], expected: [],
  });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.failures, ["expectedNoResults"]);
});

test("the AND leg requires both keys honoured, and the comparison is order-free", () => {
  const arm = BATTERY.queries.and_combo;
  // The same set in a different order is the same answer: Ruby's contract is
  // name-SET parity.
  const shuffled = cqlOperatorLegHolds({ submitted: arm.query, returned: [...arm.result].reverse(), expected: arm.result });
  assert.equal(shuffled.ok, true);

  // Honouring only `right` (dropping `type`) returns a superset, which is what a
  // silently-ignored conjunctive key looks like.
  const halfHonoured = cqlOperatorLegHolds({
    submitted: arm.query, returned: ["Search Oracle Junction+child_one", "Search Oracle Alpha"], expected: arm.result,
  });
  assert.equal(halfHonoured.failures.includes("wrongResultSet"), true);
});

test("each leg names itself from the operators it exercised", () => {
  assert.equal(
    cqlLegCheckName(cqlFilterOperators(BATTERY.queries.not_name.query)),
    "JSON CQL not + name + type operator returns the expected members and excludes what it names",
  );
  assert.equal(
    cqlLegCheckName(cqlFilterOperators(BATTERY.queries.right_child.query)),
    "JSON CQL right operator returns the expected members and excludes what it names",
  );
});