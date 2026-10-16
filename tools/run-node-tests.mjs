// Preserve the real Node runner's events and explicitly propagate failures.
import { run } from 'node:test';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { nodeTestFiles } from './node-test-runners.mjs';

function json(value) {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === 'bigint') return { type: 'bigint', value: String(v) };
    if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack, ...Object.fromEntries(Object.getOwnPropertyNames(v).filter(k => !['name', 'message', 'stack'].includes(k)).map(k => [k, v[k]])) };
    return v;
  });
}
export async function runNodeTests({ root, files = nodeTestFiles(root), report }) {
  root = path.resolve(root);
  const expected = new Set(files.map(file => path.resolve(root, file)));
  if (!expected.size || expected.size !== files.length) throw Error('nonempty unique Node test file inventory required');
  for (const file of expected) { const rel = path.relative(root, file); if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Node test file escapes selected source root'); }
  const inputs = () => [...expected].map(file => ({ file: path.relative(root, file).replace(/\\/g, '/'), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }));
  const sourceBefore = inputs();
  if (report) { if (existsSync(report) || existsSync(report + '.events.jsonl')) throw Error('Node evidence output already exists'); mkdirSync(path.dirname(path.resolve(report)), { recursive: true }); writeFileSync(report + '.events.jsonl', '', { flag: 'wx' }); }
  const seen = new Set(), failures = []; let summary;
  const stream = run({ files: [...expected], concurrency: 1, cwd: root });
  for await (const event of stream) {
    if (report) appendFileSync(report + '.events.jsonl', json(event) + '\n');
    const data = event.data;
    if (data?.file && expected.has(path.resolve(data.file))) seen.add(path.resolve(data.file));
    if (event.type === 'test:fail') failures.push(data);
    if (event.type === 'test:summary') summary = data;
  }
  const missing = [...expected].filter(file => !seen.has(file));
  const sourceAfter = inputs(), sourceUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
  const result = { runner: 'node:test', node: process.version, files, filesExecuted: files.length - missing.length, missing, sourceBefore, sourceAfter, sourceUnchanged, summary, failures, pass: Boolean(summary) && sourceUnchanged && failures.length === 0 && missing.length === 0 && summary.success === true };
  if (report) writeFileSync(report, json(result) + '\n', { flag: 'wx' });
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = {}; for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  const root = path.resolve(args.root ?? '.'), files = args['files-json'] ? JSON.parse(readFileSync(args['files-json'], 'utf8')) : undefined;
  const result = await runNodeTests({ root, files, report: args.report });
  console.log(json({ runner: result.runner, files: result.files.length, filesExecuted: result.filesExecuted, summary: result.summary, failures: result.failures.length, pass: result.pass }));
  if (!result.pass) process.exitCode = 1;
}
