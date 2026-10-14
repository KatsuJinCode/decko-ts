// render-every-card.mjs — render every non-trashed card of a migrated
// deck through the port's RenderEngine and report aggregate figures.
//
//   Run through prove-deck-migration.mjs, which bundles this file with
//   esbuild (src/ uses type-only named imports) and runs the bundle:
//   node <bundle.mjs> <staging.sqlite>
//
// Prints progress to stderr and one JSON line to stdout: cards attempted,
// rendered, fetch misses, render errors (by error class name), total
// bytes and elapsed time. No card name or content is printed.

import { LocalSqliteToolDriver } from "./import.mjs";
import { FetchEngine } from "../../src/card/fetch.ts";
import { RenderEngine } from "../../src/card/render.ts";
import { applyDeckInflections } from "../../src/card/name/inflect.ts";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.ts";

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("usage: render-every-card.mjs <staging.sqlite>");
  process.exit(2);
}
applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);

const driver = new LocalSqliteToolDriver(dbPath, { readonly: true });
const fetcher = new FetchEngine(driver);
const renderer = new RenderEngine(fetcher);
const ids = (await driver.query("SELECT id FROM cards WHERE trash = 0 ORDER BY id", [])).rows.map((r) => Number(r.id));

const out = { view: "content", attempted: 0, rendered: 0, fetchMisses: 0, renderErrors: 0, errorClasses: {}, bytes: 0, ms: 0 };
const t0 = Date.now();
for (const id of ids) {
  out.attempted += 1;
  const record = await fetcher.fetchById(id);
  if (record === undefined || record.name === undefined || record.name.s === "") {
    out.fetchMisses += 1;
    continue;
  }
  try {
    const html = await renderer.render(record.name.s, "content");
    out.rendered += 1;
    out.bytes += Buffer.byteLength(html, "utf8");
  } catch (err) {
    out.renderErrors += 1;
    const cls = err?.constructor?.name ?? "unknown";
    out.errorClasses[cls] = (out.errorClasses[cls] ?? 0) + 1;
  }
  if (out.attempted % 2000 === 0) {
    process.stderr.write(`render: ${out.attempted}/${ids.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
    renderer.resetCaches();
    fetcher.resetCaches();
  }
}
out.ms = Date.now() - t0;
console.log(JSON.stringify(out));
