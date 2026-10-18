// Controls for the compare-search-order.mjs CLI's INVOCATION surface — the
// argument-to-probe-list conversion, exercised by spawning the real CLI file
// as a subprocess against two local mock hosts (the proven tool must be
// exactly the tool an operator runs). The pure module logic beneath it is
// controlled in search-order-compare.test.mjs; the against-real-engines proof
// is prove/search-order-two-local-engines-proof.mjs.
//
// Regression anchor (2026-10-18 rehearsal find): the CLI passed its boolean
// --letters/--no-letters flag straight into defaultProbeTerms({letters}), whose
// contract is the letter ARRAY (its default applies only when the key is
// absent), so the plain default invocation died before any probe with
// "TypeError: letters is not iterable" and --no-letters spread `false` the
// same way. Every earlier proof had passed explicit --terms, so the default
// path was never exercised. These two tests pin BOTH invocations: exit 0 and
// the exact expected probe list.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LETTER_PROBES, DEFAULT_PARTIAL_WORDS, DEFAULT_EXACT_NAME } from "../lib/search-order-compare.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const cli = path.join(repo, "reference-harness/live-walk/compare-search-order.mjs");

// A stand-in deck host serving the three shapes the CLI parses: the home
// page's navbar declarations, the autocomplete JSON array (XHR-marked), and
// the results page's search-result-list region. Every probe gets the same
// single card on both hosts, so the walk is order-identical with an empty
// card-set discrepancy and makes no verification requests.
function startMockHost() {
  const home = `<html><body><nav><form role="search" class="search-box-form" action="/*search" method="get">` +
    `<input name="query[keyword]" data-completepath="/*search/search_box_complete.json" /></form></nav></body></html>`;
  const results = `<!DOCTYPE html><html><body><div class="search-result-list">
    <div class="search-result-item item-bar"><div class="card-slot" data-card-name="Topic" data-card-link-name="Topic">
    <a class="full-page-link known-card" href="/Topic">page</a></div></div></div></body></html>`;
  const server = createServer((req, res) => {
    if (req.headers["x-requested-with"] === "XMLHttpRequest") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ url: "/Topic", action: "goto", value: "Topic", label: "Topic" }]));
      return;
    }
    const { pathname } = new URL(req.url, "http://mock.test");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(pathname === "/" ? home : results);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function runCli(cliArgs) {
  const proc = spawn(process.execPath, [cli, ...cliArgs], { cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  proc.stdout.on("data", (b) => { out += b; });
  proc.stderr.on("data", (b) => { out += b; });
  const code = await new Promise((resolve) => proc.once("close", resolve));
  return { code, out };
}

test("default invocation (no --terms) walks the full default probe list: a-z + partial words + exact", async () => {
  const serverA = await startMockHost();
  const serverB = await startMockHost();
  const tmpRoot = mkdtempSync(path.join(tmpdir(), "decko-compare-search-order-default-"));
  try {
    const baseA = `http://127.0.0.1:${serverA.address().port}`;
    const baseB = `http://127.0.0.1:${serverB.address().port}`;
    const reportPath = path.join(tmpRoot, "report.json");
    const { code, out } = await runCli(["--host-a", baseA, "--host-b", baseB, "--out", reportPath]);
    assert.equal(code, 0, `CLI exited ${code}:\n${out}`);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    // The whole point: with no --terms, the walk runs every letter plus the
    // module's default partial words plus the default exact name, in order.
    assert.deepEqual(report.probes.map((p) => p.term),
      [...DEFAULT_LETTER_PROBES, ...DEFAULT_PARTIAL_WORDS, DEFAULT_EXACT_NAME]);
    assert.equal(DEFAULT_LETTER_PROBES.length, 26);
    for (const probe of report.probes) {
      for (const v of Object.values(probe.surfaces)) {
        assert.equal(v.kind, "order-identical", `probe ${JSON.stringify(probe.term)}: ${v.line}`);
      }
    }
  } finally {
    serverA.close();
    serverB.close();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("--no-letters invocation walks the list WITHOUT the letters", async () => {
  const serverA = await startMockHost();
  const serverB = await startMockHost();
  const tmpRoot = mkdtempSync(path.join(tmpdir(), "decko-compare-search-order-noletters-"));
  try {
    const baseA = `http://127.0.0.1:${serverA.address().port}`;
    const baseB = `http://127.0.0.1:${serverB.address().port}`;
    const reportPath = path.join(tmpRoot, "report.json");
    const { code, out } = await runCli(["--host-a", baseA, "--host-b", baseB, "--no-letters", "--out", reportPath]);
    assert.equal(code, 0, `CLI exited ${code}:\n${out}`);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.deepEqual(report.probes.map((p) => p.term), [...DEFAULT_PARTIAL_WORDS, DEFAULT_EXACT_NAME]);
    for (const probe of report.probes) {
      for (const v of Object.values(probe.surfaces)) {
        assert.equal(v.kind, "order-identical", `probe ${JSON.stringify(probe.term)}: ${v.line}`);
      }
    }
  } finally {
    serverA.close();
    serverB.close();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});
