// probe-trace-phantom-item-verdict.mjs -- boot the engine, render one host, and
// trace EVERY pointerItemVerdict lookup the render path performs, plus the
// resulting mini_bar body class.
//
// WHY
//   The oracle renders the FULL bar body inside a `mini_bar-view` slot for a
//   phantom pointer item; the port renders the two-span denied body. The
//   slot JSON is byte-identical on both sides, so the decision is the body,
//   and the body is chosen by `verdict?.read === true` in
//   views.ts#renderUnknownPointerListItem. This probe shows what verdict the
//   engine actually holds for that (host, item) pair at render time, which
//   is what decides it -- a direct read of the branch input rather than a
//   re-derivation.
//
// USAGE
//   node tools/oracle/probe-trace-phantom-item-verdict.mjs \
//     --name "HOST_CARD+ITEM_CARD" --view open [--trace]

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", pathToFileURL(HERE + path.sep).href);

const REPO = path.resolve(HERE, "..", "..");
function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const NAME = argValue("--name", "Quicksilver+Core Project");
const VIEW = argValue("--view", "open");
const TRACE = process.argv.includes("--trace");

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tmp", "raw-ground-truth", "scripts", "raw-corpus-seeding.js")).href
);
const Database = (await import("better-sqlite3")).default;
const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log(`TRACE boot done: ids=${everyLiveId.length}`);

const engine = storage.engine;
const lookups = [];
const original = engine.pointerItemVerdict.bind(engine);
engine.pointerItemVerdict = (hostKey, key) => {
  const v = original(hostKey, key);
  lookups.push({ hostKey, key, verdict: v === undefined ? "undefined" : JSON.stringify(v) });
  return v;
};
const denials = [];
const originalIsDenied = engine.isDenied.bind(engine);
engine.isDenied = (card) => {
  const d = originalIsDenied(card);
  if (card.key === "mytho_psychology" || card.name?.s === "mytho-psychology") {
    denials.push({ key: card.key, name: card.name?.s, id: card.id, denied: d, flag: String(card.pointerItemReadVerdict) });
  }
  return d;
};

// Optional: render PRIOR names first, to reproduce an order-dependent flip.
const WARM = argValue("--warm", "");
for (const prior of WARM.split(",").map((s) => s.trim()).filter((s) => s !== "")) {
  const [n, v] = prior.split(":");
  const out = await engine.render(n, v ?? VIEW);
  console.log(`TRACE warm-rendered ${prior} bytes=${out.length}`);
}
const html = await engine.render(NAME, VIEW);
console.log(`TRACE rendered ${NAME}:${VIEW} bytes=${html.length}`);

const bodies = [];
const OPEN = /<div id="([^"]*?)-mini_bar-view" class="([^"]*)" data-card-name="([^"]*)" data-card-type-id="([^"]*)" data-card-type-name="([^"]*)"/g;
let m;
while ((m = OPEN.exec(html)) !== null) {
  const start = m.index + m[0].length;
  const close = html.indexOf("</div></div>", start);
  const body = html.slice(start, close < 0 ? start + 4000 : close);
  bodies.push({
    item: m[3],
    type: `${m[5]}/${m[4]}`,
    kind: body.includes("bar-body row g-0") ? "FULL" : body.includes('class="denied"') ? "DENIED" : "OTHER",
    bodyBytes: body.length,
  });
}
console.log(`TRACE mini_bar bodies: ${JSON.stringify(bodies)}`);
console.log(`TRACE verdict lookups (${lookups.length}):`);
const uniq = new Map();
for (const l of lookups) {
  const k = `${l.hostKey} | ${l.key} -> ${l.verdict}`;
  uniq.set(k, (uniq.get(k) ?? 0) + 1);
}
for (const [k, n] of [...uniq.entries()]) console.log(`  x${n}  ${k}`);
console.log(`TRACE isDenied calls on the mytho-psychology phantom (${denials.length}):`);
const dtab = new Map();
for (const d of denials) {
  const k = `id=${d.id} key=${d.key} name=${d.name} -> ${d.denied}`;
  dtab.set(k, (dtab.get(k) ?? 0) + 1);
}
for (const [k, n] of [...dtab.entries()]) console.log(`  x${n}  ${k}`);
if (TRACE) for (const l of lookups) console.log(`  raw ${JSON.stringify(l)}`);
storage.close();
process.exit(0);
