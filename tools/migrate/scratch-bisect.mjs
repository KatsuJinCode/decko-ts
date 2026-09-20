// scratch bisect probe (deleted after use) — never committed
import { MysqldumpInsertParser } from "./parse-dump.mjs";

const bs = String.fromCharCode(92);
const dump = [
  "LOCK TABLES `cards` WRITE;",
  "/*!40000 ALTER TABLE `cards` DISABLE KEYS */;",
  `INSERT INTO \`cards\` VALUES (1,'It''s a ${bs}'test${bs}${bs}${bs}', he said${bs}nline2',NULL,0xdeadbeef,-12.5e2,''),(2,NULL,NULL,'plain',NULL,7,'trailing');`,
  "-- a comment",
  "# hash comment",
  "CREATE TABLE `x` (a int);",
  "INSERT INTO `cards` (`id`,`name`) VALUES (3,'col-listed');",
  "INSERT INTO `cards` VALUES (4,'end-no-semicolon-nl');",
].join("\n") + "\n";

// feed one char at a time, printing state transitions
const p = new MysqldumpInsertParser({});
let lastState = "";
for (let i = 0; i < dump.length; i++) {
  try {
    p.feed(dump[i], false);
  } catch (e) {
    console.error(`THREW at char ${i} (${JSON.stringify(dump.slice(Math.max(0, i - 30), i + 10))}): ${e.message}`);
    console.error("state=", p.state, "table=", JSON.stringify(p.table), "pos=", p.pos);
    console.error("buf ctx:", JSON.stringify(p.buf.slice(Math.max(0, p.pos - 40), p.pos + 60)));
    process.exit(1);
  }
}
p.feed("", true);
p.finish();
console.log("OK, rows:", p.stats.rowsEmitted, "statements:", p.stats.statements);
