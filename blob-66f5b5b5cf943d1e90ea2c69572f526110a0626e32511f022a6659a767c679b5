import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Shared ESM gate tool has no TypeScript declaration.
import { nodeTestFiles, testRunner } from '../../tools/node-test-runners.mjs';
const repo = fileURLToPath(new URL('../..', import.meta.url));
const owned: string[] = [];
afterEach(() => { for (const dir of owned.splice(0)) { if (path.dirname(dir) !== path.resolve(tmpdir())) throw Error('unsafe fixture cleanup'); rmSync(dir, { recursive: true, force: true }); } });
function fixture() { const root = mkdtempSync(path.join(tmpdir(), 'node-gate-control-')); owned.push(root); return root; }
it('uses actual framework imports instead of file extension, comments or string values', () => {
  const root = fixture();
  writeFileSync(path.join(root, 'node.test.mjs'), 'import {test} from "node:test"; test("actual",()=>{});');
  writeFileSync(path.join(root, 'vite.test.mjs'), '// import {test} from "node:test";\nimport {it} from "vitest"; const text="node:test";');
  expect(testRunner(root, 'node.test.mjs')).toBe('node'); expect(testRunner(root, 'vite.test.mjs')).toBe('vitest');
  expect(nodeTestFiles(root)).toEqual(['node.test.mjs']);
  writeFileSync(path.join(root, 'mixed.test.mjs'), 'import {test} from "node:test";import {it} from "vitest";');
  expect(() => testRunner(root, 'mixed.test.mjs')).toThrow(/mixed Node/);
});
it('runs actual Node assertions and propagates a failed file to the CLI exit and retained report', () => {
  const root = fixture();
  writeFileSync(path.join(root, 'pass.test.mjs'), 'import {test} from "node:test";import assert from "node:assert/strict";test("real pass",()=>assert.equal(1,1));');
  writeFileSync(path.join(root, 'fail.test.mjs'), 'import {test} from "node:test";import assert from "node:assert/strict";test("real intentional failure",()=>assert.equal(1,2));');
  const invoke = (files: string[], name: string) => {
    const list = path.join(root, name + '-files.json'), report = path.join(root, name + '.json'); writeFileSync(list, JSON.stringify(files));
    const child = spawnSync(process.execPath, [path.join(repo, 'tools/run-node-tests.mjs'), '--root', root, '--files-json', list, '--report', report], { encoding: 'utf8', windowsHide: true });
    return { child, result: JSON.parse(readFileSync(report, 'utf8')), events: readFileSync(report + '.events.jsonl', 'utf8') };
  };
  const good = invoke(['pass.test.mjs'], 'passing'); expect(good.child.status).toBe(0); expect(good.result.pass).toBe(true); expect(good.result.summary.counts.passed).toBe(1);
  const bad = invoke(['pass.test.mjs', 'fail.test.mjs'], 'failing'); expect(bad.child.status).toBe(1); expect(bad.result.pass).toBe(false); expect(bad.result.filesExecuted).toBe(2); expect(bad.result.summary.counts.failed).toBe(1); expect(bad.events).toContain('real intentional failure'); expect(bad.events).toContain('ERR_ASSERTION');
  writeFileSync(path.join(root, 'changing.test.mjs'), 'import {test} from "node:test";import {appendFileSync} from "node:fs";test("changes its source",()=>appendFileSync(new URL(import.meta.url),"\\n// modified during execution"));');
  const changed = invoke(['changing.test.mjs'], 'changed-source'); expect(changed.child.status).toBe(1); expect(changed.result.summary.counts.failed).toBe(0); expect(changed.result.sourceUnchanged).toBe(false); expect(changed.result.pass).toBe(false);
});
