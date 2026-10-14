// benchmarks/speed/node-host.ts — the port served from Node over HTTP.
//
// The request path of port-handler.ts over a local SQLite file, read through
// the node:sqlite driver of benchmarks/speed-ship (LocalSqliteDriver's
// contract without the native addon). Bundled and started by
// benchmarks/speed/run.mjs; by hand:
//
//   node tmp/speed/node-host.mjs --db <deck.sqlite3> --port 3302 [--hop-ms 10]
//
// Prints one JSON line {"ready":true,...} once listening.

import http from "node:http";
import { NodeSqliteDriver } from "../speed-ship/node-sqlite-driver.js";
import { HopDriver, portHandler } from "./port-handler.js";

const argv = process.argv.slice(2);
const arg = (k: string, d?: string): string | undefined => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};
const dbPath = arg("db");
if (dbPath === undefined) throw new Error("--db is required");
const port = Number(arg("port", "3302"));
const hopMs = Number(arg("hop-ms", "0"));

const handle = portHandler(new HopDriver(new NodeSqliteDriver(dbPath, true), hopMs));

const server = http.createServer(async (req, res) => {
  try {
    const response = await handle(new Request(`http://${req.headers.host ?? "127.0.0.1"}${req.url ?? "/"}`, { method: req.method }));
    const body = Buffer.from(await response.arrayBuffer());
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headers[k] = v;
    });
    headers["content-length"] = String(body.length);
    res.writeHead(response.status, headers);
    res.end(body);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String((e as Error)?.stack ?? e));
  }
});
server.keepAliveTimeout = 60_000;
server.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({ ready: true, port, pid: process.pid, hop_ms: hopMs, server: `node ${process.version}` }));
});
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
