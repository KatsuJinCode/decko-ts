// tools/run-save-statement-ladder-to-completion.mjs
//
// RUNS THE SAVE-STATEMENT LADDER AND EXITS WHEN THE LADDER IS DONE.
//
// WHY THIS EXISTS. The ladder counts POSTs by stamping an event-loop tick
// counter, and the counter reschedules itself forever:
//
//   let currentTick = 0;
//   const bumpTick = () => { currentTick += 1; setImmediate(bumpTick); };
//   setImmediate(bumpTick);
//
// (tools/diagnose-owner-save-statement-ladder.mjs, the tick counter's
// definition.) An endless setImmediate chain keeps the event loop alive
// forever, so the ladder process never exits: it writes its report, prints
// its summary, closes its local stack, removes its run directory, and then
// spins on the event loop until something interrupts it.
//
// The cost of that is not the spin. The cost is that a lane that runs the
// ladder in a loop runs ONE run and then hangs, and the spinning process
// burns a core for the rest of the session, which pollutes every later
// measurement on the machine, including the ladder's own wall numbers.
//
// HOW IT EXITS. The ladder's top-level code has finished by the time this
// module's dynamic import resolves: its try/finally has closed the host, the
// local Hrana server and the mock storage, and has removed its run
// directory. Exiting here is the ladder's normal end, not an interruption of
// a running measurement, and nothing external has to signal the process.
//
// The shared ladder is NOT edited: other lanes run it, and this wrapper
// leaves their behaviour exactly as it was.
//
//   node tools/run-save-statement-ladder-to-completion.mjs --out tmp/x.json
//   node tools/run-save-statement-ladder-to-completion.mjs --attribution --out tmp/x.json
//
// --attribution runs the per-POST attribution copy of the ladder
// (tools/diagnose-owner-save-statement-ladder-post-attribution.mjs), which
// records which statements rode which POST. The copy's POST and statement
// counts are identical to the plain ladder's on the same tree, which is the
// check that its extra bookkeeping changed nothing.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const attribution = process.argv.includes("--attribution");
const ladder = attribution
  ? "diagnose-owner-save-statement-ladder-post-attribution.mjs"
  : "diagnose-owner-save-statement-ladder.mjs";
const ladderPath = resolve(here, ladder);
const ladderUrl = `file:///${ladderPath.replace(/\\/g, "/")}`;

await import(ladderUrl);
process.exit(0);
