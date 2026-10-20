// The five things Ruby's own engage-tab spec asserts, read off the tab the way
// Ruby reads them.
//
//   spec/cypress/e2e/edit/board/engage_tab.spec.coffee
//     specify 'follow button'    cy.contains("follow").get('.follow-link').click()
//                                cy.contains("following"); cy.contains("1 follower")
//     specify "advanced button"  cy.get("[data-cy=follow-advanced]").click()
//     specify "all followed cards" cy.el("follow-overview").click()
//     specify 'followers'        cy.el("followers").click()
//     specify 'discussion'       cy.get('#card_comment').type("yeah")
//                                cy.get(".comment-buttons > [type=submit]").click()
//                                cy.board_sidebar().get(".RIGHT-discussion")
//
// The bytes each leg reads, from the Ruby views themselves:
//   card-mod-edit-0.20.0 set/all/board/tab_views.rb:2-4
//     view :engage_tab, wrap: { div: { class: "m-3 mt-4 _engage-tab" } },
//            cache: :never do
//       [render_follow_section, discussion_section].compact
//   card-mod-edit-0.20.0 set/all/board/follow_section.rb:1-36
//     follow_button_group -> div.btn-group.btn-group-sm.follow-btn-group
//                            [follow_button, follow_advanced]
//     follow_button      -> card-mod-follow-0.20.0 set/all/follow/follow_link.rb:24-33
//                            (a.follow-link, span.follow-verb "follow"/"following")
//     follow_advanced    -> "data-cy": "follow-advanced"  (follow_section.rb:22-29)
//     followers_board_link -> "data-cy": "followers",
//                            "#{cnt} follower#{'s' unless cnt == 1}" (:31-36)
//     follow_overview_button -> "data-cy": "follow-overview", the literal
//                            "all followed cards" (:16-20)
//     discussion_section -> field_nest(:discussion, view: :titled, title: "Discussion",
//                            show: :comment_box, hide: [:menu]) (tab_views.rb:39-44)
//     the comment box    -> card-mod-comment-0.20.0 set/all/comment.rb:46-70:
//       div.comment-box > form > textarea#card_comment, and
//       div.comment-buttons > button[type=submit] ("Comment")
//
// Registry row cap-E20 (tools/edge-signed-in-exercise/capabilities.json, id
// E20) recorded the gap this closes: "Follow controls present only;
// advanced/followers/discussion not checked." What the harness graded was
// `/follow|watch|discussion/i.test(engageBody)` over the whole page after
// clicking the tab — a regex the board's own navbar text satisfies, with no
// selector, no destination and no per-leg record. This module reads the five
// legs by their own selectors and destinations, so a tab that renders only the
// follow button fails the other four by name.
//
// The bytes it grades are already pinned against Ruby: the port renders
// fixtures/captured/board-views.json's engage_tab arms byte for byte
// (tests/card/mod-loader/card-mod-edit-views.test.ts, BOARD_PINNED_VIEWS), and
// test/engage-tab.test.mjs runs this predicate over those recorded Ruby bytes.

/** The tag-stripped, whitespace-folded text of an element's inner HTML. */
function innerText(inner) {
  return inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** The attributes of one tag's open, as a lower-cased-key map. */
function attrMap(attrs) {
  const map = {};
  for (const match of String(attrs).matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
    map[match[1].toLowerCase()] = match[2];
  }
  return map;
}

/** The index of the close tag matching the open tag at `from`, or -1.
 *  Counted, not regexed: these views nest (a follow-btn-group inside an mb-3
 *  inside the tab wrapper), and the first `</div>` after an open is almost
 *  never its own. */
function closeTagIndex(source, name, from) {
  const scanner = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b(?:"[^"]*"|[^>"])*?(\/?)>/g;
  scanner.lastIndex = from;
  let depth = 0;
  for (let hit = scanner.exec(source); hit !== null; hit = scanner.exec(source)) {
    const closing = hit[1] === "/";
    const hitName = hit[2].toLowerCase();
    if (hitName !== name) continue;
    if (closing) {
      if (depth === 0) return hit.index;
      depth -= 1;
    } else if (hit[3] !== "/") {
      depth += 1;
    }
  }
  return -1;
}

/** Every opening tag matching a name test, as {name, attrs, inner}. `inner`
 *  runs to that tag's MATCHING close tag when it is not self-closed. */
function tags(html, nameTest) {
  const found = [];
  const source = String(html);
  for (const match of source.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g)) {
    const name = match[1].toLowerCase();
    const attrs = attrMap(match[2]);
    if (!nameTest(name, attrs)) continue;
    let inner = "";
    if (match[3] !== "/") {
      const end = closeTagIndex(source, name, match.index + match[0].length);
      if (end > 0) inner = source.slice(match.index + match[0].length, end);
    }
    found.push({ name, attrs, inner });
  }
  return found;
}

/** The class list of a tag, as a Set for `has` tests. */
const classSet = (attrs) => new Set(String(attrs.class ?? "").split(/\s+/).filter(Boolean));

