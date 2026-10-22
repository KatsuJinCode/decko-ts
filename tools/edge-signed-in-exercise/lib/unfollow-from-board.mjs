// Unfollow from the board, graded on BOTH link states and the stored rule, so
// a link that says "following" while its href still writes *always cannot
// pass.
//
// THE ROW. cap-W2 ("Unfollow from the board",
// tools/edge-signed-in-exercise/capabilities.json id W2) is not_covered, and
// its finding says why a binding would not have closed it:
//
//   "Left not_covered: no id-prefixed check ran for this row in recorded run
//    strengthened-full-harness-52fc9b7e ... (the run's only unfollow result is
//    W6's mail-link check, a different surface). The board unfollow leg is
//    evidenced outside the harness, so this row needs a probe, not a binding."
//
// That is right about the missing instrumentation and this commit supplies it.
// It is also right that W6 is a DIFFERENT surface: W6 is the unfollow link
// inside the follower MAIL (card-mod-follow set/all/notify/base_views.rb:48-55,
// `view :unfollow_url`, built by follow-mail-views.ts:252-258). W2 is the
// unfollow control on the board's Engage tab. Two surfaces, two byte
// contracts, and conflating them is how W2 stayed uncovered while W6 went
// green.
//
// WHAT RUBY'S TWO LINK STATES ARE. card-mod-follow-0.20.0, both vendored and
// sha256-pinned. The base class carries the shared shape:
//
//   set/all/follow/follow_link.rb:44-47
//     def link_opts success_view=:follow_status
//       { title: title, path: path(success_view), class: css_class }
//
//   :49-52
//     def render_link_text icon=false
//       verb = %(<span class="follow-verb">#{link_text}</span>)
//       ...
//
//   :57-59
//     def title
//       "#{action} emails about changes to #{@card.follow_label}"
//     end
//
//   :61-69
//     def path view=:follow_status
//       @format.path mark: mark, action: :update,
//                    success: { mark: @card.name, view: view },
//                    card: { content: "[[#{rule_content}]]" }
//
// and the two subclasses differ in FOUR independent values:
//
//                rule_content   link_text    action           css_class          hover_text
//   StartFollow  *always        follow       send             ""                (none)
//   StopFollow   *never         following    stop sending     btn-item-delete   unfollow
//
//   set/all/follow/start_follow_link.rb:4-11
//   set/all/follow/stop_follow_link.rb:4-11
//
// and the class is chosen by STATE (set/all/follow/follow_link_views.rb:3-5):
//
//   def follow_link_class
//     card.followed? ? StopFollowLink : StartFollowLink
//   end
//
// So the two states differ on FOUR bytes that can each drift independently:
//   - the VERB span's text          (`follow` / `following`)
//   - the CSS class                 (no marker / `btn-item-delete`)
//   - the TITLE attribute           (`send ...` / `stop sending ...`)
//   - the HREF's rule content       (`[[*always]]` / `[[*never]]`)
//
// WHY FOUR, AND NOT ONE. W1's existing grade (checks-cover-b.mjs:1115-1116) is
// `linksAfter.some(t => /^following$/i.test(t))` - it reads the LINK TEXT and
// stops. A page whose anchor says "following" while its href still carries
// card[content]=[[*always]] passes that and is broken: clicking it would
// re-follow the card. The verb is the only one of the four that W1 reads, and
// it is the one that cannot detect the failure. This module grades all four,
// per state, from the anchor's own bytes.
//
// THE STORAGE ROUND TRIP, WHICH IS THE PART NOTHING GRADED. The path's
// `card: { content: "[[#{rule_content}]]" }` is a WRITE. Whether it took is a
// separate question from how the link renders, and the stored answer is what
// the next page load and the next mail both depend on. The stored option is
// read through the rule card, not inferred from the page: a card's follow
// preference is `card.preference :follow` (set/all/notify/base_views.rb:58-63
// and set/right/following.rb:current_follow_rule_card), whose value is the
// newline-separated option list that `follow_rule_option` splits
// (set/all/follow/followed_by.rb all_follow_rule_options). So:
//
//   *always -> the viewer receives notices about this card
//   *never  -> the viewer receives none
//
// and a UI that says "following" over a stored *never is a card that will
// never mail, described as one that will. That inversion is the defect class
// this row is actually about, and it is invisible to every byte-level leg.
//
// ANTI-VACUITY. Three facts keep this from passing on an inert page:
//   1. BOTH states must be observed on the SAME card by the SAME viewer. A
//      single reading proves nothing about a two-state control.
//   2. The stored rule must be read back AFTER each transition, from the deck.
//      A driver that reports the stored value it expected has measured nothing,
//      so the stored value is handed in and compared, never asserted here.
//   3. The follower COUNT must return to its baseline. A stop link that
//      removed the rule but left the cached follower set (follower_ids is
//      CACHED: set/all/follow/follower_ids.rb FOLLOWER_IDS_CACHE_KEY and
//      write/read_follower_ids_cache) would render *never in storage and still
//      count the former follower. The count is the only thing that sees the
//      cache, and follow_section.rb:31-36 renders it as the link's own label.
//
// The port already emits both states byte for byte
// (src/card/mod-loader/mods/card-mod-edit.ts:3640-3671 followButton: the two
// titles, the two css classes, the two verbs, the `data-hover-text` arm on the
// stop state only, and the href's `card%5Bcontent%5D=%5B%5B%2Anever%5D%5D`), so
// by parity law the rendering is not what this commit repairs. What was never
// driven is the transition, and this module is the driver.

