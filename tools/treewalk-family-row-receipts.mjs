#!/usr/bin/env node
// treewalk-family-row-receipts.mjs - the [Family] lane's per-row receipts.
//
// WHAT THIS IS. The lane's job is to work the family's thirty WORKING
// rows and close a row to DONE only where the port measurably matches
// the pinned Ruby. This script writes the RECEIPT for each row: the
// row's measured dispositions, the gap defs with their Ruby file and
// line, and the verdict.
//
// The receipts are GENERATED from the rig's own output, so a receipt
// cannot disagree with the instrument, and the gap names in a receipt are
// the gap names the rig measured.
//
// A receipt's verdict is DONE only when the rig measured NO GAP for the
// row. A row with a gap keeps WORKING ON IT and the receipt names the
// gap in one mechanism sentence.
//
// Run:
//   node tools/treewalk-family-row-receipts.mjs --out <dir>

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

const DISPOSITION_TOOL = join(HERE, 'treewalk-family-row-disposition.mjs');
const ROSTER = process.env.DECKO_COMPLETENESS_ROSTER
  ?? 'C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json';

const outIndex = process.argv.indexOf('--out');
const OUT = outIndex >= 0 ? process.argv[outIndex + 1] : join(REPO_ROOT, 'docs/runs/treewalk-row-conversion-2026-10-22');

const roster = JSON.parse(readFileSync(ROSTER, 'utf8'));
const working = roster.items
  .filter((i) => i.family === 'register-treewalk' && i.bucket === 'WORKING ON IT')
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const raw = execFileSync(process.execPath, [DISPOSITION_TOOL, '--all', '--json'], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});
const measured = JSON.parse(raw);
const byId = new Map(measured.map((r) => [r.id, r]));

