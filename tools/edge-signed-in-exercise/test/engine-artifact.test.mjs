import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, truncateSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pinnedEngineArtifact } from '../lib/engine-artifact.mjs';
import { startEdgeHost } from '../lib/edge-host.mjs';
test('exact artifact admits; missing source claim, wrong digest and changed bytes refuse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engine-artifact-proof-'));
  try {
    const path = join(dir, 'engine.bundle.js');
    writeFileSync(path, 'export default 42;');
    const sha256 = createHash('sha256').update('export default 42;').digest('hex');
    const input = { path, sha256, sourceCommit: '1'.repeat(40) };
    assert.equal(pinnedEngineArtifact(input).rebuilt, false);
    assert.equal(pinnedEngineArtifact(input).sha256, sha256);
    assert.throws(() => pinnedEngineArtifact({ ...input, sha256: '0'.repeat(64) }), /mismatch/);
    assert.throws(() => pinnedEngineArtifact({ ...input, sourceCommit: undefined }), /source commit/);
    writeFileSync(path, 'export default 43;');
    assert.throws(() => pinnedEngineArtifact(input), /mismatch/);
  } finally { rmSync(dir, { recursive: true }); }
});
test('oversized artifact refuses before loading its contents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engine-artifact-budget-'));
  try {
    const path = join(dir, 'engine.bundle.js');
    writeFileSync(path, ''); truncateSync(path, 7_600_001);
    assert.throws(() => pinnedEngineArtifact({ path, sha256: '0'.repeat(64), sourceCommit: '1'.repeat(40) }), /boot-budget/);
  } finally { rmSync(dir, { recursive: true }); }
});
test('staged bytes are checked before TLS setup or executing the candidate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engine-artifact-stage-'));
  try {
    const bundlePath = join(dir, 'engine.bundle.js'), runtimeDir = join(dir, 'runtime');
    writeFileSync(bundlePath, 'throw new Error("must not execute");');
    await assert.rejects(startEdgeHost({ bundlePath, runtimeDir, env: {}, expectedBundleSha256: '0'.repeat(64) }), /staged engine artifact SHA-256 mismatch/);
    assert.equal(existsSync(join(runtimeDir, 'harness-key.pem')), false);
  } finally { rmSync(dir, { recursive: true }); }
});
test('forbidden targets refuse before any filesystem access', () => {
  for (const path of ['T:/never-read.bundle.js', 'V:/never-read.bundle.js', 'C:/Users/example/Downloads/no.bundle.js']) {
    assert.throws(() => pinnedEngineArtifact({ path, sha256: '0'.repeat(64), sourceCommit: '1'.repeat(40) }), /forbidden/);
  }
});
