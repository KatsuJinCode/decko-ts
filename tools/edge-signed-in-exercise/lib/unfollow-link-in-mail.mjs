// The unfollow link in the follower mail, graded on Ruby's own template and
// on the rule it changes.
//
// THE ROW. cap-W6 ("Unfollow link in the email",
// tools/edge-signed-in-exercise/capabilities.json id W6) is carried as
// out_of_scope with the reason "needs a received email; no mail sink in the
// local harness". There IS a mail sink here (the owned in-process capture
// the requiresMail seat arms), so the reason is stale. The check that
// exists (checks-content-flows.mjs, the W6 group) already grades the
// EFFECT: it follows the link and asserts the stored rule option went from
// *always to *never.
//
// WHAT THAT CHECK DOES NOT SAY. It finds the link by searching the mail for
// any URL that matches /\/update\// and /never/i. That accepts a link that
// names the WRONG rule, a link that targets something else entirely, a mail
// whose link text is not Ruby's, and a mail with no link at all as long as
// some other URL in the body happens to look like an update path. The row's
// oracle says more than that.
//
// WHAT RUBY SENDS. The link is a view of the notice card, and the view is
// unfollow_url (card-mod-follow-0.20.0 set/all/notify/base_views.rb:49-55):
//
//   view :unfollow_url, perms: :none, compact: true, cache: :never do
//     return "" unless (rule_name = live_follow_rule_name)
//
//     card_url path(mark: [active_notice(:follower), :follow].cardname,
//                   action: :update,
//                   card: { subcards: { rule_name => :never.cardname } })
//   end
//
// So Ruby sends a link that:
//   1. IS an update of a follow card: the mark is
//      "<follower>+*follow" (the follower's own follow card) and the action
//      is :update.
//   2. NAMES the follower's live follow rule: rule_name comes from
//      live_follow_rule_name (base_views.rb:78-82), which is the set card's
//      follow_rule_name for that follower.
//   3. CARRIES the never option: :never.cardname is the never option's
//      cardname, and the never option's own content is "*never"
//      (set/all/follow/stop_follow_link.rb:6, StopFollowLink's
//      @rule_content). Following the link is what sets the rule to never.
//
// And the template puts it in the mail twice (data/real.yml:85 and :97):
//
//   <a href="{{_|unfollow_url}}">Unfollow</a> to stop receiving these emails.
//   Use this link to unfollow {{_|unfollow_url}}
//
// so the link's ANCHOR TEXT is "Unfollow" and the text part carries the
// "Use this link to unfollow" clause.
//
// THE SHAPE DIFFERENCE, NAMED. Ruby's URL is
// "/update/<follower>+*follow?card[subcards][<rule>]=*never": it updates the
// follower's follow card and sets the rule as its SUB card. The port's URL
// (src/card/notify/follow-mail-views.ts:265-269) is
// "/update/<rule>?card[content]=*never": it updates the rule card directly
// and sets its content. The two are not the same bytes, and this predicate
// does not pretend they are: it grades the claims the two SHARE - the link
// exists, its anchor text is Ruby's, it names the follower's live rule, it
// carries the never option, it targets an update of a follow card, and
// following it stops the rule - and it RECORDS which shape it saw
// (`shape`), so a reader can see the difference instead of inferring it.
// The shape is not a failure, because the capability the row names is the
// link and its effect, and both are the same in the two shapes.
//
// ANTI-VACUITY.
//   1. A mail with no link fails: the html part must carry an anchor whose
//      text is "Unfollow", and the text part must carry the "Use this link
//      to unfollow" clause.
//   2. An EMPTY href fails. Ruby's view returns "" when there is no live
//      follow rule, and an empty href is a link that goes nowhere.
//   3. The rule name is compared DECODED. Ruby percent-encodes the whole
//      rule name into the query key; a comparison against the raw query
//      would fail on a correct link.
//   4. The link must target an update path whose card name ends in
//      "+*follow", and the query must carry the never option. A URL that
//      merely contains the word "never" is not this link.
//   5. The html link and the text-part link must be the SAME link, compared
//      on path and query, so a mail whose two halves disagree fails.
//
// WHAT THIS DOES NOT CLAIM. It grades the link the notice carries. It does
// not grade who the follower is, that the follow rule was ever written, or
// the rest of the notice's clauses (cap-W5's row, and its own predicate in
// lib/follower-notice-contract.mjs).

