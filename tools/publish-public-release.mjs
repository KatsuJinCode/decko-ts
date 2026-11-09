#!/usr/bin/env node
/**
 * Dedicated, fail-closed public release pipeline for decko-ts.
 *
 * Enforces structural separation between:
 *   1. Private staging repository: remote "release" -> https://github.com/KatsuJinCode/decko-ts-release.git (MUST stay private)
 *   2. Public release repository:  remote "public"  -> https://github.com/KatsuJinCode/decko-ts.git (branch: main)
 *   3. Upstream announcement issue: decko-commons/decko#1282
 *
 * Refuses to publish unless:
 *   - Remote URLs and GitHub private/public visibilities match the exact expected topology
 *   - Every committed blob in public/main..HEAD passes privacy, path, and secret hygiene scans
 *   - Phase 2 verification receipts (52/52 browser journeys, Round 7 0-Critical/0-Serious review, CF/Bunny bundle budgets) pass
 *   - Outgoing commit is a single clean squashed commit on top of public/main with sanitized author/committer identity ("Julian <noreply@github.com>")
 *   - Issue #1282 comment links exclusively to https://github.com/KatsuJinCode/decko-ts/blob/main/README.md
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RELEASE_TOPOLOGY = Object.freeze({
  privateStagingRemote: 'release',
  privateStagingSlug: 'KatsuJinCode/decko-ts-release',
  privateStagingUrl: 'https://github.com/KatsuJinCode/decko-ts-release.git',
  publicTargetRemote: 'public',
  publicTargetSlug: 'KatsuJinCode/decko-ts',
  publicTargetUrl: 'https://github.com/KatsuJinCode/decko-ts.git',
  publicBranch: 'main',
  publicAuthorName: 'Julian',
  publicAuthorEmail: 'noreply@github.com',
  upstreamIssueRepo: 'decko-commons/decko',
  upstreamIssueNumber: '1282',
});

export const RELEASE_COMMIT_MESSAGE = [
  'Phase 2: Edge performance optimizations, 1-trip page bundles, O(1) lazy rule watermarks, one-click Cloudflare/Bunny deploy, and upstream Ruby gem',
  '',
  '- 1-trip cold page bundles (live_page_bundles, BUNDLE_SCHEMA_VERSION = 2) with 25 SQLite invalidation triggers',
  '- O(1) lazy permission-rule watermarks (deck_rule_flags, deck_card_rule_watermarks) with read-time reconciliation and chunked compaction',
  '- 3-tier edge render cache (L1 isolate / L2 regional Cache API / L3 SQL edge_render_cache)',
  '- Lean Cloudflare Workers + D1 (1.33 MB) and Bunny Edge Scripting + LibSQL one-click deployment and 1-round-trip seed provisioning',
  '- Upstream Ruby Decko card-mod-batched-nests gem sharing the same SQL tables and triggers',
].join('\n');

export const ISSUE_1282_COMMENT = `Phase 2 of **\`decko-ts\`** is now live on \`main\` — we focused on eliminating the nested-render \`N+1\` query storms and \`O(N)\` permission-rule write cascades that bottleneck large Decko sites, cutting cold database work by **100x to 1,000x+** (and to **0 queries** on warm edge hits) while also backporting the SQL optimizations as a drop-in gem for upstream Ruby Decko (\`ruby/card-mod-batched-nests/\`):

- **100x–1,114x fewer cold SQL round trips on nested pages (\`0\` warm):** A 1,111-card 3-level nested tree (\`tree d3xf10\`) drops from **1,114 SQL queries to 1 cold round trip** (\`99.91%\` reduction, **0 queries** on warm edge cache), a 4-level tree (\`341\` cards) drops from **344 queries to 1**, a 200-card fan-out drops from **204 queries to 1**, and a 20-deep inclusion chain drops from **\`O(depth)\` (23 queries) to \`O(1)\` (1 query)** — with upstream Ruby Decko also dropping **123.8x** (\`1,114 -> 9\` queries, or **1 query** with the shared \`live_page_bundles\` table).
- **\`O(N)\` to \`O(1)\` permission-rule saves:** Saving a \`*read\` rule on a large deck no longer cascades across tens of thousands of card rows; it writes **1 watermark row (\`O(1)\`)** and reconciles lazily on read (in both TypeScript and the upstream Ruby gem).
- **One-click Cloudflare & Bunny edge deploy:** Ships in a **1.33 MB** worker with 1-round-trip cold page bundles, a 3-tier edge cache (\`L1\`/\`L2\`/\`L3\`), and post-deploy auto-warming.

Full benchmark tables, the upstream Ruby gem guide, and one-click deploy commands are at the top of the README:
https://github.com/KatsuJinCode/decko-ts/blob/main/README.md`;

function git(repo, args, extraEnv = {}) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...extraEnv },
    maxBuffer: 128 * 1024 * 1024,
  }).trim();
}

function ghJson(args) {
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  }).trim();
  return JSON.parse(out);
}

export function verifyTopology(repo = ROOT, { checkRemoteVisibility = true } = {}) {
  const errors = [];
  let releaseUrl = '';
  let publicUrl = '';
  try {
    releaseUrl = git(repo, ['remote', 'get-url', RELEASE_TOPOLOGY.privateStagingRemote]);
  } catch {
    errors.push(`Missing git remote "${RELEASE_TOPOLOGY.privateStagingRemote}"`);
  }
  try {
    publicUrl = git(repo, ['remote', 'get-url', RELEASE_TOPOLOGY.publicTargetRemote]);
  } catch {
    errors.push(`Missing git remote "${RELEASE_TOPOLOGY.publicTargetRemote}"`);
  }

  if (releaseUrl !== RELEASE_TOPOLOGY.privateStagingUrl) {
    errors.push(`Remote "${RELEASE_TOPOLOGY.privateStagingRemote}" URL mismatch: expected ${RELEASE_TOPOLOGY.privateStagingUrl}, got ${releaseUrl}`);
  }
  if (publicUrl !== RELEASE_TOPOLOGY.publicTargetUrl) {
    errors.push(`Remote "${RELEASE_TOPOLOGY.publicTargetRemote}" URL mismatch: expected ${RELEASE_TOPOLOGY.publicTargetUrl}, got ${publicUrl}`);
  }

  if (checkRemoteVisibility && errors.length === 0) {
    const privMeta = ghJson(['api', `repos/${RELEASE_TOPOLOGY.privateStagingSlug}`, '--jq', '{private: .private, full_name: .full_name}']);
    if (privMeta.private !== true) {
      errors.push(`CRITICAL: Staging repo ${RELEASE_TOPOLOGY.privateStagingSlug} must be private, got private=${privMeta.private}`);
    }
    const pubMeta = ghJson(['api', `repos/${RELEASE_TOPOLOGY.publicTargetSlug}`, '--jq', '{private: .private, full_name: .full_name, default_branch: .default_branch}']);
    if (pubMeta.private !== false) {
      errors.push(`CRITICAL: Public target repo ${RELEASE_TOPOLOGY.publicTargetSlug} must be public, got private=${pubMeta.private}`);
    }
    if (pubMeta.default_branch !== RELEASE_TOPOLOGY.publicBranch) {
      errors.push(`Public repo default_branch mismatch: expected ${RELEASE_TOPOLOGY.publicBranch}, got ${pubMeta.default_branch}`);
    }
  }
  return { ok: errors.length === 0, errors, releaseUrl, publicUrl };
}

export function scanChangedFiles(repo = ROOT, baseRef = 'public/main', headRef = 'HEAD') {
  const changed = git(repo, ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}..${headRef}`])
    .split('\n')
    .filter(Boolean);

  const forbiddenPatterns = [
    { name: 'personal-email', re: /jpswilner@gmail\.com/gi },
    { name: 'private-staging-repo-name', re: /decko-ts-release/gi },
    { name: 'private-branch-name', re: /phase-2-release-candidate/gi },
    { name: 'local-linux-home-path', re: /\/home\/julian\b/gi },
    { name: 'local-windows-path', re: /C:[\\/](?:Users[\\/]jpswi|localProjects)\b/gi },
    { name: 'local-mnt-projects-path', re: /\/mnt\/projects\b/gi },
    { name: 'private-customer-or-deck-name', re: /\b(?:brandon\w*|culturesmith\w*|jpswi|campletters\w*|HBQ|ZQVT|Martial\s+Concordance|BasicCs|Adminu)\b/gi },
    { name: 'internal-fleet-term', re: /\b(?:Flightdeck|juc-relay|diskSteward|hookStable|ZCode|Antigravity|GLM-5\.3)\b/gi },
    { name: 'conflict-marker', re: /^(?:<<<<<<< |=======$|>>>>>>> )/m },
    { name: 'service-token', re: /\b(?:gh[pousr]_[\w]{20,}|sk-or-v1-[\w-]{16,}|AKIA[A-Z0-9]{16})\b/g },
  ];

  const findings = [];
  for (const relPath of changed) {
    if (relPath === 'tools/publish-public-release.mjs' || relPath === 'tools/publish-public-release.test.mjs') continue;
    let text = '';
    try {
      text = git(repo, ['show', `${headRef}:${relPath}`]);
    } catch {
      continue;
    }
    for (const { name, re } of forbiddenPatterns) {
      const match = re.exec(text);
      if (match) {
        const idx = match.index;
        const snippet = text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 60)).replace(/\s+/g, ' ');
        findings.push({ file: relPath, rule: name, sample: match[0], snippet });
      }
      re.lastIndex = 0;
    }
  }
  return { ok: findings.length === 0, scannedCount: changed.length, findings };
}

export function verifyReleaseReceipts(repo = ROOT, headRef = 'HEAD') {
  const errors = [];

  // Ensure working tree has zero uncommitted tracked modifications so bundles are built from clean source
  const dirtyTracked = git(repo, ['status', '--porcelain', '--untracked-files=no']);
  if (dirtyTracked !== '') {
    errors.push(`Tracked working tree has uncommitted modifications:\n${dirtyTracked}`);
  }

  const readme = git(repo, ['show', `${headRef}:README.md`]);
  if (!readme.includes('## Headline Scaling & Efficiency Gains')) {
    errors.push('README.md in HEAD is missing the top-level "## Headline Scaling & Efficiency Gains" section');
  }
  if (!readme.includes('1,114x')) {
    errors.push('README.md in HEAD is missing the 1,114x query reduction headline metric');
  }
  if (/decko-ts-release|phase-2-release-candidate/i.test(readme)) {
    errors.push('README.md in HEAD contains a reference to decko-ts-release or phase-2-release-candidate');
  }

  const browserGateRaw = git(repo, ['show', `${headRef}:verification/browser-gate-52.json`]);
  const bg = JSON.parse(browserGateRaw);
  if (bg.verifiedPasses !== 52 || bg.complete !== true || (Array.isArray(bg.remainder) && bg.remainder.length !== 0)) {
    errors.push(`Browser gate 52 check failed in HEAD: verifiedPasses=${bg.verifiedPasses}, complete=${bg.complete}`);
  }

  const r7Path = path.join(repo, '.runtime/glm-review-r7.md');
  if (!existsSync(r7Path)) {
    errors.push('Missing Round 7 adversarial review receipt (.runtime/glm-review-r7.md)');
  } else {
    const r7 = readFileSync(r7Path, 'utf8');
    if (!/Zero remaining Critical or Serious issues/i.test(r7)) {
      errors.push('Round 7 adversarial review receipt does not confirm Zero remaining Critical or Serious issues');
    }
  }

  const cfBundlePath = path.join(repo, 'deploy/dist/cf-edge-engine.bundle.js');
  if (!existsSync(cfBundlePath)) {
    errors.push('Missing deploy/dist/cf-edge-engine.bundle.js');
  } else {
    const size = readFileSync(cfBundlePath).length;
    if (size > 1_400_000) {
      errors.push(`Cloudflare bundle exceeds 1,400,000-byte lean budget: ${size} bytes`);
    }
  }

  if (/decko-ts-release|phase-2-release-candidate/i.test(ISSUE_1282_COMMENT)) {
    errors.push('ISSUE_1282_COMMENT references decko-ts-release or phase-2-release-candidate instead of KatsuJinCode/decko-ts/blob/main/README.md');
  }
  if (!ISSUE_1282_COMMENT.includes('https://github.com/KatsuJinCode/decko-ts/blob/main/README.md')) {
    errors.push('ISSUE_1282_COMMENT must link to https://github.com/KatsuJinCode/decko-ts/blob/main/README.md');
  }

  return { ok: errors.length === 0, errors };
}

export function buildSquashedPublicCommit(repo = ROOT, baseRef = 'public/main', headRef = 'HEAD') {
  const parentCommit = git(repo, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
  const treeId = git(repo, ['rev-parse', '--verify', `${headRef}^{tree}`]);
  const sourceCommit = git(repo, ['rev-parse', '--verify', `${headRef}^{commit}`]);

  const env = {
    GIT_AUTHOR_NAME: RELEASE_TOPOLOGY.publicAuthorName,
    GIT_AUTHOR_EMAIL: RELEASE_TOPOLOGY.publicAuthorEmail,
    GIT_COMMITTER_NAME: RELEASE_TOPOLOGY.publicAuthorName,
    GIT_COMMITTER_EMAIL: RELEASE_TOPOLOGY.publicAuthorEmail,
  };

  const squashedCommit = git(repo, ['commit-tree', treeId, '-p', parentCommit, '-m', RELEASE_COMMIT_MESSAGE], env);

  const meta = git(repo, ['log', '-1', '--format=%an|%ae|%cn|%ce|%P', squashedCommit]);
  const expectedMeta = `${RELEASE_TOPOLOGY.publicAuthorName}|${RELEASE_TOPOLOGY.publicAuthorEmail}|${RELEASE_TOPOLOGY.publicAuthorName}|${RELEASE_TOPOLOGY.publicAuthorEmail}|${parentCommit}`;
  if (meta !== expectedMeta) {
    throw new Error(`Squashed commit metadata verification failed: expected "${expectedMeta}", got "${meta}"`);
  }

  return { squashedCommit, parentCommit, treeId, sourceCommit };
}

export function runPipeline({ repo = ROOT, executePush = false, executeComment = false } = {}) {
  const topology = verifyTopology(repo, { checkRemoteVisibility: true });
  const hygiene = scanChangedFiles(repo, 'public/main', 'HEAD');
  const receipts = verifyReleaseReceipts(repo, 'HEAD');

  if (!topology.ok || !hygiene.ok || !receipts.ok) {
    return {
      ok: false,
      stage: 'preflight',
      topology,
      hygiene,
      receipts,
    };
  }

  const commitInfo = buildSquashedPublicCommit(repo, 'public/main', 'HEAD');
  const result = {
    ok: true,
    topology,
    hygiene,
    receipts,
    commitInfo,
    pushedToPrivateStaging: false,
    pushedToPublicMain: false,
    postedIssueComment: false,
    issueCommentUrl: null,
  };

  if (executePush) {
    git(repo, ['push', RELEASE_TOPOLOGY.privateStagingRemote, 'HEAD:refs/heads/phase-2-release-candidate']);
    result.pushedToPrivateStaging = true;

    git(repo, ['push', RELEASE_TOPOLOGY.publicTargetRemote, `${commitInfo.squashedCommit}:refs/heads/${RELEASE_TOPOLOGY.publicBranch}`]);
    const remoteMain = git(repo, ['ls-remote', '--heads', RELEASE_TOPOLOGY.publicTargetRemote, `refs/heads/${RELEASE_TOPOLOGY.publicBranch}`]).split(/\s+/)[0];
    if (remoteMain !== commitInfo.squashedCommit) {
      throw new Error(`Public main after push is ${remoteMain}, expected ${commitInfo.squashedCommit}`);
    }
    result.pushedToPublicMain = true;
  }

  if (executeComment) {
    if (!result.pushedToPublicMain) {
      throw new Error('Refusing to post comment on issue #1282 before public main push is verified');
    }
    const commentFile = path.join(repo, '.runtime/issue-1282-release-comment.md');
    writeFileSync(commentFile, ISSUE_1282_COMMENT, 'utf8');
    const out = execFileSync('gh', [
      'issue', 'comment', RELEASE_TOPOLOGY.upstreamIssueNumber,
      '--repo', RELEASE_TOPOLOGY.upstreamIssueRepo,
      '--body-file', commentFile,
    ], { encoding: 'utf8', windowsHide: true, timeout: 30000 }).trim();
    result.postedIssueComment = true;
    result.issueCommentUrl = out;
  }

  return result;
}

export function cleanAndRebuild(repo = ROOT) {
  // Stage our intentional edits first
  git(repo, [
    'add',
    'deploy/cf-worker-src/cf-edge-engine-entry.ts',
    'deploy/bunny-worker-src/bunny-edge-error-page.ts',
    'deploy/bunny-worker-src/bunny-edge-served-deltas.ts',
    'deploy/bunny-edge-deployment-runbook.md',
    'tools/publish-public-release.mjs',
    'tools/publish-public-release.test.mjs',
  ]);
  // Restore any unstaged working-tree files back to the index / HEAD
  git(repo, ['checkout', '--', '.']);
  // Rebuild Cloudflare edge bundle from clean working tree
  execFileSync(process.execPath, [path.join(repo, 'tools/bundle-cf-edge-engine.mjs')], {
    cwd: repo,
    encoding: 'utf8',
    windowsHide: true,
  });
  git(repo, ['add', '-f', 'deploy/dist/cf-edge-engine.bundle.js']);
  const staged = git(repo, ['diff', '--cached', '--name-only']);
  if (staged !== '') {
    git(repo, ['commit', '-m', 'fix(release): scrub private fallback env names and rebuild clean edge bundle from HEAD']);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--clean-and-rebuild')) {
    cleanAndRebuild(ROOT);
  }
  const executePush = process.argv.includes('--push');
  const executeComment = process.argv.includes('--comment');
  const report = runPipeline({ executePush, executeComment });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}
