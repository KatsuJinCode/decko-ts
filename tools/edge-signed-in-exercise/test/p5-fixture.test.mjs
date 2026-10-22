// cap-P5 - the four rule-set legs' FIXTURES.
//
//   node --test tools/edge-signed-in-exercise/test/p5-fixture.test.mjs
//
// THE PIN. Every leg of this row creates a card through the typed-fixture
// helper, and a fixture that creates a name the run ALREADY created is
// refused with a name conflict: the signed-in run of 2026-10-22 recorded the
// *self+*structure leg as "typed fixture was not created as requested:
// Harness_CB_Cereal; HTTP 422" - with the card itself already stored, from
// the *right Set leg above it.
//
// The three rule-set legs and the self-structure leg each need their OWN
// card: the *right leg's card carries a *right+*help rule, the Self leg's
// card carries a *self+*structure rule, and a card cannot carry both without
// the legs measuring each other.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const coverB = readFileSync(new URL("../checks-cover-b.mjs", import.meta.url), "utf8");

test("each P5 leg creates its OWN card: a name the run already created is refused", () => {
  // The four cards the four legs use.
  assert.match(coverB, /const card = ensure\("Harness_CB_Cereal"\);/);
  assert.match(coverB, /const card = ensure\("Harness_CB_Cereal_TPR"\);/);
  assert.match(coverB, /const card = ensure\("Harness_CB_Cereal_Self"\);/);
  assert.match(coverB, /const cardName5 = ensure\("Harness_CB_Cereal_Struct"\);/);
  // The self-structure leg must not reuse the *right leg's card: the create
  // of an existing name is a 422 and the leg never ran.
  assert.equal(/const cardName5 = ensure\("Harness_CB_Cereal"\);/.test(coverB), false);
  // And the four names are four distinct cards.
  const names = [...coverB.matchAll(/ensure\("(Harness_CB_Cereal[^"]*)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(names)].sort(), [
    "Harness_CB_Cereal",
    "Harness_CB_Cereal_Self",
    "Harness_CB_Cereal_Struct",
    "Harness_CB_Cereal_TPR",
  ]);
});