/** The four bytes Ruby derives for one link state, as the anchor carries them.
 *  `href` is read whole; the rule content is decoded out of its Rails query
 *  encoding rather than pattern-matched on the raw `%5B%5B%2A` form, so a
 *  change in the encoding does not read as a change in the rule. */
export function followLinkShape(html) {
  const source = String(html ?? "");
  const anchor = /<a\b[^>]*\bclass="[^"]*\bfollow-link\b[^"]*"[^>]*>/i.exec(source);
  if (anchor === null) return null;
  const tag = anchor[0];
  const attrs = {};
  for (const match of tag.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) attrs[match[1].toLowerCase()] = match[2];
  const verb = /<span class="follow-verb">([^<]*)<\/span>/i.exec(source.slice(anchor.index))?.[1] ?? null;
  const href = attrs.href ?? null;
  let ruleContent = null;
  if (href !== null) {
    const decoded = href.replace(/&amp;/g, "&").replace(/%2A/gi, "*").replace(/%5B/gi, "[").replace(/%5D/gi, "]");
    const content = /card\[content\]=(\[\[[^\]]*\]\])/.exec(decoded);
    if (content !== null) ruleContent = content[1];
  }
  return {
    verb,
    classes: String(attrs.class ?? "").split(/\s+/).filter(Boolean),
    title: attrs.title ?? null,
    href,
    ruleName: href === null ? null : decodeURIComponent(href.split("?")[0].replace(/^\/update\//, "")),
    ruleContent,
    hover: attrs["data-hover-text"] ?? null,
  };
}

/** What Ruby says one state must carry. Derived from the two vendored
 *  subclasses and the base class, not retyped: the caller passes the follow
 *  label because the TITLE embeds it (follow_link.rb:57-59). */
export function expectedFollowState(state, followLabel) {
  const stop = state === "stop";
  return {
    verb: stop ? "following" : "follow",
    option: stop ? "never" : "always",
    ruleContent: stop ? "[[*never]]" : "[[*always]]",
    title: `${stop ? "stop sending" : "send"} emails about changes to ${followLabel}`,
    // start_follow_link.rb sets @css_class = "" and stop_follow_link.rb sets
    // it to "btn-item-delete", so the class is ABSENT in one state and PRESENT
    // in the other. Both carry follow_link, and both are rendered through
    // FollowLink#button's own class list.
    classes: ["follow-link", "slotter", "btn", "btn-sm", "btn-primary"],
    deleteClass: stop ? "btn-item-delete" : null,
    hover: stop ? "unfollow" : null,
  };
}

/** One link state, graded against what Ruby says it must carry. */
export function followStateHolds(shape, state, followLabel) {
  const failures = [];
  if (shape === null) return { ok: false, failures: ["noFollowLink"] };
  const want = expectedFollowState(state, followLabel);
  if (shape.verb !== want.verb) failures.push("verb");
  if (shape.ruleContent !== want.ruleContent) failures.push("ruleContent");
  if (shape.title !== want.title) failures.push("title");
  if (!want.classes.every((cls) => shape.classes.includes(cls))) failures.push("baseClasses");
  // The delete class is ABSENT in the start state and PRESENT in the stop one.
  // Grading presence in one and absence in the other is what makes it a
  // two-state control rather than a link with decoration on it.
  const hasDelete = shape.classes.includes("btn-item-delete");
  if (hasDelete !== (want.deleteClass !== null)) failures.push("deleteClass");
  if ((shape.hover ?? null) !== want.hover) failures.push("hoverText");
  if (shape.ruleName === null || shape.ruleName === "") failures.push("noRuleName");
  return { ok: failures.length === 0, failures, shape, want };
}

/**
 * The whole round trip, graded.
 *
 * `before`   {shape, storedOption, followerCount}  - before following
 * `after`    {shape, storedOption, followerCount}  - after following
 * `stopped`  {shape, storedOption, followerCount}  - after unfollowing
 * `followLabel` the card's follow_label (follow.rb:4-6, which is `name`)
 */
export function unfollowRoundTrip({ before, after, stopped, followLabel }) {
  const failures = [];
  const start = followStateHolds(before?.shape ?? null, "start", followLabel);
  const followed = followStateHolds(after?.shape ?? null, "stop", followLabel);
  const reverted = followStateHolds(stopped?.shape ?? null, "start", followLabel);
  for (const failure of start.failures) failures.push(`before:${failure}`);
  for (const failure of followed.failures) failures.push(`after:${failure}`);
  for (const failure of reverted.failures) failures.push(`stopped:${failure}`);

  // The STORAGE, read from the deck. A link can render correctly and write
  // nothing, or write the wrong option; neither shows up in the bytes.
  if (before?.storedOption !== undefined && before.storedOption !== null && before.storedOption !== "*never") {
    failures.push("beforeNotUnfollowed");
  }
  if (after?.storedOption !== "*always") failures.push("afterNotFollowed");
  if (stopped?.storedOption !== "*never") failures.push("afterNotUnfollowed");

  // The SAME rule both times: an unfollow that quietly created a second rule
  // under a different mark would satisfy every check above.
  const afterRule = after?.shape?.ruleName ?? null;
  const stoppedRule = stopped?.shape?.ruleName ?? null;
  if (afterRule !== null && stoppedRule !== null && afterRule !== stoppedRule) failures.push("ruleChanged");

  // The follower count is the only leg that sees the follower CACHE
  // (follower_ids.rb FOLLOWER_IDS_CACHE_KEY). After unfollowing, the viewer is
  // no longer a follower, so the count returns to its baseline; a stale cache
  // renders *never in storage while still counting the former follower.
  const baseline = before?.followerCount ?? null;
  if (Number.isFinite(baseline) && Number.isFinite(after?.followerCount) && after.followerCount !== baseline + 1) {
    failures.push("followCountDidNotRise");
  }
  if (Number.isFinite(baseline) && Number.isFinite(stopped?.followerCount) && stopped.followerCount !== baseline) {
    failures.push("followCountDidNotFall");
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    states: { start, followed, reverted },
  };
}

/** The check names each leg records. The link states and the storage are
 *  graded apart because they fail apart - that inversion is the defect. */
export const UNFOLLOW_CHECKS = Object.freeze({
  startLink: "the Engage tab offers the start-follow link with Ruby's follow bytes: verb, title, class and an *always href",
  stopLink: "after following, the same control offers Ruby's stop link: verb 'following', the btn-item-delete class, the stop-sending title and an *never href",
  storage: "clicking the stop link leaves the stored follow preference at *never, on the same rule it followed",
  reverted: "after unfollowing, the control is byte-identical to the start state and the follower count is back to its baseline",
});