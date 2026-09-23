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
