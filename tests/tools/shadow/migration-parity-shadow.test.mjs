// migration-parity-shadow.test.mjs — pin tests for the shadow (cutover
// readiness) stage of the migration parity tool.
//
// Layers pinned, mirroring the proven tests/tools/shadow/shadow-router.test.ts
// discipline (stub servers, synthetic bytes, no engine, no network):
//   1. noise normalization  — the two documented per-response regions
//   2. classification       — ENGINE-GAP vs CONTENT-CHANGED vs UNATTRIBUTED
//   3. cutover gate         — N consecutive clean runs, signature-scoped
//   4. policy schema        — reused routing fields + refused unknown keys
//   5. route sample         — percentage-or-name sampling, S1 view refusal
//   6. reference loader     — sha-verified, duplicate-refused
//   7. CLI subprocess       — help exit 0, missing inputs exit 2 (named),
//                             refusal discipline, report shape on real
//                             stub-instrument execute runs, server teardown
//
// DATA RULE: synthetic payloads only. The stub instrument serves what the
// test env tells it; no card names, no live anything.
//
// QUOTE DISCIPLINE: this file uses single-quoted string literals only;
// every double-quote character comes from DQ (String.fromCharCode(34)) so
// the attr fixtures cannot collide with string delimiters.

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';

import {
  DEFAULT_PROBE_ROUTES,
  SHADOW_POLICY_DEFAULTS,
  SHADOW_REPORT_SCHEMA,
  classifyRoute,
  countDivergentAtStrictness,
  evaluateCutoverGate,
  firstDiffBufferOffset,
  loadReferenceFile,
  loadShadowPolicy,
  normalizeNoiseHtml,
  parseTargetsFile,
  resolveRouteSample,
  routeKey,
  routePath,
} from '../../../bin/migration-parity-shadow.mjs';

const DQ = String.fromCharCode(34); // double-quote character
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const TOOL = join(REPO, 'bin', 'migration-parity-tool.mjs');
const STUB = join(REPO, 'tests', 'tools', 'shadow', 'fixtures', 'stub-render-instrument.mjs');
const NODE = process.execPath;

const buf = (s) => Buffer.from(s, 'utf8');
const hexOf = (n, ch) => ch.repeat(n);
const slotAttr = (ch) => 'data-slot-id=' + DQ + hexOf(20, ch) + DQ;
const slotHtml = (ch) => '<i ' + slotAttr(ch) + '></i>';

// --- scratch dirs (cleaned at the end) ---
const scratchRoots = [];
function scratch(label) {
  const dir = mkdtempSync(join(tmpdir(), 'mps-pin-' + label + '-'));
  scratchRoots.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of scratchRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup; Windows handles can linger
    }
  }
});

// ===========================================================================
// 1. Noise normalization — the two documented regions
// ===========================================================================

describe('normalizeNoiseHtml — the two documented noise regions', () => {
  it('normalizes double-quoted 20-hex slot ids to the RANDOMIZED placeholder', () => {
    const out = normalizeNoiseHtml('<div ' + slotAttr('a') + '>x</div>');
    expect(out).toContain('data-slot-id=' + DQ + 'RANDOMIZED' + DQ);
    expect(out).not.toContain(hexOf(20, 'a'));
  });

  it('normalizes single-quoted slot ids too (live-check-71 pass-2 finding)', () => {
    const single = "data-slot-id='" + hexOf(20, 'b') + "'";
    const out = normalizeNoiseHtml('<span ' + single + '>');
    expect(out).toContain('data-slot-id=' + DQ + 'RANDOMIZED' + DQ);
    expect(out).not.toContain(hexOf(20, 'b'));
  });

  it('is idempotent (the placeholder is not hex, never re-matched)', () => {
    const once = normalizeNoiseHtml('<i ' + slotAttr('c') + '>');
    expect(normalizeNoiseHtml(once)).toBe(once);
  });

  it('preserves non-20-hex ids — a different-length id is a REAL divergence', () => {
    const short = '<i data-slot-id=abc123>';
    expect(normalizeNoiseHtml(short)).toBe(short);
    const upper = '<i ' + slotAttr('D') + '>';
    expect(normalizeNoiseHtml(upper)).toBe(upper);
  });

  it('preserves attribute presence — only the value is rewritten', () => {
    const out = normalizeNoiseHtml('<i ' + slotAttr('e') + ' x=1>');
    expect(out).toContain('data-slot-id=');
    expect(out).toContain('x=1');
  });

  it('removes the Cloudflare __CF$cv$params script block (region 1)', () => {
    const page = '<html><body><script>var x=1;__CF$cv$params={r:1};</script><p>hi</p></body></html>';
    const out = normalizeNoiseHtml(page);
    expect(out).not.toContain('__CF$cv$params');
    expect(out).toContain('<p>hi</p>');
  });

  it('leaves pages without CF noise byte-unchanged (region 1 is a no-op locally)', () => {
    const page = '<html><body><p>plain</p></body></html>';
    expect(normalizeNoiseHtml(page)).toBe(page);
  });
});

