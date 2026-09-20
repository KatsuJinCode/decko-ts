// scratch diff (deleted after use)
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
function run(dumpText, feedSize) {
  const p = new MysqldumpInsertParser({});
  const rows = [];
  for (let i = 0; i < dumpText.length; i += feedSize) {
    p.feed(dumpText.slice(i, i + feedSize), false);
    let r;
    while ((r = p.nextRow()) !== undefined) rows.push(r);
  }
  p.feed("", true);
  p.finish();
  let r;
  while ((r = p.nextRow()) !== undefined) rows.push(r);
  return rows;
}
const show = (rows) => JSON.stringify(rows, (k, v) => (v instanceof Uint8Array ? `U8:${Buffer.from(v).toString("hex")}` : v));
const a = show(run(dump, 1e9));
const b = show(run(dump, 1));
const c = show(run(dump, 7));
console.log("whole == char:", a === b);
console.log("whole == 7:", a === c);
for (const [name, s] of [["whole", a], ["char", b], ["7", c]]) console.log(name, s.slice(0, 400));
