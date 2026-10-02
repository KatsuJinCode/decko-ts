// Direction check on scanner-vs-AST disagreements: comment residue the
// SCANNER kept proves the scanner (not the AST) is the wrong one on a file.
import fs from 'node:fs';
import { stripScanner } from './strip-comments-verified.mjs';

const files = process.argv.slice(2);
for (const f of files) {
  const s = stripScanner(fs.readFileSync(f, 'utf8'));
  const res = s.split(/\n/).filter((L) => /^\s*\/\/|^\s*\/\*/.test(L));
  console.log(
    f +
      ': scanner kept ' +
      res.length +
      ' comment-looking lines' +
      (res.length ? ' e.g. ' + JSON.stringify(res[0].trim().slice(0, 60)) : ' (none at line starts)'),
  );
}
