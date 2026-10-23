// The three rule kinds one capability names, told apart by the set key Ruby
// itself computed, and graded with the negative control Ruby's own spec
// asserts.
//
// WHAT RUBY'S SPEC SAYS, spec/cypress/e2e/rules.spec.coffee:
//
//   specify '*right Set', ->
//     cy.app("cards/ensure", name: "cereal+*right+*help",
//            content: "I go poopoo for poco puffs").then ->
//       cy.visit("/Test+cereal")
//       cy.main_slot()
//         .should("not.contain", "something spicy")
//         .should("contain", "poopoo")
//
//   specify '*type_plus_right Set', ->
//     ... name: "User+cereal+*type plus right+*help", content: "your favorite"
//     cy.visit "Joe User+cereal"
//     cy.main_slot().should "contain", "your favorite"
//     ... cy.visit("Joe Admin+cereal")
//     cy.main_slot().should "contain", "your favorite"
//
//   specify "Self Set", ->
//     cy.app "cards/ensure", name: "cereal+*self+*structure",
//            content: "[[cereal structure]]"
//     cy.app "cards/ensure", name: "cereal structure", content: "My very own header"
//     cy.visit "cereal"
//     cy.main_slot().should "contain", "cereal structure"
//
// Each leg is the SAME shape: put a setting on a rule keyed by one of the three
// set kinds, then read the MAIN SLOT of a visited card. The FIRST leg also
// asserts what the rule REPLACED: the *all+*help default ("something spicy") must
// NOT be there. That negative assertion is the half that turns a rendering
// claim into a rule claim, and it is the half no check on this row ran.
//
// WHY THE SET KEY IS THE RIGHT THING TO READ. Ruby does not decide which rule
// fires by matching the rule's name; it computes a set key for the visited card
// and asks which rule keys are in it. Those keys are emitted into the slot's own
// class attribute, and the committed Ruby capture
// fixtures/captured/board-views.json carries them:
//
//   ALL ALL_PLUS RSTAR
//   TYPE-rich_text  TYPE-set
//   RIGHT-Xself
//   TYPE_PLUS_RIGHT-rich_text-Xself
//   SELF-home  SELF-home-Xself  SELF-oracle_basic
//
// so a card that can be answered by a *right rule, a *type_plus_right rule and
// a *self rule says so in its own bytes. The port emits the same vocabulary
// (src/card/render/set-keys.ts:21-22,60-63 documents the identical strings).
//
// Registry row cap-P5 (tools/edge-signed-in-exercise/capabilities.json, id P5)
// recorded that its single bound check "labels itself the *right Set leg while
// its fixture is a +*self+*structure rule", that no *type_plus_right and no
// Self leg ran, and that there is no negative control. This module grades the
// three legs apart and the control that makes each one a rule claim.

/** The set-key tokens, in Ruby's own least-specific-first order. Anything not
 *  in this list is a view name or a bootstrap class and is dropped. */
const KIND_ORDER = ["ALL", "ALL_PLUS", "RSTAR", "TYPE", "RIGHT", "TYPE_PLUS_RIGHT", "SELF", "RULE"];

/** The three kinds capability P5 names, as the rule's own middle segment. Ruby
 *  spells the rule's set "plus right" with a space and the shortname with an
 *  underscore: `User+cereal+*type plus right+*help`. */
export const P5_SET_KINDS = Object.freeze({
  right: "*right",
  typePlusRight: "*type plus right",
  self: "*self",
});

