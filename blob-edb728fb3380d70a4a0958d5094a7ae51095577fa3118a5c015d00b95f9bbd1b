// Scratch profiler (delete after reading): runs the prefetch walk's
// `resolved` composition directly against the corpus sqlite deck to expose
// the planner pathology. better-sqlite3 is synchronous, so each phase runs
// under a shell `timeout` in the caller.
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// The sanitized corpus leg, resolved the way every sibling corpus script
// resolves it (benchmarks/corpus-v2/audit-shard-entries-against-both-corpus-legs.mjs
// line 55, and five more). This literal used to be an absolute path into the
// machine-root checkout; that checkout exists but no longer carries the deck
// (bench-corpus-v2.sqlite3 is MISSING there, 2026-10-06), so the profiler was
// pointing at nothing. The leg is gitignored and rebuildable via
// build_corpus_v2.py.
const DB = process.env.DECKO_TS_CORPUS_V2 ?? path.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
if (!existsSync(DB)) {
  console.error(
    `sanitized corpus leg missing: ${DB}\n` +
      `rebuild it with benchmarks/corpus-v2/build_corpus_v2.py, or set DECKO_TS_CORPUS_V2 to an existing one`,
  );
  process.exit(1);
}
const db = new Database(DB, { readonly: true });
console.log("phase", "cards", db.prepare("SELECT COUNT(*) n FROM cards WHERE trash=0").get().n);

const RESOLVED = (cap) => `
WITH RECURSIVE
resolved(id, ckey, d) AS (
  SELECT id, "key", 1 FROM cards WHERE "key" IS NOT NULL AND trash = 0
  UNION
  SELECT j.id, l.ckey || '+' || r."key", l.d + 1 FROM resolved l
    JOIN cards j ON j.left_id = l.id AND j.trash = 0
    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
   WHERE l.d < ${cap}
  UNION
  SELECT j.id, l."key" || '+' || r.ckey, r.d + 1 FROM resolved r
    JOIN cards j ON j.right_id = r.id AND j.trash = 0
    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
   WHERE r.d < ${cap}
)
`;

const phase = process.argv[2] ?? "plan";
const cap = Number(process.argv[3] ?? "2");

if (phase === "plan") {
  const plan = db
    .prepare(`${RESOLVED(cap)} SELECT COUNT(*) AS n FROM resolved`)
    .raw()
    .columns([]);
  // EXPLAIN QUERY PLAN via pragma-able wrapper:
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${RESOLVED(cap)} SELECT COUNT(*) AS n FROM resolved`).all();
  for (const r of rows) console.log("PLAN", r.id, r.parent, (r.detail ?? "").slice(0, 160));
} else if (phase === "count") {
  const t = Date.now();
  const n = db.prepare(`${RESOLVED(cap)} SELECT COUNT(*) AS n FROM resolved`).get();
  console.log(`COUNT cap=${cap} rows=${n.n} ms=${Date.now() - t}`);
} else if (phase === "count-cross") {
  // CROSS JOIN forces SQLite to keep the written join order (no reordering).
  const RESOLVED_CROSS = `
WITH RECURSIVE
resolved(id, ckey, d) AS (
  SELECT id, "key", 1 FROM cards WHERE "key" IS NOT NULL AND trash = 0
  UNION
  SELECT j.id, l.ckey || '+' || r."key", l.d + 1 FROM resolved l
    CROSS JOIN cards j ON j.left_id = l.id AND j.trash = 0
    CROSS JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
   WHERE l.d < ${cap}
  UNION
  SELECT j.id, l."key" || '+' || r.ckey, r.d + 1 FROM resolved r
    CROSS JOIN cards j ON j.right_id = r.id AND j.trash = 0
    CROSS JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
   WHERE r.d < ${cap}
)
`;
  const t = Date.now();
  const n = db.prepare(`${RESOLVED_CROSS} SELECT COUNT(*) AS n FROM resolved`).get();
  console.log(`COUNT-CROSS cap=${cap} rows=${n.n} ms=${Date.now() - t}`);
} else if (phase === "jsize") {
  const j = db.prepare("SELECT COUNT(*) n FROM cards WHERE left_id IS NOT NULL AND trash=0").get().n;
  const simple = db.prepare('SELECT COUNT(*) n FROM cards WHERE "key" IS NOT NULL AND trash=0').get().n;
  const hub = db
    .prepare(
      "SELECT c.name, COUNT(*) n FROM cards j JOIN cards c ON c.id=j.left_id " +
        "WHERE j.left_id IS NOT NULL AND j.trash=0 GROUP BY j.left_id ORDER BY n DESC LIMIT 5",
    )
    .all();
  console.log(`junctions=${j} simpleKeyed=${simple} topHubs=${JSON.stringify(hub)}`);
}
db.close();
