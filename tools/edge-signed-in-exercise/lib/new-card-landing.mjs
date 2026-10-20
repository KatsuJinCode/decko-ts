// Did the create land on the card it just made?
//
// Registry row cap-C1 ("Create a RichText card through /new/RichText and land
// on it") recorded its own gap: "Create succeeds and later visit exists, but
// reported landing is not part of predicate." The harness recorded the URL the
// browser ended on and graded the WRITE status plus a later visit's 200 —
// so a create that stayed on the form, or landed anywhere else at all, still
// passed.
//
// What "landed on it" means is Decko's own: a card create's success target is
// the card it created (env/success/target.rb — the create form posts without a
// `success[mark]`, so the target is the card itself), which for a deck whose
// Home card is configured is ALSO served at `/`. So the path alone is not the
// answer; the MAIN SLOT's own card id is. That is the read the S5 check
// already uses (`#main[data-card-id=...]`), and the id it compares against is
// the created card's row in the deck, never a constant.
//
// The URL leg is kept as well because it is what a person sees: the card's
// own page is `/<name>` (DeckoName's url_key spelling), and staying on
// `/new/<Cardtype>` is the shape that must NOT pass.

/** The path portion, decoded and without its trailing slash — the same
 *  normalization the other journey legs use. */
function pathOf(landedUrl, origin) {
  const withoutOrigin = origin !== undefined && landedUrl.startsWith(origin)
    ? landedUrl.slice(origin.length)
    : landedUrl;
  const [path] = withoutOrigin.split("?");
  return decodeURIComponent(path ?? "").replace(/\/+$/, "");
}

/**
 * The legs, from the reads the check takes:
 *   landedUrl    — the browser's URL after the create's success
 *   origin       — the stack's origin, so the comparison is path-relative
 *   cardName     — the name the create submitted
 *   mainCardId   — the card id in #main on that page (null when none)
 *   createdCardId— the created card's id in the deck (null when unknown)
 */
export function newCardLanding({ landedUrl, origin, cardName, mainCardId, createdCardId }) {
  const path = pathOf(landedUrl, origin);
  const cardPath = `/${cardName}`;
  return {
    landedPath: path,
    landedOnCardPath: path === cardPath,
    // The stronger read: the main slot IS the card just created. This is what
    // makes a deck that serves its Home card at "/" grade correctly.
    landedOnCreatedCard:
      mainCardId !== null && createdCardId !== null && mainCardId === createdCardId,
  };
}

/** The check's predicate: the browser is on the card the create made. */
export function landedOnNewCard(evidence) {
  const legs = newCardLanding(evidence);
  return { ok: legs.landedOnCardPath || legs.landedOnCreatedCard, legs };
}
