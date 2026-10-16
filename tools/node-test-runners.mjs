// Classify actual imports, including existing Node suites deliberately excluded
// from Vitest. Comments and unrelated .mjs files cannot change the runner.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';

export function testRunner(root, file) {
  const source = parseAst(readFileSync(path.join(root, file), 'utf8'), { lang: /\.(?:ts|mts)$/.test(file) ? 'ts' : 'js' }, file);
  const modules = source.body.filter(statement => statement.type === 'ImportDeclaration').map(statement => statement.source.value);
  if (modules.includes('node:test') && modules.includes('vitest')) throw Error('mixed Node/Vitest test framework imports: ' + file);
  return modules.includes('node:test') ? 'node' : 'vitest';
}
export function nodeTestFiles(root) {
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'tmp', '.runtime', 'vendor'].includes(entry.name) || entry.name.startsWith('.git')) continue;
      const file = path.join(dir, entry.name), name = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(file, name);
      else if (/\.(test|spec)\.(ts|mts|js|mjs|cjs)$/.test(entry.name) && testRunner(root, name) === 'node') files.push(name);
    }
  }
  walk(root); return files.sort();
}
