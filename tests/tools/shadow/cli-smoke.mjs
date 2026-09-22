// cli-smoke.mjs — temporary CLI end-to-end smoke test (not a vitest test).
// Spawns two stub upstreams, runs the router as a subprocess, hits it,
// reads the JSONL log, runs the report, prints both.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeStub(body) {
  return createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(body);
    });
  });
}

const r = makeStub("<html>ruby-cli</html>");
const t = makeStub("<html>ts-cli</html>");
await new Promise((resolve) => r.listen(0, "127.0.0.1", resolve));
await new Promise((resolve) => t.listen(0, "127.0.0.1", resolve));
const rPort = r.address().port;
const tPort = t.address().port;

const tmpDir = mkdtempSync(join(tmpdir(), "shadow-cli-"));
const logPath = join(tmpDir, "log.jsonl");
const policyPath = join(tmpDir, "pol.json");
writeFileSync(
  policyPath,
  JSON.stringify({ mode: "shadow-everything", sampleRate: 100 }),
);

const proc = spawn(process.execPath, ["tools/shadow/shadow-router.mjs"], {
  env: {
    ...process.env,
    RUBY_UPSTREAM: "http://127.0.0.1:" + rPort,
    TS_UPSTREAM: "http://127.0.0.1:" + tPort,
    SHADOW_POLICY: policyPath,
    SHADOW_LOG: logPath,
    SHADOW_PORT: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
proc.stderr.on("data", (d) => (stderr += d.toString()));
await new Promise((r) => setTimeout(r, 200));

const m = stderr.match(/listening on http:\/\/[^:]+:(\d+)/);
if (!m) {
  console.error("No listening line:", stderr);
  process.exit(1);
}
const proxyPort = parseInt(m[1]);
console.log("proxy port:", proxyPort);

const http = await import("node:http");
await new Promise((resolve, reject) => {
  const req = http.request(
    "http://127.0.0.1:" + proxyPort + "/cards/9",
    (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        console.log("proxy status:", res.statusCode);
        console.log("proxy body:", Buffer.concat(chunks).toString());
        resolve();
      });
    },
  );
  req.on("error", reject);
  req.end();
});

await new Promise((r) => setTimeout(r, 100));

proc.kill();
r.close();
t.close();
await new Promise((r) => setTimeout(r, 50));

console.log("--- log ---");
console.log(readFileSync(logPath, "utf8"));
console.log("--- report ---");
const reportProc = spawn(
  process.execPath,
  ["tools/shadow/shadow-report.mjs", logPath],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let reportOut = "";
reportProc.stdout.on("data", (d) => (reportOut += d.toString()));
await new Promise((r) => reportProc.on("exit", r));
console.log(reportOut);
