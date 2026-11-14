import Database from "better-sqlite3";
const db = new Database("./benchmarks/corpus-v2/bench-corpus-v2.sqlite3", { readonly: true });

const totalRules = db.prepare(
  `SELECT COUNT(*) AS c FROM cards WHERE trash = 0 AND content IS NOT NULL AND name LIKE '%+*structure'`
).get();
console.log("Total *structure rule rows with content:", totalRules);

const distinctContents = db.prepare(
  `SELECT content, COUNT(*) AS rule_count, GROUP_CONCAT(name, '|') AS rule_names
   FROM cards
   WHERE trash = 0 AND content IS NOT NULL AND name LIKE '%+*structure'
   GROUP BY content
   ORDER BY rule_count DESC
   LIMIT 40`
).all();
console.log("\nTop distinct *structure rule templates:");
for (const row of distinctContents) {
  const preview = row.content.length > 100 ? row.content.slice(0, 100) + "..." : row.content;
  console.log(`  count=${row.rule_count} content="${preview}"`);
  console.log(`    rule_names=${row.rule_names.slice(0, 200)}`);
}
console.log(`\nDistinct templates: ${distinctContents.length}`);

const matches = db.prepare(
  `SELECT
     (SELECT COUNT(*) FROM cards WHERE trash = 0 AND content IS NOT NULL) AS total_with_content,
     (SELECT COUNT(DISTINCT c2.id) FROM cards c2
        JOIN (SELECT DISTINCT content FROM cards WHERE trash = 0 AND content IS NOT NULL AND name LIKE '%+*structure') s
          ON c2.content = s.content
        WHERE c2.trash = 0 AND c2.content IS NOT NULL) AS matching_records`
).get();
console.log("\nRecord content vs rule template content:", matches);

const dbContentDist = db.prepare(
  `SELECT
     SUM(CASE WHEN content IS NULL THEN 1 ELSE 0 END) AS null_content,
     SUM(CASE WHEN content = '' THEN 1 ELSE 0 END) AS empty_content,
     SUM(CASE WHEN content IS NOT NULL AND content != '' THEN 1 ELSE 0 END) AS has_content
   FROM cards WHERE trash = 0`
).get();
console.log("\nDB content distribution (trash=0):", dbContentDist);

const samples = db.prepare(
  `SELECT id, name, content FROM cards WHERE trash = 0 AND content IS NOT NULL AND name LIKE '%+*structure' LIMIT 5`
).all();
console.log("\nSample *structure rule rows:");
for (const s of samples) console.log(`  id=${s.id} name=${s.name} content=${s.content.slice(0, 120)}`);

db.close();
