// Byte comparison of the port's and stock Ruby Decko's answers for one plan.
//
//   node tools/ruby-mods/compare.mjs <port-out.json> <oracle-out.json>
//
// The one normalization is the harness's: data-slot-id values are random per
// render on both sides (adapter.rb SLOTLESS), so they are blanked.
import { readFileSync } from "node:fs";

const [portPath, oraclePath] = process.argv.slice(2);
const port = JSON.parse(readFileSync(portPath, "utf8"));
const oracle = JSON.parse(readFileSync(oraclePath, "utf8"));
const slotless = (s) => s.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, "data-slot-id=$1$1");

let same = 0;
let differ = 0;
port.renders.forEach((p, i) => {
  const o = oracle.renders[i];
  const a = p.html === undefined ? `ERROR ${p.error}` : slotless(p.html);
  const b = o.html === undefined ? `ERROR ${o.error}` : slotless(o.html);
  if (a === b) {
    same++;
    console.log(`SAME    render ${p.card} :${p.view} (${a.length} bytes)`);
  } else {
    differ++;
    let at = 0;
    while (at < a.length && a[at] === b[at]) at++;
    console.log(`DIFFER  render ${p.card} :${p.view} at byte ${at}`);
    console.log(`  port:   ${JSON.stringify(a.slice(Math.max(0, at - 40), at + 120))}`);
    console.log(`  oracle: ${JSON.stringify(b.slice(Math.max(0, at - 40), at + 120))}`);
  }
});
port.events.forEach((p, i) => {
  const o = oracle.events[i];
  if (p.stored === o.stored) {
    same++;
    console.log(`SAME    create ${p.name} -> ${JSON.stringify(p.stored)}`);
  } else {
    differ++;
    console.log(`DIFFER  create ${p.name}: port ${JSON.stringify(p.stored)} oracle ${JSON.stringify(o.stored)}`);
  }
});
console.log(`${same} same, ${differ} differ`);
process.exitCode = differ === 0 ? 0 : 1;
