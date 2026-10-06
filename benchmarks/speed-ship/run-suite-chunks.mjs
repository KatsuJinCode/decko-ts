// benchmarks/speed-ship/run-suite-chunks.mjs — the whole tests/ suite in
// short chunks (each one vitest run, killed at 115 s), so no single command
// runs past two minutes. Writes one JSON line per test file:
//   {"file": "...", "status": "passed|failed|timeout", "failed": [test names]}
//
//   node benchmarks/speed-ship/run-suite-chunks.mjs <results.jsonl> [chunkSize] [filter-substring]
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, readFileSync, writeFileSync, appendFileSync, rmSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

const out = process.argv[2];
const size = Number(process.argv[3] ?? "40");
const filter = process.argv[4] ?? "";
const root = process.cwd();

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.test\.(ts|mjs|js)$/.test(name)) acc.push(relative(root, p).replace(/\\/g, "/"));
  }
  return acc;
}

const files = walk(join(root, "tests"), []).filter((f) => f.includes(filter)).sort();
writeFileSync(out, "");
const vitest = join(root, "node_modules", "vitest", "vitest.mjs");

function runChunk(chunk) {
  const json = join(tmpdir(), `ship-suite-${process.pid}-${Date.now()}.json`);
  const r = spawnSync(process.execPath, [vitest, "run", ...chunk, "--reporter=json", `--outputFile=${json}`], {
    cwd: root,
    timeout: 115_000,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const timedOut = r.error !== undefined && /ETIMEDOUT/.test(String(r.error.code ?? r.error));
  let report;
  try {
    report = existsSync(json) ? JSON.parse(readFileSync(json, "utf8")) : undefined;
  } catch {
    report = undefined;
  }
  try {
    rmSync(json, { force: true });
  } catch {
    /* already gone */
  }
  return { report, timedOut };
}

function record(chunk) {
  const { report, timedOut } = runChunk(chunk);
  if (report === undefined) {
    if (chunk.length > 1) {
      // Split a chunk that timed out or crashed until each file runs alone.
      const mid = Math.ceil(chunk.length / 2);
      record(chunk.slice(0, mid));
      record(chunk.slice(mid));
      return;
    }
    appendFileSync(out, JSON.stringify({ file: chunk[0], status: timedOut ? "timeout" : "no-report" }) + "\n");
    return;
  }
  const seen = new Set();
  for (const tr of report.testResults ?? []) {
    const file = relative(root, tr.name).replace(/\\/g, "/");
    seen.add(file);
    const failed = (tr.assertionResults ?? []).filter((a) => a.status === "failed").map((a) => a.fullName);
    const passed = (tr.assertionResults ?? []).filter((a) => a.status === "passed").length;
    const skipped = (tr.assertionResults ?? []).filter((a) => a.status !== "passed" && a.status !== "failed").length;
    const status = tr.status === "passed" ? "passed" : "failed";
    appendFileSync(
      out,
      JSON.stringify({ file, status, passed, skipped, failed, ...(failed.length === 0 && status === "failed" ? { message: String(tr.message ?? "").slice(0, 300) } : {}) }) + "\n",
    );
  }
  for (const f of chunk) if (!seen.has(f)) appendFileSync(out, JSON.stringify({ file: f, status: "not-run" }) + "\n");
}

for (let i = 0; i < files.length; i += size) record(files.slice(i, i + size));
const rows = readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const by = {};
for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
console.log(JSON.stringify({ files: rows.length, by, tests_passed: rows.reduce((a, r) => a + (r.passed ?? 0), 0), tests_failed: rows.reduce((a, r) => a + (r.failed?.length ?? 0), 0) }));
