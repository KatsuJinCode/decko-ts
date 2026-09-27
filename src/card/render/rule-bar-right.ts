// Rule-card bar-right content (card-mod-rules-0.20.0 set/rule/bar_view.rb):
// for a card matching the *rule pattern, :bar_right nests the card's own
// :one_line_content view, wrapped in the rule format's
// `<div class="text-muted one-line">` (bar_view.rb:15-20). existing_rule_card
// is the card itself for persisted cards (set/rule/editor.rb:119-120:
// new_card? ? existing_rule_from_prototype : self; the replay renders
// persisted cards only).
//
// The nested :one_line_content dispatches by the card's OWN set patterns —
// first pattern module that defines it wins (Ruby's format composition):
//   - right::*default   card-mod-content set/right/default.rb:8-10:
//                       "#{card.type_name} : #{raw.present? ? raw :
//                       '<em>empty</em>'}"
//   - right::*structure card-mod-content set/right/structure.rb:14-16:
//                       "#{_render_type} : #{_render_raw}"
//   - otherwise         the *all base (card-mod-format set/all/base.rb:97-99):
//                       with_nest_mode(:compact) { truncate render_core }
//                       — truncate resolves to card-mod-format content.rb's
//                       helper: Rails semantics, ONE_LINE_CHARACTER_LIMIT=60.
//
// Raw/content caveat: Ruby's :raw view reads db_content, while the port's
// RenderCard.dbContent carries structured content once a *structure rule
// mutates it (render.ts applyStructureContent). No corpus rule card is
// structure-governed (checked 2026-09-22), so dbContent == raw for every
// pinned case; a future stream seeding governed rule cards owes the split.

import type { RenderCard, RenderEngineLike } from "./format.js";
import { DeckoName } from "../name.js";
import { h } from "./slot-html.js";
import { isPermissionRightSetting, isPointerOrListCard, rawItemStrings } from "./pointer-list.js";

/** card-mod-rules bar_view.rb:19-21 calls the bare `truncate` helper, which
 *  resolves to card-mod-format content.rb:43-53 — Rails truncate semantics
 *  (the TOTAL length including the omission is `length`; omission "..." only
 *  when longer) with `one_line_character_limit` = voo.size ||
 *  ONE_LINE_CHARACTER_LIMIT = 60 (content.rb:1), NOT Rails' 50 default. */
const ONE_LINE_CHARACTER_LIMIT = 60;
function truncatedCore(content: string): string {
  if (content.length > ONE_LINE_CHARACTER_LIMIT) {
    return `${content.slice(0, ONE_LINE_CHARACTER_LIMIT - 3)}...`;
  }
  return content;
}

/** Rails strip_tags for the one-line path: remove markup tags, keep the
 *  text. The rule-module's :one_line_content view body calls the METHOD
 *  one_line_content, whose base definition (card-mod-format-0.20.0
 *  set/all/content.rb:47-49) is
 *  `truncate strip_tags(render_core), length: one_line_character_limit`
 *  — the stored RichText markup (`<p><em>…</em></p>`) never reaches the
 *  one-line bytes. Pinned by the oracle: AAM+*self+*help bar-right
 *  renders `Please remember to click "Submit" after uploading.` (plain,
 *  untruncated) where the raw-markup form produced
 *  `<p><em>Please remember to click "Submit" after uploading.</e...`
 *  (recapture-raw-shard-000003, AAM+*self:content offset 34173). */
function stripHtmlTags(content: string): string {
  return content.replace(/<[^>]*>/g, "");
}

/** The :type view's text — the type card's name (render_type). */
function typeText(card: RenderCard): string {
  return h(card.typeName ?? "");
}