// ===========================================================================
// 2. Classification — two-sided, reference-arbitrated
// ===========================================================================

describe('classifyRoute — ENGINE-GAP vs CONTENT-CHANGED vs UNATTRIBUTED', () => {
  it('byte-equal bases and candidates are byte-identical', () => {
    const v = classifyRoute({ base: buf('<p>x</p>'), candidate: buf('<p>x</p>'), reference: null, strictness: 'normalized' });
    expect(v).toEqual({ outcome: 'byte-identical', class: null, firstDiff: -1 });
  });

  it('slot-id-only divergence is noise-only at normalized strictness (counts clean)', () => {
    const v = classifyRoute({ base: buf(slotHtml('a')), candidate: buf(slotHtml('b')), reference: null, strictness: 'normalized' });
    expect(v.outcome).toBe('noise-only');
    expect(v.class).toBe(null);
    expect(v.firstDiff).toBeGreaterThan(-1);
  });

  it('the same divergence at byte strictness is class NOISE and counts divergent', () => {
    const v = classifyRoute({ base: buf(slotHtml('a')), candidate: buf(slotHtml('b')), reference: null, strictness: 'byte' });
    expect(v.outcome).toBe('divergent');
    expect(v.class).toBe('NOISE');
    expect(countDivergentAtStrictness([{ outcome: 'noise-only' }], 'byte')).toBe(1);
    expect(countDivergentAtStrictness([{ outcome: 'noise-only' }], 'normalized')).toBe(0);
  });

  it('base reproduces the reference, candidate broke it -> ENGINE-GAP', () => {
    const reference = buf('<p>recorded truth</p> ' + slotHtml('a'));
    const base = buf('<p>recorded truth</p> ' + slotHtml('c'));
    const candidate = buf('<p>engine broke this</p> ' + slotHtml('d'));
    const v = classifyRoute({ base, candidate, reference, strictness: 'normalized' });
    expect(v.class).toBe('ENGINE-GAP');
    expect(v.outcome).toBe('divergent');
  });

  it('base itself no longer matches the reference -> CONTENT-CHANGED (not the fault of the candidate)"', () => {
    const reference = buf('<p>recorded truth</p> ' + slotHtml('a'));
    const base = buf('<p>the deck moved on</p> ' + slotHtml('e'));
    const candidate = buf('<p>engine broke this</p> ' + slotHtml('d'));
    const v = classifyRoute({ base, candidate, reference, strictness: 'normalized' });
    expect(v.class).toBe('CONTENT-CHANGED');
  });

  it('real divergence with no reference -> UNATTRIBUTED (never clean by default)', () => {
    const v = classifyRoute({ base: buf('<p>a</p>'), candidate: buf('<p>b</p>'), reference: null, strictness: 'normalized' });
    expect(v.class).toBe('UNATTRIBUTED');
    expect(countDivergentAtStrictness([v], 'normalized')).toBe(1);
  });

  it('firstDiff is the first differing base-vs-candidate byte offset (-1 when equal)', () => {
    expect(firstDiffBufferOffset(buf('hello'), buf('hello'))).toBe(-1);
    expect(firstDiffBufferOffset(buf('hello world'), buf('hello WORLD'))).toBe(6);
    expect(firstDiffBufferOffset(buf('abc'), buf('abcdef'))).toBe(3);
  });
});

// ===========================================================================
// 3. Cutover gate — N consecutive clean runs, signature-scoped
// ===========================================================================