/** The anchor text the template puts on the link (data/real.yml:85). */
export const UNFOLLOW_ANCHOR_TEXT = "Unfollow";

/** The text part's clause (data/real.yml:97). */
export const UNFOLLOW_TEXT_CLAUSE = "Use this link to unfollow ";

/** The never option's content, the thing a stop-follow writes
 *  (set/all/follow/stop_follow_link.rb:6, @rule_content = "*never"). */
export const NEVER_OPTION = "*never";

/** The follow card's name suffix: a follow rule is always a card whose name
 *  ends in "+*follow" (Ruby's mark is [follower, :follow].cardname). */
const FOLLOW_SUFFIX = "+*follow";

const decode = (value) => {
  try {
    return decodeURIComponent(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
};

/** The html entity for an ampersand, which the mail's html part carries. */
const unescapeHtml = (value) =>
  String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/**
 * A link, read out of a mail, as its path and its decoded query.
 *
 * The mail may carry an ABSOLUTE url (the port builds one with the origin)
 * or a RELATIVE one (Ruby's own capture carries "/update/..."), so the link
 * is parsed against a fixed base and only the path and the query are read.
 * Returns {raw, path, name, params}.
 */
export function readUnfollowLink(url) {
  const raw = unescapeHtml(String(url ?? "")).trim();
  if (raw === "") return { raw: "", path: null, name: null, params: {} };
  let parsed;
  try {
    parsed = new URL(raw, "http://unfollow.link");
  } catch {
    return { raw, path: null, name: null, params: {} };
  }
  const params = {};
  for (const [key, value] of parsed.searchParams.entries()) params[key] = value;
  const path = parsed.pathname;
  const name = path.startsWith("/update/") ? decode(path.slice("/update/".length)) : null;
  return { raw, path, name, params };
}

/** The anchor the template puts on the link, read out of the html part. */
export function findUnfollowAnchor(htmlBody) {
  const html = String(htmlBody ?? "");
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text !== UNFOLLOW_ANCHOR_TEXT) continue;
    const href = /href=['"]([^'"]*)['"]/i.exec(match[1])?.[1] ?? "";
    return { href, text };
  }
  return null;
}

/** The url the text part's clause carries, if the clause is there at all.
 *
 *  The url ends at the first whitespace, and also at the first "<": the
 *  text part is plain text, but the capture of the TEMPLATE CARD (the raw
 *  oracle fixture) wraps the plain-text body in a div, and a reader that
 *  took the markup for a url would report a link that does not exist. */
export function findUnfollowTextUrl(textBody) {
  const text = String(textBody ?? "");
  const start = text.indexOf(UNFOLLOW_TEXT_CLAUSE);
  if (start < 0) return null;
  const rest = text.slice(start + UNFOLLOW_TEXT_CLAUSE.length);
  const end = rest.search(/[\s<]/);
  const url = (end < 0 ? rest : rest.slice(0, end)).trim();
  return url === "" ? "" : url;
}

/**
 * Grade the unfollow link in one delivered notice.
 *
 * `mail`     the delivered message: {subject, textBody, htmlBody}
 * `expected` what the driver knows: {ruleName, optionBefore, optionAfter}
 *            - the follower's live follow rule for the followed set, and
 *            the stored rule option before and after the link was
 *            followed.
 *
 * Returns {ok, failures, shape, anchor, textUrl}.
 */
