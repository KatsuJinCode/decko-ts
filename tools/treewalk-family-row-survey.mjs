#!/usr/bin/env node
// treewalk-family-row-survey.mjs - the [Family] lane's row survey.
//
// WHAT THIS IS. The lane's job is to work the family's thirty WORKING
// rows in row-id order: measure each row against the pinned Ruby, and
// close it to DONE only where the port measurably matches Ruby. This
// script produces the SURVEY that the per-row receipts are written from:
// for each working row, the row's Ruby file set, its per-def
// dispositions, and the row's GAP defs with the mechanism each gap is.
//
// It reads the rig's own output, so the survey and the instrument cannot
// disagree.
//
// The survey is a READING, not a verdict. The verdict is in the row's
// receipt, and the row's receipt has to say what the port does about
// the gap - which is a reading of the port's source, not something this
// script can decide.
//
// Run:
//   node tools/treewalk-family-row-survey.mjs
//   node tools/treewalk-family-row-survey.mjs --json
//   node tools/treewalk-family-row-survey.mjs --row <row-id>

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

const DISPOSITION_TOOL = join(HERE, 'treewalk-family-row-disposition.mjs');
const ROSTER = process.env.DECKO_COMPLETENESS_ROSTER
  ?? 'C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json';
const FAMILY = process.env.DECKO_TREEWALK_FAMILY ?? 'register-treewalk';
const OUT = process.env.DECKO_TREEWALK_SURVEY_OUT ?? null;

const roster = JSON.parse(readFileSync(ROSTER, 'utf8'));
const working = roster.items
  .filter((i) => i.family === FAMILY && i.bucket === 'WORKING ON IT')
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// The rig's own output for the whole family, in one run.
const raw = execFileSync(process.execPath, [DISPOSITION_TOOL, '--all', '--json'], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});
const measured = JSON.parse(raw);
const byId = new Map(measured.map((r) => [r.id, r]));

const rows = working.map((item) => {
  const m = byId.get(item.id);
  if (!m) throw new Error(`the rig produced no measurement for ${item.id}`);
  return {
    id: item.id,
    label: item.label,
    sourceParent: item.sourceParent,
    verdict: item.verdict,
    rubyFiles: m.rubyFiles,
    rubySources: m.rubySources,
    defCount: m.defCount,
    counts: m.counts,
    closable: m.closable,
    gaps: m.gaps.map((g) => ({
      name: g.name,
      file: g.file,
      line: g.line,
      visibility: g.visibility,
      reachability: g.reachability,
      portBinding: g.portBinding,
      portMention: g.portMention,
      headerCitation: g.headerCitation,
      inlineSite: g.inlineSite,
      pinnedCallSites: g.pinnedCallSites,
      pinnedCallCount: g.pinnedCallCount,
    })),
    defs: m.defs,
  };
});

if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  console.log('row-id-order | row | defs | PORTED | INLINE | SKIP | GAP | closable');
  for (const r of rows) {
    const c = r.counts;
    console.log(
      `${r.id.padEnd(52)} ${String(r.rubyFiles).padStart(4)} ${String(r.defCount).padStart(5)} `
      + `${String(c.PORTED ?? 0).padStart(7)} ${String(c['PORTED-INLINE'] ?? 0).padStart(7)} `
      + `${String(c.SKIP ?? 0).padStart(5)} ${String(c.GAP ?? 0).padStart(4)}  ${r.closable ? 'CLOSABLE' : 'gaps'}`,
    );
  }
  console.log(`\n${rows.length} working rows; ${rows.filter((r) => r.closable).length} with no gap.`);
}
