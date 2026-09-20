// scratch parser probe (deleted after use) — never committed
import { MysqldumpInsertParser, decodeMysqlEscapes } from "./parse-dump.mjs";

const bs = String.fromCharCode(92); // backslash
console.log(
  "dec1:", JSON.stringify(decodeMysqlEscapes(`a${bs}'b${bs}${bs}`)),
  "dec2:", JSON.stringify(decodeMysqlEscapes(`x${bs}%y${bs}_z`)),
  "dec3:", JSON.stringify(decodeMysqlEscapes(`n${bs}nt${bs}tq${bs}"Z${bs}Z0${bs}0`)),
);

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
const whole = run(dump, 1e9);
const charly = run(dump, 1);
const seven = run(dump, 7);
const show = (rows) =>
  JSON.stringify(rows, (k, v) => (v instanceof Uint8Array ? `U8:${Buffer.from(v).toString("hex")}` : v));
console.log("rows:", whole.length, charly.length, seven.length);
console.log(show(whole));
console.log("identical:", show(whole) === show(charly) && show(whole) === show(seven));
console.log("stats:", JSON.stringify(whole === charly ? new MysqldumpInsertParser({}).stats : run(dump, 4096).length));