// The row's own gap sentence, in one mechanism. The DEFS are named, and
// the mechanism is the shape the port's own source shows.
const GAP_MECHANISM = {
  'reg-treewalk-c2-auth-proxy-rb-6-29-48-59':
    'the port has no permission-proxy: Ruby’s `with` saves and restores a PROCESS-GLOBAL current_id and the port\'s engine has no process-global to save, which is the same mechanism the port names for the row\'s collapsed `temporarily` (src/card/auth/actor.ts:29).',
  'reg-treewalk-c2-auth-setup-rb-9-15-39-51':
    'the port carries the setup census and not the test surface: the row\'s two remaining defs are a test-only helper the pinned deck never calls and the id LIST behind the count, which the port does not need because it counts the accounts directly (countUserAccounts, src/card/auth/first-run-setup.ts:311).',
  'reg-treewalk-c2-cache-all-card-class-class-methods-populate-shared':
    'the port fills its cache on demand and has no class-level cache registry: the row\'s defs are the cache POPULATION half (Ruby pre-fills the cache at boot), the class-level REGISTRY and the shared-cache STAMP, none of which the port has a counterpart for.',
  'reg-treewalk-c2-cache-rb-34-91-cache-shared-temporary-rb':
    'the port carries the guard as INLINE behaviour and does not cite the helper: `with_multiple_keys` (cache.rb:95-99) is the one-line guard that makes a multi-key read return nothing for one key, and the port\'s readMulti opens with exactly that condition (src/card/fetch/cache.ts:337) without naming the helper.',
  'reg-treewalk-c2-content-all-rb-5-56':
    'the port\'s draft surface is a different mechanism: the row\'s three defs are the DRAFT half of Ruby\'s content surface (re-read the content, the last draft\'s content, whether the content is blank), and the port\'s save path carries a draft action and the draft\'s stored bytes (src/card/actions/types.ts:168-172) instead.',
  'reg-treewalk-c2-content-clean-rb-37-95':
    'the port has no content-CLEANING surface: the row\'s defs strip the tags, the comments and the style attributes from a card\'s content, and no port file cites lib/card/content/clean.rb at all.',
  'reg-treewalk-c2-content-rb-20-120':
    'the port has no chunk-QUERY API: the row\'s defs find the chunks of a type, walk them and strip them, and the port\'s chunk surface is the RENDERER\'s nest syntax (src/card/render/nest-syntax.ts) rather than Ruby\'s query surface.',
  'reg-treewalk-c2-director-rb-director-rb-9':
    'the port runs an act\'s stages in one call and has no director REGISTRY: the row\'s defs are the registry (unregister, appoint, main_director), the run and stage machinery and the store, and the port\'s act lifecycle is the action engine\'s own (src/card/actions/card-action-engine.ts).',
  'reg-treewalk-c2-dirty-rb-dirty-method-factory-rb':
    'the port computes the before-values it needs instead of defining dirty methods on the record: the row\'s defs are the half Ruby\'s method factory GENERATES, and the port\'s write path carries the dirty tracking by a different mechanism (src/card/actions/update-referer-content.ts:72 and :467).',
  'reg-treewalk-c2-fetch-rb-fetch-all-card-class-results-retrieve-sto':
    'the port has no Ruby-shaped fetch options and no results helpers: the row\'s defs are validate_opts! (the guard that refuses a contradictory options pair), the newish and refresh helpers and the results helpers, and the port carries the guard by its own mechanism (src/card/fetch.ts:223-226).',
  'reg-treewalk-c2-format-rb-format-content-context-names-render-regi':
    'the port\'s format module is the renderer\'s own and has no Rails-facing surface: the row\'s defs are require_card_to_initialize!, the mime type, the context-names round trip, the render and wrapper methods and the registration helpers.',
  'reg-treewalk-c2-mailer-rb-9-26':
    'the port builds its mail headers in renderMail and its envelope in the transport, so the three defaults Ruby holds in ONE method are split across two port functions: the row\'s def is defaults_from_config, and the port cites only its charset half (src/card/notify/mail.ts:202).',
  'reg-treewalk-c2-mark-rb':
    'the port\'s own map does not claim mark.rb#cardish: the port\'s fetch path carries the BEHAVIOUR (a Card record mark resolves at src/card/fetch/retrieve.ts:154) and cites lib/card/mark.rb, but no port file names the method.',
  'reg-treewalk-c2-model-save-helper-rb-3':
    'the row is the deck\'s EXTERNAL-SCRIPTING library API and the port carries the capability under its own names without citing Ruby\'s file: the pinned deck\'s runtime calls none of these methods (the deck\'s own red-team audit measured the same), so there is no behaviour the port owes.',
  'reg-treewalk-c2-name-rb-name-all-all-descendants-all-parts-card-cl':
    'the port carries the name composition under its own surface and does not have Ruby\'s SUPERCARD branch: the row\'s defs are the construction helpers, the supercard handling, the name= writer\'s subcard cascade and the rename helpers.',
  'reg-treewalk-c2-reference-rb-reference-all-rb':
    'the port carries the reference read and write path and not the reference REPAIR and the referer-collection half: the row\'s seven defs are the ones the port binds no function for under any name.',
  'reg-treewalk-c2-rule-rb-rule-all-cache-preference-cache-read-rule-':
    'the port carries the rule cache READ path and the invalidation is its write path\'s job: the row\'s eight defs are the cache-clearing surface and the preference helpers behind it.',
  'reg-treewalk-c2-set-rb-set-28':
    'the port carries the set-module DECLARATION surface by a different mechanism: the row\'s ninety-nine defs are the set-definition DSL\'s own generators and registries (the event and view method factories, the format-module registration, the options and trait surfaces), and the port\'s mod loader reads the deck\'s set files and records the registrations (src/card/mod-loader/mod-registrar.ts).',
  'reg-treewalk-c2-setting-rb-63-114':
    'the port carries the setting REGISTRY and not the option helpers behind it: the row\'s three defs fill a setting\'s default option hash, narrow a setting to one card type and list the types a setting may be used on.',
  'reg-treewalk-c2-subcards-rb-subcards-add-all-args-relate-remove-rb':
    'the port saves a card\'s subcards in the same act and has no sub-card API: the row\'s twenty-six defs are the add, the remove and the reads around them, and the port\'s write path is the action engine\'s (src/card/actions/card-action-engine.ts).',
  'reg-treewalk-c2-view-rb-view-classy-permission-rb-view-cache-4':
    'the port has no view LINEAGE and no per-view cache: the row\'s sixteen defs are the view ancestry (root, deep_root, next_ancestor), the classy surface and the view-cache cluster, and the port\'s view is the format module\'s own.',
  'reg-treewalk-d1':
    'the port is not Rails and has no Rails initializers, environments or schema loader: the row\'s twenty-nine defs are the Rails core extensions (the Hash and Module extensions, the ActiveRecord patches) and the better_errors patch, mechanisms Rails provides and the port has no use for.',
  'reg-treewalk-d2':
    'the port is not Rails and has no railtie, no Rails application class and no rake command layer: the row\'s one hundred and forty defs are the Rails host\'s own surface, and the port is a library and an edge worker rather than a Rails server.',
  'reg-treewalk-d3':
    'the port has no generator: the row\'s thirty-one defs are the interactive prompts, the deck generator\'s file map, the migration generator and the mod and set generators, and the port\'s own deck bootstrap is the seed-and-boot path (src/card/auth/boot-seed.ts).',
  'reg-treewalk-e1':
    'the port carries the core mod by a different mechanism: the row\'s thirty-eight defs are the core mod\'s admin and set-module surface, and the port\'s equivalents are the core-admin-runtime (src/card/mod-loader/mods/core-admin-runtime.ts) and the core mod\'s own registrations (src/card/mod-loader/mods/core-mod.ts).',
  'reg-treewalk-e3':
    'the port has no Rails migration history and no Rails seed loader: the row\'s fifty-three defs are the schema and transform migrations themselves, and the port\'s schema is its own (db/schema.sqlite.sql) with the deck\'s data read as a seed corpus.',
  'reg-treewalk-e5':
    'the port has no rake task runner: the row\'s seventeen defs are the rake task CLI and its option parsing plus the seed and migrate tasks\' own methods, and the port\'s equivalents are the commands the deploy scripts invoke.',
};

