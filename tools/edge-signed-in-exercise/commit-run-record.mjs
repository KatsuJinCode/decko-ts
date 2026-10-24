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
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

const payload = {
  note: "The round-six measured run records for the [Family] capability family. Each run is the harness's own record (tools/edge-signed-in-exercise.mjs) against the LOCAL stack: the loopback database and object storage, a local copy of the deck on the engine schema, two throwaway local accounts, headless Chromium with a throwaway profile. productionRuntime is false in every provenance block: nothing reached the live edge and nothing was written to the live D1. The results array is what the grader (tools/edge-signed-in-exercise/lib/local-policy.mjs verifiedCapabilities) consumes, and the capabilityCoverage block is that grader's own output over these results.",
  redaction:
    "One request path in the mail-reset run's request ledger carried a live one-time reset token in a query string. That value is replaced with the literal 'token=REDACTED'; the rest of the entry and every other entry are the harness's own bytes.",
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