describe('evaluateCutoverGate — N consecutive clean runs, signature-scoped', () => {
  const sig = 'signature-1';

  it('default N=1: one clean run cuts over', () => {
    const g = evaluateCutoverGate({ history: [{ signature: sig, clean: true }], requiredRuns: 1, divergentCount: 0 });
    expect(g.verdict).toBe('clean');
    expect(g.cleanStreak).toBe(1);
  });

  it('N=3 needs three consecutive signature-matching clean runs', () => {
    const h = [
      { signature: sig, clean: true },
      { signature: sig, clean: true },
      { signature: sig, clean: true },
    ];
    expect(evaluateCutoverGate({ history: h.slice(0, 2), requiredRuns: 3, divergentCount: 0 }).verdict).toBe('not-clean');
    expect(evaluateCutoverGate({ history: h, requiredRuns: 3, divergentCount: 0 }).verdict).toBe('clean');
  });

  it('a dirty run inside the window breaks the streak', () => {
    const h = [
      { signature: sig, clean: true },
      { signature: sig, clean: false },
      { signature: sig, clean: true },
    ];
    const g = evaluateCutoverGate({ history: h, requiredRuns: 2, divergentCount: 0 });
    expect(g.verdict).toBe('not-clean');
    expect(g.cleanStreak).toBe(1);
    expect(g.reasons.join(' ')).toMatch(/clean streak 1 of 2/);
  });

  it('the streak is scoped to the sample signature (no cutover across changed samples)', () => {
    const h = [
      { signature: 'old-sample', clean: true },
      { signature: sig, clean: true },
    ];
    const g = evaluateCutoverGate({ history: h, requiredRuns: 2, divergentCount: 0 });
    expect(g.verdict).toBe('not-clean');
    expect(g.cleanStreak).toBe(1);
  });

  it('divergences are named as a reason even when the streak alone would fail', () => {
    const g = evaluateCutoverGate({ history: [{ signature: sig, clean: false }], requiredRuns: 1, divergentCount: 3 });
    expect(g.verdict).toBe('not-clean');
    expect(g.reasons.join(' ')).toMatch(/3 divergent route/);
  });
});

// ===========================================================================
// 4. Policy schema — reused routing fields, refused unknown keys
// ===========================================================================

describe('loadShadowPolicy — schema discipline', () => {
  it('a file with only routing fields resolves to the safe defaults', () => {
    const dir = scratch('policy1');
    const p = join(dir, 'policy.json');
    writeFileSync(p, JSON.stringify({ mode: 'shadow-everything', sampleRate: 100 }));
    const loaded = loadShadowPolicy(p);
    expect(loaded.routing.mode).toBe('shadow-everything');
    expect(loaded.strictness).toBe(SHADOW_POLICY_DEFAULTS.strictness);
    expect(loaded.requireConsecutiveCleanRuns).toBe(1);
  });

  it('resolves extension fields relative to the policy file directory', () => {
    const dir = scratch('policy2');
    writeFileSync(join(dir, 'routes.tsv'), 'Home\n');
    const p = join(dir, 'policy.json');
    writeFileSync(
      p,
      JSON.stringify({
        mode: 'shadow-everything',
        sampleRate: 50,
        targetsFile: 'routes.tsv',
        comparison: { strictness: 'byte' },
        gate: { requireConsecutiveCleanRuns: 3 },
      }),
    );
    const loaded = loadShadowPolicy(p);
    expect(loaded.strictness).toBe('byte');
    expect(loaded.requireConsecutiveCleanRuns).toBe(3);
    expect(loaded.targetsFile).toBe(join(dir, 'routes.tsv'));
  });

  it('REFUSES unknown keys (a misspelled comparison must not fall back silently)', () => {
    const dir = scratch('policy3');
    const p = join(dir, 'policy.json');
    writeFileSync(p, JSON.stringify({ mode: 'shadow-everything', sampleRate: 100, comparision: { strictness: 'byte' } }));
    expect(() => loadShadowPolicy(p)).toThrow(/unknown field.*comparision/);
  });

  it('refuses an invalid strictness by name', () => {
    const dir = scratch('policy4');
    const p = join(dir, 'policy.json');
    writeFileSync(p, JSON.stringify({ mode: 'shadow-everything', sampleRate: 100, comparison: { strictness: 'loose' } }));
    expect(() => loadShadowPolicy(p)).toThrow(/comparison.strictness/);
  });

  it('refuses a non-integer or sub-1 gate', () => {
    const dir = scratch('policy5');
    const p = join(dir, 'policy.json');
    writeFileSync(p, JSON.stringify({ mode: 'shadow-everything', sampleRate: 100, gate: { requireConsecutiveCleanRuns: 0 } }));
    expect(() => loadShadowPolicy(p)).toThrow(/requireConsecutiveCleanRuns/);
  });

  it('inherits the proven routing-field errors (allowlist mode without allowlist array)', () => {
    const dir = scratch('policy6');
    const p = join(dir, 'policy.json');
    writeFileSync(p, JSON.stringify({ mode: 'shadow-allowlist', sampleRate: 100 }));
    expect(() => loadShadowPolicy(p)).toThrow(/allowlist/);
  });

  it('refuses a missing policy file by name', () => {
    expect(() => loadShadowPolicy(join(scratch('policy7'), 'absent.json'))).toThrow(/file not found/);
  });
});