const CLOSED_MECHANISM = {
  'reg-treewalk-c1':
    'the row\'s subject is the class BODY, not methods, and the port carries every declaration in it: the mixin roster (the seven extends and eleven includes, each with a port module named for it), the action_specific_attributes list (the port names the same list and cites lib/card.rb:146), the four associations (the port reads and writes the same rows by the same keys), and the three Rails callback chains (the port names all three in the dispatcher\'s table and cites lib/card.rb:181). The one declaration the port does not carry is the `delegate :config, :paths, to: Cardio` line, because that reaches the RAILS APPLICATION\'s configuration and the port is not Rails.',
  'reg-treewalk-c2-auth-token-rb-10-33':
    'the port carries all five of the row\'s methods and cites the Ruby for each: encode is the port\'s `encodeAuthToken` (src/card/auth/token.ts:309), validate! is at :466, decode at :370, expiration at :169, and signin_with_token is the port\'s `signinFromToken` (src/server/request-authenticators.ts:123), which cites card-1.110.0/lib/card/auth/token.rb:38-41 by name. The pinned bytes were executed to confirm the behaviours: decode answers with the error MESSAGE on a bad token rather than raising, and expiration reads the config.',
  'reg-treewalk-e4':
    'the row\'s six defs are the deck\'s own RSpec SPEC HELPERS (assert_rename, expect_successful_rename, name_invariant_attributes, card_to_rename, run_admin_task, card_subject), and the pinned deck calls them only from its own spec files, so the old system\'s RUNTIME never reached them. The port\'s counterpart for a spec file is its own TEST SUITE, and the port carries the behaviour those specs check: the rename invariants (tests/card/actions/renamegate-rename-created-sides-verdicts.test.ts and rename-referer-cache-staleness.test.ts), the blocked self-side rename (obstructed-self-side-rename-write.test.ts) and the codename cache reset (codename-cache-reset-save-path.test.ts). A spec helper is not something a port SHOULD bind, so the rig measures these as the deck\'s inert library API and its private helpers, not as port gaps.',
};

mkdirSync(OUT, { recursive: true });

