// w4-follow-views.mjs - the two follow views the W4 row names, read off the
// rendered pages and graded against the pinned Ruby's own bytes.
//
// THE ROW. cap-W4 ("Followers list and 'all followed cards' view",
// tools/edge-signed-in-exercise/capabilities.json id W4) is not_covered. Its
// finding says why a binding would not have closed it: no id-prefixed check
// had ever run for the row, so no signed-in run could credit it at all. The
// row needs an INSTRUMENT, and this is it: the driver
// (checks-w4-follow-views.mjs) opens both views on the signed-in deck and this
// module grades what came back.
//
// THE CONTRACT, FROM THE PINNED RUBY, NOT FROM PROSE. The recorded bytes live
// in fixtures/captured/followers-list.json, captured from the pinned gemset
// by tests/card/mod-loader/oracle-capture-followers-list.rb. Every fact this
// module grades is read out of that capture:
//
//   followers_board_link_target  "link_to_card card.name.field(:followers),"
//       the board's followers link names the card's OWN *followers junction
//   followers_board_link_label   "\"#{cnt} follower#{'s' unless cnt == 1}\""
//       the label is a count and the word, pluralized exactly as Ruby does
//   follower_names_method        "followers.map(&:name)"
//   followers_item_names         "left ? left.follow_set_card.prototype.follower_names : []"
//       the followers list shows the NAMES of the accounts that follow the
//       card (the left card's follower names)
//   followers_content            "left ? item_names.to_pointer_content : \"\""
//       the list's BODY is the pointer content over those names
//   to_pointer_content_strip / to_pointer_content_join
//       each item is stripped of its "[[" / "]]" marks and the items are
//       joined with a newline
//   follow_overview_button_target "link_to_card [Auth.current, :follow], \"all followed cards\","
//       the overview link names the SIGNED-IN USER's *follow card
//   follow_overview_button_text  "\"all followed cards\","
//   following_core_view          "view :core do / if card.left && Auth.signed_in? /
//                                render_rule_editor / else / nest ... :followers ..."
//       the dashboard's core view is the follow editor for a signed-in viewer
//
// The port's own rendering of both views was measured against the stock Ruby
// oracle and is pinned in the repo: tests/card/set-modules/virtual-set-modules
// .test.ts records the oracle's answers for the same addresses (the
// *followers junction answers firstView=titled with the follower names; the
// *follow dashboard answers firstView=titled with "Follow Ignore"), and
// tests/card/follow/act155-w4-followers-view-content.test.ts plus
// act155-w4-follow-overview-assembly.test.ts pin the port's own bytes.
//
// WHAT IS GRADED, AND WHY EACH PART IS SEPARATE:
//
//   the LIST      the followers view must be the list surface over the
//                 follower names, and it must name EXACTLY the accounts that
//                 the stored follow rules make followers of that card. The
//                 count and the list are the same walk in Ruby
//                 (follower_names is follower_ids.map(&:name), and the count
//                 is follower_ids.size), so a list that disagrees with the
//                 count is a defect, not a presentation difference.
//   the COUNT     the board's followers link carries the count as its own
//                 label, so the count is read from the rendered view and
//                 reconciled against the stored rules - never assumed.
//   the OVERVIEW  the dashboard lists the user's held follow preference rule
//                 cards, so it must name every card the user follows and no
//                 card the user does not.
//   the CONTROL   a card nobody follows must render the EMPTY pointer list
//                 (Ruby's `left ? ... : ""` arm) and never the unknown-card
//                 create form. Without it a view that always renders one
//                 invented name would pass every other leg.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The pinned Ruby's own bytes for this contract, captured from the pinned
 * gemset (fixtures/captured/followers-list.json). */
export const ORACLE_CAPTURE = JSON.parse(
  readFileSync(
    join(here, "..", "..", "..", "fixtures", "captured", "followers-list.json"),
    "utf8",
  ),
);

/** The check names this row is bound to. They are the row's `checks` entries
 * in capabilities.json, byte for byte, and every one of them is id-prefixed
 * with the row's own id, the way the registry says an id-prefixed check
 * reads. */
export const W4_CHECKS = Object.freeze({
  followersList:
    "W4 the followers list names exactly the accounts that follow the card",
  followersCount:
    "W4 the Engage tab's follower count equals the accounts the followers list names",
  allFollowedCards:
    "W4 the all-followed-cards view lists the followed cards and no unfollowed card",
  unfollowedControl:
    "W4 a card nobody follows has an empty followers list",
});

/** A name in the deck's URL key form: spaces as underscores, case RETAINED
 * (card-mod-format's url_key retains the case, cardname variants.rb:4-12). */
export function urlKey(name) {
  return String(name ?? "").trim().replace(/\s+/g, "_");
}

/** A name reduced to its deck key form: lower case, spaces as underscores.
 * The deck stores a card's key that way (card-mod-account's key_of), and the
 * rendered pages show the name with spaces while the URLs carry the key, so
 * both sides are reduced before they are compared. */
