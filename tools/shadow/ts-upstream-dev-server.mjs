// tools/shadow/ts-upstream-dev-server.mjs — T5 of #1282.
//
// A TINY HTTP server that exposes the decko-ts RenderEngine over a
// Decko-like URL surface so the shadow-router has a TS upstream to
// compare against the Ruby oracle. NOT a production server: it boots
// an in-memory SQLite database, seeds the SAME 10 cards the smoke
// fixture records (docs/oracle-harness.md), and serves HTML renders.
//
// Why in-process .mjs and not a built TS bundle:
//   - the StreamResult for M5 is "live proof against real upstreams",
//     not "the TS HTTP server". The TS engine has no HTTP surface yet
//     (only programmatic); this is the dev-server stand-in.
//   - .mjs lets us load the .js-compiled engine modules directly via
//     dynamic import — same engine the tests use, no separate dist build.
//
// URL surface (mirrors deck-0.20.0/config/engine_routes.rb):
//   GET /<name>                       -> render default view (open)
//   GET /<name>/view/<view>           -> render specific view
//   GET /<name>.<format>              -> render with format suffix
//   GET /__health                     -> 200 OK (proxy self-test)
//
// CLI:
//   node --experimental-strip-types tools/shadow/ts-upstream-dev-server.mjs
//     (listens on PORT env or 0 for ephemeral; logs the URL)

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

// ----------------------------------------------------------------------------
// Schema + seed loading (SQL DDL via the in-memory driver).
// ----------------------------------------------------------------------------

const SCHEMA_PATH = join(REPO_ROOT, "db", "schema.sqlite.sql");

/** Quote-aware `--` stripper and `;`-split (the schema carries no `;` inside
 *  string literals — same splitter contract as render-test-storage.ts). */
function splitSqlStatements(ddl) {
  const statements = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i];
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "-" && ddl[i + 1] === "-") {
      while (i < ddl.length && ddl[i] !== "\n") i++;
      current += " ";
      continue;
    }
    if (ch === ";") {
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((s) => s !== "");
}

/** Type + codename cards the render engine needs to make sense of the
 *  smoke-fixture seeds. The IDs mirror what the oracle SQLite DB
 *  carries (docs/oracle-harness.md; the engine reads ids only to walk
 *  the codename codehash, so any consistent id range works). */
const CODENAME_SEED = [
  // (id, name, codename, type_id)
  { id: 2, name: "RichText", codename: "basic", typeId: 5 },
  { id: 4, name: "List", codename: "list", typeId: 5 },
  { id: 5, name: "Set", codename: "set", typeId: 5 },
  { id: 6, name: "Setting", codename: "setting", typeId: 5 },
  { id: 7, name: "*all", codename: "all", typeId: 5 },
  { id: 9, name: "*read", codename: "read", typeId: 2 },
  { id: 26, name: "*right", codename: "right", typeId: 2 },
  { id: 27, name: "*self", codename: "self", typeId: 2 },
  { id: 98, name: "Search", codename: "search_type", typeId: 5 },
  { id: 177, name: "Role", codename: "role", typeId: 5 },
  { id: 184, name: "Administrator", codename: "administrator", typeId: 177 },
  // Cardtype for "Role" / set Type card needed for the *type plus right
  // anchor — Decko has a Cardtype card for each type name.
];

/** The 10 smoke-fixture seed cards verbatim from fixtures/captured/smoke.json
 *  — names, types, contents, and read-rule chain (Oracle Restricted
 *  reads as the list rule list of "Administrator", matching the oracle). */
const SMOKE_SEED = [
  { id: 605, name: "Oracle Basics", typeId: 2,
    content: "A plain basic card for oracle capture." },
  { id: 606, name: "Oracle Junction", typeId: 2,
    content: "Junction parent card." },
  { id: 611, name: "Oracle Rich", typeId: 2,
    content: "<p>Rich text with an inclusion: {{Oracle Rich+rich_child}}</p>" },
  { id: 614, name: "Oracle Search", typeId: 98,
    content: '{"left":"Oracle Junction","sort":"name"}' },
  { id: 615, name: "Oracle Restricted", typeId: 2,
    content: "Only administrators can read me.", readRuleId: 617 },
  // Side cards (parts of compound names).
  { id: 607, name: "child_one", typeId: 2, content: "first child" },
  { id: 609, name: "child_two", typeId: 2, content: "second child" },
  { id: 612, name: "rich_child", typeId: 2, content: "the nested child body" },
  // Junction rows (compound names). Stored with NULL name/key + side ids
  // (the 2020 Lexicon convention the schema records).
  { id: 608, leftId: 606, rightId: 607, typeId: 2 },
  { id: 610, leftId: 606, rightId: 609, typeId: 2 },
  { id: 613, leftId: 611, rightId: 612, typeId: 2 },
  // The *self set under Oracle Restricted.
  { id: 616, leftId: 615, rightId: 27, typeId: 5, readRuleId: 617 },
  // The *read rule under Oracle Restricted+*self.
  { id: 617, leftId: 616, rightId: 9, typeId: 4, content: "Administrator",
    readRuleId: 617 },
];

