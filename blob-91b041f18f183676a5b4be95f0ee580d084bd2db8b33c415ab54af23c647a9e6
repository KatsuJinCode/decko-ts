// measure-asset-http-delivery.mjs — the WIRE measurement of every static asset
// the edge serves: real HTTP requests against the real route functions, timed,
// with the body counted as it arrives.
//
// WHAT THIS MEASURES, AND WHY IT IS NOT THE STATIC CENSUS
// (measure-vendored-asset-bytes.mjs answers "how big is this file"; this
// answers "what does a client actually download, and how much of it does it
// download twice"). Per asset:
//
//   COLD       — first GET, no conditional headers. Status, wall ms, and the
//                body bytes that actually arrived.
//   WARM       — second GET carrying the response's own ETag in If-None-Match,
//                which is what a client sends when it revalidates. Status, wall
//                ms, body bytes. A 304 moves 0 body bytes; a 200 re-sends the
//                whole file, and the difference is the waste this names.
//   GZIP/BROTLI — the same body compressed, reported beside the response's own
//                Content-Length. A route that sets no Content-Encoding hands
//                the client the decoded bytes, so this column is what a
//                compressing CDN would have saved.
//
// THE ROUTES ARE THE REAL ONES. serveFontAwesomeAsset and
// serveBootstrapFontAsset are imported straight out of src/server/, and
// /files is served through handleAttachmentRoute over the real
// BlobAttachmentStore. The headers measured here are the headers the edge
// emits; nothing about the responses is synthesized.
//
// FIXTURE SHAPES, each taken from the code that produces it:
//   - a compiled stylesheet is a HISTORYLESS asset output: its revision is a
//     timestamp, not a card_actions id (src/server/file-routes.ts:179-183),
//     so its db_content names its own revision and the route serves it from
//     the current-identifier branch (file-routes.ts:186-187).
//   - the served URL derives the NUMERIC action id from db_content
//     (src/card/render/views.ts:2655-2659) and the store keys the blob the
//     same way (src/card/attachments/attachment-store.ts:198-211), so the
//     fixture's blob keys are "<card id>/<action id><ext>", unpadded.
//   - image renditions are stored under "<action id>-<variant><ext>".
//
// Usage:
//   node --experimental-strip-types --import ./tools/perf/asset-bytes/register-ts-resolver.mjs \
//        tools/perf/asset-bytes/measure-asset-http-delivery.mjs [--json <out.json>]
import { createServer } from "node:http";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const JSON_OUT = arg("json") ? resolve(arg("json")) : null;

const { serveFontAwesomeAsset } = await import(new URL("../../../src/server/font-awesome-assets.js", import.meta.url).href);
const { serveBootstrapFontAsset } = await import(new URL("../../../src/server/bootstrap-font-assets.js", import.meta.url).href);
const { handleAttachmentRoute } = await import(new URL("../../../src/server/file-routes.js", import.meta.url).href);
const { BlobAttachmentStore } = await import(new URL("../../../src/card/attachments/attachment-store.js", import.meta.url).href);

// ---------------------------------------------------------------------------
// The /files side: a deck with two compiled stylesheets and one image, over an
// in-memory BlobDriver and the real BlobAttachmentStore.
// ---------------------------------------------------------------------------
/** A BlobDriver over a Map. getBytes returns undefined on a miss, the contract
 *  src/blob/driver.ts:103 declares and src/blob/r2.ts:38-41 documents. */
function memoryBlobDriver(store) {
  return {
    async getBytes(key) {
      const hit = store.get(key);
      return hit === undefined ? undefined : new Uint8Array(hit);
    },
    async put(key, bytes) {
      store.set(key, bytes);
      return { key, bytes: bytes.length };
    },
    async head(key) {
      const hit = store.get(key);
      return hit === undefined ? undefined : { key, size: hit.length };
    },
    async delete(key) {
      store.delete(key);
    },
    async list(prefix) {
      return [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, size: store.get(key).length }));
    },
  };
}

