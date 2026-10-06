// Scratch profiler (delete after reading): does the replay seeding's
// NULL-key convention on junction rows turn the bounded `resolved`
// composition into the measured multi-minute hang? Builds an in-memory copy
// of the corpus cards table with junction key/name nulled (the seedCard
// convention), then times the depth-capped composition.
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
const mem = new Database(":memory:");
const cols = db.prepare("PRAGMA table_info(cards)").all();
mem.exec(
  "CREATE TABLE cards (" +
    cols.map((c) => `${JSON.stringify(c.name)} ${c.type}`).join(", ") + ")",
);
mem.exec("CREATE INDEX idx_cards_left ON cards (left_id)");
mem.exec("CREATE INDEX idx_cards_right ON cards (right_id)");
const selectExpr = cols
  .map((c) =>
    c.name === "key" || c.name === "name"
      ? `CASE WHEN left_id IS NOT NULL THEN NULL ELSE ${JSON.stringify(c.name)} END`
      : JSON.stringify(c.name),
  )
  .join(", ");
mem.exec(`INSERT INTO cards SELECT ${selectExpr} FROM cards`);

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
for (const cap of [2, 3, 4, 6]) {
  const t = Date.now();
  const n = mem.prepare(RESOLVED(cap) + " SELECT COUNT(*) AS n FROM resolved").get();
  console.log(`NULLKEYS cap=${cap} rows=${n.n} ms=${Date.now() - t}`);
}
mem.close();
db.close();
