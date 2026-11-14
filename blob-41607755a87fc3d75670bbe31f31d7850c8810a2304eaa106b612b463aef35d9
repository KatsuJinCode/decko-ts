import { afterEach, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Shared ESM build tool has no TypeScript declaration.
import { copyRuntimeAssets, runtimeAssetReadiness } from '../../tools/dist/runtime-assets.mjs';

const owned: string[] = [];
afterEach(() => { for (const dir of owned.splice(0)) { if (path.dirname(dir) !== path.resolve(tmpdir())) throw Error('unsafe fixture cleanup'); rmSync(dir, { recursive: true, force: true }); } });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'runtime-assets-control-')); owned.push(root);
  const names = ['edge-bootstrap-scss-snapshot.js', 'edge-style-source-snapshot.js', 'edge-script-source-snapshot.js', 'libsass-wasm/libsass-3.6.4-wasm-base64.js', 'htmlentities-4.4.2/xhtml1.js', 'license/NOTICE'];
  for (const name of names) { const file = path.join(root, 'vendor', name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, 'export default "' + name + '";\n'); }
  return root;
}
it('copies every nested runtime asset and license with a verified complete manifest', () => {
  const root = fixture(), result = copyRuntimeAssets(root);
  expect(result.files).toBe(6); expect(runtimeAssetReadiness(root)).toEqual([]);
  expect(readFileSync(path.join(root, 'dist/vendor/htmlentities-4.4.2/xhtml1.js'))).toEqual(readFileSync(path.join(root, 'vendor/htmlentities-4.4.2/xhtml1.js')));
  expect(existsSync(path.join(root, 'dist/vendor/license/NOTICE'))).toBe(true);
});
it('detects absent HTML4 and same-length corrupted runtime copies instead of accepting a sentinel', () => {
  const root = fixture(); copyRuntimeAssets(root);
  rmSync(path.join(root, 'dist/vendor/htmlentities-4.4.2/xhtml1.js'));
  const file = path.join(root, 'dist/vendor/libsass-wasm/libsass-3.6.4-wasm-base64.js'), original = readFileSync(file);
  writeFileSync(file, Buffer.alloc(original.length, 120));
  expect(runtimeAssetReadiness(root)).toEqual(expect.arrayContaining(['dist/vendor/htmlentities-4.4.2/xhtml1.js', 'dist/vendor/libsass-wasm/libsass-3.6.4-wasm-base64.js']));
  copyRuntimeAssets(root); expect(runtimeAssetReadiness(root)).toEqual([]);
});
it('refuses incomplete source, redirected output and an extraneous stale asset', () => {
  const root = fixture(), outside = mkdtempSync(path.join(tmpdir(), 'runtime-assets-outside-')); owned.push(outside);
  symlinkSync(outside, path.join(root, 'dist'), 'junction');
  expect(() => copyRuntimeAssets(root)).toThrow(/redirected/); expect(existsSync(path.join(outside, 'vendor'))).toBe(false);
  rmSync(path.join(root, 'dist')); copyRuntimeAssets(root);
  writeFileSync(path.join(root, 'dist/vendor/stale.js'), 'old');
  expect(runtimeAssetReadiness(root)).toContain('unexpected dist/vendor/stale.js');
  rmSync(path.join(root, 'vendor/htmlentities-4.4.2/xhtml1.js'));
  expect(() => copyRuntimeAssets(root)).toThrow(/required runtime asset source/);
});
