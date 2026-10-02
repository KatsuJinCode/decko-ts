// Final AST-strip validation: fixpoint (strip(strip(x))==strip(x)) and the
// stripped text parses with zero syntax diagnostics, for all 61 files.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { stripAst } from './strip-comments-verified.mjs';

const require = createRequire(import.meta.url);
const ts = require('C:/localProjects/csdm-release/node_modules/typescript');

const all61 = [
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
];

let bad = 0;
for (const f of all61) {
  const text = fs.readFileSync(f, 'utf8');
  const s = stripAst(text);
  if (stripAst(s) !== s) {
    console.log('NOT FIXPOINT ' + f);
    bad++;
  }
  const diag = ts.createSourceFile('x.ts', s, ts.ScriptTarget.Latest, true).parseDiagnostics;
  const base = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true).parseDiagnostics;
  if (diag.length !== base.length) {
    console.log('PARSE DIAG CHANGE ' + f + ': base=' + base.length + ' stripped=' + diag.length);
    bad++;
  }
}
console.log(bad === 0 ? 'AST strip validated: fixpoint + parse-diagnostic parity on all 61 files' : bad + ' problem(s)');
process.exit(bad === 0 ? 0 : 1);
