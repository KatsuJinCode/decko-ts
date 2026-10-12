// apply-m2b-bar-subview-gate-per-nest-verdict.mjs — the bar-subview gate
// half of the per-nest read-verdict fix, applied at the byte level.
//
// After the first half (apply-m2-...mjs) the mini_bar WRAP and its slot JSON
// render the oracle's bytes and the bar-menu renders, but `bar_left` still
// denies:
//
//   expected: <div class='bar-left col-9'>\n<span class="card-title" title="<item>"><item></span>\n</div>
//   actual:   <div class='bar-left col-9'>\n<span class="denied"><!-- Sorry, you don't have permission (read) --></span>\n</div>
//
// Byte probe: a full-page delta flipped from -1605 to +3 with the
// first half alone. The residual is bar_left's OWN view-permission gate —
// format.ts renderView's `else if (effective === normalized)` arm, which runs
// for the substituted mini_bar's CHILD views (bar_left, bar_menu have no
// `unknown:` declaration, so they render AS REQUESTED and are gated).
// Its `taskAllowed` for `read` is `!this.engine.isDenied(this.card)` — the same
// deck-global map. So both gates need the per-nest verdict, and they must read
// it the same way.

import { readFileSync, writeFileSync } from "node:fs";

const GATE_FROM = [
  "          taskAllowed: (task: CrudTask): boolean | undefined =>",
  "            task === \"read\"",
  "              ? !this.engine.isDenied(this.card)",
  "              : this.engine.taskAllowed?.(this.card, task),",
].join("\n");

const GATE_TO = [
  "          taskAllowed: (task: CrudTask): boolean | undefined =>",
  "            task === \"read\"",
  "              ? this.cardReadable()",
  "              : this.engine.taskAllowed?.(this.card, task),",
].join("\n");

const HELPER_ANCHOR = "  private idCounter: number | undefined;";
const HELPER = [
  "  /** The `read` half of the view-permission gate (format/error.rb:5-8 ok?),",
  "   *  as ONE predicate for both gate call sites.",
  "   *",
  "   *  The deck-global default is `!isDenied(card)`. The one exception is an",
  "   *  unknown pointer/list item whose OWN nest found it readable: Ruby builds",
  "   *  that phantom fresh per nest (Nest::Fetch#new_card) and runs the read",
  "   *  walk on THAT card, so the per-nest verdict",
  "   *  (RenderEngine#pointerItemVerdict, `${hostKey}|${itemKey}`) is the",
  "   *  faithful answer — while `isDenied` reads deniedVerdictsByKey, which",
  "   *  ensurePointerItemVerdicts fills once per item key GLOBALLY (first fold",
  "   *  wins). An item line that appears on many hosts therefore inherits",
  "   *  whichever host the run touched first: `mytho-psychology` sits on ~30",
  "   *  corpus cards and under Quicksilver+Core Project the nest read is true",
  "   *  (Project/398) while the global entry said denied, rendering bar_left",
  "   *  as a quiet denial where the oracle renders the card title. Probed:",
  "   *  cold isDenied false -> full bar; warm isDenied true -> two denied",
  "   *  spans; per-nest verdict read:true in both (M2 receipt). */",
  "  private cardReadable(): boolean {",
  "    if (this.card.pointerItemReadVerdict === true) return true;",
  "    return !this.engine.isDenied(this.card);",
  "  }",
  "",
  "  private idCounter: number | undefined;",
].join("\n");

const file = "src/card/render/format.ts";
let text = readFileSync(file, "utf8");

const gateCount = text.split(GATE_FROM).length - 1;
if (gateCount !== 2) {
  console.error(`APPLY-ERROR ${file}: gate anchor matched ${gateCount} times, expected 2`);
  process.exit(1);
}
text = text.split(GATE_FROM).join(GATE_TO);

if (text.split(HELPER_ANCHOR).length - 1 !== 1) {
  console.error(`APPLY-ERROR ${file}: idCounter anchor is not unique`);
  process.exit(1);
}
text = text.replace(HELPER_ANCHOR, HELPER);

writeFileSync(file, text, "utf8");
console.log(`APPLIED ${file}: 2 gate sites -> cardReadable(), 1 helper inserted`);