function attrMap(attrs) {
  const map = {};
  for (const match of String(attrs).matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    map[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return map;
}

/**
 * The set keys of the card slot `html` renders, as Ruby's tokens.
 * `viewName` scopes the read: a board page renders several card slots (the
 * rules tab, the history tab, the follow section) and each carries its OWN set
 * keys, so a page-wide first-match read would let one slot answer for another.
 * With `viewName` null the FIRST card slot is returned.
 */
export function slotSetKeys(html, viewName = null) {
  const source = String(html);
  const open = /<div\b([^>]*\bclass\s*=\s*"([^"]*\bcard-slot\b[^"]*)"[^>]*)>/gi;
  for (let hit = open.exec(source); hit !== null; hit = open.exec(source)) {
    const classes = String(hit[2]).split(/\s+/).filter(Boolean);
    const view = classes.find((c) => c.endsWith("-view") || c.endsWith("_view"));
    if (viewName !== null && view !== viewName) continue;
    return classes.filter((token) =>
      KIND_ORDER.some((kind) => token === kind || token.startsWith(`${kind}-`)),
    );
  }
  return [];
}

/** Every card slot `html` renders, with the view it renders and its own set
 *  keys, in document order. A card page renders SEVERAL slots and only one of
 *  them is the visited card's own: the committed page captures show
 *
 *    0  nav_link_in_dropdown  ALL TYPE-basic_c            <- the breadcrumb
 *    1  edit_inline          ... RIGHT-Xenabled_role ...  <- the edit form's
 *    2  titled                ALL ALL_PLUS TYPE-pointer
 *                              RIGHT-harness_cb_role      <- THE VISITED CARD
 *                              SELF-harness_cb_boxy
 *    3  content               ALL TYPE-html SELF-Xfooter  <- the footer's
 *
 *  so a read that takes the FIRST slot measures the breadcrumb. This returns
 *  every row so a leg's evidence can show which slot it read and what the
 *  others carried. */
export function allSlotSetKeys(html) {
  const source = String(html);
  const open = /<div\b([^>]*\bclass\s*=\s*"([^"]*\bcard-slot\b[^"]*)"[^>]*)>/gi;
  const rows = [];
  for (let hit = open.exec(source); hit !== null; hit = open.exec(source)) {
    const classes = String(hit[2]).split(/\s+/).filter(Boolean);
    const view = classes.find((c) => c.endsWith("-view") || c.endsWith("_view")) ?? null;
    rows.push({
      view,
      keys: classes.filter((token) =>
        KIND_ORDER.some((kind) => token === kind || token.startsWith(`${kind}-`)),
      ),
    });
  }
  return rows;
}

/** The anchor names a slot can carry for `name` and the parts of a compound
 *  name: a slot that names one of these is rendering THIS card. Decko spells a
 *  name's url key with spaces folded to underscores and lowercased. */
export function cardAnchors(name) {
  const key = (part) => String(part).replace(/\s+/g, "_").toLowerCase();
  const whole = String(name).trim().replace(/^\//, "");
  const parts = whole.split("+").filter(Boolean);
  return [...new Set([key(whole), ...parts.map(key)])];
}

/**
 * The set keys of the slot that renders THE NAMED CARD, chosen by the anchors
 * that slot carries rather than by its position or its view name.
 *
 * WHY NOT A POSITION. A card page renders several card slots and the first is
 * the breadcrumb's nav-link dropdown (`unknown-view`, keys ALL TYPE-basic_c);
 * reading it grades "noRIGHTToken"/"noSELFToken" for cards whose own bytes
 * carry those tokens. The committed captures of every compound card this
 * harness visits show the page's four slots, and only the card's own slot
 * carries SELF-<this card>, RIGHT-<its right side> or
 * TYPE_PLUS_RIGHT-<left type>-<right>:
 *
 *    0  nav_link_in_dropdown   ALL TYPE-basic_c
 *    1  edit_inline           ... RIGHT-Xenabled_role ...   <- another card
 *    2  titled                 ALL TYPE-rich_text SELF-harness_cb_boxy
 *    3  content                ALL TYPE-html SELF-Xfooter    <- the footer
 *
 * WHY NOT A VIEW NAME. The card's own slot is not always `titled-view`: once a
 * rule ANSWERS for the card, the rule replaces the card's structure and the
 * card renders the RULE's slots instead. A measured page for a card the
 * *right rule had just answered carried no titled slot at all:
 *
 *    new-view        ALL ALL_PLUS TYPE-basic_c RIGHT-harness_cb_cereal
 *                    TYPE_PLUS_RIGHT-rich_text-harness_cb_cereal
 *    help-view       (same keys)
 *    new_fields-view (same keys)
 *
 * Naming the card is stable across both states: whichever slot renders it
 * carries an anchor for it, and no chrome slot ever does.
 */
export function cardSlotSetKeys(html, anchors) {
  const wanted = new Set(Array.isArray(anchors) ? anchors.map(String) : [String(anchors)]);
  const names = (key) => key.split("-").slice(1).join("-");
  for (const row of allSlotSetKeys(html)) {
    const hit = row.keys.some((key) => {
      const kind = key.split("-")[0];
      if (kind !== "SELF" && kind !== "RIGHT" && kind !== "TYPE_PLUS_RIGHT") return false;
      return wanted.has(names(key));
    });
    if (hit) return row.keys;
  }
  return [];
}

/** Every set kind present, least-specific first, deduplicated in that order. */
export function setKinds(setKeys) {
  const seen = [];
  for (const token of Array.isArray(setKeys) ? setKeys : []) {
    const kind = KIND_ORDER.find((k) => token === k || token.startsWith(`${k}-`));
    if (kind !== undefined && !seen.includes(kind)) seen.push(kind);
  }
  return seen;
}

/**
 * The most specific kind a card carries. Ruby's own reversal is
 * least-specific-first, so the LAST kind is the one a lookup narrows to
 * (src/card/render/set-keys.ts:72).
 */
export function mostSpecificKind(setKeys) {
  const kinds = setKinds(setKeys);
  return kinds.length === 0 ? null : kinds[kinds.length - 1];
}

/**
 * Which of P5's three rule kinds a rule card key is, read off the key itself.
 * A rule is `<set>+<left>+*<set kind>+*<setting>` (four segments) or
 * `<set>+<left>+*<setting>` for the Self form Ruby's own spec writes as
 * `cereal+*self+*structure` - so BOTH forms put a `*<kind>` segment in the key.
 * Returns one of "right" | "typePlusRight" | "self", or null when the key names
 * none of the three.
 */
export function ruleKindOf(ruleKey) {
  const segments = String(ruleKey ?? "").split("+").map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    if (segment.toLowerCase() === P5_SET_KINDS.self) return "self";
    if (segment.toLowerCase() === P5_SET_KINDS.right) return "right";
    if (segment.toLowerCase() === P5_SET_KINDS.typePlusRight) return "typePlusRight";
  }
  return null;
}

/** The token Ruby emits for a card that a given kind can answer, e.g.
 *  SELF- for the Self kind, RIGHT- for the *right kind. */
const KIND_TOKEN = Object.freeze({ right: "RIGHT", typePlusRight: "TYPE_PLUS_RIGHT", self: "SELF" });

/** The tag-stripped, whitespace-folded text of an element's inner HTML. */
function innerText(inner) {
  return String(inner).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The VISIBLE form of stored content. Ruby's structure rules hold links:
 * rules.spec.coffee's Self leg sets `cereal+*self+*structure` to
 * "[[cereal structure]]" and then asserts `cy.main_slot().should "contain",
 * "cereal structure"` - the bracket form is the storage syntax, the name is what
 * the reader sees. Grading the raw string would fail Ruby's own passing spec.
 * `[[name|label]]` renders as the label.
 */
export function visibleText(content) {
  return String(content ?? "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_match, name, label) =>
      label !== undefined && String(label).trim() !== "" ? String(label).trim() : String(name).trim(),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** The inner HTML of the element the page renders as the main slot. Ruby's
 *  card slots are div.card-slot under the page's main region; the battery reads
 *  the same #main container. */
export function mainSlotHtml(html) {
  const source = String(html);
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(source) ?? /id="main"[^>]*>([\s\S]*)/i.exec(source);
  const scope = main === null ? source : main[1];
  const slot = /<div\b([^>]*\bclass\s*=\s*"([^"]*\bcard-slot\b[^"]*)"[^>]*)>([\s\S]*)<\/div>/i.exec(scope);
  if (slot === null) return null;
  return { attrs: attrMap(slot[1]), inner: slot[2], classes: String(slot[2]).split(/\s+/).filter(Boolean) };
}

/**
 * One P5 leg, graded.
 *
 *   ruleKey        the rule card's key, e.g. "cereal+*right+*help"
 *   ruleContent    the setting's stored content, e.g. "I go poopoo for poco puffs"
 *   setKeys        the VISITED card's set keys (slotSetKeys of its slot)
 *   mainSlotText   the visited card's main-slot text
 *   defaultContent the *all default the rule REPLACES, e.g. "something spicy".
 *                   Optional: when omitted the negative control is not graded,
 *                   which is the state this row was in.
 *
 * Returns {ok, kind, failures}.
 */
export function ruleLegHolds(evidence) {
  const { ruleKey, ruleContent, setKeys, mainSlotText } = evidence;
  const defaultContent = evidence.defaultContent;
  const text = String(mainSlotText ?? "");
  const failures = [];

  const kind = ruleKindOf(ruleKey);
  if (kind === null) failures.push("ruleNamesNoP5Kind");

  // The visited card must carry the set kind the rule is keyed on. That token
  // is what makes the rule reachable AT ALL; without it the rule content could
  // only be on the page by accident.
  if (kind !== null) {
    const token = KIND_TOKEN[kind];
    const present = (Array.isArray(setKeys) ? setKeys : []).some(
      (key) => key === token || key.startsWith(`${token}-`),
    );
    if (!present) failures.push(`no${token}Token`);
  }

  // The positive half Ruby asserts first: the rule's own content renders. The
  // comparison is on the VISIBLE form, because a structure rule stores links
  // and renders their names.
  const expected = String(ruleContent ?? "").trim();
  if (expected === "") {
    failures.push("ruleContentEmpty");
  } else if (!text.includes(expected) && !text.includes(visibleText(expected))) {
    failures.push("ruleContentNotRendered");
  }

  // The negative half, which is what makes this a rule claim: the default the
  // rule replaced must be GONE. rules.spec.coffee's *right leg asserts it
  // before the positive one.
  if (defaultContent !== undefined && defaultContent !== null && String(defaultContent).trim() !== "") {
    if (text.includes(String(defaultContent))) failures.push("defaultStillRendered");
  } else {
    failures.push("noNegativeControl");
  }

  return { ok: failures.length === 0, kind, failures };
}

/**
 * The three legs in the order Ruby's spec names them, as the check names the
 * battery records. A leg that cannot name itself is not a leg.
 */
export const P5_CHECK_NAMES = Object.freeze({
  right: "P5 *right Set: a card the RIGHT token covers renders the *right rule and not the *all default",
  typePlusRight:
    "P5 *type_plus_right Set: a card the TYPE_PLUS_RIGHT token covers renders the *type_plus_right rule for a member of the set and not the *all default",
  self: "P5 Self Set: a card the SELF token names renders its own *self rule and not the *all default",
});