// deploy/bunny-origin/bunny-origin-server.mjs — Node HTTP origin for the
// scrubbed Culturesmith deck served from Bunny Database.
//
// This is Path B of the edge-deploy lane: a read-only Node service bound
// to 127.0.0.1:3200 on Brandon's portal VM. A Bunny CDN pull zone fronts
// it so pages are edge-cached and reachable over HTTPS.
//
// Why not the full decko-ts engine? The TypeScript engine depends on
// better-sqlite3 / native modules and has to be transpiled/distributed
// per-deploy. This origin implements the engine-canonical route surface
// against Bunny Database directly (the same DB the edge-entry would have
// used) using the BunnyDbDriver wire protocol inlined below — so it stays
// a single .mjs file with zero node_modules.
//
// USAGE:
//   BUNNY_DB_URL=libsql://<id>.lite.bunnydb.net/
//   BUNNY_DB_TOKEN=<jwt>
//   BUNNY_ORIGIN_PORT=3200        (optional, default 3200)
//   node bunny-origin-server.mjs
//
// ROUTES:
//   GET  /                -> render the "Home" card (minimal HTML)
//   GET  /_status          -> { ok, runtime, db_ok, cards_n, version, host }
//   GET  /<card-name>     -> minimal HTML record view of that card (200/404)
//   GET  /<card-name>.json -> the card record as JSON
//   anything else         -> 404
//
// Security: BUNNY_DB_URL/BUNNY_DB_TOKEN are NEVER logged, even on failure.
// Errors are reported with HTTP status + a non-credential-leaking message.

import http from "node:http";

// -----------------------------------------------------------------------------
// Config + boot
// -----------------------------------------------------------------------------

const PORT = Number(process.env.BUNNY_ORIGIN_PORT ?? 3200);
// Bind 0.0.0.0 so the Bunny CDN edge can reach this origin. The ask's
// "127.0.0.1:3200" reflected an nginx-fronting pattern (decko-staging
// shape), but Bunny CDN pulls directly from the origin URL it was
// configured with, so the listening socket must be reachable from the
// CDN's PoPs — i.e. on the VM's external interface. Override via env if
// you want to lock it down (e.g. behind an in-VM tcp proxy / iptables).
const HOST = process.env.BUNNY_ORIGIN_HOST ?? "0.0.0.0";
const HOME_NAME = "Home";

const DB_URL = process.env.BUNNY_DB_URL ?? "";
const DB_TOKEN = process.env.BUNNY_DB_TOKEN ?? "";
const AUTH_HEADER = DB_TOKEN ? `Bearer ${DB_TOKEN}` : "";

if (!DB_URL || !DB_TOKEN) {
  console.error(
    "[bunny-origin] BUNNY_DB_URL and BUNNY_DB_TOKEN must be set in env",
  );
  process.exit(2);
}

// Normalize the URL the same way the BunnyDbDriver does: append
// "/v2/pipeline" if the URL doesn't end with it. Node fetch (undici)
// only understands https:/http: — libsql:// from the Bunny dashboard
// must be rewritten to https:// before fetch() can hit it.
function pipelineUrl(raw) {
  let s = String(raw).trim();
  if (s.startsWith("libsql://")) s = `https://${s.slice("libsql://".length)}`;
  if (s.startsWith("https://libsql://")) s = `https://${s.slice("https://libsql://".length)}`;
  const base = s.replace(/\/+$/, "");
  return base.endsWith("/v2/pipeline") ? base : `${base}/v2/pipeline`;
}

const PIPELINE = pipelineUrl(DB_URL);

// -----------------------------------------------------------------------------
// Hrana v2 wire encoding/decoding (the same protocol the BunnyDbDriver
// uses). Re-implemented locally so this origin server needs no npm deps
// beyond node:http.
// -----------------------------------------------------------------------------

