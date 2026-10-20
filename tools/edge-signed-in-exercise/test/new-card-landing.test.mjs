// The C1 landing predicate — "create a RichText card via /new/RichText and
// land on it" — graded against the four page shapes a create can end on.
//
//   node --test tools/edge-signed-in-exercise/test/new-card-landing.test.mjs
//
// Registry row cap-C1 (tools/edge-signed-in-exercise/capabilities.json, id
// C1) recorded the gap this closes: "Create succeeds and later visit exists,
// but reported landing is not part of predicate." The harness recorded the
// URL the browser ended on and graded the write status plus a later visit's
// 200, so a create that stayed on the form scored a pass.
//
// The two legs are the ones Decko's own success target needs
// (env/success/target.rb: a create form posts without `success[mark]`, so the
// target is the card it created): the card's own `/<name>` path, and the main
// slot carrying the created card's id — the second because a deck whose Home
// card is configured also serves that card at `/`, where the path leg alone
// cannot answer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { landedOnNewCard, newCardLanding } from "../lib/new-card-landing.mjs";

const ORIGIN = "http://127.0.0.1:4603";
const NAME = "Harness_richtext_run1";

test("the card's own page is a landing", () => {
  const { ok, legs } = landedOnNewCard({
    landedUrl: `${ORIGIN}/${NAME}`,
    origin: ORIGIN,
    cardName: NAME,
    mainCardId: 412,
    createdCardId: 412,
  });
  assert.equal(ok, true);
  assert.deepEqual(legs, { landedPath: `/${NAME}`, landedOnCardPath: true, landedOnCreatedCard: true });
});

test("staying on the create form is NOT a landing", () => {
  // The shape the old predicate passed: the write answered 200 and the card
  // existed on a later visit, while the browser never left the form.
  const { ok, legs } = landedOnNewCard({
    landedUrl: `${ORIGIN}/new/RichText?card%5Bname%5D=${NAME}`,
    origin: ORIGIN,
    cardName: NAME,
    mainCardId: 87,
    createdCardId: 412,
  });
  assert.equal(ok, false);
  assert.equal(legs.landedPath, "/new/RichText");
  assert.equal(legs.landedOnCardPath, false);
  assert.equal(legs.landedOnCreatedCard, false);
});

test("the deck root answers only when the main slot IS the created card", () => {
  // A deck whose Home card is configured serves that card at "/". The main
  // slot's own id is what decides, and the created card's id comes from the
  // deck — never a constant.
  assert.equal(
    landedOnNewCard({
      landedUrl: `${ORIGIN}/`,
      origin: ORIGIN,
      cardName: NAME,
      mainCardId: 412,
      createdCardId: 412,
    }).ok,
    true,
  );
  assert.equal(
    landedOnNewCard({
      landedUrl: `${ORIGIN}/`,
      origin: ORIGIN,
      cardName: NAME,
      mainCardId: 87,
      createdCardId: 412,
    }).ok,
    false,
  );
});

test("an unknown created-card id falls back to the path leg alone", () => {
  // A host-override target has no owned local deck, so the id leg is null and
  // the URL is the only evidence there is.
  const { ok, legs } = landedOnNewCard({
    landedUrl: `${ORIGIN}/${NAME}`,
    origin: ORIGIN,
    cardName: NAME,
    mainCardId: null,
    createdCardId: null,
  });
  assert.equal(ok, true);
  assert.equal(legs.landedOnCreatedCard, false);
});

test("a name with a space is compared decoded, and the query is not part of the path", () => {
  assert.deepEqual(
    newCardLanding({
      landedUrl: `${ORIGIN}/The%20Newber?view=edit`,
      origin: ORIGIN,
      cardName: "The Newber",
      mainCardId: null,
      createdCardId: null,
    }),
    { landedPath: "/The Newber", landedOnCardPath: true, landedOnCreatedCard: false },
  );
});