export function nameKey(name) {
  return String(name ?? "")
    .replace(/\[|\]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** The port's pointer list, read INSIDE the page: the wrapper's presence and
 * one entry per item, with the item's own text and the hrefs it links to.
 * The function is self-contained on purpose, so the driver can hand it to
 * page.evaluate and the DOM is read where it lives. */
export function readPointerList() {
  const list = document.querySelector(".card-list.pointer-list");
  if (list === null) return null;
  return {
    wrapper: true,
    items: [...list.querySelectorAll(".pointer-item")].map((item) => ({
      text: (item.innerText ?? "").replace(/\s+/g, " ").trim(),
      hrefs: [...item.querySelectorAll("a[href]")].map((a) =>
        decodeURIComponent(a.getAttribute("href") ?? ""),
      ),
    })),
  };
}

/** The unknown-card create form, read INSIDE the page and scoped to the main
 * area: the board's own comment box carries id="new_card" as well, so an
 * unscoped read would blame the followers view for a form that belongs to
 * the page chrome. */
export function readCreateFormPresent() {
  return (
    document.querySelector(
      '#main form#new_card, #main form[action="/card/create"], #main form.card-form[action="/card/create"]',
    ) !== null
  );
}

/** Which expected names the rendered items carry. A name is CARRIED when the
 * item's own text or one of its hrefs contains the name's key form. The
 * containment test is over the whole item, so an item that renders the name
 * inside a compound name (the overview's preference rule cards) still counts,
 * and an item that names no expected name at all is an INVENTED name. */
export function nameCarriers(items, names) {
  const carriers = [];
  const carried = [];
  for (const item of items ?? []) {
    const haystack = nameKey([item.text, ...(item.hrefs ?? [])].join(" "));
    const hits = names.filter((name) => {
      const key = nameKey(name);
      return key !== "" && haystack.includes(key);
    });
    carriers.push(hits);
    carried.push(...hits);
  }
  return { carriers, carried };
}

/**
 * The followers list, graded.
 *
 * `list`      the pointer list read off the page ({wrapper, items}) or null
 * `expected`  the account names the stored follow rules make followers
 * `createForm` whether the unknown-card create form is on the page
 */
export function followersListVerdict({ list, expected, createForm = false }) {
  const failures = [];
  if (list === null || list.wrapper !== true) failures.push("noPointerList");
  if (createForm === true) failures.push("createFormShown");
  const items = list?.items ?? [];
  const { carriers, carried } = nameCarriers(items, expected);
  const missing = expected.filter((name) => !carried.includes(name));
  if (missing.length > 0) failures.push("missingFollowerNames");
  const invented = carriers.filter((hits) => hits.length === 0);
  if (invented.length > 0) failures.push("inventedFollowerNames");
  const doubled = expected.filter(
    (name) => carriers.filter((hits) => hits.includes(name)).length > 1,
  );
  if (doubled.length > 0) failures.push("followerNameRepeated");
  return {
    ok: failures.length === 0,
    failures,
    rendered: items.map((item) => item.text),
    expected: [...expected],
    missing,
    invented: invented.length,
    doubled,
  };
}

/**
 * The all-followed-cards view, graded.
 *
 * `expected`  the names of the cards the user follows (they appear inside the
 *              held preference rule names, which is what the view lists)
 * `forbidden` the names of the cards the user does NOT follow
 * `ruleCount` the number of follow preference rules the deck stores for the
 *              user (the number of items the view must carry)
 */
export function allFollowedCardsVerdict({
  items,
  expected,
  forbidden = [],
  ruleCount = null,
  createForm = false,
}) {
  const failures = [];
  if (createForm === true) failures.push("createFormShown");
  const { carriers, carried } = nameCarriers(items ?? [], expected);
  const missing = expected.filter((name) => !carried.includes(name));
  if (missing.length > 0) failures.push("missingFollowedCard");
  const forbiddenHits = forbidden.filter((name) =>
    nameCarriers(items ?? [], [name]).carried.length > 0,
  );
  if (forbiddenHits.length > 0) failures.push("unfollowedCardListed");
  if (ruleCount !== null && (items ?? []).length !== ruleCount) {
    failures.push("itemCountDisagreesWithStoredRules");
  }
  return {
    ok: failures.length === 0,
    failures,
    rendered: (items ?? []).map((item) => item.text),
    expected: [...expected],
    missing,
    forbiddenHits,
    ruleCount,
  };
}

/** The link's own path, with its query stripped and its marks decoded. The
 * recorded Ruby hrefs carry the card's URL KEY ("/Oracle_Basics+*followers/
 * content?..."), so the path is compared in the key form. */
function linkPath(href) {
  if (href === null || href === undefined) return null;
  return decodeURIComponent(String(href).split("?")[0]).replace(/^\//, "");
}

/** The followers link's own target, against the recorded Ruby
 * ("link_to_card card.name.field(:followers)"). The href names the card's
 * OWN *followers junction, and it may name one of that junction's views
 * (the recorded Ruby href is "...+*followers/content?layout=overlay&..."). */
export function followersLinkTargets(href, cardName) {
  const path = linkPath(href);
  if (path === null) return false;
  const junction = `${urlKey(cardName)}+*followers`;
  return path === junction || path.startsWith(`${junction}/`);
}

/** The overview link's own target, against the recorded Ruby
 * ("link_to_card [Auth.current, :follow]"). The href names the SIGNED-IN
 * USER's *follow card, not any other user's. */
export function overviewLinkTargets(href, actorName) {
  const path = linkPath(href);
  if (path === null) return false;
  const dashboard = `${urlKey(actorName)}+*follow`;
  return path === dashboard || path.startsWith(`${dashboard}/`);
}

/** The count label, against the recorded Ruby
 * ("\"#{cnt} follower#{'s' unless cnt == 1}\""): a count, the word, and the
 * plural exactly as Ruby pluralizes it. */
export function followerCountFrom(label) {
  const match = /^(\d+) followers?$/.exec(String(label ?? "").trim());
  if (match === null) return null;
  const count = Number(match[1]);
  const plural = /s$/.test(String(label).trim());
  if (plural === (count === 1)) return null;
  return count;
}
