// Per-set bar column split setting (card-mod-bar_and_box-0.20.0
// set/all/bar.rb:2-6): the bootstrap col sizes on `.bar-left` /
// `.bar-right` (mini-bar, two-column form). The render calls into this
// helper from the :bar / :mini_bar / :closed / :open paths so the
// captured bytes' col-X numbers come from data, not a literal.
//
// Ruby truth (the setting the render reads):
//   format :html do
//     setting :bar_cols
//     setting :mini_bar_cols
//     bar_cols 9, 3
//     mini_bar_cols 9, 3
//     ...
//   end
// In Ruby, `setting :name` defines a class method that, when called with
// args (`name a, b`), captures them as the instance-method default. The
// active format is composed of every set module that applies to the card,
// so `*rule`'s format block (card-mod-rules set/rule/bar_view.rb:2:
// `mini_bar_cols 6, 6`) overrides the default for rule cards. This port
// does NOT replicate Ruby's dynamic format composition; the override
// below is the same set-pattern signal (`*rule` -> 6,6) with the same
// fallback to the default (9, 3).
//
// Rule-card content (real `card+*mini_bar_cols` cards) is the next
// precedence up: if a rule card exists and parses as "N, N", its content
// wins. The corpus currently has no such rule cards (no *mini_bar_cols
// setting card, no rule-card content; see structure-corpus-replay.test.ts
// FOREIGN_PENDING entry for corpus:253 — the marker the byte diff
// reports). When a future stream lands rule-card seeding for arbitrary
// settings, the engine's prefetch can prime the cache below.
//
// The setting name on the rule card is `mini_bar_cols` (the format's
// setting declaration), not `*mini_bar_cols`; the rule-name machinery
// (src/card/set-patterns/rule-names.ts) adds the star when building the
// `<set>+<setting>` lookup names.

import type { RenderCard } from "./format.js";

/** The format-block defaults (card-mod-bar_and_box set/all/bar.rb:5-6):
 *  the bar_cols / mini_bar_cols declarations on the *all set module. */
export const DEFAULT_BAR_COLS: readonly [number, number, number] = [9, 4, 3];
export const DEFAULT_MINI_BAR_COLS: readonly [number, number] = [9, 3];

/** The *rule set module's defaults (card-mod-rules set/rule/bar_view.rb:2-3):
 *  override for cards matching the *rule pattern. */
export const RULE_BAR_COLS: readonly [number, number, number] = [5, 4, 3];
export const RULE_MINI_BAR_COLS: readonly [number, number] = [6, 6];

/** Parse a rule card's db_content ("N, N" or "N N") as column numbers.
 *  Returns undefined if the content isn't a comma/space-separated pair
 *  of positive integers — the caller's fallback chain decides what
 *  happens then. */
export function parseBarCols(content: string | undefined): [number, number] | undefined {
  if (content === undefined || content === null) return undefined;
  const trimmed = content.trim();
  if (trimmed === "") return undefined;
  const parts = trimmed.split(/[,\s]+/).filter((s) => s !== "");
  if (parts.length < 2) return undefined;
  const left = Number(parts[0]);
  const right = Number(parts[1]);
  if (!Number.isInteger(left) || !Number.isInteger(right)) return undefined;
  if (left <= 0 || right <= 0) return undefined;
  return [left, right];
}

/** Whether the card's setKeys includes the *rule pattern (06_rule.rb#applies?).
 *  The port enriches setKeys at render time with this bare key when the
 *  card is a rule card (set-keys-parity-notes.md). */
function cardIsRule(setKeys: string): boolean {
  // The setKeys string is the patterns' safe_keys joined by spaces, with the
  // *rule pattern contributing the bare "RULE" token (set-keys.ts module
  // doc: rule/rstar/star are anchorless).
  for (const tok of setKeys.split(" ")) {
    if (tok === "RULE") return true;
  }
  return false;
}

/**
 * Read the bar column split for a card. Returns `[left, middle, right]`
 * for a 3-col layout (the rule bar renders three columns: left, middle,
 * right) or `[left, right]` for a 2-col layout.
 *
 * The `threeCols` flag distinguishes the rule's :bar view (which uses
 * bar_cols 5, 4, 3 — three cols, bar_middle visible) from the item-bar
 * :mini_bar (which uses mini_bar_cols 6, 6 — two cols, bar_middle
 * hidden). Ruby's prepare_bar:
 *   `voo.hide :bar_middle unless three_cols`
 * gates the hide on the third column being present.
 *
 * Precedence (mirrors Ruby's set-module composition order):
 *   1. rule-card content for the bar_cols setting, if one exists and
 *      parses (caller-supplied via the optional `ruleContent` param —
 *      the engine pre-fetches during the prepare phase so the sync
 *      render path doesn't issue queries).
 *   2. the *rule set module's default (5, 4, 3) when the card matches
 *      the *rule pattern AND threeCols is true.
 *   3. the *all set module's default (9, 4, 3) for 3-col, (9, 3) for
 *      2-col.
 */
export function readBarCols(
  card: RenderCard,
  threeCols: boolean,
  ruleContent?: string,
): readonly [number, number, number] | readonly [number, number] {
  const parsed = parseBarCols(ruleContent);
  if (parsed !== undefined) {
    return threeCols ? [parsed[0], 4, parsed[1]] : parsed;
  }
  if (threeCols) {
    if (cardIsRule(card.setKeys)) return RULE_BAR_COLS;
    return DEFAULT_BAR_COLS;
  }
  if (cardIsRule(card.setKeys)) return RULE_MINI_BAR_COLS;
  return DEFAULT_MINI_BAR_COLS;
}

/**
 * Read the mini-bar column split for a card. The two-col form the :bar /
 * :mini_bar / :closed / :open paths render (the rule that hides
 * bar-middle in small viewports). Returns `[left, right]` col numbers.
 */
export function readMiniBarCols(
  card: RenderCard,
  ruleContent?: string,
): readonly [number, number] {
  const cols = readBarCols(card, false, ruleContent);
  if (Array.isArray(cols) && cols.length === 2) return cols;
  return DEFAULT_MINI_BAR_COLS;
}