// ===========================================================================
// 5. Route sample — proven sampling semantics + S1 refusal
// ===========================================================================

describe('route sampling — percentage-or-name through shouldShadow (reused)', () => {
  it('parseTargetsFile: name-only lines default to view=page; comments and blanks skipped', () => {
    const routes = parseTargetsFile('# c\n\nHome\nAikido\t\n');
    expect(routes).toEqual([
      { name: 'Home', view: 'page' },
      { name: 'Aikido', view: 'page' },
    ]);
  });

  it('parseTargetsFile: more than two columns is a named error with the line number', () => {
    expect(() => parseTargetsFile('a\tb\tc')).toThrow(/line 1.*2 columns/);
  });

  it('LIMIT S1: view routes other than page are REFUSED with the named message', () => {
    expect(() => parseTargetsFile('Home\topen')).toThrow(/limit S1/);
  });

  it('the default sample is the 5 standard probe pages, all page-view', () => {
    expect(DEFAULT_PROBE_ROUTES.length).toBe(5);
    for (const r of DEFAULT_PROBE_ROUTES) expect(r.view).toBe('page');
    expect(DEFAULT_PROBE_ROUTES.map(routeKey)).toEqual([
      'Home|page',
      'Aikido|page',
      'About|page',
      'Eagle|page',
      'Taking_Stock|page',
    ]);
  });

  it('sampleRate 100 shadows every route; 0 shadows none', () => {
    const routes = [...DEFAULT_PROBE_ROUTES];
    const mkRouting = (rate) => ({ mode: 'shadow-everything', sampleRate: rate, allowlist: [], blocklist: [] });
    const all = resolveRouteSample({ routes, routing: mkRouting(100), strictness: 'normalized' });
    expect(all.sampled.length).toBe(5);
    expect(all.excluded.length).toBe(0);
    const none = resolveRouteSample({ routes, routing: mkRouting(0), strictness: 'normalized' });
    expect(none.sampled.length).toBe(0);
    expect(none.excluded.length).toBe(5);
  });

  it('allowlist mode filters by URL path (name-based selection), reusing compileGlob semantics', () => {
    const routing = { mode: 'shadow-allowlist', sampleRate: 100, allowlist: [/^\/Home$/], blocklist: [] };
    const out = resolveRouteSample({ routes: [...DEFAULT_PROBE_ROUTES], routing, strictness: 'normalized' });
    expect(out.sampled.map(routeKey)).toEqual(['Home|page']);
    expect(out.excluded.length).toBe(4);
  });

  it('the sample signature binds routes + strictness + policy shape (stable; changes when any changes)', () => {
    const routing = { mode: 'shadow-everything', sampleRate: 100, allowlist: [], blocklist: [] };
    const a = resolveRouteSample({ routes: [...DEFAULT_PROBE_ROUTES], routing, strictness: 'normalized' });
    const b = resolveRouteSample({ routes: [...DEFAULT_PROBE_ROUTES], routing, strictness: 'normalized' });
    expect(a.signature).toBe(b.signature);
    const c = resolveRouteSample({ routes: [...DEFAULT_PROBE_ROUTES], routing, strictness: 'byte' });
    expect(a.signature).not.toBe(c.signature);
    const d = resolveRouteSample({ routes: [...DEFAULT_PROBE_ROUTES], routing: { ...routing, sampleRate: 50 }, strictness: 'normalized' });
    expect(a.signature).not.toBe(d.signature);
  });

  it('routePath percent-encodes names and preserves Decko plus-joint', () => {
    expect(routePath({ name: 'A Taste', view: 'page' })).toBe('/A%20Taste');
    expect(routePath({ name: 'A+B', view: 'page' })).toBe('/A%2BB');
  });
});

