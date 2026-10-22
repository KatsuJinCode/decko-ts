// follow-dashboard-expectations.mjs
//
// What the "all followed cards" dashboard must name, read from Ruby on this
// machine rather than from the port's own output. Every assertion below is
// the counterpart of a Ruby line; the port is never consulted to build the
// expectation.
//
// WHAT THE DASHBOARD IS. The user's follow dashboard is the virtual pointer
// card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb:5-20
// (`include_set Abstract::List`, `def virtual?; new?; end`,
// `def item_names; left ? Card::Rule.preference_names left.name, "follow" : []`)
// - a pointer whose items are the follow PREFERENCE CARDS of that user.
// Card::Rule.preference_names (card-1.110.0/lib/card/rule.rb:39-45) returns
// the cards that hold a follow preference for the user, which are the rule
// cards "<set>+<user>+follow".
//
// WHAT A DASHBOARD ROW IS NAMED AFTER. The Follow tab renders the editor
// rows (user/follow.rb:45-47 `view :follow_tab` -> follow_editor.haml ->
// `subformat(rule_card).follow_item option`), and the follow_item body links
// the SET the rule sits on (card-mod-follow-0.20.0/set/right/follow.rb:111-119
// `follow_item_link_target` / `follow_item_link_text`). The link TEXT is the
// set's follow_label, and for a set-type card that label is the SET
// PATTERN's short label (card-mod-follow-0.20.0/set/type/set.rb:9-13
// `def follow_label; klass = subclass_for_set; klass.short_label name.left_name`),
// not the set's codename.
//
//   - the SELF pattern's short label is the anchor's own name
//     (card-1.110.0 mod/core/set_pattern/09_self.rb:5-6 `def short_label name; name; end`),
//     so a card-scoped rule's row is named after the CARD;
//   - the ALL pattern's short label is "everything"
//     (card-1.110.0 mod/core/set_pattern/01_all.rb:5-7 `def short_label _name; "everything"; end`),
//     so a deck-wide rule's row is named "everything" - the deck-wide set's
//     CODENAME ("*all") never appears, and no per-card name appears either.
//
// WHY THE MEMBER'S ROW IS NOT A CARD NAME. The member's follow is the
// deck-wide rule (the fixture's *all rule for Mira), which Ruby resolves
// through the set-pattern walk and materializes on NO card
// (card-1.110.0/lib/card/rule/all.rb:17-31,66-73). Her dashboard therefore
// names the deck-wide SET, and a dashboard that named a per-card
// materialization for her would be wrong.

/** The SELF pattern's short label: the anchor's own name (09_self.rb:5-6).
 *  The rendered title may keep the name's separator (the port renders the
 *  name with its underscore), so the match tolerates the separator and the
 *  casing of the rendered title. */
export function selfSetShortLabel(anchorName) {
  return anchorName;
}

/** The ALL pattern's short label (01_all.rb:5-7). */
export const ALL_SET_SHORT_LABEL = "everything";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does this dashboard text name the SET a card-scoped rule sits on?
 * The set is the card's own +*self set, whose short label is the card's
 * name (09_self.rb:5-6).
 */
export function dashboardNamesSelfSet(cardName, dashboardText) {
  if (typeof cardName !== "string" || cardName.length === 0) return false;
  if (typeof dashboardText !== "string") return false;
  const label = escapeRegExp(selfSetShortLabel(cardName));
  // the separator may be rendered as the name's own "_" or as a space
  const pattern = new RegExp(label.replace(/_/g, "[_ ]"), "i");
  return pattern.test(dashboardText);
}

/**
 * Does this dashboard text name the deck-wide SET the member follows?
 * The label is the ALL pattern's short label (01_all.rb:5-7). A text that
 * names a per-card materialization for the member does NOT satisfy it: Ruby
 * materializes nothing per card for a deck-wide follow.
 */
export function dashboardNamesAllSet(dashboardText) {
  if (typeof dashboardText !== "string") return false;
  return new RegExp(escapeRegExp(ALL_SET_SHORT_LABEL), "i").test(dashboardText);
}

