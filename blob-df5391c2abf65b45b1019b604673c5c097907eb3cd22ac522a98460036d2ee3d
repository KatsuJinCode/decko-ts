// follow/follow-options.ts — the follow option list: the port of
// card-mod-follow-0.20.0's FollowOption registry (lib/card/follow_option.rb)
// and the four option registrations (set/self/always.rb, set/self/created.rb,
// set/self/edited.rb, set/self/never.rb).
//
// Ruby shape:
//   lib/card/follow_option.rb:5-11  @test / @follower_candidate_ids /
//                                   @options = { all: [], main: [],
//                                   restrictive: [] }
//   lib/card/follow_option.rb:34-41 insert_option pos, item, type:
//     list[pos] ? list.insert(pos, item) : (list[pos] = item) — and the
//     FIXME at :37-40: "If pos > codenames.size in a previous insert then
//     we have a bunch of preceding nils in the array" — a Ruby array
//     assignment beyond the end pads with nils.
//   lib/card/follow_option.rb:43-51 add_option: optional positional insert
//     into the type list, THEN `Card::FollowOption.codenames(:all) <<
//     codename` (the :all list is always a plain append, in registration
//     order).
//   Registration order = the mod loader's dir walk over set/self/ —
//   alphabetical: always, created, edited, (follow, follow_defaults,
//   follow_fields — no registrations), never.

/** set/self/always.rb:2     follow_opts position: 2 → main[1] = :always.
 *  set/self/never.rb:2      follow_opts position: 3 → main[2] = :never.
 *  `main = []`, so `[nil, "always", "never"]` — the leading nil is Ruby's
 *  array pad (the FIXME's "bunch of preceding nils"); FollowOption.cards
 *  compacts it away (follow_option.rb:20-22). */
export const FOLLOW_OPTION_MAIN: readonly (string | null)[] = Object.freeze([
  null,
  "always",
  "never",
]);

/** set/self/created.rb:2    restrictive_follow_opts position: 1 → [0].
 *  set/self/edited.rb:2     restrictive_follow_opts position: 2 → [1]. */
export const FOLLOW_OPTION_RESTRICTIVE: readonly string[] = Object.freeze([
  "created",
  "edited",
]);

/** The :all list — plain appends in registration order
 *  (follow_option.rb:50): always (self/always.rb:2), created
 *  (self/created.rb:2), edited (self/edited.rb:2), never (self/never.rb:2). */
export const FOLLOW_OPTION_ALL: readonly string[] = Object.freeze([
  "always",
  "created",
  "edited",
  "never",
]);

/** FollowOption.cards.compact (follow_option.rb:20-22 + right/follow.rb:12-14
 *  option_cards): the codenames resolved to their star card NAMES. Ruby does
 *  Card[codename] (the codename registry); a missing codename card would be
 *  nil and compacted — every deck that ships the follow mod carries all four
 *  (data/real.yml seeds *always/*never/*created/*edited), so the compact is
 *  an identity here; the name form is what the views interpolate. */
export const FOLLOW_OPTION_CARD_NAMES: readonly string[] = Object.freeze([
  "*always",
  "*created",
  "*edited",
  "*never",
]);

/** FollowOption.restrictive_options (follow_option.rb:24-26). */
export function isRestrictiveFollowOption(codename: string): boolean {
  return (FOLLOW_OPTION_RESTRICTIVE as readonly string[]).includes(codename);
}

/** Abstract::FollowOption#description set_card
 *  (set/abstract/follow_option.rb:5-7): `set_card.follow_label` — with the
 *  created/edited overrides (set/self/created.rb:11-13, set/self/edited.rb:
 *  11-13): "#{set_card.follow_label} I created/edited". always/never carry
 *  no override, so the default applies. setLabel is the rule set's
 *  follow_label (set/type/set.rb:9-15 subclass short label). */
export function followOptionDescription(
  optionCodename: string,
  setLabel: string,
): string {
  if (optionCodename === "created") return `${setLabel} I created`;
  if (optionCodename === "edited") return `${setLabel} I edited`;
  return setLabel;
}

/** The option cards' display labels (set/self/*.rb label methods):
 *  always "follow" (:6-8), created "follow if I created" (:9-11), edited
 *  "follow if I edited" (:9-11), never "ignore" (:6-8). */
export function followOptionLabel(optionCodename: string): string {
  switch (optionCodename) {
    case "always":
      return "follow";
    case "created":
      return "follow if I created";
    case "edited":
      return "follow if I edited";
    case "never":
      return "ignore";
    default:
      return optionCodename;
  }
}