export function unfollowLinkInMail(mail, expected) {
  const failures = [];
  const html = String(mail?.htmlBody ?? "");
  const text = String(mail?.textBody ?? "");

  // 1. The anchor the template names, with a href that goes somewhere.
  const anchor = findUnfollowAnchor(html);
  if (anchor === null) {
    failures.push("unfollowAnchorMissing");
  } else if (anchor.href.trim() === "") {
    failures.push("unfollowHrefEmpty");
  }

  // 2. The text part's clause, with a url that goes somewhere.
  const textUrl = findUnfollowTextUrl(text);
  if (textUrl === null) {
    failures.push("unfollowTextClauseMissing");
  } else if (textUrl === "") {
    failures.push("unfollowTextUrlEmpty");
  }

  const link = readUnfollowLink(anchor?.href ?? "");
  const textLink = readUnfollowLink(textUrl ?? "");

  // 3. The link targets an update of a follow card (Ruby's action: :update
  //    on a mark whose name ends in "+*follow").
  if (anchor !== null && anchor.href.trim() !== "") {
    if (link.path === null) failures.push("unfollowTargetNotAnUpdate");
    else if (link.name === null) failures.push("unfollowTargetNotAnUpdate");
    else if (!link.name.endsWith(FOLLOW_SUFFIX)) failures.push("unfollowTargetNotAFollowCard");
  }

  // 4. The link names the follower's live follow rule (base_views.rb:78-82).
  if (expected?.ruleName !== undefined && anchor !== null && anchor.href.trim() !== "") {
    const named = `${link.name ?? ""} ${Object.keys(link.params).map((key) => `${key} ${link.params[key]}`).join(" ")}`;
    if (!named.includes(expected.ruleName)) failures.push("unfollowRuleNotNamed");
  }

  // 5. The link carries the never option (the value a stop-follow writes).
  if (anchor !== null && anchor.href.trim() !== "") {
    const carried = Object.values(link.params).join(" ");
    if (!carried.includes(NEVER_OPTION)) failures.push("unfollowNeverNotCarried");
  }

  // 6. The two halves of the template carry the SAME link.
  if (anchor !== null && textUrl !== null && anchor.href.trim() !== "" && textUrl !== "") {
    if (textLink.path !== link.path) failures.push("unfollowLinkHalfMismatch");
    else if (JSON.stringify(textLink.params) !== JSON.stringify(link.params)) {
      failures.push("unfollowLinkHalfMismatch");
    }
  }

  // 7. The effect: following the link stopped the rule. The driver read
  //    both states from the deck.
  if (expected?.optionBefore !== undefined && expected?.optionAfter !== undefined) {
    if (expected.optionBefore !== "*always") failures.push("followRuleWasNotAlways");
    if (expected.optionAfter !== NEVER_OPTION) failures.push("followRuleDidNotStop");
  }

  // Which shape this link has, recorded rather than graded: "subcards" is
  // Ruby's (the follower's follow card, the rule as its sub card),
  // "content" is the port's (the rule card's own content). The two are
  // named so a reader sees the difference instead of inferring it.
  const shape = Object.keys(link.params).some((key) => key.includes("subcards"))
    ? "subcards"
    : Object.keys(link.params).some((key) => key === "card[content]")
      ? "content"
      : "other";

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    shape,
    anchor,
    textUrl,
    link: { path: link.path, name: link.name, params: link.params },
    textLink: { path: textLink.path, name: textLink.name, params: textLink.params },
  };
}

/** The check names each leg records, so the evidence names its own leg. */
export const UNFOLLOW_LINK_CHECKS = Object.freeze({
  present: "the follower mail carries the Unfollow link the template writes",
  rule: "the unfollow link names the follower's live follow rule and carries the never option",
  stops: "following the unfollow link stops the follow rule, the way Ruby's stop-follow does",
});

/** Which leg each failure belongs to, so a red names the CLAIM that broke
 *  and not just the check. */
export const UNFOLLOW_LINK_LEGS = Object.freeze({
  unfollowAnchorMissing: "present",
  unfollowHrefEmpty: "present",
  unfollowTextClauseMissing: "present",
  unfollowTextUrlEmpty: "present",
  unfollowLinkHalfMismatch: "present",
  unfollowTargetNotAnUpdate: "rule",
  unfollowTargetNotAFollowCard: "rule",
  unfollowRuleNotNamed: "rule",
  unfollowNeverNotCarried: "rule",
  followRuleWasNotAlways: "stops",
  followRuleDidNotStop: "stops",
});

/**
 * The verdict split by leg, so the battery can record the three claims
 * separately and a red names which one broke.
 */
export function unfollowLinkLegs(verdict) {
  const failures = Array.isArray(verdict?.failures) ? verdict.failures : [];
  const legs = { present: [], rule: [], stops: [] };
  for (const failure of failures) {
    const leg = UNFOLLOW_LINK_LEGS[failure];
    if (leg !== undefined) legs[leg].push(failure);
  }
  return {
    present: { ok: legs.present.length === 0, failures: legs.present },
    rule: { ok: legs.rule.length === 0, failures: legs.rule },
    stops: { ok: legs.stops.length === 0, failures: legs.stops },
  };
}
