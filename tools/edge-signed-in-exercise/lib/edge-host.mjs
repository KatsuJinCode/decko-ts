// edge-host.mjs — runs the DEPLOYED Bunny edge bundle on Node over HTTPS on
// localhost, so the harness drives the same artifact the deploy uploads.
//
// What runs: deploy/dist/bunny-edge-engine.bundle.js, rebuilt from
// deploy/bunny-worker-src by tools/bundle-bunny-edge-engine.mjs. The bundle
// is loaded as-is from a runtime directory that carries a node_modules
// shim for its one bare import (@bunny.net/edgescript-sdk); node: builtins
// resolve natively. The shim captures the handler the entry registers and
// this host answers node:http requests with it, building the same
// web-standard Request the platform would hand it.
//
// Why HTTPS: the live script is served from https://culturesmith-edge
// .bunny.run, so the deployment's DECKO_SERVED_* asset URLs are https and
// its session cookie carries Secure. Serving the harness over plain http
// would manufacture mixed-content blocks and a cookie-flag difference that
// the live site does not have, so the harness answers https on 127.0.0.1
// with a throwaway self-signed certificate and the browser is told to
// ignore certificate errors for this host only.

import { createServer } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { mkdirSync, copyFileSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from 'node:crypto';
import { oneAtATimeQueue } from './one-at-a-time-queue.mjs';

const SHIM_DIR = "node_modules/@bunny.net/edgescript-sdk";

/** Writes the SDK shim next to a copy of the bundle so the bare import resolves. */
function stageBundle(bundlePath, runtimeDir) {
  mkdirSync(join(runtimeDir, SHIM_DIR), { recursive: true });
  const shimSrc = join(dirname(fileURLToPath(import.meta.url)), "sdk-shim.mjs");
  writeFileSync(
    join(runtimeDir, SHIM_DIR, "package.json"),
    JSON.stringify({ name: "@bunny.net/edgescript-sdk", version: "0.0.0-local", type: "module", main: "index.mjs" }, null, 1),
  );
  writeFileSync(join(runtimeDir, SHIM_DIR, "index.mjs"), `import { captured, net } from ${JSON.stringify(pathToFileURL(shimSrc).href)};\nexport { captured, net };\nexport default { net };\n`);
  const staged = join(runtimeDir, "bunny-edge-engine.bundle.mjs");
  copyFileSync(bundlePath, staged);
  return staged;
}

/** A throwaway self-signed certificate for 127.0.0.1 (the harness origin). */
function ensureCertificate(runtimeDir) {
  const key = join(runtimeDir, "harness-key.pem");
  const cert = join(runtimeDir, "harness-cert.pem");
  if (!existsSync(key) || !existsSync(cert)) {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", key, "-out", cert, "-days", "2",
      "-subj", "/CN=127.0.0.1",
      "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ], { stdio: "ignore", windowsHide: true });
  }
  return { key: readAll(key), cert: readAll(cert) };
}

function readAll(path) {
  return readFileSync(path);
}

/**
 * Boots the bundle behind HTTPS.
 * @param {{ bundlePath: string, expectedBundleSha256?: string, runtimeDir: string, env: Record<string,string>, host?: string, port?: number, onRequest?: (line: string) => void }} opts
 */
export async function startEdgeHost({ bundlePath, expectedBundleSha256, runtimeDir, env, host = "127.0.0.1", port = 0, onRequest }) {
  mkdirSync(runtimeDir, { recursive: true });
  const staged = stageBundle(bundlePath, runtimeDir);
  const sourceBundleSha256 = createHash('sha256').update(readFileSync(staged)).digest('hex');
  if (expectedBundleSha256 && sourceBundleSha256 !== expectedBundleSha256) throw new Error('staged engine artifact SHA-256 mismatch');
  const tls = ensureCertificate(runtimeDir);

  // This is the harness's own Node process. The bundle reads process.env;
  // remove ambient provider credentials as well as refusing live input creds.
  for (const key of Object.keys(process.env)) {
    if (/^(?:DECKO_|BUNNY_|AWS_|S3_)/.test(key) && !(key in env)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  await import(pathToFileURL(staged).href);
  const { captured } = await import(pathToFileURL(join(runtimeDir, SHIM_DIR, "index.mjs")).href);
  if (typeof captured.handler !== "function") {
    throw new Error("edge host: the bundle registered no handler (SDK shim did not capture serve())");
  }
  const handler = captured.handler;

  const origin = `https://${host}:0`;
  const requests = [];
  // The engine's requests are served ONE AT A TIME.
  //
  // WHY. The harness drives many browser contexts into this ONE Node process,
  // and Node runs one request's JavaScript at a time. When two requests
  // overlap, the one that is waiting for the database hands the thread to
  // the other, so the first request's WALL carries the second request's CPU,
  // and the engine's per-isolate db ledger - one monotonic counter the
  // header's db;dur and stmt= are deltas of
  // (deploy/bunny-worker-src/bunny-edge-server-timing.ts:62-71) - counts the
  // other request's round trips inside this request's window.
  //
  // MEASURED, at the tranche-6 tip. 59 of the 3961 requests in one
  // whole-family run carried `db;dur` GREATER than `total;dur`, which is
  // impossible for a single request's own work (the db wall cannot exceed
  // the request's own wall). And the SAME request - the cover-b E21
  // fixture's board_act page - measured total;dur=2012 ms with stmt=1688 in
  // the tranche-5 run and total;dur=9675 ms with stmt=3774 in the tranche-6
  // run: 4.8x, at nearly the same commit, on a page whose own cost did not
  // change. That page decided the "9. timings" verdict in the tranches that
  // failed and did not decide it in the tranche that passed.
  //
  // The engine's own instrument states the contract this restores: "the
  // per-request numbers are exact whenever requests do not overlap driver
  // activity" (bunny-edge-server-timing.ts:66-68). This host is the only
  // place the overlap is created, so this host is where it is removed.
  //
  // WHAT IT COSTS. The engine's total work is unchanged - the tranche-6 run
  // spent 13.9 minutes of engine wall over a 24.1 minute run - but it is
  // serialized instead of overlapped, so the run takes a little longer and
  // every request's measured server time becomes its own. The wait a
  // request spent in the queue is recorded as `queuedMs` beside its own
  // `ms`, so the run record shows both.
  const serveInTurn = oneAtATimeQueue();
  const server = createTlsServer(tls, async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const hostHeader = req.headers.host ?? `127.0.0.1`;
    const url = new URL(req.url ?? "/", `https://${hostHeader}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const arrived = Date.now();
    let started = arrived;
    let response;
    try {
      response = await serveInTurn(() => {
        started = Date.now();
        return handler(
          new Request(url, {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
            redirect: "manual",
          }),
        );
      });
    } catch (error) {
      const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`local edge host: the handler threw\n${message}`);
      const line = { method: req.method, path: url.pathname + url.search, status: 500, ms: Date.now() - started, queuedMs: started - arrived, threw: message };
      requests.push(line);
      onRequest?.(line);
      return;
    }
    const out = Buffer.from(await response.arrayBuffer());
    response.headers.forEach((v, k) => {
      // Set-Cookie must stay one header per cookie: iterating Headers joins
      // repeated values into one comma-joined string, and a browser then keeps
      // only the first pair (the session cookie would be dropped on any
      // response that also sets decko_visit).
      if (k.toLowerCase() === "set-cookie") {
        const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [v];
        res.setHeader("set-cookie", cookies);
        return;
      }
      res.setHeader(k, v);
    });
    res.statusCode = response.status;
    res.end(out);
    const line = {
      method: req.method,
      path: url.pathname + url.search,
      status: response.status,
      ms: Date.now() - started,
      // The wait this request spent behind another request in the host's
      // one-at-a-time queue. It is NOT part of the request's server time
      // (the Server-Timing header measures the handler's own wall) and it is
      // recorded so the run record shows the harness's own queuing.
      queuedMs: started - arrived,
      serverTiming: response.headers.get("server-timing"),
      bytes: out.length,
      // Chromium can discard an AJAX delete body when its redirect navigates.
      // Preserve only this bounded JSON answer, bound to the exact request.
      ...(url.pathname.startsWith('/delete/') &&
        (response.headers.get('content-type') ?? '').includes('application/json') && out.length <= 4096
        ? { deleteResponseBody: out.toString('utf8'), deleteResponseSha256: createHash('sha256').update(out).digest('hex') }
        : {}),
      // The answer to a write, for the run record: what the server actually said.
      bodyHead: req.method === "GET" || req.method === "HEAD" ? undefined : out.toString("utf8").replace(/\s+/g, " ").slice(0, 240),
    };
    requests.push(line);
    onRequest?.(line);
  });

  await new Promise((r) => server.listen(port, host, r));
  const actual = server.address().port;
  const url = `https://${host}:${actual}`;
  return {
    url,
    origin: url,
    sourceBundleSha256,
    requests,
    close: async () => {
      await new Promise((r) => server.close(r));
    },
    cleanup: () => rmSync(runtimeDir, { recursive: true, force: true }),
  };
}
