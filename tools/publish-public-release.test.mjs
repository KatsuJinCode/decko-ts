import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RELEASE_TOPOLOGY,
  ISSUE_1282_COMMENT,
  verifyTopology,
  scanChangedFiles,
  verifyReleaseReceipts,
  buildSquashedPublicCommit,
} from './publish-public-release.mjs';

test('RELEASE_TOPOLOGY locks private staging remote vs public target remote', () => {
  assert.equal(RELEASE_TOPOLOGY.privateStagingRemote, 'release');
  assert.equal(RELEASE_TOPOLOGY.privateStagingSlug, 'KatsuJinCode/decko-ts-release');
  assert.equal(RELEASE_TOPOLOGY.publicTargetRemote, 'public');
  assert.equal(RELEASE_TOPOLOGY.publicTargetSlug, 'KatsuJinCode/decko-ts');
  assert.equal(RELEASE_TOPOLOGY.publicBranch, 'main');
  assert.equal(RELEASE_TOPOLOGY.publicAuthorEmail, 'noreply@github.com');
});

test('ISSUE_1282_COMMENT leads with 100x-1,114x and O(1) wins and links only to public KatsuJinCode/decko-ts main README', () => {
  assert.match(ISSUE_1282_COMMENT, /100x–1,114x/);
  assert.match(ISSUE_1282_COMMENT, /O\(1\)/);
  assert.match(ISSUE_1282_COMMENT, /https:\/\/github\.com\/KatsuJinCode\/decko-ts\/blob\/main\/README\.md/);
  assert.doesNotMatch(ISSUE_1282_COMMENT, /decko-ts-release/);
  assert.doesNotMatch(ISSUE_1282_COMMENT, /phase-2-release-candidate/);
});

test('verifyTopology, scanChangedFiles, verifyReleaseReceipts, and buildSquashedPublicCommit pass on clean HEAD', () => {
  const topo = verifyTopology(undefined, { checkRemoteVisibility: false });
  assert.equal(topo.ok, true, JSON.stringify(topo.errors));

  const scan = scanChangedFiles();
  assert.equal(scan.ok, true, JSON.stringify(scan.findings));

  const receipts = verifyReleaseReceipts();
  assert.equal(receipts.ok, true, JSON.stringify(receipts.errors));

  const commit = buildSquashedPublicCommit();
  assert.match(commit.squashedCommit, /^[0-9a-f]{40}$/);
  assert.match(commit.parentCommit, /^[0-9a-f]{40}$/);
});
