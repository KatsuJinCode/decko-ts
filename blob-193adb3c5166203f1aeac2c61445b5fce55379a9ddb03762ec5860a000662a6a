// The board History tab's change pills, read the way Ruby's own history-tab
// spec reads them: as pills whose TEXT names the actor and the age of the
// change.
//
//   spec/cypress/e2e/edit/board/history_tab.spec.coffee
//     beforeEach -> cy.visit_board('no history')
//                   cy.board_sidebar().find('.nav-tabs a').eq(2).click()
//     specify 'changes appear in the pills list' ->
//       cy.contains("Joe Admin less than a minute ago")
//
// That single assertion is the leg: the actor's NAME and the RELATIVE TIME, in
// one pill. Everything else below is what makes it non-vacuous.
//
// The bytes, from the Ruby views:
//   card-mod-edit-0.20.0 set/all/board/tab_views.rb:6-10
//     view :history_tab, wrap: :slot do
//       class_up "d0-card-body", "history-slot"; voo.hide :act_legend
//       acts_board_layout card.history_acts
//     end
//   card-mod-history-0.20.0 set/all/history_board.rb:28-34 acts_board_layout
//     = output[_render_creator_credit, act_link_list(acts, context),
//     act_paging(acts, context)]; :43-48 act_link_list = board_pills(items);
//     :50-54 act_link_list_item -> act_renderer(:board).board_link
//   card-mod-edit-0.20.0 set/all/board/board_pills.rb:1-11 BOARD_PILL_UL_CLASSES
//     "nav nav-pills _auto-single-select board-pills flex-column", one
//     li.nav-item per pill
//   card-mod-history-0.20.0 lib/card/act/act_renderer/board_act_renderer.rb
//     :25-33 board_link: board_link_opts(path: {act_id:, view: :board_act,
//              act_seq:}) + "data-bs-toggle": "pill" + class "d-flex nav-link"
//     :6-9   title  = wrap_with(:div, left_title, class: "me-2") +
//                     wrap_with(:div, right_title, class: "ms-auto act-summary")
//     :11-13 left_title  = ["##{@args[:act_seq]}", @act.actor.name,
//                           wrap_with(:small, edited_ago)].join " "
//     :15-17 right_title = summary
//     lib/card/act/act_renderer.rb:105-109 edited_ago =
//       "#{time_ago_in_words(@act.acted_at)} ago" ("" with no acted_at)
//
// Registry row cap-E21 (tools/edge-signed-in-exercise/capabilities.json, id
// E21) records "History tab present; changes pills not asserted." The harness
// read the tab LINKS and, on the cover-b leg, the act_id in each href - so a
// pill whose text never named the actor, or whose relative time was missing,
// scored a pass. This module grades the pill's own text.

/** The tag-stripped, whitespace-folded text of an element's inner HTML. */
function innerText(inner) {
  return String(inner)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attrMap(attrs) {
  const map = {};
  for (const match of String(attrs).matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
    map[match[1].toLowerCase()] = match[2];
  }
  return map;
}

const classList = (attrs) => String(attrs.class ?? "").split(/\s+/).filter(Boolean);

/** The inner HTML of the first element opening `name` whose attributes match
 *  `test` — a scoped slice, so a pill list on another tab cannot be read as
 *  this one. Tags of the same name nest, so the close tag is counted. */
function innerOf(html, name, test) {
  const source = String(html);
  const open = new RegExp(`<${name}\\b`, "gi");
  for (let hit = open.exec(source); hit !== null; hit = open.exec(source)) {
    const start = hit.index;
    const headEnd = (() => {
      const head = /^<[a-zA-Z][a-zA-Z0-9]*(?:"[^"]*"|[^>"])*?>/.exec(source.slice(start));
      return start + (head === null ? name.length + 2 : head[0].length);
    })();
    const attrs = attrMap(source.slice(start + name.length + 2, headEnd - 1));
    if (!test(attrs, source.slice(start, headEnd))) continue;
    // count to this tag's own close
    const scanner = new RegExp(`<(/?)${name}\\b(?:"[^"]*"|[^>"])*?>`, "gi");
    scanner.lastIndex = headEnd;
    let depth = 0;
    for (let s = scanner.exec(source); s !== null; s = scanner.exec(source)) {
      if (s[1] === "/") {
        if (depth === 0) return source.slice(headEnd, s.index);
        depth -= 1;
      } else if (!/\/>$/.test(s[0])) {
        depth += 1;
      }
    }
    return source.slice(headEnd);
  }
  return null;
}

/** Every pill anchor of a board pill list, in document order. */
export function boardPillAnchors(html) {
  const list = innerOf(html, "ul", (attrs) => classList(attrs).includes("board-pills"));
  if (list === null) return [];
  const found = [];
  for (const match of list.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = attrMap(match[1]);
    if (attrs["data-bs-toggle"] !== "pill") continue;
    found.push({ attrs, inner: match[2] });
  }
  return found;
}