/** The one-line inner content for a list/pointer-typed rule card.
 *  Abstract::List overrides :one_line_content (card-mod-list-0.20.0
 *  set/abstract/01_list/html_views.rb) — the compact-mode render_core
 *  emits a `<div class="pointer-list">` wrapper (NOT the full
 *  `card-list card-list-bar pointer-list` content-view wrapper) with
 *  each item rendered as `<div class="pointer-item item-link"><a
 *  class="wanted-card" href="/NAME">…title…</a></div>`. Pinned by
 *  corpus:6560 (*star+*delete, type list, dbContent "uflluwkwvaenx") —
 *  the rule's bar-right captured bytes show this exact wrapper shape,
 *  and the regression pins in tests/card/render/nest-item-and-one-line-limit
 *  encode the same shape: pointer/list-typed rule cards whose right
 *  setting is one of the four permission rights (*create/*read/*update/
 *  *delete) wrap in `<div class="pointer-list">…<div class=
 *  "pointer-item item-link">…</div></div>` regardless of the item
 *  count (single or multi).
 *
 *  CLUSTER 6 RECONCILIATION (2026-09-25, round 4 pin-reconciler): the
 *  two oracles agree on *star+*delete (fixture corpus:6560 wrapped;
 *  raw recapture-raw-shard-000003:15 ALSO wrapped, content drift
 *  "uflluwkwvaenx"→"Administrator" is anonymization only) — and the
 *  raw oracle emits the bar_right as bare literal text for rule cards
 *  whose right is NOT a permission right (*all+*layout "Default
 *  Layout"; *layout+*right+*content options '{"type": "Layout"}' —
 *  recapture-raw-shard-000000:4,14). The dispatch therefore gates the
 *  wrapper on isRuleCardWithPermissionRight (pointer-list.ts:129):
 *  permission-right rule cards wrap, all other pointer/list rule
 *  cards render truncatedCore literal text. Closes the 3 cluster-6
 *  entries; moves zero pins. The earlier single-item-collapse fix was
 *  WRONG — it would also un-wrap *star+*delete, which the raw oracle
 *  pins as wrapped. */
function pointerListOneLineContent(
  card: RenderCard,
  engine?: RenderEngineLike,
): string {
  const items = rawItemStrings(card.dbContent).filter((s) => s.length > 0);
  const inner = items.map((name) => pointerListOneLineItem(name, engine)).join("\n");
  return `<div class="pointer-list">${inner}</div>`;
}

/** One compact-mode pointer/list item: a card link with the card-title
 *  span. Ruby's chain (card-mod-list set/abstract/01_list/html_views.rb
 *  :one_line_content -> pointer_items(view: :link) -> listing -> nest_item
 *  view :link; card-mod-format set/all/base.rb:35-44 link_view):
 *
 *     opts[:known] = card.known?
 *     link_to_card card.name, _render_title, opts
 *
 *  `add_known_or_wanted_class` (links.rb:140-143) emits `known-card` when
 *  `Card.known?(name)` (states.rb:65 fetch(mark).present?) and
 *  `wanted-card` otherwise; the href comes from `path(mark: name)` — the
 *  link NAME's url_key form (spaces -> underscores, case retained;
 *  cardname variants.rb #url_key). The anchor text is the item card's
 *  :title view (wrapped_title: `card-title` span, joint "+"s wrapped in
 *  bare spans).
 *
 *  The engine resolves the item through the fetch ladder (fetchRenderCard,
 *  the port of Card.fetch — the same seam the pointer/list core view
 *  reads items through, whose closure walk the render prepare phase runs
 *  to fixpoint over pointer/list hosts). Without an engine (bare-function
 *  tests), the item cannot be verified -> the unclassified wanted-card
 *  shape, byte-identical to the pre-lane behavior. */
function pointerListOneLineItem(name: string, engine?: RenderEngineLike): string {
  const resolved = engine?.fetchRenderCard?.(name);
  const known = resolved !== undefined;
  const display = known ? resolved.name : DeckoName.parse(name);
  const titleAttr = h(display.s);
  const inner = titleAttr.split("+").join("<span>+</span>");
  const cls = known ? "known-card" : "wanted-card";
  return (
    `<div class="pointer-item item-link">` +
    `<a class="${cls}" href="/${h(display.urlKey)}">` +
    `<span class="card-title" title="${titleAttr}">${inner}</span>` +
    `</a>` +
    `</div>`
  );
}

/** The one-line inner content for a persisted rule card, per the dispatch
 *  above. `rightSetting` is the card name's right part (the rule's setting
 *  name, e.g. "*default"); undefined for simple names (not rule cards). */
