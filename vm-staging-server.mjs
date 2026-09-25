// vm-staging-server.mjs — read-only Node HTTP staging copy of the decko-ts
// engine, served from /opt/decko-staging on Brandon's portal VM
// (170.9.231.182) so the owner can click through real pages in a browser
// while parity work continues. NO write path, NO editing, NO search —
// pure browse.
//
// Routes (the engine-canonical surface, mirrors deploy/worker.ts):
//   GET /                -> render "Home" card, :open view (HTML)
//   GET /_status         -> engine + database health JSON
//   GET /<card-name>     -> render that card, :open view (HTML)
//   GET /<card-name>.json -> the card record as JSON
//   anything else        -> 404 with the engine's unknown-card bytes
//
// Boot:
//   node vm-staging-server.mjs <path-to-corpus.sqlite> [port]
//
// Defaults: port 3100, db path arg required.
//
// Why this shape: the worker entrypoint (deploy/worker.ts) shows the
// canonical request->render call shape against the same engine — this file
// is the Node-port of that surface, plus the 404 path the worker only
// takes via the render()'s thrown Error("card not found: ...").

import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { LocalSqliteDriver } from "./dist/src/server/drivers/local-sqlite.js";
import { FetchEngine } from "./dist/src/card/fetch.js";
import { RenderEngine } from "./dist/src/card/render.js";
import { DeckoName } from "./dist/src/card/name.js";
import { sqliteRegexpUdf } from "./dist/src/cql/sqlite-regexp.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI / boot args
// ---------------------------------------------------------------------------

const dbPath = process.argv[2];
const port = Number.parseInt(process.argv[3] ?? "3100", 10);

if (!dbPath) {
  console.error(
    "usage: node vm-staging-server.mjs <path-to-corpus.sqlite> [port]\n" +
      "  port defaults to 3100 (bind on 127.0.0.1; nginx fronts with basic auth).",
  );
  process.exit(2);
}
if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  console.error(`invalid port: ${process.argv[3]}`);
  process.exit(2);
}

console.log(`[vm-staging] db: ${dbPath}`);
console.log(`[vm-staging] port: ${port}`);

// ---------------------------------------------------------------------------
// Engine boot
// ---------------------------------------------------------------------------

const driver = new LocalSqliteDriver({ path: dbPath, readonly: true });
// CQL match queries compile SQL `field REGEXP ?`; SQLite has no built-in
// REGEXP, so the UDF is registered before the first match query runs
// (registerSqliteRegexpFunction header note: function resolution is at
// statement-prepare time).
driver.registerFunction("regexp", sqliteRegexpUdf, { deterministic: true });

const fetcher = new FetchEngine(driver);
const render = new RenderEngine(fetcher);

// Sync name-environment adapters (mark strings like "~9", ":search_type"
// resolve through engine.peekLexiconId etc., which read warm caches only;
// the worker primes them via primeCqlNameResolver. The Node boot mirrors
// that: load the lexicon, load the codenames, then install).
await primeEngine(fetcher);

const HOME_CARD_NAME = "Home";
const OPEN_VIEW = "open";

async function primeEngine(engine) {
  // 1. Codenames (small, one statement).
  await engine.codenames.ensureLoaded();
  // 2. Lexicon: every live row's id/name/left/right, then a recursive
  //    composition for junction cards. Mirrors deploy/worker.ts
  //    primeCqlNameResolver (the Node-port equivalent — the worker's
  //    version is in TS, the same logic here).
  const { rows } = await driver.query(
    "SELECT id, name, left_id, right_id FROM cards WHERE trash = 0",
    [],
  );
  const byId = new Map();
  const idToName = new Map();
  const keyToId = new Map();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.name !== null && row.name !== "") {
      const name = DeckoName.parse(row.name);
      idToName.set(row.id, name.s);
      keyToId.set(name.key, row.id);
    }
  }
  const composing = new Set();
  const composedName = (id) => {
    const direct = idToName.get(id);
    if (direct !== undefined) return direct;
    if (composing.has(id)) return undefined;
    const row = byId.get(id);
    if (row === undefined || row.left_id === null || row.right_id === null) {
      return undefined;
    }
    composing.add(id);
    try {
      const left = composedName(row.left_id);
      const right = composedName(row.right_id);
      if (left === undefined || right === undefined) return undefined;
      const joined = `${left}${DeckoName.JOINT}${right}`;
      idToName.set(id, joined);
      return joined;
    } finally {
      composing.delete(id);
    }
  };
  for (const row of rows) {
    const name = composedName(row.id);
    if (name !== undefined) keyToId.set(DeckoName.parse(name).key, row.id);
  }
  // 3. Install + warm (the worker's installNameEnvironment + lexicon writes
  //    happen AFTER the codenames load — see worker.ts header).
  fetcher.installNameEnvironment();
  for (const row of rows) {
    if (row.left_id !== null && row.right_id !== null) {
      const joined = composedName(row.id);
      if (joined === undefined) continue;
      fetcher.lexicon.write(row.id, DeckoName.parse(joined), [row.left_id, row.right_id]);
    } else if (row.name !== null && row.name !== "") {
      const name = DeckoName.parse(row.name);
      fetcher.lexicon.write(row.id, name, row.name);
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

function htmlResponse(status, body, title = "decko-ts staging") {
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
      `<body>${body}</body></html>`,
  };
}

function jsonResponse(status, body) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body, null, 2),
  };
}

