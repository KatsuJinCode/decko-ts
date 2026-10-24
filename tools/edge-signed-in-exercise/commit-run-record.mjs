// Commit-ready run record for the round-six measured runs.
//
// It takes the harness's own run record and keeps the parts a reader and the
// grader need: the provenance, the completedAt stamp, the results (what
// tools/edge-signed-in-exercise/lib/local-policy.mjs verifiedCapabilities
// consumes) and the coverage the grader computed.
//
// The request ledger is kept too, because it is the evidence of what the
// browser actually asked for. One entry in the mail-reset ledger carries a
// LIVE reset token in a query string (the disposable local account's own
// one-time link). That value is replaced with the marker below and the
// redaction is stated in the record's own redaction field, so nothing is
// quietly shortened.
//
// Usage: node tools/edge-signed-in-exercise/commit-run-record.mjs <out.json> <runDir> [<runDir> ...]
// The rows the round closes are read from the roster, so the record names
// the rows it is the evidence for: a reader of the record alone learns which
// rows these runs close, and the grader cross-check
// (tools/edge-signed-in-exercise/grader-cross-check.mjs) can check exactly
// those rows against exactly this record.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [outPath, ...runDirs] = process.argv.slice(2);
if (!outPath || runDirs.length === 0) {
  console.error(
    "usage: commit-run-record.mjs <out.json> <runDir> [<runDir> ...]",
  );
  process.exit(2);
}

const TOKEN_VALUE = /token=eyJ[A-Za-z0-9_.\-]*/g;
const MARKER = "token=REDACTED";

const runs = runDirs.map((dir) => {
  const record = JSON.parse(readFileSync(join(dir, "report.md.json"), "utf8"));
  const requests = (record.requests ?? []).map((entry) => {
    const path = typeof entry.path === "string" ? entry.path : entry.path;
    if (typeof path !== "string" || !TOKEN_VALUE.test(path)) return entry;
    TOKEN_VALUE.lastIndex = 0;
    return { ...entry, path: path.replace(TOKEN_VALUE, MARKER) };
  });
  TOKEN_VALUE.lastIndex = 0;
  return {
    run: dir,
    provenance: record.provenance,
    completedAt: record.completedAt,
    productionAcceptance: record.productionAcceptance,
    results: record.results,
    capabilityCoverage: record.capabilityCoverage,
    requests,
  };
});

// The rows this round closes: the rows whose roster finding names this
// round's run record.
const roster = JSON.parse(
  readFileSync(join(repoRoot, "tools/edge-signed-in-exercise/capabilities.json"), "utf8"),
).capabilities;
const recordStem = outPath.replace(/\.json$/, "").split(/[\\/]/).pop();
const rowsClosed = roster
  .filter((row) => row.status === "covered")
  .filter((row) => (row.finding ?? "").includes(recordStem))
  .map((row) => row.id);

const payload = {
  note: "The round-six measured run records for the [Family] capability family. Each run is the harness's own record (tools/edge-signed-in-exercise.mjs) against the LOCAL stack: the loopback database and object storage, a local copy of the deck on the engine schema, two throwaway local accounts, headless Chromium with a throwaway profile. productionRuntime is false in every provenance block: nothing reached the live edge and nothing was written to the live D1. The results array is what the grader (tools/edge-signed-in-exercise/lib/local-policy.mjs verifiedCapabilities) consumes, and the capabilityCoverage block is that grader's own output over these results.",
  redaction:
    "One request path in the mail-reset run's request ledger carried a live one-time reset token in a query string. That value is replaced with the literal 'token=REDACTED'; the rest of the entry and every other entry are the harness's own bytes.",
  rowsClosed,
  runs,
};

writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`wrote ${outPath}`);
for (const run of runs) {
  const counts = run.capabilityCoverage?.counts ?? {};
  console.log(
    `  ${run.run}: ${run.results.length} results, ${run.results.filter((r) => r.pass === false).length} failed, covered ${counts.covered}, partial ${counts.partial}, not_covered ${counts.not_covered}`,
  );
}