// ── the followers LIST address ──────────────────────────────────────────────
//
// THE FOLLOWERS LIST LIVES AT THE ASTERISKED JUNCTION. The list is the set
// module card-mod-follow-0.20.0/set/right/followers.rb, whose own first line
// names its address: "X+*followers provides a list of all users following X".
// It is a RIGHT set, so the star is part of the junction name, and the mod
// ships no set/left/followers.rb, so nothing resolves the un-asterisked
// spelling.
//
// SETTLED BY MEASUREMENT AGAINST A LIVE RUBY ORACLE (Ruby 3.3.12, card
// 1.110.0, card-mod-follow 0.20.0, Rails 7.2.4; see
// docs/reports/oracle-followers-address-settle-2026-10-22.md). Real HTTP GETs
// through the Decko router, on one seeded card:
//   GET /<card>+followers   -> 404, "Not Found / Could not find <card>+followers"
//                              for an anonymous reader; the create form for a
//                              reader with create rights. NEVER a list.
//   GET /<card>+*followers  -> 200, the followers LIST surface.
// and at the object level, on the same boot:
//   Card.new(name: "<card>+followers").virtual?  == false   (no set matched)
//   Card.new(name: "<card>+*followers").virtual? == true    (Followers matched,
//                              followers.rb:20-22 `def virtual?; new?; end`)
// The port's own oracle-measured fixtures agree: firstView=new at
// /Ada_Admin+followers, firstView=titled at /Ada_Admin+*followers
// (tests/card/set-modules/virtual-set-modules.test.ts:7-15).
//
// WHY THIS IS AN EXPECTATION AND NOT A COMMENT. The ACT-155 leg's original
// predicate was `status === 200 && /Mira/i.test(text)`, and the create form
// satisfies it: its own page chrome names the signed-in member. That predicate
// graded the create form as a followers list, which is how a followers list
// came to be "measured" at the un-asterisked address (matrix tranche-6's
// receipt, docs/reports/receipts/row-mx-155-act155-probe-leg-2026-10-21-tranche6.json,
// whose whole followersText is the un-asterisked junction's own heading).
// The discriminator below reads the JUNCTION the page names, which is the
// thing the two surfaces actually differ on.

/** The followers LIST junction tag. A RIGHT set, so the star is part of the
 *  name (set/right/followers.rb:1). */
export const FOLLOWERS_JUNCTION_TAG = "*followers";

/** The tag the followers list is NOT at. Kept as a named value because the
 *  leg asserts against it: reading the list here is the defect. */
export const UNASTERISKED_FOLLOWERS_TAG = "followers";

/** The followers LIST path for a card name. */
export function followersJunctionPath(cardName) {
  if (typeof cardName !== "string" || cardName.length === 0) return null;
  return `/${cardName.replaceAll(" ", "_")}+${FOLLOWERS_JUNCTION_TAG}`;
}

/**
 * Is this path the followers LIST address?
 * True only for the asterisked junction. This is the address assertion, so a
 * leg that reads the un-asterisked address fails here rather than reporting a
 * list it never read.
 */
export function isFollowersListAddress(path) {
  if (typeof path !== "string" || path.length === 0) return false;
  return new RegExp(`\\+${escapeRegExp(FOLLOWERS_JUNCTION_TAG)}(?:[/?#]|$)`, "i").test(path);
}

/**
 * The regex a rendered page carries when it names this card's junction with
 * this tag. Two measured separator shapes are tolerated, because Ruby renders
 * both: the tight key form ("Ada_Admin+*followers", the port fixture at
 * tests/card/set-modules/virtual-set-modules.test.ts:11) and the spaced title
 * form ("Oracle Followers Address Probe + *followers", the live oracle body
 * measured on 2026-10-22). The STAR is never optional: it is the whole
 * difference between the list and the create form.
 */
function junctionPattern(cardName, tag) {
  const key = cardName.replaceAll(" ", "_");
  return key.replaceAll("_", "[_ ]") + `\\s*\\+\\s*${escapeRegExp(tag)}`;
}

/**
 * Does this page text name the FOLLOWERS LIST junction?
 * The list page names its own junction, "<card>+*followers" (measured:
 * `firstView=titled "Ada Admin+*followers Mira Member"`). A create form for
 * the un-asterisked junction names "<card>+followers" instead, so a text that
 * carries the name WITHOUT the star is not a followers list, however many
 * member names it also carries.
 *
 * `cardName` is required so the match is anchored to THIS card's junction and
 * cannot be satisfied by some other card's list.
 */
export function namesFollowersList(cardName, pageText) {
  if (typeof cardName !== "string" || cardName.length === 0) return false;
  if (typeof pageText !== "string" || pageText.length === 0) return false;
  return new RegExp(junctionPattern(cardName, FOLLOWERS_JUNCTION_TAG), "i").test(pageText);
}

/**
 * Does this page text name the UNKNOWN (un-asterisked) junction?
 * That is the create form's heading: "<card>+followers", never a list
 * (measured: 404 "Could not find <card>+followers" anonymous, the create form
 * for a permitted reader).
 */
export function namesUnknownJunctionCreateForm(cardName, pageText) {
  if (typeof cardName !== "string" || cardName.length === 0) return false;
  if (typeof pageText !== "string" || pageText.length === 0) return false;
  // a text that also names the STARRED junction is the list, not this form
  if (namesFollowersList(cardName, pageText)) return false;
  return new RegExp(junctionPattern(cardName, UNASTERISKED_FOLLOWERS_TAG), "i").test(pageText);
}
