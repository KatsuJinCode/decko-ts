// apply-m2-pointer-item-per-nest-read-verdict.mjs — the M2 edit, applied at
// the byte level so no EOL in the carrier file is touched.
//
// WHY A SCRIPT AND NOT THE EDIT TOOL: src/card/render/views.ts is a MIXED-EOL
// file (527 CRLF / 4919 LF-only lines at this commit). The Edit tool
// normalizes CRLF to LF across the file, which produced 61 lines of pure-EOL
// churn once already (negdelta-zero receipt, section 5). This script does exact
// byte replacements and asserts each one applied.
//
// THE MECHANISM (tools/oracle/probe-trace-phantom-item-verdict.mjs, run on
// corpus card 802 "Metashamanic+Core Project" whose content is the single
// pointer item `mytho-psychology`):
//
//   verdict lookup   metashamanic+core_project | mytho_psychology
//                    -> {"read":true,"create":false}     (BOTH cold and warm)
//   COLD  isDenied(mytho_psychology) -> false  x2   body = FULL bar (correct)
//   WARM  isDenied(mytho_psychology) -> true   x1   body = two denied spans
//
// The two isDenied calls in the COLD run are bar_left + bar_menu passing the
// gate; in the WARM run bar_left fails it and miniBarView short-circuits to
// the two-span body. `isDenied` reads deniedVerdictsByKey — the DECK-GLOBAL
// map, which RenderEngine#ensurePointerItemVerdicts fills ONCE per item key
// ("first computation wins", pointerItemGlobalVerdictDone). `mytho-psychology`
// is an item line on ~30 corpus cards; whichever one the run touches FIRST
// decides the global entry, and the per-nest verdict this nest already read
// never reaches the gate. Ruby builds the phantom fresh per nest
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