/** decodeURIComponent that 400s on malformed input instead of throwing.
 *  '+' is DECKO'S JOINT (Card::Name.joint, prototype/lib/cardname.rb) and
 *  must survive into the name — see deploy/worker.ts#decodeName. */
function decodeName(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

async function renderCardPage(cardName) {
  try {
    const view = await render.render(cardName, OPEN_VIEW);
    return {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body:
        `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(cardName)} — decko-ts staging</title></head>` +
        `<body><div class="card-view" data-card="${escapeHtml(cardName)}" data-view="${OPEN_VIEW}">${view}</div>` +
        `<p><a href="/${encodeURIComponent(cardName)}.json">record JSON</a> · <a href="/_status">status</a> · <a href="/">Home</a></p>` +
        `</body></html>`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/^card not found: /.test(message)) {
      return htmlResponse(
        404,
        `<h1>Card not found</h1><pre>${escapeHtml(message)}</pre>` +
          `<p><a href="/">Home</a> · <a href="/_status">status</a></p>`,
        "Card not found",
      );
    }
    return htmlResponse(
      500,
      `<h1>Render error</h1><pre>${escapeHtml(message)}</pre>`,
      "Render error",
    );
  }
}

async function cardRecordJson(cardName) {
  const record = await fetcher.fetchByName(cardName);
  if (record === undefined || record.name === undefined) {
    return jsonResponse(404, { error: "card not found", name: cardName });
  }
  const typeRecord =
    record.typeId !== undefined ? await fetcher.fetchById(record.typeId) : undefined;
  const readable = await render.canReadCard(record, typeRecord?.name?.s);
  if (!readable) {
    return jsonResponse(403, { error: "permission denied", name: cardName });
  }
  return jsonResponse(200, {
    id: record.id ?? null,
    name: record.name.s,
    key: record.name.key ?? null,
    type_id: record.typeId ?? null,
    type_name: typeRecord?.name?.s ?? null,
    codename: record.codename ?? null,
    left_id: record.leftId ?? null,
    right_id: record.rightId ?? null,
    trash: record.trash,
    created_at: record.createdAt ?? null,
    updated_at: record.updatedAt ?? null,
    creator_id: record.creatorId ?? null,
    updater_id: record.updaterId ?? null,
    db_content: record.dbContent ?? null,
  });
}

async function status() {
  try {
    const { rows } = await driver.query("SELECT COUNT(*) AS n FROM cards", []);
    return jsonResponse(200, {
      ok: true,
      engine: "decko-ts",
      runtime: "node-vm-staging",
      view: "open-view, read-only browsing",
      database: { ok: true, driver: "LocalSqliteDriver", card_count: rows[0]?.n ?? 0 },
      deck: { booted_at: new Date().toISOString(), path: dbPath },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(503, {
      ok: false,
      engine: "decko-ts",
      database: { ok: false, error: message },
    });
  }
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  // Normalize: drop one trailing slash (matches worker.ts).
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method !== "GET") {
    const body = jsonResponse(405, { error: "method not allowed" });
    res.writeHead(body.status, body.headers).end(body.body);
    console.log(
      `[vm-staging] ${req.method} ${pathname} -> ${body.status} (${Date.now() - startedAt}ms)`,
    );
    return;
  }

  let response;
  try {
    if (pathname === "/_status") {
      response = await status();
    } else if (pathname === "/") {
      response = await renderCardPage(HOME_CARD_NAME);
    } else if (pathname.endsWith(".json")) {
      const raw = pathname.slice(0, -".json".length).replace(/^\//, "");
      const name = decodeName(raw);
      if (name === undefined || name === "") {
        response = jsonResponse(400, { error: "empty card name" });
      } else {
        response = await cardRecordJson(name);
      }
    } else if (!pathname.slice(1).includes("/")) {
      const name = decodeName(pathname.slice(1));
      if (name === undefined || name === "") {
        response = jsonResponse(400, { error: "empty card name" });
      } else {
        response = await renderCardPage(name);
      }
    } else {
      response = htmlResponse(
        404,
        `<h1>Not found</h1><pre>No route for ${escapeHtml(pathname)} — try /<card-name> or /<card-name>.json</pre>`,
        "Not found",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response = htmlResponse(500, `<h1>Server error</h1><pre>${escapeHtml(message)}</pre>`);
  }

  res.writeHead(response.status, response.headers).end(response.body);
  console.log(
    `[vm-staging] ${req.method} ${pathname} -> ${response.status} (${Date.now() - startedAt}ms)`,
  );
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[vm-staging] listening on http://127.0.0.1:${port}`);
});

// Graceful shutdown for systemd (Type=notify not used — plain SIGTERM
// drains in-flight requests, then closes).
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[vm-staging] ${signal} received, shutting down`);
    server.close(() => {
      driver.close();
      process.exit(0);
    });
    // Hard exit if close hangs (5s).
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