// Representative real bytes rather than synthetic filler, because the
// compression ratio IS the measurement. SMALL_CSS is one Bootstrap 5 rule block
// in its compiled form.
//
// LARGE_CSS stands in for a deck-scale compiled stylesheet: a real Bootstrap
// build is a LONG run of DISTINCT rules (one per component and utility class),
// not one rule repeated. Repeating a single identical rule would compress
// almost to nothing and report a ratio no real deck stylesheet achieves, so
// the fixture is built from distinct rules with distinct declarations and
// distinct lengths — the shape a minifier actually emits, and the shape a real
// deck's gzip ratio is measured against.
const SMALL_CSS = Buffer.from(
  ".btn{display:inline-block;font-weight:400;line-height:1.5;text-align:center;vertical-align:middle;cursor:pointer;-webkit-user-select:none;-moz-user-select:none;user-select:none;border:1px solid transparent;padding:.375rem .75rem;font-size:1rem;line-height:1.5;border-radius:.25rem;transition:color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out}@media (prefers-reduced-motion:reduce){.btn{transition:none}}\n",
  "utf8",
);
/** One distinct compiled rule whose selector and declarations vary with `i`, so
 *  the repeated run carries real redundancy (shared property NAMES, the CSS
 *  grammar's biggest source of gzip gain) without being byte-identical. */
function deckRule(i) {
  const props = [
    `padding:${(0.125 * (1 + (i % 8))).toFixed(3)}rem ${(0.25 * (1 + (i % 6))).toFixed(3)}rem`,
    `margin-bottom:${(0.125 * (1 + (i % 5))).toFixed(3)}rem`,
    `font-weight:${[300, 400, 500, 600, 700][i % 5]}`,
    `color:#${(i * 2654435761 % 0xffffff).toString(16).padStart(6, "0")}`,
    `background-color:rgba(${i % 256},${(i * 7) % 256},${(i * 13) % 256},.${(i % 9) + 1})`,
    `border-radius:${(0.125 * (1 + (i % 4))).toFixed(3)}rem`,
    `line-height:${(1 + (i % 5) * 0.1).toFixed(1)}`,
    `letter-spacing:${((i % 4) * 0.01).toFixed(2)}em`,
  ].slice(0, 3 + (i % 6));
  return `.deck-component-${i.toString(36)},.deck-utility-${i.toString(36)}{${props.join(";")}}\n`;
}
const LARGE_CSS = Buffer.from(
  Array.from({ length: 2600 }, (_, i) => deckRule(i)).join(""),
  "utf8",
);
const PNG_4x4 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR4nGP8//8/AzZgYmJiYmH//8/AzZgYGBgYPjPwMDAwM/xkYGBgYGBgYGBgYGBgYGBgYBABHgP9nJ+ZswAAAABJRU5ErkJggg==",
  "base64",
);

const blobs = new Map();
blobs.set("45514/1759300000.css", new Uint8Array(SMALL_CSS));
blobs.set("45515/1759400000.css", new Uint8Array(LARGE_CSS));
blobs.set("103/3649-small.png", new Uint8Array(PNG_4x4));

const attachmentStore = new BlobAttachmentStore(memoryBlobDriver(blobs));

/** Card 45514 is the deck's `*all+*style+*asset output` file card (the same id
 *  head-views.ts:203-207 cites); 45515 is a second deck's compiled stylesheet,
 *  measured at deck scale; 103 is an image card. */
const cards = new Map([
  [45514, { id: 45514, name: "*all+*style+*asset output", key: "all_style_asset_output", type_id: 2, db_content: "~45514/1759300000.css", codename: null }],
  [45515, { id: 45515, name: "*all+*style+*asset output", key: "all_style_asset_output2", type_id: 2, db_content: "~45515/1759400000.css", codename: null }],
  [103, { id: 103, name: "Logo", key: "logo", type_id: 3, db_content: "~103/3649.png", codename: null }],
]);

const driver = {
  async query(sql, params) {
    if (/FROM cards WHERE id/.test(sql)) {
      const row = cards.get(Number(params[0]));
      return { rows: row === undefined ? [] : [row] };
    }
    if (/FROM cards WHERE codename/.test(sql)) return { rows: [] };
    if (/FROM cards WHERE name/.test(sql)) {
      const row = [...cards.values()].find((c) => c.name === params[0]);
      return { rows: row === undefined ? [] : [row] };
    }
    if (/card_actions/.test(sql)) return { rows: [] };
    if (/card_changes/.test(sql)) return { rows: [] };
    return { rows: [] };
  },
};