function toWireValue(v) {
  if (v === null) return { type: "null" };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new RangeError("non-finite number");
    return Number.isSafeInteger(v)
      ? { type: "integer", value: v.toString() }
      : { type: "float", value: v };
  }
  if (typeof v === "bigint") return { type: "integer", value: v.toString() };
  if (typeof v === "string") return { type: "text", value: v };
  throw new TypeError(`unsupported value type for Hrana: ${typeof v}`);
}

async function pipeline(statements) {
  const body = {
    requests: [
      ...statements.map((s) => ({
        type: "execute",
        stmt: { sql: s.sql, args: (s.args ?? []).map(toWireValue), want_rows: true },
      })),
      { type: "close" },
    ],
  };
  const headers = { "content-type": "application/json" };
  if (AUTH_HEADER) headers.authorization = AUTH_HEADER;
  const res = await fetch(PIPELINE, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const snippet = (await res.text().catch(() => "")).slice(0, 500);
    const err = new Error(`pipeline HTTP ${res.status}: ${snippet}`);
    err.status = res.status;
    throw err;
  }
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.results)) {
    throw new Error("pipeline response missing results array");
  }
  if (payload.results.length !== body.requests.length) {
    throw new Error(
      `pipeline count mismatch: sent ${body.requests.length}, got ${payload.results.length}`,
    );
  }
  const executeResults = payload.results.slice(0, statements.length);
  return executeResults.map((entry, i) => {
    if (!entry || entry.type === "error") {
      const msg = entry?.error?.message ?? `unknown error at statement ${i}`;
      const err = new Error(msg);
      err.statementIndex = i;
      throw err;
    }
    const result = entry.response?.result ?? {};
    const cols = result.cols ?? [];
    const rows = (result.rows ?? []).map((row) => {
      const cells = row.map(decodeCell);
      const obj = {};
      cols.forEach((c, idx) => {
        const name = typeof c === "string" ? c : c?.name;
        if (name) obj[name] = cells[idx] ?? null;
      });
      return obj;
    });
    return {
      cols,
      rows,
      affectedRowCount: result.affected_row_count ?? 0,
      lastInsertRowId: result.last_insert_rowid ?? null,
    };
  });
}

