// Final census (attempt 3): every /lane/i hit in src/ TS/JS sources, dumped
// to census-final.txt; reports total, file count, and hits outside the 61
// tranche target files.
import fs from 'node:fs';
import path from 'node:path';

const targets = new Set([
  'src/card/attachments/asset-output-write.ts', 'src/card/attachments/attachment-store.ts',
  'src/card/auth/account-verify-reset-flows.ts', 'src/card/auth/migrations.ts',
  'src/card/drivers/bunny-db.ts', 'src/card/fetch.ts',
  'src/card/follow/follow-form-shapes.ts', 'src/card/follow/follow-render-seam.ts',
  'src/card/mod-loader.ts', 'src/card/mod-loader/default-mod-deck.ts',
  'src/card/mod-loader/mod-form-substrate-rule-form.ts', 'src/card/mod-loader/mod-form-substrate.ts',
  'src/card/mod-loader/mod-manifest.ts', 'src/card/mod-loader/mod-view-helpers.ts',
  'src/card/mod-loader/mods/card-mod-account.ts', 'src/card/mod-loader/mods/card-mod-assets.ts',
  'src/card/mod-loader/mods/card-mod-bootstrap.ts', 'src/card/mod-loader/mods/card-mod-carrierwave.ts',
  'src/card/mod-loader/mods/card-mod-comment.ts', 'src/card/mod-loader/mods/card-mod-date.ts',
  'src/card/mod-loader/mods/card-mod-email.ts', 'src/card/mod-loader/mods/card-mod-follow.ts',
  'src/card/mod-loader/mods/card-mod-help.ts', 'src/card/mod-loader/mods/card-mod-edit.ts',
  'src/card/mod-loader/mods/card-mod-format.ts', 'src/card/mod-loader/mods/card-mod-history.ts',
  'src/card/mod-loader/mods/card-mod-layout.ts', 'src/card/mod-loader/mods/card-mod-list.ts',
  'src/card/mod-loader/mods/card-mod-recaptcha.ts', 'src/card/mod-loader/mods/card-mod-rules.ts',
  'src/card/mod-loader/mods/card-mod-script.ts', 'src/card/mod-loader/mods/card-mod-search.ts',
  'src/card/mod-loader/mods/card-mod-tinymce_editor.ts', 'src/card/mod-loader/mods/core-admin-runtime.ts',
  'src/card/mod-loader/mods/core-mod.ts', 'src/card/mod-loader/mods/marketplace-mod-catalog.ts',
  'src/card/name/oracle-deck-inflections.ts', 'src/card/permissions/view-perms.ts',
  'src/card/render.ts', 'src/card/render/bootstrap-code-files.ts',
  'src/card/render/code-highlighting/scanners/java-script.ts', 'src/card/render/code-highlighting/scanners/json.ts',
  'src/card/render/deck-origin.ts', 'src/card/render/errors.ts',
  'src/card/render/format-families.ts', 'src/card/render/format.ts',
  'src/card/render/head-views.ts', 'src/card/render/navbar-views.ts',
  'src/card/render/page.ts', 'src/card/render/pointer-list.ts',
  'src/card/render/prefetch.ts', 'src/card/render/rule-bar-right.ts',
  'src/card/render/set-keys-to-modules.ts', 'src/card/render/setting-help-text.ts',
  'src/card/render/slot-html.ts', 'src/card/render/views.ts',
  'src/card/render/virtual-rule-card.ts', 'src/server/file-routes.ts',
  'src/server/first-run-routes.ts', 'src/server/write-routes.ts',
  'src/types/coffeescript-npm-1-12-2.d.ts',
]);

const out = [];
const outside = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|mjs|mts|d\.mts)$/.test(e.name)) {
      const rel = p.split(path.sep).join('/');
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      lines.forEach((L, i) => {
        if (/lane/i.test(L)) {
          const rec = rel + ':' + (i + 1) + ': ' + L.trim().slice(0, 150);
          out.push(rec);
          if (!targets.has(rel)) outside.push(rec);
        }
      });
    }
  }
}
walk('src');
fs.writeFileSync('.jargon-r2-scratch/census-final.txt', out.join('\n'));
console.log('src-wide lane-hit lines: ' + out.length + ' across ' + new Set(out.map((l) => l.split(':')[0])).size + ' files');
console.log('lines outside the 61 target files: ' + outside.length);
if (outside.length) console.log(outside.slice(0, 10).join('\n'));
