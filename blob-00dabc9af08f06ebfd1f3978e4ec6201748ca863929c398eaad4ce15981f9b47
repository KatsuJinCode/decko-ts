// Diagnose scanner-vs-AST strip disagreements: first divergence + context.
import fs from 'node:fs';
import { stripScanner, stripAst } from './strip-comments-verified.mjs';

const files = process.argv.slice(2);
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const a = stripScanner(text);
  const b = stripAst(text);
  let at = 0;
  while (at < Math.min(a.length, b.length) && a[at] === b[at]) at++;
  console.log(`=== ${f} first divergence at ${at} (scanner=${a.length} ast=${b.length})`);
  console.log(`scanner: ...${JSON.stringify(a.slice(Math.max(0, at - 60), at + 60))}`);
  console.log(`ast    : ...${JSON.stringify(b.slice(Math.max(0, at - 60), at + 60))}`);
}