function ruleOneLineContent(
  card: RenderCard,
  rightSetting: string | undefined,
  engine?: RenderEngineLike,
  renderCoreText?: (card: RenderCard) => string,
): string {
  if (rightSetting === "*default") {
    const raw = card.dbContent;
    return `${typeText(card)} : ${raw === "" ? "<em>empty</em>" : raw}`;
  }
  if (rightSetting === "*structure") {
    return `${typeText(card)} : ${card.dbContent}`;
  }
  if (rightSetting === "*head") {
    // card-mod-layout-0.20.0 set/right/head.rb:11-13 — the right/*head set
    // overrides :one_line_content with `raw_one_line_content` (card-mod-
    // format set/all/content.rb:43-45: truncate strip_tags(render_raw)) —
    // the RAW stored bytes, nests UNPROCESSED (render_raw, not render_core).
    // The right-set declaration beats the rule module's (the rule pattern
    // is the generic right-side set; right/head is that set for *head).
    // Pinned by the oracle: AAM+*self+*head (HTML-typed, content
    // "{{:head|core}}") bar-right renders the literal nest string.
    return truncatedCore(stripHtmlTags(card.dbContent));
  }
  // Toggle-type cards: the compact-mode one_line_content routes through
  // the card's content view (card-mod-toggle set/type/toggle.rb), which
  // renders the truthy/falsy display string ("yes" / "no") rather than
  // the raw dbContent. Captured oracle for recapture-raw:*all+*captcha
  // shows `yes` for dbContent "1" (cluster 4 — boolean-yes-vs-integer-1
  // — closes via this branch; the bar_right path was the last divergence
  // after the barBottomView body fix).
  if (card.typeCode === "toggle") {
    const normalized = (card.dbContent ?? "").trim().toLowerCase();
    if (normalized === "0" || normalized === "false" || normalized === "" || normalized === "no") {
      return "no";
    }
    return "yes";
  }
  // Abstract::List overrides :one_line_content for pointer/list cards —
  // but only rule cards whose right setting is a permission right wrap
  // (see the CLUSTER 6 RECONCILIATION doc above); non-permission rule
  // cards take the Abstract::List METHOD path (below).
  if (isPointerOrListCard(card)) {
    // card-mod-permissions-0.20.0 set/abstract/permission.rb:98-105
    // `core_inherit_content`: when a permission rule (right is one of
    // *create / *read / *update / *delete) carries the magic content
    // "_left", Ruby renders the bar_right as
    // `<span class="inherit-perm">Inherit from left card</span>` — the
    // pointer list of explicit names is replaced with the inheritance
    // marker (the upstream left card's permission verdict wins). Pinned
    // at recapture-raw:*read:render:open:_all_plus+Xread where the
    // bar_right body shows exactly this span. Emitted ahead of the
    // pointerListOneLineContent branch because that branch would
    // otherwise render an empty pointer-list wrapper (raw items = []
    // for dbContent "_left" — that string isn't a comma-separated
    // item list).
    if (
      card.dbContent === "_left" &&
      isPermissionRightSetting(rightSetting)
    ) {
      // core_inherit_content (permission.rb:100-105): the set-context
      // branches — in_context_of_self_set? (permission.rb:107-110, the
      // set_context's tag is *self) renders the LINKS form
      // ("Inherit ( party, party )", permission.rb:114-120) whose who_can
      // walk RESCUES to bare "Inherit" (permission.rb:121); any other set
      // context renders "Inherit from left card". The engine has no who_can
      // party walk, so the self-set context always lands on the rescue form
      // — the exact bytes the capture pinned (the Anonymous viewer's walk
      // raised at capture time the same way).
      const setContext = card.name.trunkName;
      const setContextTag = setContext?.tagName?.key;
      if (setContextTag === "*self" || setContextTag === "self") {
        return `<span class="inherit-perm">Inherit</span>`;
      }
      return `<span class="inherit-perm">Inherit from left card</span>`;
    }
    if (isPermissionRightSetting(rightSetting)) {
      return pointerListOneLineContent(card, engine);
    }
    // Non-permission pointer/list rule cards ride the Abstract::List
    // METHOD one_line_content (card-mod-list-0.20.0 set/abstract/
    // 01_list/html_views.rb:99-105): count == 1 -> card.first_name —
    // the single item string, byte-identical to the literal dbContent
    // the pre-lane pins carry (*all+*layout "Default Layout") — while
    // count != 1 -> short_content (card-mod-format-0.20.0 set/all/html/
    // views.rb:92-100) -> short_content_items: "#{count} #{'item'.
    // pluralize count}" — the compact "N items" one-line. Pinned by the
    // oracle: AAM+*self+*script (List, count 16) bar-right renders
    // `16 items` (recapture-raw-shard-000003, AAM+*self:content offset
    // 31086), and the gem probe tails-one-line-dispatch-probe.rb
    // reproduced both forms against the capture deck (*all+*create
    // count 1 -> the single-item anchor form is the PERMISSION module's
    // view, *all+*script count 16 -> "16 items").
    const items = rawItemStrings(card.dbContent).filter((s) => s.length > 0);
    if (items.length > 1) {
      return `${items.length} items`;
    }
    // count == 1 -> first_name: the raw single item string (a NAME —
    // no strip_tags on this branch).
    return truncatedCore(card.dbContent);
  }
  // Non-list rule cards (RichText help/guide contents, HTML, …): the
  // base method path truncate(strip_tags(render_core)) — render_core is
  // the card's OWN core view (mod-dispatched: Markdown cards kramdown to
  // HTML first, RichText processed content), so the injected core render
  // (views.ts barRightView) is the faithful input; without it (bare
  // tests) the raw dbContent stands in.
  const coreText = renderCoreText !== undefined ? renderCoreText(card) : card.dbContent;
  return truncatedCore(stripHtmlTags(coreText));
}

