// scratch end-to-end probe (deleted after use) — synthetic dump only.
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalSqliteToolDriver, importDump, checksumTargetTable, parseTargetSchema } from "./import.mjs";
import { verifyMigration } from "./verify.mjs";
import { dumpRows } from "./parse-dump.mjs";

const bs = String.fromCharCode(92);
const esc = (s) => s.replace(/\\/g, bs + bs).replace(/'/g, bs + "'").replace(/\n/g, bs + "n").replace(/\r/g, bs + "r").replace(/\t/g, bs + "t");

function cardsRow(id, name, opts = {}) {
  return `(${id},${name === null ? "NULL" : `'${esc(name)}'`},${opts.key === null ? "NULL" : opts.key === undefined ? (name === null ? "NULL" : `'${esc(name.toLowerCase().replace(/[^a-z0-9_]+/g, "_"))}'`) : `'${esc(opts.key)}'`},NULL,${opts.leftId ?? "NULL"},${opts.rightId ?? "NULL"},NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',1,1,NULL,NULL,NULL,${opts.trash ?? 0},2,${opts.content === undefined || opts.content === null ? "NULL" : `'${esc(opts.content)}'`})`;
}

const rows = [
  cardsRow(1, "Alpha One", { content: "<p>The first alpha card.</p>" }),
  cardsRow(2, "Beta Page", { content: "Beta content with 'quotes' and\\backslash." }),
  cardsRow(3, "Alpha One+child", { key: null, leftId: 1, rightId: 4, content: "child content" }),
  cardsRow(4, "child"),
  cardsRow(5, "Trashed Card", { trash: 1, content: "gone but kept" }),
  cardsRow(6, "Gamma Doc", { content: "Gamma body text.\nSecond line.\tTabbed." }),
];

const acts = ["(11,1,1,'2020-01-01 00:00:00','127.0.0.1')", "(12,3,1,'2020-01-01 00:00:00',NULL)"];
const actions = ["(21,1,11,1,0,NULL,'create')", "(22,3,12,1,0,NULL,'create')", "(23,4,NULL,12,1,0,NULL)"];
const changes = [
  "(31,21,0,'Alpha One')",
  "(32,21,2,'<p>The first alpha card.</p>')",
  `(33,22,2,'child content')`,
];
const refs = ["(41,3,'child',4,'I',1)"];

const dump = [
  "-- MySQL dump (synthetic fixture)",
  "/*!40101 SET NAMES utf8mb4 */;",
  "CREATE TABLE `cards` (id int);",
  `INSERT INTO \`cards\` VALUES ${rows.join(",")};`,
  `INSERT INTO \`card_acts\` VALUES ${acts.join(",")};`,
  `INSERT INTO \`card_actions\` VALUES ${actions.join(",")};`,
  `INSERT INTO \`card_changes\` VALUES ${changes.join(",")};`,
  `INSERT INTO \`card_references\` VALUES ${refs.join(",")};`,
  "INSERT INTO `some_site_custom_table` VALUES (1,'x'),(2,'y');",
].join("\n") + "\n";

const dir = mkdtempSync(join(tmpdir(), "decko-migrate-"));
const dumpPath = "C:/localProjects/decko-ts/tools/migrate/scratch-dump.sql";
const dbPath = join(dir, "out.sqlite");
writeFileSync(dumpPath, dump, "utf8");

// 1. parser surface
const seen = {};
for await (const row of dumpRows(dumpPath)) {
  seen[row.table] = (seen[row.table] ?? 0) + 1;
  if (row.table === "cards") {
    const at = row.values[7];
    if (row.values.length !== 17 || at === null) {
      console.log("BAD CARD ROW len=", row.values.length, "at7=", JSON.stringify(at), JSON.stringify(row.values));
    }
  }
}
console.log("parser counts:", JSON.stringify(seen));

// 2. import
const driver = new LocalSqliteToolDriver(dbPath);
const DDL = "C:/localProjects/decko-ts/db/schema.sqlite.sql";
const stats = await importDump({
  dumpPath,
  driver,
  ddlPath: DDL,
});
console.log("import counts:", JSON.stringify(stats.counts));
console.log("skipped:", JSON.stringify(stats.skippedTables));
console.log("warnings:", JSON.stringify(stats.warnings));

// 3. verify (SQL-level only, no engine hook)
const report = await verifyMigration({
  dumpPath,
  driver,
  ddlPath: "C:/localProjects/decko-ts/db/schema.sqlite.sql",
  importStats: stats,
  spotCount: 5,
  reportPath: join(dir, "report.json"),
});
console.log("allParity:", report.allParity);
console.log("junction:", JSON.stringify(report.junction));
console.log("cards:", JSON.stringify(report.cards));
console.log("report bytes:", JSON.stringify(report).length);

// sanity: junction walk resolves Alpha One+child via composed name
const walk = await import("./verify.mjs");
const r = await driver.query("SELECT id FROM cards WHERE left_id = 1", []);
console.log("compound row id:", JSON.stringify(r.rows));
driver.close();
console.log("dir:", dir);
