// scratch debug3 (deleted after use) — regenerate the e2e synthetic dump
// and print the generated cards INSERT for inspection.
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bs = String.fromCharCode(92);
const esc = (s) =>
  s
    .replace(new RegExp(bs + bs, "g"), bs + bs + bs + bs)
    .replace(/'/g, bs + "'")
    .replace(/\n/g, bs + "n")
    .replace(/\r/g, bs + "r")
    .replace(/\t/g, bs + "t");

function cardsRow(id, name, opts = {}) {
  return (
    `(${id},` +
    (name === null ? "NULL" : `'${esc(name)}'`) +
    "," +
    (opts.key === null
      ? "NULL"
      : opts.key === undefined
        ? name === null
          ? "NULL"
          : `'${esc(name.toLowerCase().replace(/[^a-z0-9_]+/g, "_"))}'`
        : `'${esc(opts.key)}'`) +
    `,NULL,${opts.leftId ?? "NULL"},${opts.rightId ?? "NULL"},NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',1,1,NULL,NULL,NULL,${opts.trash ?? 0},2,` +
    (opts.content === undefined || opts.content === null
      ? "NULL"
      : `'${esc(opts.content)}'`) +
    ")"
  );
}

console.log(cardsRow(6, "Gamma Doc", { content: "Gamma body text.\nSecond line.\tTabbed." }));
console.log(cardsRow(3, "Alpha One+child", { key: null, leftId: 1, rightId: 4, content: "child content" }));