/** :bar_right for a rule card ("..." when the card is not a rule card —
 *  the *all bar_right stays empty, bar.rb:28's bar_right default).
 *  `engine` is the render-path engine when the caller has one (the view
 *  dispatch always does; bare-function tests may omit it). It resolves
 *  each one-line pointer item's knownness (Card.known?) — see
 *  pointerListOneLineItem. `renderCoreText` (injected by views.ts
 *  barRightView — importing the view dispatch here would close an import
 *  cycle) renders a card's UNWRAPPED core-view body (Ruby render_core,
 *  mod-dispatched: Markdown kramdown, RichText processed content) for
 *  the base one-line method path. */
export function ruleBarRightHtml(
  card: RenderCard,
  engine?: RenderEngineLike,
  renderCoreText?: (card: RenderCard) => string,
): string {
  const setKeyTokens = card.setKeys.split(" ");
  if (!setKeyTokens.includes("RULE")) return "";
  // R16: bar_right for rule cards is rule_short_content (bar_view.rb:39-44):
  // `nest existing_rule_card, view: :one_line_content, set_context: ...` —
  // the EXISTING rule's one-line content through the existing rule's OWN
  // read verdict (the nest's view gate), not the virtual's own content.
  // existing_rule_card (editor.rb:119-131): the card itself for stored
  // rows; for virtual rule cards the prototype's winning stored rule (the
  // engine memoizes the walk; explicitly false = none → one_line_content's
  // `return render_mini_unknown unless existing_rule_card` renders a blank
  // bar-right — the oracle's *all+*autoname bar pins `bar-right …>\n\n</div>`
  // with no one-line div at all). undefined (engine absent or the setting
  // never preloaded) keeps the pre-R16 own-content behavior.
  let oneLineCard = card;
  if (card.id === undefined && engine?.hasExistingRuleFor?.(card.key) === false) {
    return "";
  }
  const existing = card.id === undefined ? engine?.existingRuleFor?.(card.key) : undefined;
  if (existing !== undefined) oneLineCard = existing;
  const rightSetting = oneLineCard.name.rightName?.s;
  const inner = ruleOneLineContent(oneLineCard, rightSetting, engine, renderCoreText);
  // The nested existing rule's own view gate: a read-denied existing rule
  // (e.g. *all+*default, stored read rule "Anyone Signed In") renders the
  // quiet denial span instead of its one-line content
  // (view/permission.rb:19-23 altered_view on the nest).
  if (engine?.isDenied(oneLineCard) === true) {
    return `<span class="denied"><!-- Sorry, you don't have permission (read) --></span>`;
  }
  return `<div class="text-muted one-line">${inner}</div>`;
}
