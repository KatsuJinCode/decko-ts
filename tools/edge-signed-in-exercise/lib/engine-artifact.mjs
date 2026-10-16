import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export function pinnedEngineArtifact({ path, sha256, sourceCommit }) {
  if (!/^[a-f0-9]{64}$/.test(sha256 ?? '')) throw new Error('artifact requires exact lowercase SHA-256');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) throw new Error('artifact requires its declared engine source commit');
  if (!path || /^[tv]:[\\/]/i.test(path) || /[\\/]downloads(?:[\\/]|$)/i.test(path)) throw new Error('artifact path is forbidden');
  const absolute = resolve(path);
  for (let current = absolute; ; current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error('artifact path contains a link');
    if (dirname(current) === current) break;
  }
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.size > 7_600_000) throw new Error('artifact is not a boot-budget-sized regular file');
  const bytes = readFileSync(absolute);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha256) throw new Error('engine artifact SHA-256 mismatch');
  return { path: absolute, sha256: actual, bytes: bytes.length, sourceCommit,
    sourceCommitAssurance: 'caller-declared; exact executable artifact verified by SHA-256', rebuilt: false };
}