const fileDeps = {
  driver,
  fetchEngine: {
    async fetchByName(name) {
      const row = [...cards.values()].find((c) => c.name === name);
      return row === undefined ? undefined : { id: row.id, name: { s: row.name }, key: row.key, typeId: row.type_id, dbContent: row.db_content, codename: row.codename };
    },
  },
  attachmentStore,
  createEngine() {
    throw new Error("not reached on the read path");
  },
};

// ---------------------------------------------------------------------------
// The asset set a deck page actually asks for.
// ---------------------------------------------------------------------------
const FA_PREFIX = "/mod/bootstrap/fontawesome-6.7.2/";
const ASSETS = [
  { key: "fontawesome css", route: "fontawesome", path: `${FA_PREFIX}css/all.min.css` },
  { key: "fontawesome solid woff2", route: "fontawesome", path: `${FA_PREFIX}webfonts/fa-solid-900.woff2` },
  { key: "fontawesome solid ttf", route: "fontawesome", path: `${FA_PREFIX}webfonts/fa-solid-900.ttf` },
  { key: "fontawesome brands woff2", route: "fontawesome", path: `${FA_PREFIX}webfonts/fa-brands-400.woff2` },
  { key: "fontawesome brands ttf", route: "fontawesome", path: `${FA_PREFIX}webfonts/fa-brands-400.ttf` },
  { key: "fontawesome regular woff2", route: "fontawesome", path: `${FA_PREFIX}webfonts/fa-regular-400.woff2` },
  { key: "fontawesome regular ttf", route: "fontawesome", path: `${FA_PREFIX}webfonts/fa-regular-400.ttf` },
  { key: "fontawesome v4compat woff2", route: "fontawesome", path: `${FA_PREFIX}webfonts/fa-v4compatibility.woff2` },
  { key: "fontawesome v4compat ttf", route: "fontawesome", path: `${FA_PREFIX}webfonts/fa-v4compatibility.ttf` },
  { key: "bootstrap icons woff2", route: "bootstrap", path: "/mod/bootstrap/fonts/bootstrap-icons.woff2" },
  { key: "bootstrap icons woff", route: "bootstrap", path: "/mod/bootstrap/fonts/bootstrap-icons.woff" },
  { key: "deck stylesheet (small)", route: "files", path: "/files/~45514/1759300000.css" },
  { key: "deck stylesheet (deck scale)", route: "files", path: "/files/~45515/1759400000.css" },
  { key: "deck image rendition", route: "files", path: "/files/~103/3649-small.png" },
];

async function routeFor(asset, url, headers) {
  const request = new Request(url, { method: headers.has("if-none-match") ? "GET" : "GET", headers });
  if (asset.route === "fontawesome") return serveFontAwesomeAsset(request);
  if (asset.route === "bootstrap") return serveBootstrapFontAsset(request);
  return (await handleAttachmentRoute(request, fileDeps)) ?? new Response(null, { status: 404 });
}

// A real HTTP server in front of the real route functions, so the numbers are
// wire numbers and not direct function returns.
const server = createServer(async (req, res) => {
  const asset = ASSETS.find((a) => a.path === req.url);
  if (asset === undefined) {
    res.writeHead(404).end();
    return;
  }
  const headers = new Headers();
  if (req.headers["if-none-match"] !== undefined) headers.set("if-none-match", req.headers["if-none-match"]);
  const response = await routeFor(asset, `http://127.0.0.1:${server.address().port}${req.url}`, headers);
  const out = {};
  for (const [name, value] of response.headers) out[name] = value;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

/** One GET, counted the way a client sees it: wall clock plus the body bytes
 *  that actually arrived. */
async function get(path, headers = {}) {
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, { headers });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    wallMs: Math.round((performance.now() - started) * 1000) / 1000,
    bodyBytes: bytes.length,
    body: bytes,
    headers: response.headers,
  };
}

