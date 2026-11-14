// isolated-write-upstream.mjs: the write target for the shadow router's
// isolated-write mode.
//
// The shadow router never replays a write against the TypeScript upstream
// that serves reads, because that upstream shares the primary deck: a write
// would run twice. In isolated-write mode it replays writes here instead.
// This server:
//   1. snapshots the primary SQLite deck into a scratch directory
//      (VACUUM INTO over a read-only connection, so the primary is never
//      opened for writing) and serves writes against the snapshot only;
//   2. turns external effects off: the engine's mail transport drops every
//      message, uploads go to the scratch directory, recaptcha is not
//      configured, and fetch() is blocked for the life of the server;
//   3. answers GET /_shadow/isolation with a declaration the router checks
//      before it sends the first write;
//   4. deletes the scratch directory when it closes.
//
// Library: startIsolatedWriteUpstream({ primaryDbPath, createHandler, port })
//   createHandler({ dbPath, filesDir }) -> { handle(req), close() }, where
//   handle takes and returns the write-routes request/response shapes
//   (src/server/shadow-isolated-write-handler.ts provides the engine's).
//
// CLI (bundles the engine's handler with esbuild into the scratch directory):
//   node tools/shadow/isolated-write-upstream.mjs --primary <deck.sqlite3> [--port 0]

import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

export const ISOLATION_PATH = "/_shadow/isolation";

/** Copy the primary deck with VACUUM INTO over a read-only connection. */
export function snapshotDeck(primaryDbPath, copyPath) {
  const db = new DatabaseSync(primaryDbPath, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${copyPath.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

function blockNetwork() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    throw new Error(`external effects are off in the isolated shadow upstream: refused fetch ${url}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function startIsolatedWriteUpstream({ primaryDbPath, createHandler, port = 0, host = "127.0.0.1" }) {
  if (!existsSync(primaryDbPath)) throw new Error(`primary deck not found: ${primaryDbPath}`);
  const workDir = mkdtempSync(join(tmpdir(), "decko-shadow-isolated-"));
  const copyPath = join(workDir, "deck.sqlite3");
  const filesDir = join(workDir, "files");
  let restoreNetwork = () => {};
  let handler;
  let server;
  try {
    if (realpathSync(dirname(resolve(primaryDbPath))) === realpathSync(workDir)) {
      throw new Error("the snapshot directory must differ from the primary deck's");
    }
    snapshotDeck(primaryDbPath, copyPath);
    mkdirSync(filesDir, { recursive: true });
    restoreNetwork = blockNetwork();
    handler = await createHandler({ dbPath: copyPath, filesDir });
    let writes = 0;
    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://isolated.invalid");
        if (req.method === "GET" && url.pathname === ISOLATION_PATH) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              isolated: true,
              database: "copy",
              externalEffects: "off",
              mail: "dropped",
              uploads: "scratch directory",
              network: "blocked",
              writes,
            }),
          );
          return;
        }
        const bodyBytes = await readBody(req);
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
        const method = (req.method ?? "GET").toUpperCase();
        const result = await handler.handle({
          method,
          pathname: url.pathname.replace(/\/+$/, "") || "/",
          search: url.search,
          host: headers.host,
          headers,
          body: bodyBytes.toString("utf8"),
          bodyBytes: new Uint8Array(bodyBytes),
        });
        if (result === null) {
          res.writeHead(405, { "content-type": "text/plain" });
          res.end("not a write route");
          return;
        }
        writes += 1;
        res.writeHead(result.status, result.headers);
        res.end(result.body);
      } catch (err) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(`isolated upstream error: ${err?.message ?? err}`);
      }
    });
    await new Promise((ok) => server.listen(port, host, ok));
  } catch (err) {
    restoreNetwork();
    try {
      handler?.close();
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
    throw err;
  }
  const addr = server.address();
  return {
    url: `http://${addr.address}:${addr.port}`,
    copyPath,
    async close() {
      try {
        await new Promise((ok) => server.close(() => ok()));
      } finally {
        restoreNetwork();
        try {
          handler.close();
        } finally {
          rmSync(workDir, { recursive: true, force: true });
        }
      }
    },
  };
}

// ===========================================================================
// CLI
// ===========================================================================

async function bundledEngineHandler(scratch) {
  const { build } = await import("esbuild");
  const { builtinModules } = await import("node:module");
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, "..", "..");
  const outfile = join(scratch, "isolated-write-handler.mjs");
  await build({
    entryPoints: [join(repo, "src/server/shadow-isolated-write-handler.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    external: [...builtinModules, ...builtinModules.map((n) => `node:${n}`), "better-sqlite3", "sass", "coffeescript"],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: "warning",
  });
  return (await import(pathToFileURL(outfile).href)).createIsolatedWriteHandler;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
  };
  const primary = arg("primary");
  if (!primary) {
    process.stderr.write("usage: isolated-write-upstream.mjs --primary <deck.sqlite3> [--port 0]\n");
    process.exit(2);
  }
  const scratch = mkdtempSync(join(tmpdir(), "decko-shadow-handler-"));
  let upstream;
  const stop = async () => {
    try {
      await upstream?.close();
    } finally {
      rmSync(scratch, { recursive: true, force: true });
      process.exit(0);
    }
  };
  try {
    const createHandler = await bundledEngineHandler(scratch);
    upstream = await startIsolatedWriteUpstream({ primaryDbPath: primary, createHandler, port: Number(arg("port", "0")) });
  } catch (err) {
    rmSync(scratch, { recursive: true, force: true });
    throw err;
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stderr.write(`isolated-write-upstream: serving writes against a copy of ${primary} at ${upstream.url}\n`);
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
