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
