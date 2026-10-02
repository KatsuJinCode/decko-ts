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

/** The format-block default (card-mod-bar_and_box set/all/bar.rb:5): the
 *  TWO-element `mini_bar_cols 9, 3` / `bar_cols 9, 3` declaration on the
 *  *all set module (bar.rb:5 has no third element — there is no *all
 *  md triple). */
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
 * The full bar-column split for the bar view: defaults (2-col, used at
 * mobile) and md-cols (3-col, used at md+). Ruby's prepare_bar:
 *   `class_up_cols %w[bar-left bar-right], two_cols` -> bar-left col-X,
 *     bar-right col-Y (no md context, applied at all sizes).
 *   If three_cols: `class_up_cols %w[bar-left bar-middle bar-right],
 *     three_cols, "md"` -> col-md-X/Y/Z (only at md+).
 * Returns [default_left, default_right, md_left, md_middle, md_right].
 * For 2-col (no three), middle defaults to 0 (hidden via d-none).
 *
 * Precedence:
 *   1. rule-card content for the bar_cols setting, if one exists and
 *      parses.
 *   2. the *rule set module's defaults — two-col (6, 6) + md three-col
 *      (5, 4, 3) — when the card matches the *rule pattern.
 *   3. the *all set module's two-col default (9, 3); no md window (0s).
 */
export type BarCols = readonly [
  number, // default left col
  number, // default right col
  number, // md left col
  number, // md middle col
  number, // md right col
];

export function readBarCols(card: RenderCard, ruleContent?: string): BarCols {
  const parsed = parseBarCols(ruleContent);
  if (parsed !== undefined) {
    return [parsed[0], parsed[1], parsed[0], 4, parsed[1]];
  }
  if (cardIsRule(card.setKeys)) {
    // rule's :bar: two_cols = mini_bar_cols (6, 6); three_cols = bar_cols (5, 4, 3)
    return [
      RULE_MINI_BAR_COLS[0],
      RULE_MINI_BAR_COLS[1],
      RULE_BAR_COLS[0],
      RULE_BAR_COLS[1],
      RULE_BAR_COLS[2],
    ];
  }
  // *all default: bar_cols 9, 3; no three-col for the standard :bar view
  // (closed/open render via build_accordion_bar which calls prepare_bar
  // with only mini_bar_cols).
  return [9, 3, 0, 0, 0];
}

/**
 * Read the mini-bar column split for a card. The two-col form the
 * :mini_bar / :closed / :open paths render (the rule that hides
 * bar-middle in small viewports). Returns `[default_left, default_right]`.
 */
export function readMiniBarCols(
  card: RenderCard,
  ruleContent?: string,
): readonly [number, number] {
  const cols = readBarCols(card, ruleContent);
  return [cols[0], cols[1]];
}

/**
 * card-mod-bar_and_box-0.20.0 set/all/bar.rb:18-20 `view :full_bar`:
 *   class_up "bar", full_page_card.safe_set_keys
 *   class_up_cols %w[bar-left bar-middle bar-right], bar_cols
 * `bar_cols` is whatever the composed format's `bar_cols` declaration holds
 * — a TWO-element array on the *all set module (`bar_cols 9, 3`, bar.rb:5),
 * a THREE-element array on the *rule set module (card-mod-rules
 * set/rule/bar_view.rb sets it to 5, 4, 3) — and class_up_cols indexes it by
 * the CLASS index across three classes. So the array Ruby indexes is NOT
 * readBarCols' md window; it is:
 *   - rule card:     [5, 4, 3]   (three cols, all present)
 *   - non-rule card: [9, 3]      (two cols, index 2 is nil)
 *   - rule card w/ stored bar_cols content: the parsed pair
 * This reader returns exactly that array so full_bar's class_up_cols
 * reproduces Ruby's index-for-index, INCLUDING the ragged tail: Ruby
 * `["col", nil, cols[2].nil?].compact.join("-")` renders the BARE string
 * "col" for a column past the end of the array, and this port must emit
 * that rather than a "col-0" made-up number.
 */
export function readFullBarCols(
  card: RenderCard,
  ruleContent?: string,
): readonly number[] {
  const parsed = parseBarCols(ruleContent);
  if (parsed !== undefined) return [parsed[0], parsed[1]];
  if (cardIsRule(card.setKeys)) {
    // RULE_BAR_COLS IS the *rule set module's `bar_cols` (card-mod-rules
    // set/rule/bar_view.rb:2-3 `bar_cols 5, 4, 3`) — a three-element array,
    // so all three classes index a real number and none collapses to "col".
    return [RULE_BAR_COLS[0], RULE_BAR_COLS[1], RULE_BAR_COLS[2]];
  }
  // The *all set module declares `bar_cols 9, 3` (bar.rb:5) — the TWO-col
  // form, which is this file's DEFAULT_MINI_BAR_COLS (bar.rb:5 has no
  // third element, so there is no *all md triple).
  return [DEFAULT_MINI_BAR_COLS[0], DEFAULT_MINI_BAR_COLS[1]];
}