/** Ruby's board_act path (board_act_renderer.rb:27 + card-mod-format
 *  lib/card/path.rb): `<mark>/board_act?act_id=<id>&act_seq=<n>` with the
 *  board_link_opts slot query after it. */
function pillHrefParts(attrs) {
  const href = attrs.href ?? "";
  const m = /^(.*)\/board_act\?act_id=(\d+)&amp;act_seq=(\d+)(&|$)/.exec(href);
  if (m === null) return null;
  return { mark: m[1], actId: Number(m[2]), actSeq: Number(m[3]), rest: m[4] };
}

/** left_title (board_act_renderer.rb:11-13): "#<seq> <actor name>" plus the
 *  small() age. The actor name is a card name, so it is whatever sits between
 *  the seq and the small; it must not be empty and must not be a bare id
 *  (the renderer interpolates @act.actor.name, never the id). */
function leftTitleParts(inner) {
  const div = innerOf(inner, "div", (attrs) => classList(attrs).includes("me-2"));
  if (div === null) return null;
  const m = /^#(\d+)\s+([\s\S]*?)\s*(?:<small>([\s\S]*?)<\/small>)?\s*$/.exec(
    div.replace(/^\s*<div class="me-2">/, "").replace(/<\/div>\s*$/, "").trim(),
  );
  if (m === null) return null;
  return { seq: Number(m[1]), actor: (m[2] ?? "").trim(), ago: (m[3] ?? "").trim() };
}

/** actionview's distance_in_words :one/:other vocabulary as
 *  time_ago_in_words can return it (date_helper.rb:33-46, 95-165; the en
 *  locale values vendored under fixtures/vendor/actionview-7.2.3.2-locale-
 *  en.yml), with edited_ago's own trailing " ago" (act_renderer.rb:105-109).
 *  Only the shapes a rendered act can carry are listed; the point is that the
 *  age is one of Ruby's phrases, not free text. */
const AGO_PHRASE =
  /^(less than \d+ seconds?|less than a minute|\d+ seconds?|1 minute|\d+ minutes|about 1 hour|\d+ hours|1 day|\d+ days|about 1 month|\d+ months|about 1 year|\d+ years|over \d+ years|\d+ decades?) ago$/;

/** One pill, as {actId, actSeq, seq, actor, ago, summary, href}. */
function readPill(anchor) {
  const href = pillHrefParts(anchor.attrs);
  if (href === null) return null;
  const left = leftTitleParts(anchor.inner);
  const summary = innerOf(anchor.inner, "div", (attrs) => classList(attrs).includes("act-summary"));
  return {
    href: anchor.attrs.href ?? null,
    actId: href.actId,
    actSeq: href.actSeq,
    mark: href.mark,
    seq: left?.seq ?? null,
    actor: left?.actor ?? null,
    ago: left?.ago ?? null,
    summary: summary === null ? null : innerText(summary),
    pillToggle: anchor.attrs["data-bs-toggle"] ?? null,
    navLink: classList(anchor.attrs).includes("nav-link"),
  };
}

/**
 * The History tab's own pills: {pills, failures}. Scoped to the
 * `.history_tab-view` slot (tab_views.rb:6-10), then to the ul.board-pills
 * inside it (board_pills.rb:1-11), so the Related tab's pills — same classes,
 * different slot — cannot answer for it.
 */
export function historyPills(html) {
  const slot = innerOf(html, "div", (attrs) => classList(attrs).includes("history_tab-view"));
  if (slot === null) return { pills: [], failures: ["historyTabSlot"] };
  const pills = boardPillAnchors(slot).map(readPill).filter((p) => p !== null);
  const failures = [];
  if (pills.length === 0) failures.push("noPills");
  pills.forEach((pill, index) => {
    // current_act_seq (act_listing.rb) counts DOWN from acts.size, so the first
    // pill in document order is the newest and carries the highest seq.
    if (pill.actSeq !== pills.length - index) failures.push(`seq${index}`);
    if (pill.seq === null || pill.seq !== pill.actSeq) failures.push(`titleSeq${index}`);
    if (pill.actor === null || pill.actor === "" || /^\d+$/.test(pill.actor)) {
      failures.push(`actor${index}`);
    }
    if (pill.ago === null || pill.ago === "") {
      failures.push(`agoMissing${index}`);
    } else if (!AGO_PHRASE.test(pill.ago)) {
      failures.push(`agoPhrase${index}`);
    }
    if (pill.summary === null) failures.push(`summary${index}`);
  });
  return { pills, failures };
}

/**
 * The check's own predicate: the tab lists pills, each one carrying the actor
 * and the age Ruby's renderer puts there, and the act the run is looking for
 * is among them. `expectedActId` is optional — the cover-b leg reads it from
 * the deck; without it the shape legs still grade.
 */
export function listsChangeAsPills(html, expectedActId = null) {
  const { pills, failures } = historyPills(html);
  const listed =
    expectedActId === null ? pills.length > 0 : pills.some((pill) => pill.actId === Number(expectedActId));
  return {
    ok: failures.length === 0 && listed,
    failures: expectedActId === null || listed ? failures : [...failures, "expectedAct"],
    pills,
  };
}
