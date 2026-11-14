// Comments-only proof for the tranche-2 jargon scrub (worktree decko-ts-lane-jargon3).
// Pure-fs: git was severed mid-lane by the concurrent main-repo rebuild, so the
// base blobs under base/ were snapshotted from 40e91d18 while git still worked.
// A file is proven iff a base snapshot exists and the comment-stripped bytes
// are IDENTICAL base vs working tree. The strip is the AST-based
// stripAst (strip-comments-verified.mjs): the original bare-scanner strip
// mis-lexed template substitutions and regex literals (no parser context),
// swallowing comment AND code text downstream into one token — false drift.
// stripAst takes comment ranges only from parser-verified trivia positions
// (all tokens incl. punctuation, leading+trailing windows) and was validated
// for zero comment residue, fixpoint, and parse-diagnostic parity on all 61
// target files (ast-strip-validate.mjs).
// Also checks the CRLF pair counts of the four gate files against the
// base-40e91d18 values (render.ts 61, views.ts 527, format.ts 0,
// write-routes.ts 940).
// Exit 0 = proof holds; exit 1 = any executable-content or CRLF drift.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stripAst as stripComments } from './strip-comments-verified.mjs';

const require = createRequire(import.meta.url);
const ts = require('C:/localProjects/csdm-release/node_modules/typescript');

const ROOT = 'C:/localProjects/decko-ts-lane-jargon3';
const BASE_DIR = path.join(ROOT, '.jargon-r2-scratch/base');

// The full tranche target list (classification-table items 1-61).
const fullTargetList = [
  'src/card/attachments/asset-output-write.ts',
  'src/card/attachments/attachment-store.ts',
  'src/card/auth/account-verify-reset-flows.ts',
  'src/card/auth/migrations.ts',
  'src/card/drivers/bunny-db.ts',
  'src/card/fetch.ts',
  'src/card/follow/follow-form-shapes.ts',
  'src/card/follow/follow-render-seam.ts',
  'src/card/mod-loader.ts',
  'src/card/mod-loader/default-mod-deck.ts',
  'src/card/mod-loader/mod-form-substrate-rule-form.ts',
  'src/card/mod-loader/mod-form-substrate.ts',
  'src/card/mod-loader/mod-manifest.ts',
  'src/card/mod-loader/mod-view-helpers.ts',
  'src/card/mod-loader/mods/card-mod-account.ts',
  'src/card/mod-loader/mods/card-mod-assets.ts',
  'src/card/mod-loader/mods/card-mod-bootstrap.ts',
  'src/card/mod-loader/mods/card-mod-carrierwave.ts',
  'src/card/mod-loader/mods/card-mod-comment.ts',
  'src/card/mod-loader/mods/card-mod-date.ts',
  'src/card/mod-loader/mods/card-mod-email.ts',
  'src/card/mod-loader/mods/card-mod-follow.ts',
  'src/card/mod-loader/mods/card-mod-help.ts',
  'src/card/mod-loader/mods/card-mod-edit.ts',
  'src/card/mod-loader/mods/card-mod-format.ts',
  'src/card/mod-loader/mods/card-mod-history.ts',
  'src/card/mod-loader/mods/card-mod-layout.ts',
  'src/card/mod-loader/mods/card-mod-list.ts',
  'src/card/mod-loader/mods/card-mod-recaptcha.ts',
  'src/card/mod-loader/mods/card-mod-rules.ts',
  'src/card/mod-loader/mods/card-mod-script.ts',
  'src/card/mod-loader/mods/card-mod-search.ts',
  'src/card/mod-loader/mods/card-mod-tinymce_editor.ts',
  'src/card/mod-loader/mods/core-admin-runtime.ts',
  'src/card/mod-loader/mods/core-mod.ts',
  'src/card/mod-loader/mods/marketplace-mod-catalog.ts',
  'src/card/name/oracle-deck-inflections.ts',
  'src/card/permissions/view-perms.ts',
  'src/card/render.ts',
  'src/card/render/bootstrap-code-files.ts',
  'src/card/render/code-highlighting/scanners/java-script.ts',
  'src/card/render/code-highlighting/scanners/json.ts',
  'src/card/render/deck-origin.ts',
  'src/card/render/errors.ts',
  'src/card/render/format-families.ts',
  'src/card/render/format.ts',
  'src/card/render/head-views.ts',
  'src/card/render/navbar-views.ts',
  'src/card/render/page.ts',
  'src/card/render/pointer-list.ts',
  'src/card/render/prefetch.ts',
  'src/card/render/rule-bar-right.ts',
  'src/card/render/set-keys-to-modules.ts',
  'src/card/render/setting-help-text.ts',
  'src/card/render/slot-html.ts',
  'src/card/render/views.ts',
  'src/card/render/virtual-rule-card.ts',
  'src/server/file-routes.ts',
  'src/server/first-run-routes.ts',
  'src/server/write-routes.ts',
  'src/types/coffeescript-npm-1-12-2.d.ts',
];

function crlfCount(buf) {
  let n = 0;
  for (let i = 1; i < buf.length; i++) {
    if (buf[i] === 0x0a && buf[i - 1] === 0x0d) n++;
  }
  return n;
}

let bad = 0;
let proven = 0;
for (const f of fullTargetList) {
  const cur = fs.readFileSync(path.join(ROOT, f));
  const basePath = path.join(BASE_DIR, f);
  if (!fs.existsSync(basePath)) {
    console.log(`SKIP (no base snapshot - lane has not touched it yet) ${f}`);
    continue;
  }
  const base = fs.readFileSync(basePath);
  const a = stripComments(base.toString('utf8'));
  const b = stripComments(cur.toString('utf8'));
  if (a !== b) {
    bad++;
    let at = 0;
    while (at < a.length && a[at] === b[at]) at++;
    console.error(`EXECUTABLE DRIFT ${f} (stripped ${a.length} vs ${b.length} bytes, first divergence at ${at})`);
    console.error(`  base: ...${JSON.stringify(a.slice(Math.max(0, at - 40), at + 60))}`);
    console.error(`  curr: ...${JSON.stringify(b.slice(Math.max(0, at - 40), at + 60))}`);
  } else {
    proven++;
    console.log(`OK ${f}`);
  }
}

const gates = [
  ['src/card/render.ts', 61],
  ['src/card/render/views.ts', 527],
  ['src/card/render/format.ts', 0],
  ['src/server/write-routes.ts', 940],
];
for (const [f, want] of gates) {
  const cur = crlfCount(fs.readFileSync(path.join(ROOT, f)));
  const status = cur === want ? 'OK' : 'FAIL';
  if (status === 'FAIL') bad++;
  console.log(`${status} CRLF ${f}: cur=${cur} expected=${want}`);
}

if (bad > 0) {
  console.error(`PROOF FAILED: ${bad} problem(s)`);
  process.exit(1);
}
console.log(`PROOF HOLDS: ${proven} files executable-content byte-identical, CRLF gates unchanged`);
