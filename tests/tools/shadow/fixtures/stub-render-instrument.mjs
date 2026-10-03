// stub-render-instrument.mjs — a stand-in for vm-staging-server.mjs used by
// the migration-parity shadow stage's pin tests (the --instrument seam).
//
// Contract it honors (the same surface the real instrument exposes):
//   argv: node stub-render-instrument.mjs <ignored-db-path> <port>
//   GET /_status  -> 200 {"ok":true,...}   (boot health)
//   GET /<name>   -> 200 text/html with $SHADOW_STUB_BODY as the body
//   SIGTERM       -> exits 0 (graceful teardown like the real instrument)
//
// The body comes from the environment so a test can point BASE and
// CANDIDATE at identical or divergent bytes without any engine:
//   SHADOW_STUB_BODY           body served by BOTH sides (clean run)
//   SHADOW_STUB_CANDIDATE_BODY when set, served by the side whose mirror
//                              copy is the candidate copy (path contains
//                              "mirror-candidate) — the divergent run
// Synthetic payloads only — no real card names, no network.

import http from "node:http";

const dbPath = process.argv[2] ?? "(none)";
const port = Number(process.argv[3] ?? 0);
if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  console.error("stub-render-instrument: usage: node stub-render-instrument.mjs <db-path> <port>");
  process.exit(2);
}

const isCandidateCopy = dbPath.includes("mirror-candidate");
const body =
  isCandidateCopy && process.env.SHADOW_STUB_CANDIDATE_BODY !== undefined
    ? process.env.SHADOW_STUB_CANDIDATE_BODY
    : process.env.SHADOW_STUB_BODY ?? "<html>stub</html>";

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/_status") {
    const status = JSON.stringify({
      ok: true,
      instrument: "stub-render-instrument",
      dbPath,
    });
    res.writeHead(200, { "content-type": "application/json" }).end(status);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[stub-render] listening on http://127.0.0.1:${port} (db ${dbPath})`);
});

let shuttingDown = false;
function beginShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", beginShutdown);
process.on("SIGINT", beginShutdown);