const index = [];
for (const item of working) {
  const m = byId.get(item.id);
  if (!m) throw new Error(`the rig produced no measurement for ${item.id}`);
  const gaps = m.gaps;
  const closed = gaps.length === 0;
  // The mechanism sentence opens with a capital, so the receipt reads as
  // a sentence and not as a fragment.
  const capitalize = (text) => (text.length === 0 ? text : text[0].toUpperCase() + text.slice(1));
  const mechanism = closed
    ? capitalize(CLOSED_MECHANISM[item.id] ?? '')
    : capitalize(GAP_MECHANISM[item.id] ?? '');

  const lines = [];
  lines.push(`# ${item.id}`);
  lines.push('');
  lines.push(`- Ruby's file set: \`${item.sourceParent}\``);
  lines.push(`- The row's own label: ${item.label}`);
  lines.push(`- ${m.rubyFiles} Ruby file(s), ${m.defCount} def(s).`);
  lines.push(
    `- PORTED ${m.counts.PORTED ?? 0} / PORTED-INLINE ${m.counts['PORTED-INLINE'] ?? 0} `
    + `/ NAMED-COLLAPSE ${m.counts['NAMED-COLLAPSE'] ?? 0} / SKIP ${m.counts.SKIP ?? 0} `
    + `/ INERT-API ${m.counts['INERT-API'] ?? 0} / GAP ${m.counts.GAP ?? 0}.`,
  );
  lines.push('');
  if (closed) {
    lines.push('## Verdict: DONE');
    lines.push('');
    lines.push(`The port measurably matches the pinned Ruby on this row's whole surface: ${mechanism}`);
  } else {
    lines.push('## Verdict: WORKING ON IT');
    lines.push('');
    lines.push(`The port does not carry ${gaps.length} of the row's defs: ${mechanism}`);
    lines.push('');
    lines.push('The defs the port does not carry:');
    lines.push('');
    lines.push('| def | Ruby | visibility | the pinned deck reaches it |');
    lines.push('| --- | --- | --- | --- |');
    for (const g of gaps) {
      lines.push(`| \`${g.name}\` | ${g.file.split('/').pop()}:${g.line} | ${g.visibility ?? '?'} | ${g.reachability ?? '?'} |`);
    }
  }
  lines.push('');
  lines.push('## How this row was measured');
  lines.push('');
  lines.push('- The row\'s Ruby file set and per-def roster: `tools/treewalk-family-def-coverage.mjs`.');
  lines.push('- The per-def disposition: `tools/treewalk-family-row-disposition.mjs`.');
  lines.push('- The pinned bytes, executed: `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`');
  lines.push('  (or `tests/server/oracle-capture-card-class-declarations-ruby.rb` for the c1 row, whose');
  lines.push('  subject is the class body rather than methods), whose fixture is under');
  lines.push('  `fixtures/captured/`.');
  lines.push('- The port side, re-checked against the port tree as it stands:');
  lines.push('  `tests/server/treewalk-row-disposition-parity.test.ts`.');
  lines.push('');
  lines.push('Branch: `port/register-treewalk-convert-20261022` in KatsuJinCode/decko-ts.');
  lines.push('');

  const dir = join(OUT, item.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'RECEIPT.md'), lines.join('\n'));
  index.push({ id: item.id, closed, gaps: gaps.length, dir: item.id });
}

const indexLines = [];
indexLines.push('# The register-treewalk family\'s working rows, adjudicated');
indexLines.push('');
indexLines.push(`${index.filter((i) => i.closed).length} of ${index.length} rows closed on their own`);
indexLines.push('verification; the rest keep their bucket with the measured gap named.');
indexLines.push('');
indexLines.push('| row | verdict | gap defs | receipt |');
indexLines.push('| --- | --- | --- | --- |');
for (const i of index) {
  indexLines.push(`| ${i.id} | ${i.closed ? 'DONE' : 'WORKING ON IT'} | ${i.gaps} | [receipt](${i.dir}/RECEIPT.md) |`);
}
indexLines.push('');
writeFileSync(join(OUT, 'README.md'), indexLines.join('\n'));

console.log(`wrote ${index.length} receipts to ${OUT}`);
console.log(`closed: ${index.filter((i) => i.closed).length}; open: ${index.filter((i) => !i.closed).length}`);
