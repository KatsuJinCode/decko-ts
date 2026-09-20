// scratch debug probe (deleted after use) — never committed
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
console.log("bytes 73-140:", JSON.stringify(dump.slice(73, 140)));

const p = new MysqldumpInsertParser({});
try {
  p.feed(dump, true);
  p.finish();
  let r;
  const rows = [];
  while ((r = p.nextRow()) !== undefined) rows.push(r);
  console.log("rows:", JSON.stringify(rows, (k, v) => (v instanceof Uint8Array ? `U8:${Buffer.from(v).toString("hex")}` : v), 1));
} catch (e) {
  console.error("ERR:", e.message);
  console.error("state=", p.state, "table=", p.table, "pos=", p.pos, "bufLen=", p.buf.length);
  console.error("context:", JSON.stringify(p.buf.slice(Math.max(0, p.pos - 50), p.pos + 70)));
}
