// scratch debug4 (deleted after use) — log every parsed row's shape.
import { MysqldumpInsertParser } from "./parse-dump.mjs";

const bs = String.fromCharCode(92);
const dump = [
  "-- MySQL dump (synthetic fixture)",
  "/*!40101 SET NAMES utf8mb4 */;",
  "CREATE TABLE `cards` (id int);",
  "INSERT INTO `cards` VALUES (1,'Alpha One','alpha_one',NULL,NULL,NULL,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',1,1,NULL,NULL,NULL,0,2,'<p>body</p>');",
  "INSERT INTO `card_acts` VALUES (11,1,1,'2020-01-01 00:00:00','127.0.0.1');",
  "INSERT INTO `some_site_custom_table` VALUES (1,'x'),(2,'y');",
].join("\n") + "\n";

const p = new MysqldumpInsertParser({});
const lines = dump.split("\n");
// feed line by line to localize
for (const line of lines) {
  const before = p.stats.statements;
  p.feed(line + "\n", false);
  let r;
  while ((r = p.nextRow()) !== undefined) {
    console.log(
      `row table=${r.table} cols=${JSON.stringify(r.columns)} len=${r.values.length}`,
    );
  }
  if (p.state !== "scan") {
    console.log(`  after line ${JSON.stringify(line.slice(0, 50))}: state=${p.state} table=${p.table}`);
  }
}
p.feed("", true);
p.finish();
console.log("statements:", p.stats.statements);
