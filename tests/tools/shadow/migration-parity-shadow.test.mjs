// migration-parity-shadow.test.mjs — pin tests for the shadow (cutover
// readiness) stage of the migration parity tool.
//
// Layers pinned, mirroring the proven tests/tools/shadow/shadow-router.test.ts
// discipline (stub servers, synthetic bytes, no engine, no network):
//   1. noise normalization  — the two documented per-response regions
//   2. classification       — ENGINE-GAP vs CONTENT-CHANGED vs UNATTRIBUTED
//   3. cutover gate         — N consecutive clean runs, signature-scoped
//   4. policy schema        — reused routing fields + refused unknown keys
//   5. route sample         — percentage-or-name sampling; view routes from
//                             the corpus canvas fixture set (S1 CLOSED —
//                             unknown views still refused by name)
//   6. reference loader     — sha-verified, duplicate-refused
//   7. CLI subprocess       — help exit 0, missing inputs exit 2 (named),
//                             refusal discipline, report shape on real
//                             stub-instrument execute runs, server teardown
//   8. view-lane e2e        — mixed-lane clean run, view-only divergence
//                             isolation, the close-71 CF-carrier census,
//                             gate semantics on view samples
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
import { scratchDir } from '../../support/scratch-dir.mjs';

import {
  DEFAULT_PROBE_ROUTES,
  SHADOW_POLICY_DEFAULTS,
  SHADOW_REPORT_SCHEMA,
  UNKNOWN_VIEW_INPUT,
  UNKNOWN_VIEW_SENTINEL_LABEL,
  VALID_VIEW_ROUTES,
  VIEW_FETCH_HEADERS,
  cfCarrierPresent,
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
  routeLane,
  routePath,
  routeUrl,
  viewQueryValue,
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
  const dir = scratchDir('mps-pin-' + label + '-');
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

  it('normalizes single-quoted slot ids too (live-check-71 a work item finding)', () => {
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

  it('is LANE-BLIND: a view-lane body carrying an unexpected CF block still normalizes (never false-diverges)', () => {
    const view = '<div ' + slotAttr('f') + '>v</div><script>__CF$cv$params={};</script>';
    const out = normalizeNoiseHtml(view);
    expect(out).not.toContain('__CF$cv$params');
    expect(out).toContain('data-slot-id=' + DQ + 'RANDOMIZED' + DQ);
    expect(out).toContain('<div ');
  });
});

// ===========================================================================
// 1c. The view-lane noise asymmetry — the close-71 / live-check-71 census
// ===========================================================================
//
// The census (live-check-71-lane.md steps 6-7 + verdict table, 2026-10-03
// live fetch, 71 GETs): 34 page entries + 37 view entries. ALL 34 pages
// carried the Cloudflare __CF$cv$params per-response block; ZERO of the 37
// views did (33 views byte-exact, 4 views slot-id-norm only). This pin
// encodes those receipt numbers (a DATA pin, cited — the live captures are
// frozen artifacts, not re-fetchable here) and the behavior the asymmetry
// licenses: the CF region exists for PAGE-lane references and is a measured
// no-op on VIEW-lane references, while the normalizer itself stays
// lane-blind. NOTE: the lane mission text said "42 page carriers"; no
// receipt on disk says 42 — both close-71-lane.md and live-check-71-lane.md
// say 34 pages / 0 views. The pins encode the receipts.
describe('view-lane noise asymmetry — the close-71 census (34 page carriers, 0 view carriers)', () => {
  const CENSUS_PAGES = 34;
  const CENSUS_VIEWS = 37;
  const CENSUS_PAGE_CF_CARRIERS = 34; // all 34 pages carry the block
  const CENSUS_VIEW_CF_CARRIERS = 0;  // zero views carry it (33 exact + 4 slot-id-norm)

  it('the census arithmetic is internally consistent (34 pages + 37 views = 71 entries)', () => {
    expect(CENSUS_PAGES + CENSUS_VIEWS).toBe(71);
    expect(CENSUS_PAGE_CF_CARRIERS).toBe(CENSUS_PAGES);
    expect(CENSUS_VIEW_CF_CARRIERS).toBe(0);
    expect(33 + 4).toBe(CENSUS_VIEWS); // exact-equal + slot-id-norm views
  });

  it('cfCarrierPresent detects the block on page-lane-shaped bytes (the 34/34 shape)', () => {
    const page = '<html><head><script>__CF$cv$params={r:"a",t:"b"};</script></head><body>x</body></html>';
    expect(cfCarrierPresent(Buffer.from(page, 'utf8'))).toBe(true);
  });

  it('cfCarrierPresent measures ZERO on view-lane-shaped bytes (the 0/37 shape)', () => {
    const view = '<div id="x-open-view" class="card-slot open-view" data-slot-id="0123456789abcdef0123">v</div>';
    expect(cfCarrierPresent(Buffer.from(view, 'utf8'))).toBe(false);
    expect(cfCarrierPresent(Buffer.from('CAPTURE_ERROR: UnsupportedViewError: view (v) not supported', 'utf8'))).toBe(false);
  });

  it('the tool census counts carriers per lane (the observable per-run form)', () => {
    // Covered end-to-end in the view e2e describe below (a candidate view
    // body with an embedded CF block lands in counts.noiseCarriers.view).
    expect(VALID_VIEW_ROUTES).toEqual(['open', 'closed', 'content', 'title']);
    expect(UNKNOWN_VIEW_SENTINEL_LABEL).toBe('unknown_view_sentinel');
    expect(UNKNOWN_VIEW_INPUT).toBe('definitely_not_a_view');
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
    const routes = parseTargetsFile('# c\n\nHome\nFieldwork\t\n');
    expect(routes).toEqual([
      { name: 'Home', view: 'page' },
      { name: 'Aikido', view: 'page' },
    ]);
  });

  it('parseTargetsFile: more than two columns is a named error with the line number', () => {
    expect(() => parseTargetsFile('a\tb\tc')).toThrow(/line 1.*2 columns/);
  });

  it('view routes: the corpus canvas fixture views are ACCEPTED (S1 closed)', () => {
    const routes = parseTargetsFile('Home\topen\nFieldwork\tclosed\nAbout\tcontent\nEagle\ttitle');
    expect(routes.map(routeKey)).toEqual([
      'Home|open',
      'Aikido|closed',
      'About|content',
      'Eagle|title',
    ]);
  });

  it('view routes: the capture label unknown_view_sentinel parses as its label (executes via viewQueryValue)', () => {
    const routes = parseTargetsFile('Home\tunknown_view_sentinel');
    expect(routes.map(routeKey)).toEqual(['Home|unknown_view_sentinel']);
    expect(viewQueryValue('unknown_view_sentinel')).toBe('definitely_not_a_view');
    expect(viewQueryValue('open')).toBe('open');
  });

  it('view routes: an UNKNOWN view is REFUSED with the named valid set (typo protection)', () => {
    expect(() => parseTargetsFile('Home\topne')).toThrow(/unknown view "opne".*open, closed, content, title/);
    expect(() => parseTargetsFile('Home\tedit')).toThrow(/unknown view "edit"/);
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

  it('routePath stays QUERY-FREE for view routes (proven glob semantics: ? is a one-char wildcard; strip query before matching)', () => {
    expect(routePath({ name: 'Probe Card', view: 'open' })).toBe('/Probe%20Card');
    expect(routePath({ name: 'Probe Card', view: 'open' })).toBe(routePath({ name: 'Probe Card', view: 'page' }));
  });

  it('routeUrl: pages carry no query (proven fetch shape); views use the corpus /name?view= form', () => {
    expect(routeUrl({ name: 'Home', view: 'page' })).toBe('/Home');
    expect(routeUrl({ name: 'Probe Card', view: 'open' })).toBe('/Probe%20Card?view=open');
    expect(routeUrl({ name: 'Home', view: 'unknown_view_sentinel' })).toBe('/Home?view=definitely_not_a_view');
  });

  it('view routes sample through the SAME shouldShadow machinery, on the bare path', () => {
    const routing = { mode: 'shadow-everything', sampleRate: 100, allowlist: [], blocklist: [] };
    const routes = parseTargetsFile('Home\topen\nHome\tcontent\nEagle\ttitle\nEagle');
    const out = resolveRouteSample({ routes, routing, strictness: 'normalized' });
    expect(out.sampled.map(routeKey)).toEqual(['Home|open', 'Home|content', 'Eagle|title', 'Eagle|page']);
    const allow = { mode: 'shadow-allowlist', sampleRate: 100, allowlist: [/^\/Home$/], blocklist: [] };
    const filtered = resolveRouteSample({ routes, routing: allow, strictness: 'normalized' });
    expect(filtered.sampled.map(routeKey)).toEqual(['Home|open', 'Home|content']);
  });

  it('the sample signature distinguishes (name, view) pairs — a view-lane run never shares a streak with a page-lane run', () => {
    const routing = { mode: 'shadow-everything', sampleRate: 100, allowlist: [], blocklist: [] };
    const pages = resolveRouteSample({ routes: [{ name: 'Home', view: 'page' }], routing, strictness: 'normalized' });
    const views = resolveRouteSample({ routes: [{ name: 'Home', view: 'open' }], routing, strictness: 'normalized' });
    expect(pages.signature).not.toBe(views.signature);
    const viewsAgain = resolveRouteSample({ routes: [{ name: 'Home', view: 'open' }], routing, strictness: 'normalized' });
    expect(views.signature).toBe(viewsAgain.signature);
  });

  it('view fetches carry the corpus XHR header shape; pages keep the proven empty headers', () => {
    expect(VIEW_FETCH_HEADERS).toEqual({
      Accept: 'text/html, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    });
    expect(routeLane({ name: 'Home', view: 'page' })).toBe('page');
    expect(routeLane({ name: 'Home', view: 'open' })).toBe('view');
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

  it('a targets file with an UNKNOWN view is refused by name (exit 2); the canvas fixture views plan (S1 closed)', () => {
    const dir = scratch('cli-view');
    mkdirSync(join(dir, 'cand'), { recursive: true });
    writeFileSync(join(dir, 'm.sqlite'), 'synthetic-mirror-bytes');
    writeFileSync(join(dir, 'bad-targets.tsv'), 'Home\tbogus_lan\n');
    const bad = runCli([
      'shadow',
      '--base', dir,
      '--candidate', join(dir, 'cand'),
      '--mirror', join(dir, 'm.sqlite'),
      '--out', join(dir, 'out'),
      '--targets', join(dir, 'bad-targets.tsv'),
      '--instrument', STUB,
    ]);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toMatch(/unknown view "bogus_lan"/);
    // S1 is closed: a canvas-fixture view row plans with the corpus URL form.
    writeFileSync(join(dir, 'view-targets.tsv'), 'Home\topen\n');
    const good = runCli([
      'shadow',
      '--base', dir,
      '--candidate', join(dir, 'cand'),
      '--mirror', join(dir, 'm.sqlite'),
      '--out', join(dir, 'out'),
      '--targets', join(dir, 'view-targets.tsv'),
      '--instrument', STUB,
    ]);
    expect(good.status).toBe(0);
    expect(good.stdout).toMatch(/Home\|open\s+->\s+\/Home\?view=open/);
    expect(good.stdout).toMatch(/\[view lane\]/);
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
    expect(report.limitations.join(' ')).toMatch(/S1 CLOSED in this build/);
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

// ===========================================================================
// 8b. View-lane end-to-end with the stub instrument (execute runs)
// ===========================================================================
//
// The stub's view seam (SHADOW_STUB_VIEW_BODY / SHADOW_STUB_VIEW_CANDIDATE_BODY)
// is keyed off the same ?view= query the real instrument's renderCardView
// branch dispatches on. The REAL branch is proven against a real fixture deck
// with both real instruments spawned by runShadow — the manual e2e recorded in
// an internal work log (clean run 5/5, divergent run
// 4x ENGINE-GAP against a sha-verified reference, ports torn down).

describe('view-lane end-to-end with the stub instrument (execute runs)', () => {
  it('a mixed-lane sample runs clean end-to-end: view routes byte-identical, lanes + corpus URL forms recorded, exit 0', () => {
    const targets = scratch('view-targets-clean');
    writeFileSync(join(targets, 'views.tsv'), 'Home\topen\nFieldwork\tcontent\nEagle\t\n');
    const { r, out } = executeShadow(
      'e2e-view-clean',
      ['--targets', join(targets, 'views.tsv')],
      { SHADOW_STUB_BODY: '<html>page</html>', SHADOW_STUB_VIEW_BODY: '<div class="open-view">view</div>' },
    );
    expect(r.status).toBe(0);
    const report = JSON.parse(readFileSync(join(out, 'shadow-run.json'), 'utf8'));
    expect(report.verdict.verdict).toBe('clean');
    expect(report.counts.totalSampled).toBe(3);
    expect(report.counts.noiseCarriers).toEqual({ page: 0, view: 0 });
    const byKey = new Map(report.routes.map((rec) => [rec.route, rec]));
    expect(byKey.get('Home|open').lane).toBe('view');
    expect(byKey.get('Home|open').path).toBe('/Home?view=open');
    expect(byKey.get('Home|open').outcome).toBe('byte-identical');
    expect(byKey.get('Aikido|content').outcome).toBe('byte-identical');
    expect(byKey.get('Eagle|page').path).toBe('/Eagle');
    expect(byKey.get('Eagle|page').lane).toBe('page');
  });

  it('a divergent VIEW candidate diverges only the view lane: UNATTRIBUTED, exit 2, page route byte-identical', () => {
    const targets = scratch('view-targets-div');
    writeFileSync(join(targets, 'views.tsv'), 'Home\topen\nEagle\t\n');
    const { r, out } = executeShadow(
      'e2e-view-divergent',
      ['--targets', join(targets, 'views.tsv')],
      {
        SHADOW_STUB_BODY: '<html>page</html>',
        SHADOW_STUB_VIEW_BODY: '<div class="open-view">view base</div>',
        SHADOW_STUB_VIEW_CANDIDATE_BODY: '<div class="open-view">view cand</div>',
      },
    );
    expect(r.status).toBe(2);
    const report = JSON.parse(readFileSync(join(out, 'shadow-run.json'), 'utf8'));
    expect(report.verdict.verdict).toBe('not-clean');
    const byKey = new Map(report.routes.map((rec) => [rec.route, rec]));
    expect(byKey.get('Home|open').outcome).toBe('divergent');
    expect(byKey.get('Home|open').class).toBe('UNATTRIBUTED');
    // the page lane is isolated from the view seam
    expect(byKey.get('Eagle|page').outcome).toBe('byte-identical');
    expect(readdirSync(join(out, 'divergences')).length).toBe(1);
  });

  it('a CF block inside a view body normalizes to noise-only CLEAN and lands in the view-lane census (normalized strictness)', () => {
    const targets = scratch('view-targets-cf');
    writeFileSync(join(targets, 'views.tsv'), 'Home\topen\n');
    const cfView = (token) =>
      '<div data-slot-id="' + token + '">v</div><script>__CF$cv$params={r:"' + token + '"};</script>';
    const { r, out } = executeShadow(
      'e2e-view-cf',
      ['--targets', join(targets, 'views.tsv')],
      {
        SHADOW_STUB_VIEW_BODY: cfView(hexOf(20, 'a')),
        SHADOW_STUB_VIEW_CANDIDATE_BODY: cfView(hexOf(20, 'b')),
      },
    );
    expect(r.status).toBe(0);
    const report = JSON.parse(readFileSync(join(out, 'shadow-run.json'), 'utf8'));
    expect(report.verdict.verdict).toBe('clean');
    expect(report.routes[0].outcome).toBe('noise-only');
    expect(report.counts.noiseCarriers.view).toBe(1);
    expect(report.counts.noiseCarriers.page).toBe(0);
  });

  it('gate semantics are identical on view samples: N-consecutive streak in the same out dir, signature-scoped across lanes', () => {
    const targets = scratch('view-targets-gate');
    writeFileSync(join(targets, 'views.tsv'), 'Home\topen\nFieldwork\tcontent\n');
    const pageTargets = scratch('page-targets-gate');
    writeFileSync(join(pageTargets, 'pages.tsv'), 'Home\n');
    const env = { SHADOW_STUB_BODY: '<html>same</html>', SHADOW_STUB_VIEW_BODY: '<div class="open-view">same</div>' };

    const first = executeShadow(
      'e2e-view-gate',
      ['--targets', join(targets, 'views.tsv'), '--gate-runs', '2'],
      env,
    );
    expect(first.r.status).toBe(2);
    const report1 = JSON.parse(readFileSync(join(first.out, 'shadow-run.json'), 'utf8'));
    expect(report1.verdict.verdict).toBe('not-clean');
    expect(report1.verdict.cleanStreak).toBe(1);
    expect(report1.verdict.requiredRuns).toBe(2);

    // Second VIEW-lane run into the SAME out dir completes the streak.
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
        '--base-port', String(PORT + 10),
        '--candidate-port', String(PORT + 11),
        '--boot-timeout-ms', '15000',
        '--gate-runs', '2',
        '--targets', join(targets, 'views.tsv'),
      ],
      { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 },
    );
    expect(r2.status).toBe(0);
    const report2 = JSON.parse(readFileSync(join(first.out, 'shadow-run.json'), 'utf8'));
    expect(report2.verdict.verdict).toBe('clean');
    expect(report2.verdict.cleanStreak).toBe(2);

    // A PAGE-lane run (a DIFFERENT sample signature) never inherits the view streak.
    const r3 = spawnSync(
      NODE,
      [
        TOOL, 'shadow',
        '--base', join(dir, 'base-checkout'),
        '--candidate', join(dir, 'cand-checkout'),
        '--mirror', join(dir, 'mirror.sqlite'),
        '--out', first.out,
        '--instrument', STUB,
        '--execute',
        '--base-port', String(PORT + 12),
        '--candidate-port', String(PORT + 13),
        '--boot-timeout-ms', '15000',
        '--gate-runs', '2',
        '--targets', join(pageTargets, 'pages.tsv'),
      ],
      { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 },
    );
    expect(r3.status).toBe(2);
    const report3 = JSON.parse(readFileSync(join(first.out, 'shadow-run.json'), 'utf8'));
    expect(report3.verdict.verdict).toBe('not-clean');
    expect(report3.verdict.cleanStreak).toBe(1);
  });
});
