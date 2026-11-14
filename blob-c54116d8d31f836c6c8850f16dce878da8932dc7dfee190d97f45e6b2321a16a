// Lane p22-rulestable probe: the *recent settings card in BOTH corpus copies
// vs format.ts's static RECENT_SETTINGS; plus the settings named in the
// residual (table of contents / content options).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const open = (file) =>
  new Database(
    new URL(`./${file}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    { readonly: true },
  );

for (const [label, file] of [
  ["RAW (oracle capture deck)", "bench-corpus-raw-lane-copy.sqlite3"],
  ["V2 (later deck state)", "bench-corpus-v2-lane-copy.sqlite3"],
]) {
  const db = open(file);
  console.log(`\n===== ${label} =====`);
  const recent = db
    .prepare(
      `SELECT id, key, codename, trash, db_content, content FROM cards
       WHERE key LIKE '%recent setting%'`,
    )
    .all();
  for (const r of recent) {
    console.log(`recent card id=${r.id} key=${JSON.stringify(r.key)} codename=${r.codename} trash=${r.trash}`);
    const content = r.db_content ?? r.content;
    console.log("  content:", JSON.stringify(content));
    if (content) {
      const items = content
        .split("\n")
        .map((l) => l.trim().replace(/^\*/, "").replace(/\s+/g, "_"))
        .filter((s) => s !== "");
      console.log("  item codename-shapes:", JSON.stringify(items));
    }
  }
  for (const key of ["*table of contents", "*table of content", "*content options"]) {
    const c = db
      .prepare(`SELECT id, key, codename, trash, type_id FROM cards WHERE key = ?`)
      .all(key);
    console.log(`setting card ${JSON.stringify(key)}:`, JSON.stringify(c));
  }
  db.close();
}