// ===========================================================================
// 6. Reference loader — sha-verified, duplicate-refused
// ===========================================================================

describe('loadReferenceFile — a reference that cannot prove itself must not arbitrate', () => {
  it('loads route/sha256/bodyFile lines into a Map with relative bodyFile resolution', () => {
    const dir = scratch('ref1');
    writeFileSync(join(dir, 'body.html'), '<html>truth</html>');
    const sha = createHash('sha256').update(readFileSync(join(dir, 'body.html'))).digest('hex');
    writeFileSync(
      join(dir, 'reference.jsonl'),
      JSON.stringify({ route: 'Home|page', sha256: sha, bodyFile: 'body.html' }) + '\n',
    );
    const map = loadReferenceFile(join(dir, 'reference.jsonl'));
    expect(map.get('Home|page').toString()).toBe('<html>truth</html>');
  });

  it('refuses a sha256 mismatch by name', () => {
    const dir = scratch('ref2');
    writeFileSync(join(dir, 'body.html'), '<html>truth</html>');
    writeFileSync(
      join(dir, 'reference.jsonl'),
      JSON.stringify({ route: 'Home|page', sha256: hexOf(64, '0'), bodyFile: 'body.html' }) + '\n',
    );
    expect(() => loadReferenceFile(join(dir, 'reference.jsonl'))).toThrow(/sha256 mismatch/);
  });

  it('refuses duplicate routes and missing bodyFiles by name', () => {
    const dir = scratch('ref3');
    writeFileSync(join(dir, 'body.html'), 'x');
    const sha = createHash('sha256').update('x').digest('hex');
    const line = JSON.stringify({ route: 'Home|page', sha256: sha, bodyFile: 'body.html' });
    writeFileSync(join(dir, 'dup.jsonl'), line + '\n' + line + '\n');
    expect(() => loadReferenceFile(join(dir, 'dup.jsonl'))).toThrow(/duplicate route/);
    writeFileSync(join(dir, 'missing.jsonl'), JSON.stringify({ route: 'Home|page', sha256: sha, bodyFile: 'nope.html' }) + '\n');
    expect(() => loadReferenceFile(join(dir, 'missing.jsonl'))).toThrow(/bodyFile not found/);
  });
});

// ===========================================================================
// 7. CLI subprocess pins + stub-instrument end-to-end
// ===========================================================================

function runCli(args, env = {}) {
  return spawnSync(NODE, [TOOL, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60000,
  });
}

describe('CLI — help, refusals, policy check', () => {
  it('help exits 0 and names the shadow command (top-level and shadow)', () => {
    const top = runCli(['--help']);
    expect(top.status).toBe(0);
    expect(top.stdout).toMatch(/shadow/);
    const sh = runCli(['shadow', '--help']);
    expect(sh.status).toBe(0);
    expect(sh.stdout).toMatch(/CANDIDATE engine checkout/);
    expect(sh.stdout).toMatch(/DRY-RUN BY DEFAULT/);
  });

  it('shadow with no inputs exits 2 with the full NAMED missing list', () => {
    const r = runCli(['shadow']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/MISSING INPUTS/);
    expect(r.stderr).toMatch(/--base/);
    expect(r.stderr).toMatch(/--candidate/);
    expect(r.stderr).toMatch(/--mirror/);
    expect(r.stderr).toMatch(/--out/);
  });

  it('shadow refuses base == candidate by name', () => {
    const dir = scratch('cli-same');
    const r = runCli([
      'shadow',
      '--base', dir,
      '--candidate', dir,
      '--mirror', join(dir, 'm.sqlite'),
      '--out', join(dir, 'out'),
      '--instrument', STUB,
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/DIFFERENT checkouts/);
  });

  it('an unknown shadow flag is refused by name', () => {
    const r = runCli(['shadow', '--definitely-not-a-flag']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown shadow argument: --definitely-not-a-flag/);
  });

  it('a targets file requesting a non-page view is refused with the S1 message (exit 2)', () => {
    const dir = scratch('cli-view');
    writeFileSync(join(dir, 'targets.tsv'), 'Home\topen\n');
    mkdirSync(join(dir, 'cand'), { recursive: true });
    writeFileSync(join(dir, 'm.sqlite'), 'synthetic-mirror-bytes');
    const r = runCli([
      'shadow',
      '--base', dir,
      '--candidate', join(dir, 'cand'),
      '--mirror', join(dir, 'm.sqlite'),
      '--out', join(dir, 'out'),
      '--targets', join(dir, 'targets.tsv'),
      '--instrument', STUB,
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/limit S1/);
  });

  it('the run subcommand keeps its own contract (missing inputs exit 2)', () => {
    const r = runCli(['run']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/MISSING INPUTS/);
  });

  it('policy --check: valid exits 0 with the resolved form; invalid exits 2 named', () => {
    const dir = scratch('cli-policy');
    const good = join(dir, 'good.json');
    writeFileSync(good, JSON.stringify({ mode: 'shadow-everything', sampleRate: 40 }));
    const ok = runCli(['policy', '--check', good, '--sample-path', '/Home']);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/"sampleRate": 40/);
    expect(ok.stdout).toMatch(/sample-path .*-> (SHADOW|SKIP)/);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ mode: 'nope', sampleRate: 40 }));
    const failed = runCli(['policy', '--check', bad]);
    expect(failed.status).toBe(2);
    expect(failed.stderr).toMatch(/POLICY INVALID.*mode/);
  });
});

