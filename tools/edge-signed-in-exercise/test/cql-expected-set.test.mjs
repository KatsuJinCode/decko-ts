// cap-N2 - the three operator legs' EXPECTED SETS.
//
//   node --test tools/edge-signed-in-exercise/test/cql-expected-set.test.mjs
//
// THE DEFECTS. The signed-in run of 2026-10-22 recorded the right, the not
// and the created_by legs as failures ["wrongResultSet"] while the pages
// were RIGHT. Two causes, both in the CHECK's expectation model:
//
// (1) THE NAME A JUNCTION CARRIES. The expected sets were read as
//     `SELECT c.name`, and in this deck a JUNCTION ROW HAS NO NAME: the
//     new-schema junction rows carry a NULL name column and are identified
//     by their left/right ids. The expected sets carried nulls (the
//     created_by leg's expected set was
//     [null,null,...,null,"Harness_upload_mvjqi9s3",...]) while the page
//     renders the COMPOSED name
//     ("Harness_CF_Followed_mvjq9axx+*self+Harness Member"). A null can
//     never equal a composed name.
//
// (2) THE RIGHT OPERATOR'S MEANING. `right: X` returns the cards whose
//     RIGHT SIDE is X, not X itself. The right leg's expected set was the
//     card NAMED X - the member alone - while the page carried exactly the
//     cards whose right side is the member.
//
// (3) THE PAGE'S OWN CAP. A result set larger than one page shows the first
//     SEARCH_PAGE_CAP of it (src/card/render/search-paging.ts:16, the CQL
//     limit ?? 20). The not leg's page carried the first 20 of the type's
//     cards and the created_by leg's page the first 20 of the creator's
//     cards, while the expected sets held every card of the set.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cqlOperatorLegHolds,
  sameNameSet,
  SEARCH_PAGE_CAP,
} from "../lib/cql-operator-breadth.mjs";

test("the page's own cap is the port's own search limit", () => {
  assert.equal(SEARCH_PAGE_CAP, 20);
});

test("a result set that fits on one page is graded as a SET", () => {
  const wanted = ["Harness_CF_Followed_mvjq9axx+*self+Harness Member", "Harness_watchme_mvjqk982+*self+Harness Member"];
  const verdict = cqlOperatorLegHolds({
    submitted: { right: "Harness Member", sort: "name" },
    returned: wanted,
    expected: wanted,
    excluded: "Harness Admin",
  });
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  // A whole-deck answer still fails.
  const wholeDeck = cqlOperatorLegHolds({
    submitted: { right: "Harness Member", sort: "name" },
    returned: [...wanted, "Harness Admin"],
    expected: wanted,
    excluded: "Harness Admin",
  });
  assert.equal(wholeDeck.failures.includes("excludedCardReturned"), true);
  assert.equal(wholeDeck.failures.includes("wrongResultSet"), true);
});

test("a result set larger than one page is graded on the rows the page shows", () => {
  const wanted = Array.from({ length: 24 }, (_, i) => `Card ${String(i).padStart(2, "0")}`);
  const page = wanted.slice(0, SEARCH_PAGE_CAP);
  const verdict = cqlOperatorLegHolds({
    submitted: { created_by: "Harness Member", sort: "name" },
    returned: page,
    expected: wanted,
  });
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  // A page that is not full is not the answer.
  const short = cqlOperatorLegHolds({
    submitted: { created_by: "Harness Member", sort: "name" },
    returned: page.slice(0, 3),
    expected: wanted,
  });
  assert.equal(short.failures.includes("wrongResultSet"), true);
  // A page carrying a card the operator must not return fails.
  const foreign = cqlOperatorLegHolds({
    submitted: { created_by: "Harness Member", sort: "name" },
    returned: [...page.slice(0, SEARCH_PAGE_CAP - 1), "Someone Else"],
    expected: wanted,
  });
  assert.equal(foreign.failures.includes("wrongResultSet"), true);
  // And the set comparison itself is a SET, never a sequence.
  assert.equal(sameNameSet(["b", "a"], ["a", "b"]), true);
});

test("the CALLER's expected sets are the deck's own rows, named as the page names them", () => {
  const driver = readFileSync(new URL("../checks-cql-navbox.mjs", import.meta.url), "utf8");
  // The composed name: a junction row has no name, and the name the page
  // renders is the composed one.
  assert.match(driver, /const composedName=\(id,depth=0\)=>/);
  assert.match(driver, /`\$\{left\}\+\$\{right\}`/);
  // The right operator: the cards whose RIGHT side is the member.
  assert.match(driver, /SELECT c\.id FROM cards c WHERE c\.trash=0 AND c\.right_id=\?'\)\.all\(identity\.id\)/);
  // The old expectation - the card NAMED the member - is gone.
  assert.equal(/SELECT c\.name FROM cards c WHERE c\.trash=0 AND c\.name=\?'\)\.all\(memberRight\)/.test(driver), false);
  // The created_by leg reads the creator's rows by id and names them.
  assert.match(driver, /SELECT c\.id FROM cards c JOIN cards u ON u\.id=c\.creator_id/);
  // The not leg excludes the member by ID: a junction row's name is NULL, so
  // a name comparison would drop every junction of that type.
  assert.match(driver, /t\.name=\? AND c\.id<>\?'\)\.all\(identity\.type,identity\.id\)/);
  assert.equal(/t\.name=\? AND c\.name<>\?'\)\.all\(identity\.type,identity\.name\)/.test(driver), false);
});
