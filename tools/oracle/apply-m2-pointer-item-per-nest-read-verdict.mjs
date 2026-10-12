// apply-m2-pointer-item-per-nest-read-verdict.mjs — the pointer-item
// per-nest read-verdict edit, applied at the byte level so no EOL in the
// carrier file is touched.
//
// WHY A SCRIPT AND NOT THE EDIT TOOL: src/card/render/views.ts is a MIXED-EOL
// file (527 CRLF / 4919 LF-only lines at this commit). The Edit tool
// normalizes CRLF to LF across the file, which has produced whole-file
// pure-EOL churn before. This script does exact byte replacements and asserts
// each one applied.
//
// THE MECHANISM (see tools/oracle/probe-trace-phantom-item-verdict.mjs,
// which traces a phantom pointer item's read verdict across a cold and a
// warm render of the same nest):
//
//   verdict lookup   <item key>
//                    -> {"read":true,"create":false}     (BOTH cold and warm)
//   COLD  isDenied(item) -> false  x2   body = FULL bar (correct)
//   WARM  isDenied(item) -> true   x1   body = two denied spans
//
// The two isDenied calls in the COLD run are bar_left + bar_menu passing the
// gate; in the WARM run bar_left fails it and miniBarView short-circuits to
// the two-span body. `isDenied` reads deniedVerdictsByKey — the DECK-GLOBAL
// map, which RenderEngine#ensurePointerItemVerdicts fills ONCE per item key
// ("first computation wins", pointerItemGlobalVerdictDone). An item line that
// appears on many corpus cards is decided by whichever nest the run touches
// FIRST, and the per-nest verdict this nest already read never reaches the
// gate. Ruby builds the phantom fresh per nest
// (Nest::Fetch#new_card) and runs the walk on THAT card, so the per-nest
// value is the faithful one.

import { readFileSync, writeFileSync } from "node:fs";

const edits = [
  {
    file: "src/card/render/format.ts",
    from: [
      "   *  RenderFormat.viewForUnknown). Real (fetched) cards never set this. */",
      "  unknown?: boolean;",
      "}",
    ].join("\n"),
    to: [
      "   *  RenderFormat.viewForUnknown). Real (fetched) cards never set this. */",
      "  unknown?: boolean;",
      "  /** This NEST's own read verdict for an unknown pointer/list item",
      "   *  (RenderEngine#pointerItemVerdict, keyed `${hostKey}|${itemKey}`).",
      "   *  Ruby constructs the item's phantom fresh per nest",
      "   *  (Nest::Fetch#new_card) and runs the read walk on THAT card, so the",
      "   *  per-nest verdict — not the deck-global `deniedVerdictsByKey` entry",
      "   *  another nest happened to fold first — is what the :mini_bar body",
      "   *  gate asks. Set by renderUnknownPointerListItem on the readable arm",
      "   *  only; undefined = no per-nest verdict for this phantom, and every",
      "   *  consumer keeps the deck-global read. */",
      "  pointerItemReadVerdict?: boolean;",
      "}",
    ].join("\n"),
  },
  {
    file: "src/card/render/views.ts",
    from: [
      "    return pointerListItemSlot(phantom, body, slotTypeName);",
      "  }",
      "  return fmt.nestRecord(phantom, itemView, {",
    ].join("\n"),
    to: [
      "    return pointerListItemSlot(phantom, body, slotTypeName);",
      "  }",
      "  // READABLE arm: this nest's own walk says the phantom reads, so the",
      "  // substituted :mini_bar body must not re-decide through the",
      "  // DECK-GLOBAL deniedVerdictsByKey (miniBarView below). `mytho-psychology`",
      "  // is an item line on ~30 corpus cards and ensurePointerItemVerdicts",
      "  // keeps the FIRST fold per item key globally, so under any other",
      "  // render order the global entry says denied and a phantom this nest",
      "  // found readable rendered the two-span body (probe: cold isDenied",
      "  // false -> FULL, warm isDenied true -> DENIED, per-nest verdict",
      "  // read:true in both). Carried on the phantom card itself, which is the",
      "  // object the mini_bar render receives.",
      "  phantom.pointerItemReadVerdict = true;",
      "  return fmt.nestRecord(phantom, itemView, {",
    ].join("\n"),
  },
  {
    file: "src/card/render/views.ts",
    from: [
      "const miniBarView: ViewFn = (ctx) => {",
      "  if (ctx.fmt.card.unknown === true && ctx.fmt.engine.isDenied(ctx.fmt.card)) {",
    ].join("\n"),
    to: [
      "const miniBarView: ViewFn = (ctx) => {",
      "  if (ctx.fmt.card.unknown === true && ctx.fmt.card.pointerItemReadVerdict !== true && ctx.fmt.engine.isDenied(ctx.fmt.card)) {",
    ].join("\n"),
  },
];

for (const edit of edits) {
  const before = readFileSync(edit.file, "utf8");
  const count = before.split(edit.from).length - 1;
  if (count !== 1) {
    console.error(`APPLY-ERROR ${edit.file}: anchor matched ${count} times, expected exactly 1`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(edit.file, before.replace(edit.from, edit.to), "utf8");
  console.log(`APPLIED ${edit.file} (${edit.from.split("\n").length} -> ${edit.to.split("\n").length} lines)`);
}
