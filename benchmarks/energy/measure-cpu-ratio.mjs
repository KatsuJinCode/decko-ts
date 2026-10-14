// measure-cpu-ratio.mjs — CPU time per page render, Ruby Decko vs the port.
//
// Drives two reference-harness adapters (the same protocol run.mjs uses)
// over the same synthetic-v1 deck and the same anonymous page renders. For
// each adapter: start it, render every page once (warm-up), then read the
// CPU time (user+kernel) of the adapter's whole process tree, render the
// page list R more times, read it again. CPU ms per page = delta / renders.
// Boot is excluded; both engines are measured warm.
//
// Usage:
//   node benchmarks/energy/measure-cpu-ratio.mjs [--rounds 3] [--json out.json]
// The Ruby adapter needs the oracle bundle's gems on BUNDLE_PATH (see
// reference-harness/oracle). Windows-only CPU counter (PowerShell).

import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { AdapterSession, loadAdapterManifest } from "../../reference-harness/runner/adapter-process.mjs";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = path.join(REPO, "reference-harness", "fixtures", "synthetic-v1");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const ROUNDS = Number(opt("--rounds", 3));
const JSON_OUT = opt("--json", null);
const ADAPTERS = (opt("--adapters", "ts,ruby")).split(",");

const pages = readFileSync(path.join(FIXTURE, "ops", "render.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((op) => op.actor === "anonymous" && op.view === undefined)
  .map((op) => ({ op: "render", actor: op.actor, card: op.card }));

function treeCpuMs(rootPid) {
  const script = [
    `$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId`,
    `$ids = @(${rootPid}); $frontier = @(${rootPid})`,
    `while ($frontier.Count -gt 0) { $next = @($all | Where-Object { $frontier -contains $_.ParentProcessId } | ForEach-Object { $_.ProcessId }); $ids += $next; $frontier = $next }`,
    `$t = 0; foreach ($p in $ids) { $g = Get-Process -Id $p -ErrorAction SilentlyContinue; if ($g) { $t += $g.TotalProcessorTime.TotalMilliseconds } }; $t`,
  ].join("; ");
  return Number(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, encoding: "utf8" }).trim());
}

async function measure(adapterName) {
  const manifest = loadAdapterManifest(path.join(REPO, "reference-harness", "adapters", adapterName, "adapter.json"));
  const work = mkdtempSync(path.join(os.tmpdir(), "cpu-ratio-"));
  try {
    cpSync(path.join(FIXTURE, "deck", "deck.sqlite3"), path.join(work, "deck.sqlite3"));
    const db = new DatabaseSync(path.join(work, "deck.sqlite3"));
    db.exec("PRAGMA journal_mode = DELETE");
    db.close();
    cpSync(path.join(FIXTURE, "deck", "files"), path.join(work, "files"), { recursive: true });
    mkdirSync(path.join(work, "adapter"));
    const slash = (p) => p.replaceAll("\\", "/");
    const session = new AdapterSession(manifest, {
      HARNESS_DECK: slash(path.join(work, "deck.sqlite3")),
      HARNESS_FILES: slash(path.join(work, "files")),
      HARNESS_DECK_JSON: slash(path.join(FIXTURE, "deck.json")),
      HARNESS_WORK: slash(path.join(work, "adapter")),
    }, { timeoutMs: 600_000 });
    const hello = await session.start();
    try {
      let failures = 0;
      for (const page of pages) if (!(await session.request(page)).ok) failures++;
      const c0 = treeCpuMs(session.child.pid);
      const w0 = Date.now();
      for (let r = 0; r < ROUNDS; r++) for (const page of pages) await session.request(page);
      const wall = Date.now() - w0;
      const cpu = treeCpuMs(session.child.pid) - c0;
      const renders = ROUNDS * pages.length;
      return {
        adapter: adapterName,
        engine: hello?.engine ?? null,
        renders,
        warmupFailures: failures,
        cpuMsPerPage: Number((cpu / renders).toFixed(2)),
        wallMsPerPage: Number((wall / renders).toFixed(2)),
      };
    } finally {
      await session.close();
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const results = [];
for (const name of ADAPTERS) {
  const r = await measure(name);
  console.log(JSON.stringify(r));
  results.push(r);
}
const ts = results.find((r) => r.adapter === "ts");
const ruby = results.find((r) => r.adapter === "ruby");
const out = {
  measuredAt: new Date().toISOString(),
  platform: `${process.platform} ${process.arch}, node ${process.version}`,
  pages: pages.length,
  rounds: ROUNDS,
  results,
  rubyOverPortCpuRatio: ts && ruby ? Number((ruby.cpuMsPerPage / ts.cpuMsPerPage).toFixed(1)) : null,
};
console.log(JSON.stringify({ rubyOverPortCpuRatio: out.rubyOverPortCpuRatio }));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2) + "\n");