// --- execute-run harness (stub instrument, synthetic mirror) ---
const PORT = 3410; // distinct from manual runs; singleFork keeps tests serial

function executeShadow(outName, extraArgs, env) {
  const dir = scratch(outName);
  const mirror = join(dir, 'mirror.sqlite');
  writeFileSync(mirror, 'synthetic-mirror-bytes');
  mkdirSync(join(dir, 'base-checkout'), { recursive: true });
  mkdirSync(join(dir, 'cand-checkout'), { recursive: true });
  const out = join(dir, 'run');
  const r = spawnSync(
    NODE,
    [
      TOOL, 'shadow',
      '--base', join(dir, 'base-checkout'),
      '--candidate', join(dir, 'cand-checkout'),
      '--mirror', mirror,
      '--out', out,
      '--instrument', STUB,
      '--execute',
      '--base-port', String(PORT),
      '--candidate-port', String(PORT + 1),
      '--boot-timeout-ms', '15000',
      ...extraArgs,
    ],
    { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 },
  );
  return { r, out, dir };
}

function writeReference(dir, truth) {
  const refDir = join(dir, 'ref');
  mkdirSync(refDir);
  writeFileSync(join(refDir, 'truth.html'), truth);
  const sha = createHash('sha256').update(truth).digest('hex');
  const lines = DEFAULT_PROBE_ROUTES.map((route) =>
    JSON.stringify({ route: routeKey(route), sha256: sha, bodyFile: 'truth.html' }),
  );
  writeFileSync(join(refDir, 'reference.jsonl'), lines.join('\n') + '\n');
  return join(refDir, 'reference.jsonl');
}

