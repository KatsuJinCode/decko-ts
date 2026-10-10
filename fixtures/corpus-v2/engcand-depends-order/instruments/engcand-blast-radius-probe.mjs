// engcand-blast-radius-probe.mjs -- ENGCAND LANE
// Renders the 28-page mod cardtype surface + the 20-page recap23 set and
// emits one JSONL row per page: name, sha256 of the RAW bytes, byte length.
// Run ONCE in the base scratch worktree (before) and ONCE in the lane
// worktree (after); the diff is the measured blast radius.
//
// USAGE: node --max-old-space-size=6144 tmp/lane-engcand/engcand-blast-radius-probe.mjs <out.jsonl>

import { register } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register(
  "./typescript-source-loader.mjs",
  pathToFileURL(path.join(HERE, "..", "..", "tools", "oracle") + path.sep).href,
);
const REPO = path.resolve(HERE, "..", "..");
const OUT = process.argv[2];
if (!OUT) { console.error("usage: probe <out.jsonl>"); process.exit(2); }

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.ts")).href
);
const { normalizeForReplay } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);
const Database = (await import("better-sqlite3")).default;

const MOD_SURFACE = [
  "mod: account", "mod: ace editor", "mod: api key", "mod: bar and box",
  "mod: bootstrap", "mod: carrierwave", "mod: comment", "mod: content",
  "mod: core", "mod: date", "mod: defaults", "mod: edit", "mod: email",
  "mod: follow", "mod: format", "mod: help", "mod: history", "mod: integrate",
  "mod: layout", "mod: list", "mod: permissions", "mod: recaptcha",
  "mod: rules", "mod: script", "mod: search", "mod: session", "mod: style",
  "mod: tabs",
];
const RECAP23_SET = [
  "*input type+*right", "Administrator", "Archetypal", "Family", "Christmas",
  "*search", "*input type+*right+*content options", "Morgan",
  "Project+Task+*type plus right", "Message+Conversation+*type plus right",
  "Administrator+Dashboard", "Help Desk", "Pointer", "Shark",
  "mod: account", "mod: bootstrap", "mod: core", "mod: email", "mod: list",
  "mod: tinymce editor",
];
const PAGES = [...new Set([...MOD_SURFACE, ...RECAP23_SET])];

const everyLiveId = new Database(RAW_CORPUS_DB, { readonly: true })
  .prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
console.log(`BLAST boot: ids=${everyLiveId.length} pages=${PAGES.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);

const rows = [];
for (const name of PAGES) {
  let html, err = null;
  try {
    html = await storage.engine.renderPage(name);
  } catch (e) {
    err = String(e?.message ?? e);
  }
  if (err !== null) {
    rows.push({ name, error: err });
  } else {
    rows.push({
      name,
      len: html.length,
      sha256: createHash("sha256").update(html, "utf8").digest("hex"),
      normSha256: createHash("sha256").update(normalizeForReplay(html), "utf8").digest("hex"),
    });
  }
}
writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`BLAST done: ${rows.filter(r => !r.error).length}/${rows.length} rendered -> ${OUT}`);
