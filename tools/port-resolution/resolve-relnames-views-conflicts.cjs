// Resolve views.ts's two pointer/list-item nest arms after a merge, taking
// each side's winning decision.
//
// RECONCILIATION, recorded. The tree and the incoming revision disagree on
// TWO things in each of the two pointer/list item nest arms:
//   (a) the `hide: ["bar_middle"]` opts key - the incoming side still carries
//       it; this tree removed it in a later fix validated against rendered
//       output (a referred-to-by item slot renders one_line_content and then
//       bar_middle, so hiding bar_middle contradicts the actual body order).
//       THIS TREE WINS on this point: the removal supersedes.
//   (b) the `{ pointerListItem: true }` 4th nestRecord argument - this IS
//       the incoming revision's delta (the shape gate that stops the
//       view-lane bar-context seat firing on the set card's accordion rule
//       bars). THE INCOMING REVISION WINS on this point.
// So each arm takes this tree's opts object verbatim and gains only the marker.
//
// Byte discipline: views.ts carries 527 deliberate CRLF line endings. This script
// asserts 527/527/0 before and after; it never rewrites a line it did not
// touch.
const fs = require("fs");

const P = "src/card/render/views.ts";
const MARKER = "510fd7a4";

function crlfCounts(buf) {
  let cr = 0, crlf = 0, lone = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 13) { cr++; if (buf[i + 1] === 10) crlf++; else lone++; }
  }
  return { cr, crlf, lone };
}

const BEFORE = crlfCounts(fs.readFileSync(P));
if (BEFORE.crlf !== 527 || BEFORE.lone !== 0) {
  throw new Error(`pre-condition failed: ${JSON.stringify(BEFORE)} want crlf=527 lone=0`);
}

let s = fs.readFileSync(P).toString("latin1");

const ARM1_OLD = [
  '    return fmt.nestRecord(target, "bar", {',
  '      nest_name: target.name.s,',
  '      show: ["bar"],',
  '      home_view: "bar",',
  '      ...(slotTypeName !== undefined ? { type: slotTypeName } : {}),',
  '    });',
  '',
].join("\n");

const ARM1_NEW = [
  '    return fmt.nestRecord(',
  '      target,',
  '      "bar",',
  '      {',
  '        nest_name: target.name.s,',
  '        show: ["bar"],',
  '        home_view: "bar",',
  '        ...(slotTypeName !== undefined ? { type: slotTypeName } : {}),',
  '      },',
  '      // relnames (2026-10-04): this IS the pointer/list item shape the',
  '      // census-M1 view-lane bar-context seat was fitted to — the Guns:open',
  '      // census (Weapons+rifles renders title="+Rifles", Standards stays',
  '      // ctx-less). Every other bar nest leaves the flag off, so the seat',
  '      // does not fire on the set card\'s accordion rule bars.',
  '      { pointerListItem: true },',
  '    );',
  '',
].join("\n");

const ARM2_OLD = [
  '  return fmt.nestRecord(phantom, itemView, {',
  '    nest_name: name,',
  '    show: [itemView],',
  '    home_view: itemView === "closed" ? "open" : itemView,',
  '    ...(slotTypeName !== undefined ? { type: slotTypeName } : {}),',
  '  });',
  '',
].join("\n");

const ARM2_NEW = [
  '  return fmt.nestRecord(',
  '    phantom,',
  '    itemView,',
  '    {',
  '      nest_name: name,',
  '      show: [itemView],',
  '      home_view: itemView === "closed" ? "open" : itemView,',
  '      ...(slotTypeName !== undefined ? { type: slotTypeName } : {}),',
  '    },',
  '    // relnames (2026-10-04): the phantom sibling of the pointer/list item',
  '    // nest — same shape, same seat eligibility.',
  '    { pointerListItem: true },',
  '  );',
  '',
].join("\n");

const TRANSFORMS = [
  [ARM1_OLD, ARM1_NEW, "arm1 known-item bar"],
  [ARM2_OLD, ARM2_NEW, "arm2 unknown/phantom"],
];

let round = 0;
while (s.includes("<<<<<<< HEAD")) {
  if (round++ > 8) throw new Error("runaway conflict loop");
  const i = s.indexOf("<<<<<<< HEAD");
  const m = s.indexOf("\n=======\n", i);
  const e = s.indexOf("\n>>>>>>> " + MARKER, m);
  if (i < 0 || m < 0 || e < 0) throw new Error(`markers not found near ${i}`);
  const headSide = s.slice(i + "<<<<<<< HEAD\n".length, m + 1);
  const [oldText, newText, label] = TRANSFORMS[round - 1];
  if (!headSide) throw new Error(`${label}: empty HEAD side`);
  if (headSide.split(oldText).length - 1 !== 1) {
    throw new Error(`${label}: anchor count ${headSide.split(oldText).length - 1}`);
  }
  // e is the index of the "\n" that ENDS the last HEAD line; the ">>>>>>> "
  // marker line starts at e+1 and runs to its own newline. Drop both.
  const markerLineEnd = s.indexOf("\n", e + 1);
  if (markerLineEnd < 0) throw new Error("unterminated >>>>>>> marker line");
  s = s.slice(0, i) + headSide.replace(oldText, newText) + s.slice(markerLineEnd + 1);
}

if (s.includes("<<<<<<<") || s.includes(">>>>>>>")) throw new Error("markers remain");
fs.writeFileSync(P, Buffer.from(s, "latin1"));

const AFTER = crlfCounts(fs.readFileSync(P));
if (AFTER.crlf !== 527 || AFTER.lone !== 0) {
  throw new Error(`post-condition failed: ${JSON.stringify(AFTER)} want crlf=527 lone=0`);
}
const markers = (s.match(/pointerListItem: true/g) || []).length;
console.log(`RESOLVED both arms. views.ts CRLF ${BEFORE.crlf} -> ${AFTER.crlf}, lone ${BEFORE.lone} -> ${AFTER.lone}. pointerListItem: true count = ${markers}`);