const rows = [];
for (const asset of ASSETS) {
  const cold = await get(asset.path);
  const etag = cold.headers.get("etag");
  // A revalidation is only meaningful when the client holds a validator; where
  // the route sets none, the honest warm row is "no validator, so revalidation
  // cannot even be expressed" and it is recorded as such rather than as zero
  // bytes saved.
  const warm = etag === null ? null : await get(asset.path, { "if-none-match": etag });
  rows.push({
    key: asset.key,
    path: asset.path,
    route: asset.route,
    status: cold.status,
    contentType: cold.headers.get("content-type"),
    contentLength: cold.headers.get("content-length"),
    cacheControl: cold.headers.get("cache-control"),
    expires: cold.headers.get("expires"),
    etag,
    contentEncoding: cold.headers.get("content-encoding"),
    coldWallMs: cold.wallMs,
    coldBodyBytes: cold.bodyBytes,
    warmStatus: warm?.status ?? null,
    warmWallMs: warm?.wallMs ?? null,
    warmBodyBytes: warm?.bodyBytes ?? null,
    warmSavedBytes: warm === null ? null : cold.bodyBytes - warm.bodyBytes,
    gzipBytes: cold.body.length === 0 ? null : gzipSync(cold.body, { level: 9 }).length,
    brotliBytes: cold.body.length === 0 ? null : brotliCompressSync(cold.body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  });
}

server.close();

const k = (n) => `${(n / 1024).toFixed(1)} KiB`;
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

console.log("asset                         status  type                     cache-control                           cold body   gzip      warm  warm body  saved");
for (const row of rows) {
  console.log(
    pad(row.key, 29) + rpad(row.status, 7) + "  " + pad(row.contentType ?? "", 25) +
    pad(row.cacheControl ?? (row.expires ? "(no cache-control; Expires set)" : "(none)"), 39) +
    rpad(row.coldBodyBytes, 10) + rpad(row.gzipBytes ?? "-", 10) +
    rpad(row.warmStatus ?? "n/a", 6) + rpad(row.warmBodyBytes ?? "-", 11) + rpad(row.warmSavedBytes ?? "-", 7),
  );
}

const totalCold = rows.reduce((n, r) => n + r.coldBodyBytes, 0);
const totalWarm = rows.reduce((n, r) => n + (r.warmBodyBytes ?? 0), 0);
const totalGzip = rows.reduce((n, r) => n + (r.gzipBytes ?? 0), 0);
const totalBrotli = rows.reduce((n, r) => n + (r.brotliBytes ?? 0), 0);
const encoded = rows.filter((r) => r.contentEncoding !== null).length;
const withEtag = rows.filter((r) => r.etag !== null).length;
const answered304 = rows.filter((r) => r.warmStatus === 304).length;
const warmReDownloaded = rows.filter((r) => r.warmBodyBytes !== null && r.warmBodyBytes > 0).reduce((n, r) => n + r.warmBodyBytes, 0);
const noValidator = rows.filter((r) => r.etag === null).length;

console.log("");
console.log(`assets measured: ${rows.length}`);
console.log(`cold transfer total:          ${rpad(totalCold, 9)} bytes (${k(totalCold)})`);
console.log(`gzip-9 total:                 ${rpad(totalGzip, 9)} bytes (${k(totalGzip)})  — ${((1 - totalGzip / totalCold) * 100).toFixed(1)}% smaller`);
console.log(`brotli-11 total:              ${rpad(totalBrotli, 9)} bytes (${k(totalBrotli)})  — ${((1 - totalBrotli / totalCold) * 100).toFixed(1)}% smaller`);
console.log(`responses setting Content-Encoding: ${encoded} of ${rows.length}`);
console.log(`responses carrying an ETag:        ${withEtag} of ${rows.length}  (${noValidator} set no validator at all)`);
console.log(`revalidations answered 304:        ${answered304} of ${withEtag}`);
console.log(`bytes re-sent on revalidation:     ${rpad(warmReDownloaded, 9)} bytes (${k(warmReDownloaded)})`);

const report = {
  instrument: "tools/perf/asset-bytes/measure-asset-http-delivery.mjs",
  note: "cold = first GET; warm = GET carrying the response's own ETag in If-None-Match (null where the route sets no validator). gzip/brotli are what a compressing CDN would put on the wire; the routes themselves set no Content-Encoding.",
  rows,
  totals: {
    coldBodyBytes: totalCold,
    gzipBytes: totalGzip,
    brotliBytes: totalBrotli,
    warmBodyBytes: totalWarm,
    responsesWithContentEncoding: encoded,
    responsesWithEtag: withEtag,
    responsesWithNoValidator: noValidator,
    conditionalRequestsAnswered304: answered304,
    bytesResentOnRevalidation: warmReDownloaded,
  },
};
if (JSON_OUT !== null) {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nwrote ${JSON_OUT}`);
}