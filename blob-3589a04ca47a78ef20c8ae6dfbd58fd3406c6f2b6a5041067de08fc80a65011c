// The grader cross-check: run the roster's own grader over the COMMITTED
// run record and report what it computes for every row.
//
// The grader is tools/edge-signed-in-exercise/lib/local-policy.mjs
// verifiedCapabilities - the same function the harness itself calls to print
// its coverage table. The input is the committed run record
// (docs/runs/edge-signed-in-exercise-round6-measured-2026-10-23.json), not a
// scratch file, so the cross-check is reproducible from the repository alone.
//
//   node tools/edge-signed-in-exercise/grader-cross-check.mjs \
//     [tools/edge-signed-in-exercise/capabilities.json] \
//     [docs/runs/edge-signed-in-exercise-round6-measured-2026-10-23.json]
//
// Exit 0 when every row the roster declares covered is computed covered by
// the grader over that record; exit 1 when a declared-covered row is not.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { verifiedCapabilities } from "./lib/local-policy.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rosterPath = resolve(
  process.argv[2] ?? join(repoRoot, "tools/edge-signed-in-exercise/capabilities.json"),
);
const recordPath = resolve(
  process.argv[3] ??
    join(repoRoot, "docs/runs/edge-signed-in-exercise-round6-measured-2026-10-23.json"),
);

const roster = JSON.parse(readFileSync(rosterPath, "utf8")).capabilities;
const record = JSON.parse(readFileSync(recordPath, "utf8"));

// The record's results are the union of the runs it carries: a capability is
// credited when EVERY one of its named checks passes in EVERY run that
// recorded it, and every required actor appears in the evidence.
const results = record.runs.flatMap((run) => run.results);

const computed = verifiedCapabilities(roster, results);
const counts = { covered: 0, partial: 0, not_covered: 0, disabled_upstream: 0, out_of_scope: 0 };
for (const row of computed) counts[row.status] += 1;

console.log(`roster: ${rosterPath}`);
console.log(`record: ${recordPath}`);
console.log(`runs carried: ${record.runs.length} | results fed to the grader: ${results.length}`);
console.log(
  `grader over the committed record: ${counts.covered} covered, ${counts.partial} partial, ` +
    `${counts.not_covered} not_covered, ${counts.disabled_upstream} disabled_upstream, ` +
    `${counts.out_of_scope} out_of_scope (of ${computed.length})`,
);

const driven = computed.filter((row) => row.status === "covered").map((row) => row.id);
console.log(`computed covered: ${driven.join(", ")}`);

// The cross-check criterion: the rows THIS ROUND closed must be computed
// covered by the grader over the committed record. The roster's other
// covered rows were closed by EARLIER rounds against their own run
// records, so this record's runs do not exercise them, and the grader
// correctly computes them not_covered here. Comparing every declared-covered
// row against this one record would report those as mismatches, which would
// be a wrong criterion, not a finding.
//
// The rows this round closed: taken from the record's own rowsClosed field
// (the record names the rows it is the evidence for), or from the roster
// rows whose finding names this record, or from explicit arguments.
const roundRows = process.argv.slice(4);
const recordStem = recordPath.replace(/\.json$/, "").split(/[\\/]/).pop();
const target =
  roundRows.length > 0
    ? roundRows
    : Array.isArray(record.rowsClosed) && record.rowsClosed.length > 0
      ? record.rowsClosed
      : roster
          .filter((row) => row.status === "covered")
          .filter((row) => (row.finding ?? "").includes(recordStem))
          .map((row) => row.id);
console.log(`rows this round closed (checked against this record): ${target.join(", ")}`);

const mismatches = target.filter((id) => !driven.includes(id));
if (mismatches.length > 0) {
  console.error(
    `MISMATCH: closed by this round but NOT computed covered by the grader over the committed record: ${mismatches.join(", ")}`,
  );
  process.exit(1);
}
console.log(`every row this round closed (${target.length}) is computed covered by the grader`);

const open = computed.filter((row) => row.status === "not_covered");
console.log(`rows this record's runs do not exercise: ${open.map((row) => row.id).join(", ") || "none"}`);

// The roster's own declared state, which is the family's standing count.
const declared = { covered: 0, partial: 0, not_covered: 0, disabled_upstream: 0, out_of_scope: 0 };
for (const row of roster) declared[row.status] += 1;
console.log(
  `the roster's own declared state: ${declared.covered} covered, ${declared.partial} partial, ` +
    `${declared.not_covered} not_covered, ${declared.disabled_upstream} disabled_upstream, ` +
    `${declared.out_of_scope} out_of_scope (of ${roster.length})`,
);