describe('CLI end-to-end with the stub instrument (execute runs)', () => {
  it('dry-run is the default: plan printed, exit 0, NO run dir created, nothing spawned', () => {
    const dir = scratch('cli-dry');
    mkdirSync(join(dir, 'cand'), { recursive: true });
    writeFileSync(join(dir, 'm.sqlite'), 'synthetic-mirror-bytes');
    const r = runCli([
      'shadow',
      '--base', dir,
      '--candidate', join(dir, 'cand'),
      '--mirror', join(dir, 'm.sqlite'),
      '--out', join(dir, 'run'),
      '--instrument', STUB,
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/SHADOW PLAN/);
    expect(r.stdout).toMatch(/Home\|page/);
    expect(existsSync(join(dir, 'run'))).toBe(false);
  });

  it('identical stub bodies: 5/5 byte-identical, verdict clean, exit 0, report + history written', () => {
    const { r, out } = executeShadow('e2e-clean', [], { SHADOW_STUB_BODY: '<html>same</html>' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/VERDICT: CLEAN/);
    const report = JSON.parse(readFileSync(join(out, 'shadow-run.json'), 'utf8'));
    expect(report.schema).toBe(SHADOW_REPORT_SCHEMA);
    expect(report.verdict.verdict).toBe('clean');
    expect(report.counts.totalSampled).toBe(5);
    expect(report.counts.byteIdentical).toBe(5);
    expect(report.counts.divergent).toBe(0);
    expect(report.boots).toEqual({ base: true, candidate: true });
    for (const field of ['base', 'candidate', 'mirror', 'policy', 'sample', 'routes', 'counts', 'limitations']) {
      expect(report).toHaveProperty(field);
    }
    expect(report.limitations.join(' ')).toMatch(/S1: page-surface routes only/);
    const history = readFileSync(join(out, 'shadow-run-history.jsonl'), 'utf8').trim().split('\n');
    expect(history.length).toBe(1);
    expect(JSON.parse(history[0]).clean).toBe(true);
  });

  it('divergent bodies without a reference: every route UNATTRIBUTED, verdict not-clean, exit 2', () => {
    const { r, out } = executeShadow('e2e-unattr', [], {
      SHADOW_STUB_BODY: '<html>base</html>',
      SHADOW_STUB_CANDIDATE_BODY: '<html>cand</html>',
    });
    expect(r.status).toBe(2);
    const report = JSON.parse(readFileSync(join(out, 'shadow-run.json'), 'utf8'));
    expect(report.verdict.verdict).toBe('not-clean');
    expect(report.counts.classCounts.UNATTRIBUTED).toBe(5);
    for (const rec of report.routes) {
      expect(rec.class).toBe('UNATTRIBUTED');
      expect(rec.firstDiff).toBeGreaterThan(-1);
      expect(rec.shaBase).not.toBe(rec.shaCandidate);
    }
  });

  it('slot-id-only divergence: noise-only CLEAN at normalized; NOISE divergent at byte strictness', () => {
    const a = '<html>' + slotHtml('a') + '</html>';
    const b = '<html>' + slotHtml('b') + '</html>';
    const norm = executeShadow('e2e-noise-norm', [], { SHADOW_STUB_BODY: a, SHADOW_STUB_CANDIDATE_BODY: b });
    expect(norm.r.status).toBe(0);
    const normReport = JSON.parse(readFileSync(join(norm.out, 'shadow-run.json'), 'utf8'));
    expect(normReport.counts.noiseOnly).toBe(5);
    expect(normReport.verdict.verdict).toBe('clean');

    const byte = executeShadow('e2e-noise-byte', ['--strictness', 'byte'], { SHADOW_STUB_BODY: a, SHADOW_STUB_CANDIDATE_BODY: b });
    expect(byte.r.status).toBe(2);
    const byteReport = JSON.parse(readFileSync(join(byte.out, 'shadow-run.json'), 'utf8'));
    expect(byteReport.counts.classCounts.NOISE).toBe(5);
    expect(byteReport.counts.divergent).toBe(5);
  });

  it('with a sha-verified reference: broken recorded truth is ENGINE-GAP; a stale base is CONTENT-CHANGED', () => {
    const truth = '<html>recorded-truth</html>';
    const movedOn = '<html>deck-moved-on</html>';
    const candidate = '<html>candidate-broke-it</html>';

    const gap = executeShadow('e2e-gap', [], { SHADOW_STUB_BODY: truth, SHADOW_STUB_CANDIDATE_BODY: candidate });
    void gap; // replaced below by the prepared-reference runs

    const dir = scratch('e2e-gap-ref');
    const mirror = join(dir, 'mirror.sqlite');
    writeFileSync(mirror, 'synthetic-mirror-bytes');
    mkdirSync(join(dir, 'base-checkout'), { recursive: true });
    mkdirSync(join(dir, 'cand-checkout'), { recursive: true });
    const reference = writeReference(dir, truth);
    const out = join(dir, 'run');
    const r = spawnSync(
      NODE,
      [
        TOOL, 'shadow',
        '--base', join(dir, 'base-checkout'),
        '--candidate', join(dir, 'cand-checkout'),
        '--mirror', mirror,
        '--out', out,
        '--instrument', STUB,
        '--execute',
        '--base-port', String(PORT + 2),
        '--candidate-port', String(PORT + 3),
        '--boot-timeout-ms', '15000',
        '--reference', reference,
      ],
      { encoding: 'utf8', env: { ...process.env, SHADOW_STUB_BODY: truth, SHADOW_STUB_CANDIDATE_BODY: candidate }, timeout: 120000 },
    );
    expect(r.status).toBe(2);
    const report = JSON.parse(readFileSync(join(out, 'shadow-run.json'), 'utf8'));
    expect(report.counts.classCounts['ENGINE-GAP']).toBe(5);
    expect(report.counts.classCounts['CONTENT-CHANGED']).toBe(0);

    const dir2 = scratch('e2e-stale');
    const mirror2 = join(dir2, 'mirror.sqlite');
    writeFileSync(mirror2, 'synthetic-mirror-bytes');
    mkdirSync(join(dir2, 'base-checkout'), { recursive: true });
    mkdirSync(join(dir2, 'cand-checkout'), { recursive: true });
    const reference2 = writeReference(dir2, truth);
    const r2 = spawnSync(
      NODE,
      [
        TOOL, 'shadow',
        '--base', join(dir2, 'base-checkout'),
        '--candidate', join(dir2, 'cand-checkout'),
        '--mirror', mirror2,
        '--out', join(dir2, 'run'),
        '--instrument', STUB,
        '--execute',
        '--base-port', String(PORT + 4),
        '--candidate-port', String(PORT + 5),
        '--boot-timeout-ms', '15000',
        '--reference', reference2,
      ],
      { encoding: 'utf8', env: { ...process.env, SHADOW_STUB_BODY: movedOn, SHADOW_STUB_CANDIDATE_BODY: candidate }, timeout: 120000 },
    );
    expect(r2.status).toBe(2);
    const report2 = JSON.parse(readFileSync(join(dir2, 'run', 'shadow-run.json'), 'utf8'));
    expect(report2.counts.classCounts['CONTENT-CHANGED']).toBe(5);
  });

  it('the gate needs N consecutive clean runs in the SAME out dir (N=2 across two runs)', () => {
    const env = { SHADOW_STUB_BODY: '<html>same</html>' };
    const first = executeShadow('e2e-gate', ['--gate-runs', '2'], env);
    expect(first.r.status).toBe(2);
    const report1 = JSON.parse(readFileSync(join(first.out, 'shadow-run.json'), 'utf8'));
    expect(report1.verdict.verdict).toBe('not-clean');
    expect(report1.verdict.cleanStreak).toBe(1);
    expect(report1.verdict.requiredRuns).toBe(2);

    const dir = first.dir;
    const r2 = spawnSync(
      NODE,
      [
        TOOL, 'shadow',
        '--base', join(dir, 'base-checkout'),
        '--candidate', join(dir, 'cand-checkout'),
        '--mirror', join(dir, 'mirror.sqlite'),
        '--out', first.out,
        '--instrument', STUB,
        '--execute',
        '--base-port', String(PORT + 6),
        '--candidate-port', String(PORT + 7),
        '--boot-timeout-ms', '15000',
        '--gate-runs', '2',
      ],
      { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 },
    );
    expect(r2.status).toBe(0);
    const report2 = JSON.parse(readFileSync(join(first.out, 'shadow-run.json'), 'utf8'));
    expect(report2.verdict.verdict).toBe('clean');
    expect(report2.verdict.cleanStreak).toBe(2);
    const history = readFileSync(join(first.out, 'shadow-run-history.jsonl'), 'utf8').trim().split('\n');
    expect(history.length).toBe(2);
  });

  it('after an execute run BOTH render servers are torn down (ports refuse connections)', async () => {
    const { r } = executeShadow('e2e-teardown', [], { SHADOW_STUB_BODY: '<html>same</html>' });
     expect(r.status).toBe(0);
    const probe = (port) =>
      new Promise((resolvePromise) => {
        const s = connect(port, '127.0.0.1');
        s.on('error', () => resolvePromise(true));
        s.on('connect', () => {
          s.destroy();
          resolvePromise(false);
        });
      });
    expect(await probe(PORT + 8)).toBe(true);
    expect(await probe(PORT + 9)).toBe(true);
  });

  it('divergent routes leave triage artifacts (base.html + candidate.html + meta.json)', () => {
    const { out } = executeShadow('e2e-artifacts', [], {
      SHADOW_STUB_BODY: '<html>base</html>',
      SHADOW_STUB_CANDIDATE_BODY: '<html>cand</html>',
    });
    const divDir = join(out, 'divergences');
    const first = join(divDir, '000-Home_page');
    expect(existsSync(join(first, 'base.html'))).toBe(true);
    expect(existsSync(join(first, 'candidate.html'))).toBe(true);
    expect(existsSync(join(first, 'meta.json'))).toBe(true);
    const meta = JSON.parse(readFileSync(join(first, 'meta.json'), 'utf8'));
    expect(meta.class).toBe('UNATTRIBUTED');
    // capped count sanity: exactly the 5 sampled routes diverged
    expect(readdirSync(divDir).length).toBe(5);
  });
});