/** Insert one cards row. NULL name/key columns for junction rows
 *  (the 2020 convention the schema records). */
async function insertCard(driver, row) {
  const isCompound = row.leftId !== undefined && row.rightId !== undefined;
  const nameColumn = isCompound ? null : (row.name ?? null);
  const keyColumn = isCompound ? null :
    (row.name ? row.name.toLowerCase().replace(/\s+/g, "_") : null);
  await driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      nameColumn,
      keyColumn,
      row.codename ?? null,
      row.leftId ?? null,
      row.rightId ?? null,
      null,
      "2026-09-21 00:00:00.000",
      "2026-09-21 00:00:00.000",
      1,
      1,
      null,
      row.readRuleId ?? null,
      null,
      0,
      row.typeId,
      row.content ?? null,
    ],
  );
}

// ----------------------------------------------------------------------------
// URL parsing (Decko convention: spaces -> '+' in the path).
// ----------------------------------------------------------------------------

/** Decode a URL mark: '+' -> space; '+' is a literal plus only when escaped
 *  as %2B. Trailing .<format> is stripped. */
function decodeMark(rawMark) {
  let s = decodeURIComponent(rawMark);
  // Restore spaces from '+' markers.
  s = s.replace(/\+/g, " ");
  // Strip trailing .<format>.
  const dotIdx = s.lastIndexOf(".");
  if (dotIdx > 0) s = s.slice(0, dotIdx);
  return s;
}

// ----------------------------------------------------------------------------
// Boot: schema + seed + engine.
// ----------------------------------------------------------------------------

async function bootEngine() {
  // Dynamic import of the COMPILED engine modules. The repo's tsconfig
  // builds only test artefacts; we compile the engine into dist-ts/
  // via tsconfig.engine.json --noCheck, then point the dev server at
  // it. Build is cached; first start pays for it, subsequent starts
  // are cold-load.
  const drivers = await import(pathToFileURL(
    join(REPO_ROOT, "dist-ts", "server", "drivers", "local-sqlite.js"),
  ).href);
  const fetchMod = await import(pathToFileURL(
    join(REPO_ROOT, "dist-ts", "card", "fetch.js"),
  ).href);
  const renderMod = await import(pathToFileURL(
    join(REPO_ROOT, "dist-ts", "card", "render.js"),
  ).href);

  const driver = new drivers.LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(SCHEMA_PATH, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  for (const row of CODENAME_SEED) await insertCard(driver, row);
  for (const row of SMOKE_SEED) await insertCard(driver, row);

  const fetcher = new fetchMod.FetchEngine(driver);
  const renderer = new renderMod.RenderEngine(fetcher);
  // Warm the codename registry + lexicon — the sync render path needs
  // these resolved (render.ts#computeIsRule, render.ts#enrichAndStore).
  await fetcher.warmLexicon(SMOKE_SEED.map((r) => r.id));
  return { driver, fetcher, renderer };
}

// ----------------------------------------------------------------------------
// HTTP handler.
// ----------------------------------------------------------------------------

function makeHandler({ renderer }) {
  return async function handle(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      if (path === "/__health") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok\n");
        return;
      }
      // Strip leading "/" to get the mark, then split on "/view/" for the
      // explicit-view form.
      const markRaw = path.startsWith("/") ? path.slice(1) : path;
      if (markRaw === "") {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("ts-upstream: empty mark\n");
        return;
      }
      let cardName, view;
      const viewSplit = markRaw.split("/view/");
      if (viewSplit.length === 2) {
        cardName = decodeMark(viewSplit[0]);
        view = viewSplit[1];
      } else {
        cardName = decodeMark(markRaw);
        view = "open";
      }
      let html;
      try {
        html = await renderer.render(cardName, view);
      } catch (err) {
        // Unknown-view / missing-card errors map to 422 — the proxy logs
        // them, the client still sees the Ruby bytes.
        res.writeHead(422, { "content-type": "text/plain" });
        res.end(`ts-upstream: render failed: ${err.message}\n`);
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`ts-upstream: handler crash: ${err.message}\n`);
    }
  };
}

// ----------------------------------------------------------------------------
// CLI.
// ----------------------------------------------------------------------------

function envConfig() {
  return {
    port: Number(process.env.PORT ?? 0),
  };
}

async function main() {
  const cfg = envConfig();
  const { renderer } = await bootEngine();
  const server = createServer(makeHandler({ renderer }));
  server.listen(cfg.port, () => {
    const addr = server.address();
    process.stderr.write(
      `ts-upstream: listening on http://${addr.address}:${addr.port}\n`,
    );
  });
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`ts-upstream: boot failed: ${err.message}\n`);
    process.exit(1);
  });
}

export { bootEngine, makeHandler, decodeMark, CODENAME_SEED, SMOKE_SEED };