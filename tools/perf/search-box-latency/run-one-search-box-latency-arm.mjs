// run-one-search-box-latency-arm.mjs — ONE side of the paired A/B, in its own
// PROCESS. Boots a single local stack for one bundle, then answers one request
// per line of stdin and writes one JSON line per term to stdout.
//
// WHY A SEPARATE PROCESS IS NOT OPTIONAL. tools/edge-signed-in-exercise/lib/
// stack.mjs is not reentrant across stacks in one process, and that is a fact
// about the harness, not a style choice:
//
//   - startEdgeHost writes the stack's settings into the SHARED process.env
//     (edge-host.mjs:74-79), so the SECOND startStack overwrites
//     DECKO_DB_URL. The first stack's engine, which reads process.env at
//     request time, then issues every statement at the SECOND stack's
//     database. Measured directly (tmp env probe, this lane):
//     after two boots, process.env.DECKO_DB_URL equals stack2's hrana URL
//     while stack1's own hrana URL is different.
//   - startStack also replaces the shared globalThis.fetch with its loopback
//     transport, and the engine binds fetch at construction.
//
// Consequences for a two-arm comparison in one process: arm 1's ledger stays
// at zero (its statements land in arm 2's ledger), and neither arm is reading
// the database it thinks it is. Any latency number from that setup is
// unsound. One process per arm removes the aliasing completely.
//
// PROTOCOL. stdin: one term per line. stdout: one JSON line per input line
// {term, status, wallMs, items, sqlStmts, sqlMs, body?}. stderr is the
// harness's own logging and is never parsed. The parent writes the next term
// only after reading the previous reply, so the two arms stay interleaved
// rather than racing ahead at different speeds.
//
// Credentials are read from the local creds file and never printed.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, join } from "node:path";
import { Agent, request as httpsRequestRaw } from "node:https";
import { startStack } from "../../edge-signed-in-exercise/lib/stack.mjs";

const REPO = resolve(import.meta.dirname, "../../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const DECK = resolve(arg("deck", join(REPO, "tmp/search-box-latency/deck.sqlite3")));
const CREDS = resolve(arg("creds", join(REPO, "tmp/search-box-latency/creds.json")));
const BUNDLE = resolve(arg("bundle"));
const ACTOR = arg("actor", "admin");
const RUNTIME = join(REPO, "tmp", `search-box-latency-arm-${process.pid}`);
const PATH = "/*search/search_box_complete.json";

const stack = await startStack({
  deckPath: DECK,
  live: { DECKO_LIVE_RENDER: "1" },
  runtimeDir: RUNTIME,
  bundlePath: BUNDLE,
});

const agent = new Agent({ rejectUnauthorized: false, keepAlive: true });
const cookies = new Map();
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");

const request = (method, pathname, { headers, body }) =>
  new Promise((res, rej) => {
    const req = httpsRequestRaw(new URL(`${stack.origin}${pathname}`), { method, headers, agent }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => res(new Response(Buffer.concat(chunks), { status: r.statusCode, headers: r.headers })));
    });
    req.on("error", rej);
    if (body) req.write(body);
    req.end();
  });

if (ACTOR !== "anonymous") {
  const creds = JSON.parse(readFileSync(CREDS, "utf8"));
  const account = creds[ACTOR] ?? creds.admin ?? Object.values(creds)[0];
  const form = new URLSearchParams({
    "card[subcards][+*email][content]": account.email,
    "card[subcards][+*password][content]": account.password,
  }).toString();
  const signed = await request("POST", "/update/*signin", {
    headers: { "content-type": "application/x-www-form-urlencoded", origin: stack.origin },
    body: form,
  });
  for (const raw of signed.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  await signed.text();
  if (!cookies.has("decko_ts_session")) {
    console.error(`arm pid=${process.pid}: sign-in did not set a session cookie`);
    process.exit(2);
  }
}
process.stdout.write(`${JSON.stringify({ ready: true, pid: process.pid })}\n`);

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  const term = line.trim();
  if (term === "" || term === "__quit__") continue;
  const wantBody = term.startsWith("body:");
  const query = wantBody ? term.slice(5) : term;
  const before = { count: stack.hrana.ledger.count, totalMs: stack.hrana.ledger.totalMs };
  const started = performance.now();
  const response = await request("GET", `${PATH}?term=${encodeURIComponent(query)}`, {
    headers: { ...(cookies.size ? { cookie: cookieHeader() } : {}), "x-requested-with": "XMLHttpRequest" },
  });
  const wallMs = performance.now() - started;
  const text = await response.text();
  const body = text.split(stack.origin).join("https://127.0.0.1:ORIGIN");
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  process.stdout.write(
    `${JSON.stringify({
      term: query,
      status: response.status,
      wallMs: Math.round(wallMs),
      items: Array.isArray(parsed) ? parsed.length : null,
      isArray: Array.isArray(parsed),
      bodyBytes: Buffer.byteLength(text),
      sqlStmts: stack.hrana.ledger.count - before.count,
      sqlMs: Math.round(stack.hrana.ledger.totalMs - before.totalMs),
      ...(wantBody ? { body } : {}),
    })}\n`,
  );
}

await stack.close();
stack.cleanup();
