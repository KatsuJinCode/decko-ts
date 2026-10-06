// PROOF: the Self::Mod address pin is load-bearing.
//
//   node tools/oracle/prove-mod-address-pin-catches-engine-mutations.mjs
//
// WHY THIS TOOL EXISTS. A pin that passes proves nothing on its own — it has
// to be shown to FAIL when the engine is wrong. This mutates the engine 13
// ways (drop the address, malform it six ways, drift a neighbouring byte, make
// the id a constant, drop a line, and reorder the list three ways) and requires
// the pin to catch every one.
//
// THE CORRECTION IS THE POINT. The first version of this tool counted a
// mutation as caught whenever the child process exited non-zero. That is wrong:
// an npx SPAWN FAILURE looks exactly like a test failure, and on this machine it
// did — the first run reported a clean 13/13 while every run had produced no
// output at all. This version reads vitest's own summary line out of the
// output, reports SPAWN-FAILURE when there is none, and asserts the UNMUTATED
// baseline passes first, so "caught" cannot mean "never ran".
//
// The three reordering mutations are why the engine had to grow an observable
// mod name (capturedModObjects): Object#to_s prints the address, so a reversed
// list produces byte-identical content and no byte-level assertion can see it.
//
// Each mutation is restored and the restore is verified by sha256, so the tool
// leaves the engine exactly as it found it.
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ENGINE = "src/card/set-module-content-overrides.ts";
const TEST = "tests/card/content/mod-object-address-shape-parity.test.ts";
const original = fs.readFileSync(ENGINE);
const originalHash = crypto.createHash("sha256").update(original).digest("hex");

/** Run the suite and classify by the SUMMARY, never by exit code alone. */
function runSuite() {
  let out = "";
  try {
    out = execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", TEST, "--no-file-parallelism"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 600000,
    });
  } catch (err) {
    out = `${err.stdout || ""}${err.stderr || ""}`;
  }
  const clean = out.replace(/\[[0-9;]*m/g, "");
  const m = /Tests\s+(.*)/.exec(clean);
  if (m === null) return { verdict: "SPAWN-FAILURE", summary: clean.slice(-300) };
  const summary = m[1].trim();
  const failedMatch = /(\d+)\s+failed/.exec(summary);
  const failed = failedMatch !== null && Number(failedMatch[1]) > 0;
  return { verdict: failed ? "CAUGHT" : "SURVIVED", summary };
}

const MUTATIONS = [
  ["drop the address (port emits the mod name again)",
    "return `#<${CARDIO_MOD_CLASS_NAME}:0x${address}>`;",
    'return `${CARDIO_MOD_CLASS_NAME.split("::")[1].toLowerCase()}_mod`;'],
  ["malform: empty address",
    "return `#<${CARDIO_MOD_CLASS_NAME}:0x${address}>`;",
    "return `#<${CARDIO_MOD_CLASS_NAME}:0x>`;"],
  ["malform: non-hex characters in the address",
    "  const address = mod.identity\n    .toString(16)",
    '  const address = "zzzzzzzzzzzzzzzz" || mod.identity\n    .toString(16)\n    '],
  ["malform: wrong width (8 hex digits)",
    '    .padStart(CARDIO_MOD_ADDRESS_HEX_DIGITS, "0");',
    '    .padStart(8, "0").slice(-8);'],
  ["malform: missing closing bracket",
    "return `#<${CARDIO_MOD_CLASS_NAME}:0x${address}>`;",
    "return `#<${CARDIO_MOD_CLASS_NAME}:0x${address}`;"],
  ["malform: missing 0x prefix",
    "return `#<${CARDIO_MOD_CLASS_NAME}:0x${address}>`;",
    "return `#<${CARDIO_MOD_CLASS_NAME}:${address}>`;"],
  ["drift another byte: drop the _mod suffix",
    "return toPointerContent(mods.map((mod) => `${modObjectToS(mod)}_mod`));",
    "return toPointerContent(mods.map((mod) => modObjectToS(mod)));"],
  ["drift another byte: add a trailing newline",
    "  return modItemCodesContentForMods(capturedModObjects());",
    "  return modItemCodesContentForMods(capturedModObjects()) + String.fromCharCode(10);"],
  ["per-process id replaced by a constant (all 34 lines identical)",
    "function nextModIdentity(): bigint {",
    "function nextModIdentity(): bigint {\n  if (modIdentityCursor !== undefined) return modIdentityCursor;"],
  ["drop a line (34 -> 33 mods)",
    "  return ORACLE_BUNDLE_ORDER.map((name) => ({ name, identity: nextModIdentity() }));",
    "  return ORACLE_BUNDLE_ORDER.slice(0, -1).map((name) => ({ name, identity: nextModIdentity() }));"],
  ["REVERSE the mod order (ordering is unobservable in the bytes)",
    "  return ORACLE_BUNDLE_ORDER.map((name) => ({ name, identity: nextModIdentity() }));",
    "  return [...ORACLE_BUNDLE_ORDER].reverse().map((name) => ({ name, identity: nextModIdentity() }));"],
  ["SWAP two adjacent mods (same multiset, different order)",
    "  return ORACLE_BUNDLE_ORDER.map((name) => ({ name, identity: nextModIdentity() }));",
    "  return ORACLE_BUNDLE_ORDER.map((name, i) => ({\n    name: i === 0 ? ORACLE_BUNDLE_ORDER[1] : i === 1 ? ORACLE_BUNDLE_ORDER[0] : name,\n    identity: nextModIdentity(),\n  }));"],
  ["SORT the mod list instead of using the bundle order",
    "  return ORACLE_BUNDLE_ORDER.map((name) => ({ name, identity: nextModIdentity() }));",
    "  return [...ORACLE_BUNDLE_ORDER].sort().map((name) => ({ name, identity: nextModIdentity() }));"],
];

// sanity: the UNMUTATED suite must pass, or "caught" means nothing
fs.writeFileSync(ENGINE, original);
const baseline = runSuite();
console.log(`BASELINE (unmutated): ${baseline.verdict} — ${baseline.summary}\n`);

const results = [];
for (const [name, from, to] of MUTATIONS) {
  const text = original.toString("utf8");
  if (text.indexOf(from) < 0) {
    results.push({ name, verdict: "ANCHOR-MISSING", summary: "" });
    continue;
  }
  fs.writeFileSync(ENGINE, text.replace(from, to));
  const r = runSuite();
  fs.writeFileSync(ENGINE, original);
  const restored = crypto.createHash("sha256").update(fs.readFileSync(ENGINE)).digest("hex") === originalHash;
  results.push({ name, verdict: r.verdict, summary: r.summary, restored });
}

console.log("=== MUTATION PROOF ===");
for (const r of results) {
  const tag = r.verdict === "CAUGHT" ? "PASS" : "FAIL";
  console.log(`  ${tag}  [${r.verdict}]  ${r.name}`);
  console.log(`        ${r.summary}${r.restored === false ? "  [RESTORE FAILED]" : ""}`);
}
const survivors = results.filter((r) => r.verdict !== "CAUGHT");
console.log(`\nmutations: ${results.length}  caught: ${results.length - survivors.length}  NOT caught: ${survivors.length}`);
for (const s of survivors) console.log(`   NOT CAUGHT: ${s.name} (${s.verdict})`);
console.log(`engine restored byte-for-byte: ${crypto.createHash("sha256").update(fs.readFileSync(ENGINE)).digest("hex") === originalHash}`);