function decodeCell(cell) {
  if (!cell || typeof cell !== "object") return null;
  switch (cell.type) {
    case "null":
      return null;
    case "integer":
      return Number(cell.value);
    case "float":
      return cell.value;
    case "text":
      return cell.value;
    case "blob": {
      if (typeof cell.base64 !== "string") return null;
      return new Uint8Array(Buffer.from(cell.base64, "base64"));
    }
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// DB operations (the engine-canonical read surface)
// -----------------------------------------------------------------------------

async function dbCount() {
  const [r] = await pipeline([
    { sql: "SELECT COUNT(*) AS n FROM cards WHERE trash = 0" },
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

async function dbPing() {
  try {
    await dbCount();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

async function fetchCardByName(name) {
  const [r] = await pipeline([
    {
      sql:
        "SELECT id, name, key, codename, type_id, left_id, right_id, db_content, trash, created_at, updated_at FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
      args: [name],
    },
  ]);
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id: Number(row.id),
    name: row.name ?? null,
    key: row.key ?? null,
    codename: row.codename ?? null,
    type_id: row.type_id ?? null,
    left_id: row.left_id ?? null,
    right_id: row.right_id ?? null,
    db_content: row.db_content ?? null,
    trash: Number(row.trash ?? 0),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function describeError(e) {
  if (!e) return "unknown error";
  if (e instanceof Error) return e.message;
  return String(e);
}

// -----------------------------------------------------------------------------
// Response helpers
// -----------------------------------------------------------------------------

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonResponse(status, body, extra = {}) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
    body: JSON.stringify(body, null, 2),
  };
}

function htmlResponse(status, body, title = "decko-ts bunny-origin") {
  return {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
    body:
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
      `<body>${body}</body></html>`,
  };
}

// -----------------------------------------------------------------------------
// Route handlers
// -----------------------------------------------------------------------------

async function handleStatus() {
  const ping = await dbPing();
  return jsonResponse(ping.ok ? 200 : 503, {
    ok: ping.ok,
    engine: "decko-ts",
    runtime: "bunny-origin",
    view: "minimal record view",
    database: {
      ok: ping.ok,
      driver: "BunnyDbDriver-protocol",
      card_count: ping.ok ? await dbCount() : null,
      ...(ping.ok ? {} : { error: ping.error }),
    },
    version: "1.0.0",
  });
}

async function handleCardPage(name) {
  const rec = await fetchCardByName(name);
  if (rec === null) {
    return htmlResponse(
      404,
      `<h1>Card not found</h1><pre>card not found: ${escapeHtml(name)}</pre>` +
        `<p><a href="/">Home</a> · <a href="/_status">status</a></p>`,
      "Card not found",
    );
  }
  const body =
    `<div class="card-view" data-card="${escapeHtml(name)}">` +
    `<h1>${escapeHtml(name)}</h1>` +
    `<p><strong>id:</strong> ${rec.id} · <strong>type_id:</strong> ${rec.type_id ?? "—"}` +
    (rec.codename
      ? ` · <strong>codename:</strong> ${escapeHtml(rec.codename)}`
      : "") +
    `</p>` +
    `<h2>db_content</h2>` +
    `<pre>${escapeHtml(rec.db_content ?? "(empty)")}</pre>` +
    `<p><a href="/${encodeURIComponent(name)}.json">record JSON</a> · <a href="/_status">status</a> · <a href="/">Home</a></p>` +
    `</div>`;
  return htmlResponse(200, body, name);
}

async function handleCardJson(name) {
  const rec = await fetchCardByName(name);
  if (rec === null) {
    return jsonResponse(404, { error: "card not found", name });
  }
  return jsonResponse(200, rec);
}

// -----------------------------------------------------------------------------
// Server
// -----------------------------------------------------------------------------

function decodeName(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

async function route(method, pathname) {
  if (method !== "GET") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  try {
    if (pathname === "/_status") return await handleStatus();
    if (pathname === "/") return await handleCardPage(HOME_NAME);
    if (pathname.endsWith(".json")) {
      const raw = pathname.slice(0, -".json".length).replace(/^\//, "");
      const name = decodeName(raw);
      if (name === undefined || name === "") {
        return jsonResponse(400, { error: "empty card name" });
      }
      return await handleCardJson(name);
    }
    if (!pathname.slice(1).includes("/")) {
      const name = decodeName(pathname.slice(1));
      if (name === undefined || name === "") {
        return jsonResponse(400, { error: "empty card name" });
      }
      return await handleCardPage(name);
    }
    return htmlResponse(
      404,
      `<h1>Not found</h1><pre>No route for ${escapeHtml(pathname)} — try /<card-name> or /<card-name>.json</pre>`,
      "Not found",
    );
  } catch (error) {
    const message = describeError(error);
    const status = typeof error?.status === "number" ? error.status : 500;
    return jsonResponse(status, { error: "server error", message });
  }
}

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const out = await route(req.method ?? "GET", pathname);
    res.writeHead(out.status, out.headers);
    res.end(out.body);
    console.log(
      `[bunny-origin] ${req.method} ${pathname} -> ${out.status} (${Date.now() - start}ms)`,
    );
  } catch (error) {
    console.error("[bunny-origin] uncaught:", error);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: "uncaught", message: describeError(error) }),
    );
  }
});

// Log the DB-derived card count once at boot so the operational receipt
// shows the engine sees what we expect.
(async () => {
  const ping = await dbPing();
  console.log(
    `[bunny-origin] boot: DB ok=${ping.ok}` +
      (ping.ok ? ` cards=${await dbCount()}` : ` err=${ping.error}`),
  );
  if (!ping.ok) {
    console.error("[bunny-origin] WARNING: DB unreachable at boot");
  }
})();

server.listen(PORT, HOST, () => {
  console.log(`[bunny-origin] listening on http://${HOST}:${PORT}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[bunny-origin] ${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