/** The engage tab's own wrapper div. tab_views.rb:2 wraps the whole view in
 *  `div.m-3.mt-4._engage-tab`; nothing else on a board page carries that class,
 *  so scoping to it is what keeps the navbar (and the rest of the board) out of
 *  the legs. */
export function engageTabRegion(html) {
  const wrapper = tags(html, (name, attrs) => name === "div" && classSet(attrs).has("_engage-tab"))[0];
  return wrapper === undefined ? null : wrapper.inner;
}

/**
 * The five engage-tab legs, each named as Ruby's spec names it. A leg is null
 * when the tab does not render that control at all, which is the difference
 * between "checked" and "not checked".
 */
export function engageTabLegs(html) {
  const region = engageTabRegion(html);
  if (region === null) {
    return { region: null, followLink: null, advanced: null, followers: null, overview: null, discussion: null };
  }
  const anchors = tags(region, (name) => name === "a");
  const byCy = (cy) => {
    const found = anchors.find((a) => a.attrs["data-cy"] === cy);
    return found === undefined ? null : { href: found.attrs.href ?? null, text: innerText(found.inner) };
  };
  // follow_button (follow_link.rb:24-33): the class AND the verb span, both of
  // which the Ruby source emits; a bare .follow-link with no verb is a
  // different control.
  const followAnchor = anchors.find((a) => classSet(a.attrs).has("follow-link"));
  const verb = followAnchor === undefined ? null : tags(followAnchor.inner, (name, attrs) => name === "span" && classSet(attrs).has("follow-verb"))[0];
  // discussion_section (tab_views.rb:39-44 + comment.rb:46-70): the nest slot
  // carries the RIGHT-discussion mark and the "Discussion" title; the comment
  // box carries textarea#card_comment and div.comment-buttons > button[submit].
  const discussionSlot = tags(region, (name, attrs) =>
    name === "div" &&
    classSet(attrs).has("card-slot") &&
    String(attrs.class).split(/\s+/).includes("RIGHT-discussion"))[0];
  const commentBox = discussionSlot === undefined ? null : tags(discussionSlot.inner, (name) => name === "textarea").find((t) => t.attrs.id === "card_comment") ?? null;
  const commentButtons = discussionSlot === undefined ? null : tags(discussionSlot.inner, (name, attrs) => name === "div" && classSet(attrs).has("comment-buttons"))[0];
  return {
    region,
    followLink:
      followAnchor === undefined || verb === undefined
        ? null
        : {
            href: followAnchor.attrs.href ?? null,
            title: followAnchor.attrs.title ?? null,
            verb: innerText(verb.inner),
            hover: followAnchor.attrs["data-hover-text"] ?? null,
            advancedSibling: byCy("follow-advanced") !== null,
          },
    advanced: byCy("follow-advanced"),
    followers: byCy("followers"),
    overview: byCy("follow-overview"),
    discussion:
      discussionSlot === undefined
        ? null
        : {
            title: /\btitle="([^"]*)"/.exec(discussionSlot.inner)?.[1] ?? null,
            nestName: /"nest_name":"([^"]*)"/.exec(String(discussionSlot.attrs["data-slot"] ?? "").replace(/&quot;/g, '"'))?.[1] ?? null,
            commentField: commentBox === null ? null : (commentBox.attrs.name ?? null),
            commentSubmit:
              commentButtons === undefined
                ? null
                : (tags(commentButtons.inner, (name, attrs) => name === "button" && attrs.type === "submit")[0]?.attrs.name ?? null),
          },
  };
}

/** The followers link's own text against follow_section.rb:33's
 *  `"#{cnt} follower#{'s' unless cnt == 1}"` — a count and the word, with the
 *  plural exactly as Ruby pluralizes it. */
export function followersLabelOk(text) {
  const match = /^(\d+) followers?$/.exec(String(text ?? "").trim());
  return match !== null && (match[1] === "1") === !/s$/.test(String(text).trim());
}

/** The check's own predicate: all five legs, each graded by its own rule.
 *  Returns the failing leg names so a red names which control is missing. */
export function hasFullEngageTab(html) {
  const legs = engageTabLegs(html);
  const failures = [];
  if (legs.region === null) failures.push("engageTabRegion");
  if (legs.followLink === null || !/^(follow|following)$/.test(legs.followLink.verb)) failures.push("followLink");
  if (legs.advanced === null || legs.advanced.href === null) failures.push("advanced");
  if (legs.followers === null || legs.followers.href === null || !followersLabelOk(legs.followers.text)) failures.push("followers");
  if (legs.overview === null || legs.overview.text !== "all followed cards") failures.push("overview");
  if (
    legs.discussion === null ||
    legs.discussion.commentField !== "card[comment]" ||
    legs.discussion.commentSubmit === null
  ) {
    failures.push("discussion");
  }
  return { ok: failures.length === 0, failures, legs };
}
