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

import type { RenderCard } from "./format.js";
import { h } from "./slot-html.js";
import { isPointerOrListCard, rawItemStrings } from "./pointer-list.js";

/** card-mod-rules bar_view.rb:19-21 calls the bare `truncate` helper, which
 *  resolves to card-mod-format content.rb:43-53 — Rails truncate semantics
 *  (omission "..." only when longer) but with `one_line_character_limit` =
 *  voo.size || ONE_LINE_CHARACTER_LIMIT = 60 (content.rb:1), NOT Rails' 50
 *  default. No captured oracle pins these bytes (verified 2026-09-22), so
 *  the limit is gem-cited. */
const ONE_LINE_CHARACTER_LIMIT = 60;
function truncatedCore(content: string): string {
  if (content.length > ONE_LINE_CHARACTER_LIMIT) {
    return `${content.slice(0, ONE_LINE_CHARACTER_LIMIT)}...`;
  }
  return content;
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
 *  encode the same shape: every pointer/list-typed rule card's
 *  bar_right wraps in `<div class="pointer-list">…<div class=
 *  "pointer-item item-link">…</div></div>` regardless of the item
 *  count (single or multi).
 *
 *  CLUSTER 6 (rule-card-content-as-pointer-list, 3 entries in the
 *  recapture-raw shard 0 — `*all+*layout:render:closed/ :render:open
 *  and `*layout+*right+*content options:render:open) records that the
 *  recaptured-raw oracle emits the bar_right as a bare literal text
 *  run for single-item cases (vs the wrapped pointer-list above).
 *  That byte shape contradicts the fixture corpus:6560 pin that the
 *  regression tests are locked against; the regression suite is
 *  authoritative here, so cluster 6 is left to the engine round that
 *  reconciles the recapture oracle with the fixture corpus bytes. The
 *  three cluster-6 entries are reported as deferred-to-engine-round
 *  in the round report. */
function pointerListOneLineContent(card: RenderCard): string {
  const items = rawItemStrings(card.dbContent).filter((s) => s.length > 0);
  const inner = items.map(pointerListOneLineItem).join("\n");
  return `<div class="pointer-list">${inner}</div>`;
}

/** One compact-mode pointer/list item: a wanted-card link with the
 *  card-title span. Ruby's link view classifies unknown nest targets
 *  with `wanted-card` (links.rb#add_known_or_wanted_class); the
 *  rule-bar-right compact rendering emits the same class for every
 *  item (the captured corpus:6560 item is unseeded, hence wanted). */
function pointerListOneLineItem(name: string): string {
  return (
    `<div class="pointer-item item-link">` +
    `<a class="wanted-card" href="/${h(name)}">` +
    `<span class="card-title" title="${h(name)}">${name}</span>` +
    `</a>` +
    `</div>`
  );
}

/** The one-line inner content for a persisted rule card, per the dispatch
 *  above. `rightSetting` is the card name's right part (the rule's setting
 *  name, e.g. "*default"); undefined for simple names (not rule cards). */
function ruleOneLineContent(card: RenderCard, rightSetting: string | undefined): string {
  if (rightSetting === "*default") {
    const raw = card.dbContent;
    return `${typeText(card)} : ${raw === "" ? "<em>empty</em>" : raw}`;
  }
  if (rightSetting === "*structure") {
    return `${typeText(card)} : ${card.dbContent}`;
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
  // Abstract::List overrides :one_line_content for pointer/list cards.
  // The *all base's compact-mode render_core (rule-bar-right.ts:9-19)
  // routes through this branch — see pointerListOneLineContent's doc.
  if (isPointerOrListCard(card)) {
    return pointerListOneLineContent(card);
  }
  return truncatedCore(card.dbContent);
}

/** :bar_right for a rule card ("..." when the card is not a rule card —
 *  the *all bar_right stays empty, bar.rb:28's bar_right default). */
export function ruleBarRightHtml(card: RenderCard): string {
  const setKeyTokens = card.setKeys.split(" ");
  if (!setKeyTokens.includes("RULE")) return "";
  const rightSetting = card.name.rightName?.s;
  return `<div class="text-muted one-line">${ruleOneLineContent(card, rightSetting)}</div>`;
}
