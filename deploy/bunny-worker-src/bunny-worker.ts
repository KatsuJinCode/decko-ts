// deploy/bunny-worker-src/bunny-worker.ts — Bunny Edge Scripting entry for
// the scrubbed Culturesmith deck stored in Bunny Database.
//
// USAGE:
//   BUNNY_DB_URL=libsql://<id>-<name>.lite.bunnydb.net/
//   BUNNY_DB_TOKEN=<jwt>
//   node tools/bundle-bunny-worker.mjs
//   POST https://api.bunny.net/compute/script/<id>/code   body={Code: <bundle>}
//   POST https://api.bunny.net/compute/script/<id>/publish body={}
//
// MINIMAL SCOPE (NOT THE FULL decko-ts engine):
// - The decko-ts render engine depends on better-sqlite3, node:fs, node:crypto
//   and is several MB minified, so it does NOT fit Bunny's ~1 MB edge bundle
//   limit. This entry implements the engine-canonical route surface but does
//   the card fetch + a structured JSON/HTML record response directly. The full
//   HTML render (RenderEngine) is a future step (would require either a
//   tree-shaken subset or a port to Deno-compatible APIs). See
//   docs/bunny-driver-and-edge-entry-report.md for what this entry does and
//   does not cover.
//
// ROUTES:
//   GET  /              -> render the "Home" card (minimal HTML record view)
//   GET  /_status        -> { ok, runtime, db_ok, cards_n, version }
//   GET  /<card-name>    -> minimal HTML record view of that card (200/404)
//   GET  /<card-name>.json -> the card record as JSON
//   anything else        -> 404
//
// Driver: @libsql/client/web. Bunny's runtime uses workerd/Deno; for the
// workstation-side esbuild bundle we import the npm package directly. The
// generated bundle is uploaded as the Edge Script code, and at runtime Bunny
// re-resolves any remaining imports against its CDN/npm caches. For our
// minimal entry there are no other runtime imports, so the bundle is self-
// contained.

import { createClient } from "@libsql/client/web";

interface Env {
  BUNNY_DB_URL: string;
  BUNNY_DB_TOKEN: string;
}

interface CardRecord {
  id: number;
  name: string | null;
  key: string | null;
  codename: string | null;
  type_id: number | null;
  left_id: number | null;
  right_id: number | null;
  db_content: string | null;
  trash: number;
  created_at: string;
  updated_at: string;
}

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function htmlResponse(status: number, body: string, title = "decko-ts on Bunny Edge"): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
      `<body>${body}</body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeName(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

const HOME_NAME = "Home";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method !== "GET") {
      return jsonResponse(405, { error: "method not allowed" });
    }

    try {
      if (!env.BUNNY_DB_URL || !env.BUNNY_DB_TOKEN) {
        return jsonResponse(500, {
          error: "BUNNY_DB_URL or BUNNY_DB_TOKEN missing from env",
        });
      }
      const db = createClient({ url: env.BUNNY_DB_URL, authToken: env.BUNNY_DB_TOKEN });

      if (pathname === "/_status") {
        return await status(db);
      }

      const cardName =
        pathname === "/" ? HOME_NAME :
        pathname.endsWith(".json") ? null :
        decodeName(pathname.slice(1));

      if (pathname === "/") {
        return await renderCardPage(db, HOME_NAME);
      }
      if (pathname.endsWith(".json")) {
        const raw = pathname.slice(0, -".json".length).replace(/^\//, "");
        const name = decodeName(raw);
        if (name === undefined || name === "") {
          return jsonResponse(400, { error: "empty card name" });
        }
        return await cardRecordJson(db, name);
      }
      if (cardName !== null) {
        if (cardName === undefined || cardName === "") {
          return jsonResponse(400, { error: "empty card name" });
        }
        return await renderCardPage(db, cardName);
      }
      return htmlResponse(
        404,
        `<h1>Not found</h1><pre>No route for ${escapeHtml(pathname)} — try /<card-name> or /<card-name>.json</pre>`,
        "Not found",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse(500, { error: "server error", message });
    }
  },
};

async function status(db: ReturnType<typeof createClient>): Promise<Response> {
  try {
    const r = await db.execute("SELECT COUNT(*) AS n FROM cards WHERE trash = 0");
    const n = Number((r.rows[0] as { n: number | string }).n);
    return jsonResponse(200, {
      ok: true,
      engine: "decko-ts",
      runtime: "bunny-edge-scripting",
      view: "minimal record view (engine subset)",
      database: { ok: true, driver: "@libsql/client/web", card_count: n },
      version: "1.0.0",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(503, { ok: false, database: { ok: false, error: message } });
  }
}

async function fetchCardByName(db: ReturnType<typeof createClient>, name: string): Promise<CardRecord | null> {
  const r = await db.execute({
    sql: "SELECT id, name, key, codename, type_id, left_id, right_id, db_content, trash, created_at, updated_at FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
    args: [name],
  });
  if (r.rows.length === 0) return null;
  return r.rows[0] as unknown as CardRecord;
}

async function cardRecordJson(db: ReturnType<typeof createClient>, name: string): Promise<Response> {
  const rec = await fetchCardByName(db, name);
  if (rec === null) {
    return jsonResponse(404, { error: "card not found", name });
  }
  return jsonResponse(200, {
    id: rec.id,
    name: rec.name,
    key: rec.key,
    type_id: rec.type_id,
    codename: rec.codename,
    left_id: rec.left_id,
    right_id: rec.right_id,
    trash: rec.trash,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    db_content: rec.db_content,
  });
}

async function renderCardPage(db: ReturnType<typeof createClient>, name: string): Promise<Response> {
  const rec = await fetchCardByName(db, name);
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
    (rec.codename ? ` · <strong>codename:</strong> ${escapeHtml(rec.codename)}` : "") +
    `</p>` +
    `<h2>db_content</h2>` +
    `<pre>${escapeHtml(rec.db_content ?? "(empty)")}</pre>` +
    `<p><a href="/${encodeURIComponent(name)}.json">record JSON</a> · <a href="/_status">status</a> · <a href="/">Home</a></p>` +
    `</div>`;
  return htmlResponse(200, body, name);
}