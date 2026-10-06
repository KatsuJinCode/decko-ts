// migration-parity-shadow.mjs — the CUTOVER-READINESS shadow stage of the
// migration parity tool (issue #1282 promise #6's missing half).
//
//   "Run a candidate engine in parallel behind a routing policy; cut over
//    when the comparison is clean."
//
// WHAT EXISTS vs WHAT THIS ADDS
//   tools/shadow/shadow-router.mjs (T5 of #1282) is the LIVE-proxy half: a
//   proxy that fronts a Ruby and a TypeScript upstream, plus the routing
//   policy (mode/allowlist/blocklist/sampleRate) with deterministic
//   FNV-1a percent sampling. This module is the CUTOVER half for other deck
//   owners: it drives TWO engine checkouts (BASE = current, CANDIDATE =
//   proposed) against a LOCAL MIRROR deck — zero live-site requests — and
//   emits a cutover report with a routing-policy verdict.
//
//   REUSED verbatim (wired, not reinvented):
//     - loadPolicy / shouldShadow : percentage-or-name route sampling
//     - forwardOnce               : per-request fetch machinery
//     - appendLogEntry            : JSONL history writing
//   NEW here (the gaps the T5 report does not close):
//     - the documented two-region noise normalization (Cloudflare
//       __CF$cv$params per-response tokens + decko data-slot-id hashes,
//       both quote forms — see normalizeNoiseHtml)
//     - two-sided divergence classification: ENGINE-GAP (candidate broke
//       recorded truth the base reproduces) vs CONTENT-CHANGED (the base
//       itself no longer matches the reference — reference drift, not the
//       candidate's fault), mirroring the plan's report shape
//     - the cutover gate predicate: N consecutive clean runs, scoped to a
//       sample signature (same routes + strictness + policy shape)
//     - the report schema `migration-parity-shadow-report/1
//
// SAFETY POSTURE (same refusal discipline as the migration-parity `run):
//   - DRY-RUN BY DEFAULT: without --execute nothing is spawned and nothing
//     is written — the command prints the exact plan.
//   - The only HTTP this stage performs is against 127.0.0.1 ports it
//     spawned itself (each checkout's own vm-staging-server.mjs on its own
//     WRITABLE COPY of the mirror). It never fetches a site.
//   - The owner's mirror file is never opened for writing: each run copies
//     it (sha256-bound) once per side, because the staging instrument's
//     auth layer opens its copy read-write.
//   - Page AND view-lane surfaces: route views from the corpus canvas
//     fixture set (open, closed, content, title — plus the capture label
//     unknown_view_sentinel, which maps to the executable input
//     definitely_not_a_view) render through each checkout's own
//     vm-staging-server.mjs at GET /<name>?view=<view> — the engine's BARE
//     view lane (RenderEngine.render), the exact path the corpus replay
//     grades. Limit S1 (page-surface-only) is CLOSED as of this build;
//     remaining limits are named in the report's `limitations` array.
//
// Docs: docs/migration-parity-tool-cli.md (shadow section). Plan:
// deliverables/migration-parity-tool-PLAN.md (stage table, honest gaps).

import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Proven routing/sampling/fetch machinery from the T5 shadow proxy. DO NOT
// duplicate its logic here — import and reuse.
import {
  appendLogEntry,
  forwardOnce,
  loadPolicy,
  shouldShadow,
} from "../tools/shadow/shadow-router.mjs";

export const SHADOW_REPORT_SCHEMA = "migration-parity-shadow-report/1";
export const DEFAULT_BASE_PORT = 3110;
export const DEFAULT_CANDIDATE_PORT = 3111;
export const DEFAULT_BOOT_TIMEOUT_MS = 60000;
export const DEFAULT_MAX_DIVERGENCE_ARTIFACTS = 20;
export const EXIT_OK = 0;
export const EXIT_USAGE = 2;

/**
 * The 5 standard probe pages — the same set the one-trip lane pinned
 * byte-identical (tmp/wrong-goal-hunt/one-trip-implementation-lane.md).
 * Literal card names; the tool URL-encodes them for the staging server.
 * The DEFAULT sample stays the proven page set; view routes join a sample
 * through the targets file.
 */
export const DEFAULT_PROBE_ROUTES = Object.freeze([
  { name: "Home", view: "page" },
  { name: "Aikido", view: "page" },
  { name: "About", view: "page" },
  { name: "Eagle", view: "page" },
  { name: "Taking_Stock", view: "page" },
]);

// ===========================================================================
// 1b. The view-lane surface — the corpus canvas fixture view set
// ===========================================================================

/**
 * The valid VIEW routes: exactly the view set the corpus canvas fixtures
 * define. Verified 2026-10-03 by scan — fixtures/captured/smoke.json
 * rendered keys carry open/closed/content/title per card, and the full
 * corpus-v2 recapture across all 48 shards carries the same four views
 * (open 2,431 / content 1,060 / closed 261 / title 28 view rows, nothing
 * else). A targets line outside this set is REFUSED with a named message
 * (typo protection, the same discipline as unknown policy keys) — never
 * silently downgraded to a page.
 */
export const VALID_VIEW_ROUTES = Object.freeze(["open", "closed", "content", "title"]);

/**
 * The capture LABEL vs EXECUTABLE INPUT convention
 * (src/testing/fixture-schema.ts): capture.rb recorded one sentinel per
 * card under the label unknown_view_sentinel, but the view it actually
 * rendered was definitely_not_a_view. A targets line may use the label;
 * the executable view is the mapping below.
 */
export const UNKNOWN_VIEW_SENTINEL_LABEL = "unknown_view_sentinel";
export const UNKNOWN_VIEW_INPUT = "definitely_not_a_view";

/** The executable view a targets-file view column names. */
export function viewQueryValue(view) {
  return view === UNKNOWN_VIEW_SENTINEL_LABEL ? UNKNOWN_VIEW_INPUT : view;
}

/**
 * The fetch headers for a VIEW route — the corpus convention from the
 * live-check-71 capture (live-check-71-fetch-culturesmith-2026-10-03.mjs):
 * views are fetched XHR-shaped (narrow Accept + X-Requested-With) while
 * pages are document navigations. The local staging instrument keys its
 * view dispatch off the ?view= query, so these headers are fidelity to the
 * capture convention, not a functional dependency. (The capture's Referer
 * header named the live origin and is intentionally omitted — the local
 * origins are per-side ports.)
 */
export const VIEW_FETCH_HEADERS = Object.freeze({
  Accept: "text/html, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
});

/** The comparison lane of a route: "page" or "view". */
export function routeLane(route) {
  return route.view === "page" ? "page" : "view";
}

// ===========================================================================
// 1. Noise normalization — the two documented per-response regions
// ===========================================================================

/**
 * Region 2 — decko data-slot-id. Verbatim rule from src/testing/diff.ts
 * (the tracked replay judge): data-slot-id=<quote><20 lowercase hex><quote>
 * becomes data-slot-id="RANDOMIZED". Quote style is erased (Ruby emits
 * double quotes in most views and single quotes inside search-result bars;
 * the live-check-71 lane's pass-2 fix proved nested bar slots carry
 * single-quoted ids). The 20-hex length is STRICT by design: a render
 * emitting a different-length id is a real divergence and must survive
 * normalization. Attribute PRESENCE is preserved — only the value is
 * rewritten. The placeholder is not hex, so normalization is idempotent.
 */
const SLOT_ID_PATTERN = /data-slot-id=(['"])([0-9a-f]{20})\1/g;
const RANDOMIZED_SLOT_ATTRIBUTE = 'data-slot-id="RANDOMIZED"';

/**
 * Region 1 — Cloudflare per-response challenge tokens. Every page the live
 * site serves through Cloudflare carries a script block defining
 * __CF$cv$params with per-response r/t tokens (live-check-71-lane.md:
 * "a per-response token cannot be byte-equal by construction"). No
 * deterministic engine can emit it, so the comparison protocol removes the
 * whole script element containing the marker (tempered pattern: the marker
 * must occur before that element's closing tag). On the LOCAL MIRROR path
 * this region never occurs (Cloudflare injects it at the edge, not in
 * engine output) — the removal is kept so ONE documented protocol covers
 * both the local cutover run and any later captured-live reference.
 */
const CF_SCRIPT_BLOCK_PATTERN =
  /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?__CF\$cv\$params(?:(?!<\/script>)[\s\S])*?<\/script>/gi;

/**
 * Normalize the two documented noise regions out of a rendered page.
 * Everything else is spec: any remaining difference is a real divergence.
 *
 * LANE-BLIND BY CONSTRUCTION: the SAME two regions apply to page-lane and
 * view-lane bytes — no lane special-casing exists or is needed. The
 * close-71/live-check-71 census (live-check-71-lane.md steps 6-7) measured
 * the asymmetry that makes this safe: all 34 PAGE entries of the 71-entry
 * live fetch carried the Cloudflare block while ZERO of the 37 VIEW entries
 * did (33 views byte-exact, 4 views slot-id-norm only) — view references
 * never need region 1, and applying it to them is a measured no-op. The
 * function stays lane-blind so a view body that DOES carry an unexpected
 * edge artifact still normalizes rather than false-diverging.
 */
export function normalizeNoiseHtml(html) {
  return html
    .replace(CF_SCRIPT_BLOCK_PATTERN, "")
    .replace(SLOT_ID_PATTERN, RANDOMIZED_SLOT_ATTRIBUTE);
}

/** Non-global twin of CF_SCRIPT_BLOCK_PATTERN for presence TESTS (a /g
 *  regex carries lastIndex state between .test calls — never reuse the
 *  global pattern for testing). */
const CF_CARRIER_TEST_PATTERN = new RegExp(CF_SCRIPT_BLOCK_PATTERN.source, "i");

/**
 * Whether one rendered body carries the Cloudflare per-response block.
 * Used for the per-run NOISE-CARRIER CENSUS the report emits per lane
 * (counts.noiseCarriers.{page,view}) — the observable form of the
 * close-71 asymmetry: page-lane references carry the block (34/34 in the
 * census), view-lane references never do (0/37).
 */
export function cfCarrierPresent(buffer) {
  return CF_CARRIER_TEST_PATTERN.test(buffer.toString("utf8"));
}

/** First differing byte offset between two buffers, or -1 if identical. */
export function firstDiffBufferOffset(a, b) {
  if (a.equals(b)) return -1;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// ===========================================================================
// 2. Routing-policy config schema (extends the proven T5 routing fields)
// ===========================================================================

export const SHADOW_POLICY_DEFAULTS = Object.freeze({
  mode: "shadow-everything",
  sampleRate: 100,
  strictness: "normalized", // "normalized" (documented default) | "byte"
  requireConsecutiveCleanRuns: 1,
});

const VALID_STRICTNESS = new Set(["normalized", "byte"]);

/**
 * Load + validate a shadow routing-policy file.
 *
 * Schema (JSON; paths resolve relative to the policy file's directory):
 * {
 *   "mode": "shadow-everything" | "shadow-allowlist" | "shadow-blocklist",
 *   "allowlist"?: [glob, ...],   // required iff mode = shadow-allowlist
 *   "blocklist"?: [glob, ...],   // required iff mode = shadow-blocklist
 *   "sampleRate": 0..100,        // percent; FNV-1a deterministic buckets.
 *                                // mode/allowlist/blocklist/sampleRate are
 *                                // validated BY tools/shadow/shadow-router.mjs
 *                                // loadPolicy — reused, not re-implemented
 *   "targetsFile"?: "routes.tsv",        // route sample: name[<TAB>view] lines
 *   "comparison"?: { "strictness"?: "normalized" | "byte" },
 *   "gate"?: { "requireConsecutiveCleanRuns"?: <integer >= 1> },
 *   "reference"?: "reference.jsonl       // {route, sha256, bodyFile} lines
 * }
 * Unknown keys are REFUSED (typo protection — a misspelled "comparison"
 * must not silently fall back to a safe-looking default).
 */
export function loadShadowPolicy(policyPath) {
  const abs = path.resolve(policyPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new Error(`policy: file not found: ${abs}`);
  }
  const dir = path.dirname(abs);
  // Proven validation for the routing fields (named errors on bad mode,
  // missing allowlist/blocklist, out-of-range sampleRate, bad JSON).
  const routing = loadPolicy(abs);
  let raw;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    throw new Error(`policy ${abs}: invalid JSON: ${err.message}`);
  }

  const KNOWN_KEYS = new Set([
    "mode",
    "allowlist",
    "blocklist",
    "sampleRate",
    "targetsFile",
    "comparison",
    "gate",
    "reference",
  ]);
  const unknown = Object.keys(raw).filter((k) => !KNOWN_KEYS.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `policy ${abs}: unknown field(s): ${unknown.join(", ")} — ` +
        `known fields: ${[...KNOWN_KEYS].join(", ")}`,
    );
  }

  let strictness = SHADOW_POLICY_DEFAULTS.strictness;
  if (raw.comparison !== undefined) {
    if (typeof raw.comparison !== "object" || raw.comparison === null || Array.isArray(raw.comparison)) {
      throw new Error(`policy ${abs}: comparison must be an object`);
    }
    const ck = Object.keys(raw.comparison).filter((k) => k !== "strictness");
    if (ck.length > 0) {
      throw new Error(`policy ${abs}: unknown comparison field(s): ${ck.join(", ")} (only strictness)`);
    }
    if (raw.comparison.strictness !== undefined) {
      if (!VALID_STRICTNESS.has(raw.comparison.strictness)) {
        throw new Error(
          `policy ${abs}: comparison.strictness must be "normalized" or "byte", got ${JSON.stringify(raw.comparison.strictness)}`,
        );
      }
      strictness = raw.comparison.strictness;
    }
  }

  let requireConsecutiveCleanRuns = SHADOW_POLICY_DEFAULTS.requireConsecutiveCleanRuns;
  if (raw.gate !== undefined) {
    if (typeof raw.gate !== "object" || raw.gate === null || Array.isArray(raw.gate)) {
      throw new Error(`policy ${abs}: gate must be an object`);
    }
    const gk = Object.keys(raw.gate).filter((k) => k !== "requireConsecutiveCleanRuns");
    if (gk.length > 0) {
      throw new Error(
        `policy ${abs}: unknown gate field(s): ${gk.join(", ")} (only requireConsecutiveCleanRuns)`,
      );
    }
    if (raw.gate.requireConsecutiveCleanRuns !== undefined) {
      const n = raw.gate.requireConsecutiveCleanRuns;
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(
          `policy ${abs}: gate.requireConsecutiveCleanRuns must be an integer >= 1, got ${JSON.stringify(n)}`,
        );
      }
      requireConsecutiveCleanRuns = n;
    }
  }

  let targetsFile;
  if (raw.targetsFile !== undefined) {
    if (typeof raw.targetsFile !== "string" || raw.targetsFile === "") {
      throw new Error(`policy ${abs}: targetsFile must be a non-empty string path`);
    }
    targetsFile = path.resolve(dir, raw.targetsFile);
  }

  let reference;
  if (raw.reference !== undefined) {
    if (typeof raw.reference !== "string" || raw.reference === "") {
      throw new Error(`policy ${abs}: reference must be a non-empty string path`);
    }
    reference = path.resolve(dir, raw.reference);
  }

  return { routing, strictness, requireConsecutiveCleanRuns, targetsFile, reference, dir };
}

/**
 * Load the reference file (two-sided classification input): JSONL lines
 * { "route": "Name|view", "sha256": "<64 hex of bodyFile bytes>",
 *   "bodyFile": "<path relative to this file" }.
 * Returns Map<routeKey, Buffer>. sha256 is VERIFIED against the body bytes
 * (the capture discipline: a reference that cannot prove itself must not
 * silently arbitrate a cutover).
 */
export function loadReferenceFile(referencePath) {
  const abs = path.resolve(referencePath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new Error(`reference: file not found: ${abs}`);
  }
  const dir = path.dirname(abs);
  const map = new Map();
  const lines = readFileSync(abs, "utf8").split("\n").filter((l) => l.trim() !== "");
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch (err) {
      throw new Error(`reference ${abs}: line ${lineNo}: invalid JSON: ${err.message}`);
    }
    for (const field of ["route", "sha256", "bodyFile"]) {
      if (typeof entry[field] !== "string" || entry[field] === "") {
        throw new Error(`reference ${abs}: line ${lineNo}: missing or empty "${field}"`);
      }
    }
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new Error(`reference ${abs}: line ${lineNo}: sha256 must be 64 lowercase hex chars`);
    }
    if (map.has(entry.route)) {
      throw new Error(`reference ${abs}: line ${lineNo}: duplicate route ${JSON.stringify(entry.route)}`);
    }
    const bodyPath = path.resolve(dir, entry.bodyFile);
    if (!existsSync(bodyPath) || !statSync(bodyPath).isFile()) {
      throw new Error(`reference ${abs}: line ${lineNo}: bodyFile not found: ${bodyPath}`);
    }
    const body = readFileSync(bodyPath);
    const actual = sha256Hex(body);
    if (actual !== entry.sha256) {
      throw new Error(
        `reference ${abs}: line ${lineNo}: sha256 mismatch for ${entry.bodyFile} ` +
          `(declared ${entry.sha256}, actual ${actual})`,
      );
    }
    map.set(entry.route, body);
  }
  return map;
}

// ===========================================================================
// 3. Route sample — name-and-view routes through the proven sampling
// ===========================================================================

/** URL PATH for a route — policy matching and FNV sampling see THIS string
 *  only. Query strings never enter matching: the proven shadow-router glob
 *  language treats "?" as a ONE-CHAR wildcard and its header convention is
 *  "match the full URL path (no query string — strip before matching)".
 *  decodeName on the instrument side = decodeURIComponent; "+" is Decko's
 *  joint and must survive — encodeURIComponent preserves it as %2B. */
export function routePath(route) {
  return "/" + encodeURIComponent(route.name);
}

/** The full FETCH URL for a route — routePath plus the view query for
 *  view-lane routes, the corpus convention
 *  ("/<Name_underscored>?view=<view>", live-check-71 fetch). Page routes
 *  carry no query (byte-identical to the proven page-surface fetches).
 *  The instrument's view dispatch keys off this query (vm-staging-server
 *  serve branch), not off the headers. */
export function routeUrl(route) {
  const p = routePath(route);
  if (route.view === "page") return p;
  return `${p}?view=${encodeURIComponent(viewQueryValue(route.view))}`;
}

export function routeKey(route) {
  return `${route.name}|${route.view}`;
}

/**
 * Parse a route-sample TSV: one route per line, `name or `name<TAB>view.
 * `# comments and blank lines are ignored (the capture instrument's TSV
 * convention). The view column accepts `page (the default) and the corpus
 * canvas fixture view set — open, closed, content, title — plus the
 * capture label unknown_view_sentinel (mapped to the executable input
 * definitely_not_a_view, the fixture-schema.ts convention). Anything else
 * is REFUSED with a named message listing the valid set (typo protection,
 * never a silent downgrade).
 */
export function parseTargetsFile(text, sourceLabel = "targets") {
  const routes = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const lineNo = i + 1;
    if (line === "" || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length > 2) {
      throw new Error(
        `${sourceLabel}: line ${lineNo}: expected name<TAB>view (2 columns), got ${parts.length}`,
      );
    }
    const name = parts[0].trim();
    const view = (parts[1] ?? "page").trim() || "page";
    if (name === "") {
      throw new Error(`${sourceLabel}: line ${lineNo}: empty route name`);
    }
    const viewKnown = view === "page" || view === UNKNOWN_VIEW_SENTINEL_LABEL || VALID_VIEW_ROUTES.includes(view);
    if (!viewKnown) {
      throw new Error(
        `${sourceLabel}: line ${lineNo}: route ${JSON.stringify(name)} requests unknown view ` +
          `${JSON.stringify(view)} — valid views: page (the full page render) and the ` +
          `corpus canvas fixture views ${VALID_VIEW_ROUTES.join(", ")} ` +
          `(smoke.json rendered keys + the corpus-v2 recapture view rows) plus the capture ` +
          `label ${JSON.stringify(UNKNOWN_VIEW_SENTINEL_LABEL)} ` +
          `(executes as ${JSON.stringify(UNKNOWN_VIEW_INPUT)}).`,
      );
    }
    routes.push({ name, view });
  }
  return routes;
}

/**
 * Apply the routing policy to a route list: mode filter (name globs) AND
 * deterministic percent sampling — the EXACT semantics of
 * tools/shadow/shadow-router.mjs shouldShadow, reused. Returns
 * { sampled, excluded, signature } where signature binds the sampled route
 * set + strictness + policy shape (the cutover gate is scoped to it).
 */
export function resolveRouteSample({ routes, routing, strictness }) {
  const sampled = [];
  const excluded = [];
  for (const route of routes) {
    if (shouldShadow(routing, "GET", routePath(route))) sampled.push(route);
    else excluded.push(route);
  }
  const signatureInput = JSON.stringify({
    mode: routing.mode,
    sampleRate: routing.sampleRate,
    strictness,
    routes: sampled.map(routeKey).sort(),
  });
  const signature = createHash("sha256").update(signatureInput).digest("hex");
  return { sampled, excluded, signature };
}

// ===========================================================================
// 4. Classification — two-sided, reference-arbitrated
// ===========================================================================

/**
 * Classify one route's BASE vs CANDIDATE bytes, with an optional reference.
 *
 *   byte-equal                        -> outcome "byte-identical"
 *   noise-only (equal after the two
 *   documented normalizations)        -> strictness "normalized":
 *                                          outcome "noise-only" (counts clean)
 *                                        strictness "byte":
 *                                          outcome "divergent", class "NOISE"
 *   real divergence + reference:
 *     base reproduces the reference
 *     (normalized)                    -> class "ENGINE-GAP" — the candidate
 *                                        broke truth the base still renders
 *     base does NOT match reference   -> class "CONTENT-CHANGED — the
 *                                        recorded reference drifted from even
 *                                        the base engine (mirror/content
 *                                        moved); not attributable to the
 *                                        candidate
 *   real divergence, no reference     -> class "UNATTRIBUTED — never counted
 *                                        clean (a comparison that cannot
 *                                        attribute must not pass the gate)
 *
 * base/candidate/reference are Buffers. Returns { outcome, class, firstDiff }
 * where firstDiff is the first differing BASE-vs-CANDIDATE byte offset
 * (-1 when byte-equal).
 */
export function classifyRoute({ base, candidate, reference, strictness }) {
  const firstDiff = firstDiffBufferOffset(base, candidate);
  if (firstDiff === -1) {
    return { outcome: "byte-identical", class: null, firstDiff };
  }
  const nb = normalizeNoiseHtml(base.toString("utf8"));
  const nc = normalizeNoiseHtml(candidate.toString("utf8"));
  if (nb === nc) {
    return strictness === "byte"
      ? { outcome: "divergent", class: "NOISE", firstDiff }
      : { outcome: "noise-only", class: null, firstDiff };
  }
  if (reference === undefined || reference === null) {
    return { outcome: "divergent", class: "UNATTRIBUTED", firstDiff };
  }
  const nr = normalizeNoiseHtml(reference.toString("utf8"));
  const gapClass = nb === nr ? "ENGINE-GAP" : "CONTENT-CHANGED";
  return { outcome: "divergent", class: gapClass, firstDiff };
}

/** Divergent-route count at the given strictness (fetch errors always
 *  count — an engine that did not answer cannot be called clean). */
export function countDivergentAtStrictness(routes, strictness) {
  return routes.filter(
    (r) =>
      r.outcome === "divergent" ||
      r.outcome === "fetch-error-base" ||
      r.outcome === "fetch-error-candidate" ||
      r.outcome === "fetch-error-both" ||
      (strictness === "byte" && r.outcome === "noise-only"),
  ).length;
}

// ===========================================================================
// 5. Cutover gate — N consecutive clean runs, signature-scoped
// ===========================================================================

/**
 * Evaluate the cutover gate over the run history (oldest -> newest, INCLUDING
 * the current run as the last entry). A run counts toward the streak only if
 * it has the SAME sample signature (same routes + strictness + policy shape)
 * — a streak across different samples would compare apples to gates.
 * Returns { verdict: "clean" | "not-clean", cleanStreak, reasons: [] }.
 */
export function evaluateCutoverGate({ history, requiredRuns, divergentCount, reasons: extraReasons = [] }) {
  const reasons = [...extraReasons];
  const current = history[history.length - 1];
  let cleanStreak = 0;
  if (current !== undefined && current.clean) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const entry = history[i];
      if (entry.signature !== current.signature || !entry.clean) break;
      cleanStreak += 1;
    }
  }
  const verdict =
    current !== undefined && current.clean && cleanStreak >= requiredRuns
      ? "clean"
      : "not-clean";
  if (divergentCount > 0) {
    reasons.push(`${divergentCount} divergent route(s) at the policy strictness`);
  }
  if (verdict === "not-clean" && cleanStreak < requiredRuns) {
    reasons.push(
      `clean streak ${cleanStreak} of ${requiredRuns} required consecutive clean run(s) ` +
        `(signature-scoped)`,
    );
  }
  return { verdict, cleanStreak, reasons };
}

function readHistory(historyPath) {
  if (!existsSync(historyPath)) return [];
  return readFileSync(historyPath, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

// ===========================================================================
// 6. Report
// ===========================================================================

function buildReport({ runId, startedAt, finishedAt, base, candidate, mirror, policy, sample, routes, counts, boots, gate, limitations }) {
  return {
    schema: SHADOW_REPORT_SCHEMA,
    runId,
    startedAt,
    finishedAt,
    base,
    candidate,
    mirror,
    policy,
    sample,
    routes,
    counts,
    boots,
    verdict: {
      verdict: gate.verdict,
      cleanStreak: gate.cleanStreak,
      requiredRuns: policy.requireConsecutiveCleanRuns,
      reasons: gate.reasons,
    },
    limitations,
  };
}

export function renderReportText(report) {
  const lines = [];
  lines.push(`CUTOVER REPORT — shadow run ${report.runId}`);
  lines.push(`base:      ${report.base.dir} @ ${report.base.rev} (port ${report.base.port})`);
  lines.push(`candidate: ${report.candidate.dir} @ ${report.candidate.rev} (port ${report.candidate.port})`);
  lines.push(`mirror:    ${report.mirror.path}`);
  lines.push(`           sha256 ${report.mirror.sha256} (writable copies: ${report.mirror.copies.base}, ${report.mirror.copies.candidate})`);
  lines.push(
    `policy:    mode=${report.policy.mode} sampleRate=${report.policy.sampleRate}% ` +
      `strictness=${report.policy.strictness} gate=requireConsecutiveCleanRuns:${report.policy.requireConsecutiveCleanRuns}`,
  );
  lines.push(`Routes sampled: ${report.counts.totalSampled} of ${report.counts.requested} in scope`);
  lines.push(`  byte-identical (raw):                   ${report.counts.byteIdentical}`);
  lines.push(`  noise-only (equal after normalization): ${report.counts.noiseOnly}`);
  lines.push(`  divergent at strictness:                ${report.counts.divergent}`);
  lines.push(`    ENGINE-GAP:              ${report.counts.classCounts["ENGINE-GAP"]}`);
  lines.push(`    CONTENT-CHANGED:         ${report.counts.classCounts["CONTENT-CHANGED"]}`);
  lines.push(`    UNATTRIBUTED:            ${report.counts.classCounts["UNATTRIBUTED"]}`);
  lines.push(`    NOISE (byte strictness): ${report.counts.classCounts.NOISE}`);
  lines.push(`    FETCH-ERROR:             ${report.counts.classCounts["FETCH-ERROR"]}`);
  lines.push(
    `  noise carriers (CF block, base|candidate either side): ` +
      `page ${report.counts.noiseCarriers.page}, view ${report.counts.noiseCarriers.view}` +
      ` (close-71 census: page lanes carry it, view lanes measure 0)`,
  );
  const divergentRoutes = report.routes.filter((r) => r.class !== null);
  if (divergentRoutes.length > 0) {
    lines.push("Divergent / errored routes:");
    for (const r of divergentRoutes) {
      lines.push(
        `  ${r.route}  class=${r.class} firstDiff=${r.firstDiff} ` +
          `status ${r.statusBase}/${r.statusCandidate} bytes ${r.bytesBase}/${r.bytesCandidate}`,
      );
    }
  }
  lines.push(
    `VERDICT: ${report.verdict.verdict.toUpperCase()} — clean streak ${report.verdict.cleanStreak}/${report.verdict.requiredRuns}`,
  );
  for (const reason of report.verdict.reasons) lines.push(`  reason: ${reason}`);
  for (const lim of report.limitations) lines.push(`limitation: ${lim}`);
  return lines.join("\n");
}

// ===========================================================================
// 7. Orchestration
// ===========================================================================

function isDir(p) {
  return existsSync(p) && statSync(p).isDirectory();
}
function isFile(p) {
  return existsSync(p) && statSync(p).isFile();
}

function gitRev(dir) {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  if (r.status === 0 && typeof r.stdout === "string" && r.stdout.trim() !== "") {
    return r.stdout.trim();
  }
  return "unknown";
}

function collectOutput(proc, cap = 64 * 1024) {
  let buf = "";
  proc.stdout.on("data", (d) => {
    if (buf.length < cap) buf += String(d);
  });
  proc.stderr.on("data", (d) => {
    if (buf.length < cap) buf += String(d);
  });
  return () => buf;
}

/**
 * Stop a child this run spawned. Ownership is total: the PID was created by
 * this invocation, its command line is known (we built it), and stopping it
 * is the run's own teardown — no name-based killing, nothing external.
 * SIGTERM first (the staging instrument drains gracefully), then SIGKILL on
 * the SAME pid if it will not exit (escalation recorded).
 */
function stopChild(child, label, log) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  const pid = child.pid;
  log.push(`teardown: SIGTERM -> ${label} (pid ${pid})`);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return Promise.resolve(); // already gone
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      log.push(`teardown: escalation SIGKILL -> ${label} (pid ${pid}) — did not exit on SIGTERM`);
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // gone already
      }
      resolve();
    }, 5000);
    timer.unref();
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForStatus(baseUrl, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await forwardOnce({ baseUrl, method: "GET", urlPath: "/_status", headers: {} });
      if (res.status === 200) return { ok: true };
      lastError = new Error(`${label} /_status answered ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return {
    ok: false,
    error: `${label} did not become healthy within ${timeoutMs}ms: ${lastError?.message ?? String(lastError)}`,
  };
}

/** Validate everything; returns a list of named problems (empty = valid). */
export function validateShadowInputs(opts) {
  const problems = [];
  const { baseDir, candidateDir, mirrorPath, outDir } = opts;

  if (!baseDir) problems.push("  --base <dir> not provided (BASE engine checkout)");
  else if (!isDir(baseDir)) problems.push(`  --base: directory not found: ${baseDir}`);

  if (!candidateDir) problems.push("  --candidate <dir> not provided (CANDIDATE engine checkout)");
  else if (!isDir(candidateDir)) problems.push(`  --candidate: directory not found: ${candidateDir}`);

  if (baseDir && candidateDir && isDir(baseDir) && isDir(candidateDir)) {
    if (path.resolve(baseDir) === path.resolve(candidateDir)) {
      problems.push(
        `  --base and --candidate must be DIFFERENT checkouts (both are ${path.resolve(baseDir)})`,
      );
    }
  }

  if (!mirrorPath) problems.push("  --mirror <deck.sqlite> not provided (local mirror deck; the owner's file is never written)");
  else if (!isFile(mirrorPath)) problems.push(`  --mirror: file not found: ${mirrorPath}`);

  if (!outDir) problems.push("  --out <dir> not provided (run directory for report, copies, history)");

  // Instrument presence — checked per side. With --instrument (absolute
  // override used for both sides — the test/pinch-hitter seam, also settable
  // via PARITY_SHADOW_INSTRUMENT) the per-checkout build checks are skipped;
  // without it, each checkout needs its own vm-staging-server.mjs AND its
  // compiled engine.
  if (opts.instrument) {
    if (!isFile(opts.instrument)) {
      problems.push(`  --instrument: file not found: ${opts.instrument}`);
    }
  } else {
    for (const [label, dir] of [["base", baseDir], ["candidate", candidateDir]]) {
      if (!dir || !isDir(dir)) continue;
      const instrument = path.join(dir, "vm-staging-server.mjs");
      if (!isFile(instrument)) {
        problems.push(`  ${label} checkout: render instrument not found: ${instrument}`);
      }
      const builtEngine = path.join(dir, "dist", "src", "card", "render", "page.js");
      if (!isFile(builtEngine)) {
        problems.push(
          `  ${label} checkout: compiled engine not found: ${builtEngine} — build the checkout (npx tsc) or point --instrument at a local stub`,
        );
      }
    }
  }

  // Targets / policy / reference files are parsed by their loaders; here we
  // only refuse obvious absence so the named list is complete in one pass.
  if (opts.targetsPath && !isFile(opts.targetsPath)) {
    problems.push(`  --targets: file not found: ${opts.targetsPath}`);
  }
  if (opts.policyPath && !isFile(opts.policyPath)) {
    problems.push(`  --policy: file not found: ${opts.policyPath}`);
  }
  if (opts.referencePath && !isFile(opts.referencePath)) {
    problems.push(`  --reference: file not found: ${opts.referencePath}`);
  }
  for (const [flag, port] of [["--base-port", opts.basePort], ["--candidate-port", opts.candidatePort]]) {
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      problems.push(`  ${flag}: must be an integer in [1, 65535], got ${port}`);
    }
  }
  if (
    Number.isInteger(opts.basePort) &&
    Number.isInteger(opts.candidatePort) &&
    opts.basePort === opts.candidatePort
  ) {
    problems.push(`  --base-port and --candidate-port must differ (both ${opts.basePort})`);
  }
  if (opts.gateRuns !== undefined && (!Number.isInteger(opts.gateRuns) || opts.gateRuns < 1)) {
    problems.push(`  --gate-runs: must be an integer >= 1, got ${opts.gateRuns}`);
  }
  return problems;
}

function defaultPolicyShape(opts) {
  return {
    routing: {
      mode: SHADOW_POLICY_DEFAULTS.mode,
      sampleRate: SHADOW_POLICY_DEFAULTS.sampleRate,
      allowlist: [],
      blocklist: [],
    },
    strictness: opts.strictness ?? SHADOW_POLICY_DEFAULTS.strictness,
    requireConsecutiveCleanRuns: opts.gateRuns ?? SHADOW_POLICY_DEFAULTS.requireConsecutiveCleanRuns,
    targetsFile: opts.targetsPath ?? null,
    reference: opts.referencePath ?? null,
  };
}

function baseUrls(opts) {
  const basePort = opts.basePort ?? DEFAULT_BASE_PORT;
  const candidatePort = opts.candidatePort ?? DEFAULT_CANDIDATE_PORT;
  return {
    basePort,
    candidatePort,
    base: `http://127.0.0.1:${basePort}`,
    candidate: `http://127.0.0.1:${candidatePort}`,
  };
}

function describePlan(opts, policy, sample, urls) {
  const node = process.execPath;
  const instrument = opts.instrument;
  const baseInstrument = instrument ?? path.join(opts.baseDir, "vm-staging-server.mjs");
  const candidateInstrument = instrument ?? path.join(opts.candidateDir, "vm-staging-server.mjs");
  const lines = [];
  lines.push("SHADOW PLAN (dry-run — nothing executed; add --execute to run the comparison)");
  lines.push(`  base checkout:      ${opts.baseDir} @ ${gitRev(opts.baseDir)}`);
  lines.push(`  candidate checkout: ${opts.candidateDir} @ ${gitRev(opts.candidateDir)}`);
  lines.push(`  mirror (never written): ${opts.mirrorPath}`);
  lines.push(
    `  policy: mode=${policy.routing.mode} sampleRate=${policy.routing.sampleRate}% ` +
      `strictness=${policy.strictness} gate=requireConsecutiveCleanRuns:${policy.requireConsecutiveCleanRuns}`,
  );
  lines.push(
    `  would copy mirror -> ${path.join(opts.outDir, "mirror-base.sqlite")} and ${path.join(opts.outDir, "mirror-candidate.sqlite")} (sha256-bound)`,
  );
  lines.push(`  would spawn BASE      : ${node} ${baseInstrument} <mirror-copy> ${urls.basePort}  (binds ${urls.base})`);
  lines.push(`  would spawn CANDIDATE : ${node} ${candidateInstrument} <mirror-copy> ${urls.candidatePort}  (binds ${urls.candidate})`);
  lines.push(
    `  routes sampled: ${sample.sampled.length} of ${sample.sampled.length + sample.excluded.length} in scope ` +
      `(policy ${policy.routing.mode} @ ${policy.routing.sampleRate}%)`,
  );
  for (const r of sample.sampled) lines.push(`    ${routeKey(r)}  ->  ${routeUrl(r)}  [${routeLane(r)} lane]`);
  for (const r of sample.excluded) lines.push(`    (excluded by policy) ${routeKey(r)}`);
  lines.push(
    `  reference: ${policy.reference ?? "(none — real divergences will classify UNATTRIBUTED and fail the gate)"}`,
  );
  return lines.join("\n");
}

/**
 * Run the shadow comparison. Returns { exitCode, report?, planText?, problems? }.
 */
export async function runShadow(opts) {
  const problems = validateShadowInputs(opts);
  if (problems.length > 0) {
    return { exitCode: EXIT_USAGE, problems };
  }

  // Policy + targets + reference resolution (named failures).
  let policy;
  try {
    policy = opts.policyPath ? loadShadowPolicy(opts.policyPath) : defaultPolicyShape(opts);
    if (opts.strictness) policy.strictness = opts.strictness;
    if (opts.gateRuns !== undefined) policy.requireConsecutiveCleanRuns = opts.gateRuns;
    if (opts.targetsPath) policy.targetsFile = opts.targetsPath;
    if (opts.referencePath) policy.reference = opts.referencePath;
  } catch (err) {
    return { exitCode: EXIT_USAGE, problems: [`  ${err.message}`] };
  }

  let routes;
  try {
    if (policy.targetsFile) {
      routes = parseTargetsFile(readFileSync(policy.targetsFile, "utf8"), policy.targetsFile);
    } else {
      routes = [...DEFAULT_PROBE_ROUTES];
    }
  } catch (err) {
    return { exitCode: EXIT_USAGE, problems: [`  ${err.message}`] };
  }

  const sample = resolveRouteSample({ routes, routing: policy.routing, strictness: policy.strictness });

  let referenceMap = new Map();
  if (policy.reference) {
    try {
      referenceMap = loadReferenceFile(policy.reference);
    } catch (err) {
      return { exitCode: EXIT_USAGE, problems: [`  ${err.message}`] };
    }
  }

  const urls = baseUrls(opts);

  if (!opts.execute) {
    const planText = describePlan(opts, policy, sample, urls);
    return { exitCode: EXIT_OK, dryRun: true, planText };
  }

  // ---------------- EXECUTE (explicit --execute only) ----------------
  const startedAt = new Date().toISOString();
  const runId = `shadow-${startedAt.replace(/[-:]/g, "").replace(/\..+$/, "")}`;
  const outDir = path.resolve(opts.outDir);
  mkdirSync(outDir, { recursive: true });
  const teardownLog = [];

  const mirrorSha = sha256Hex(readFileSync(opts.mirrorPath));
  const copyBase = path.join(outDir, "mirror-base.sqlite");
  const copyCandidate = path.join(outDir, "mirror-candidate.sqlite");
  copyFileSync(opts.mirrorPath, copyBase);
  copyFileSync(opts.mirrorPath, copyCandidate);
  const copyBaseSha = sha256Hex(readFileSync(copyBase));
  const copyCandidateSha = sha256Hex(readFileSync(copyCandidate));

  const instrument = opts.instrument; // may be null
  const baseInstrument = instrument ?? path.join(opts.baseDir, "vm-staging-server.mjs");
  const candidateInstrument = instrument ?? path.join(opts.candidateDir, "vm-staging-server.mjs");

  const bootTimeoutMs = opts.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS;
  const maxArtifacts = opts.maxDivergenceArtifacts ?? DEFAULT_MAX_DIVERGENCE_ARTIFACTS;
  const divergenceDir = path.join(outDir, "divergences");

  // Spawn BOTH engines' render servers (the parallel run behind the policy).
  // FOLD-12 UNION ADJUDICATION: the spawned instruments get
  // DECKO_SHADOW_VIEW_LANE=1 so vm-staging-server.mjs serves its BARE view
  // lane (raise -> CAPTURE_ERROR sentinel at 200 — this stage's
  // byte-comparison contract). Servers NOT spawned here (the graded pins,
  // the session-replay surface, default staging) never see the flag and
  // keep Ruby's unsupported-view 422 — the standing-net member
  // tests/server/edit-session-replay.test.ts pins that shape.
  const shadowLaneEnv = { ...process.env, DECKO_SHADOW_VIEW_LANE: "1" };
  const baseProc = spawn(process.execPath, [baseInstrument, copyBase, String(urls.basePort)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: shadowLaneEnv,
  });
  const candidateProc = spawn(process.execPath, [candidateInstrument, copyCandidate, String(urls.candidatePort)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: shadowLaneEnv,
  });
  collectOutput(baseProc);
  collectOutput(candidateProc);

  let routeRecords = [];
  let baseBoot = { ok: false, error: "not attempted" };
  let candidateBoot = { ok: false, error: "not attempted" };

  try {
    [baseBoot, candidateBoot] = await Promise.all([
      waitForStatus(urls.base, bootTimeoutMs, "BASE"),
      waitForStatus(urls.candidate, bootTimeoutMs, "CANDIDATE"),
    ]);

    const bothBootsOk = baseBoot.ok && candidateBoot.ok;
    if (bothBootsOk) {
      let storedArtifacts = 0;
      for (const route of sample.sampled) {
        const urlPath = routeUrl(route);
        // Pages keep the proven header shape ({}); view routes carry the
        // corpus XHR convention (live-check-71 fetch).
        const fetchHeaders = route.view === "page" ? {} : VIEW_FETCH_HEADERS;
        const [b, c] = await Promise.all([
          forwardOnce({ baseUrl: urls.base, method: "GET", urlPath, headers: fetchHeaders }).catch((err) => ({ error: err })),
          forwardOnce({ baseUrl: urls.candidate, method: "GET", urlPath, headers: fetchHeaders }).catch((err) => ({ error: err })),
        ]);

        if (b.error && c.error) {
          routeRecords.push(errorRecord(route, urlPath, "fetch-error-both"));
          continue;
        }
        if (b.error || c.error) {
          routeRecords.push(errorRecord(route, urlPath, b.error ? "fetch-error-base" : "fetch-error-candidate"));
          continue;
        }

        const verdict = classifyRoute({
          base: b.body,
          candidate: c.body,
          reference: referenceMap.get(routeKey(route)) ?? null,
          strictness: policy.strictness,
        });
        const rec = {
          route: routeKey(route),
          path: urlPath,
          lane: routeLane(route),
          outcome: verdict.outcome,
          class: verdict.class,
          firstDiff: verdict.firstDiff,
          statusBase: b.status,
          statusCandidate: c.status,
          bytesBase: b.body.length,
          bytesCandidate: c.body.length,
          shaBase: sha256Hex(b.body),
          shaCandidate: sha256Hex(c.body),
          // The per-route noise-carrier census (the observable form of the
          // close-71 asymmetry: page lanes carry the CF block, view lanes
          // measure 0).
          cfCarrierBase: cfCarrierPresent(b.body),
          cfCarrierCandidate: cfCarrierPresent(c.body),
        };
        if (b.status !== c.status) rec.statusMismatch = true;

        // Keep divergent bodies for triage (capped; error pages included).
        const isDivergentHere =
          rec.outcome === "divergent" ||
          (policy.strictness === "byte" && rec.outcome === "noise-only");
        if (isDivergentHere && storedArtifacts < maxArtifacts) {
          const safeName = routeKey(route).replace(/[^A-Za-z0-9_.-]+/g, "_");
          const dir = path.join(divergenceDir, `${String(storedArtifacts).padStart(3, "0")}-${safeName}`);
          mkdirSync(dir, { recursive: true });
          writeFileSync(path.join(dir, "base.html"), b.body);
          writeFileSync(path.join(dir, "candidate.html"), c.body);
          writeFileSync(path.join(dir, "meta.json"), JSON.stringify(rec, null, 2) + "\n");
          rec.divergenceArtifacts = dir;
          storedArtifacts += 1;
        }
        routeRecords.push(rec);
      }
    }
  } finally {
    // Teardown ALWAYS (never leak servers), even if the fetch loop threw.
    await Promise.all([
      stopChild(baseProc, "BASE render server", teardownLog),
      stopChild(candidateProc, "CANDIDATE render server", teardownLog),
    ]);
  }

  const finishedAt = new Date().toISOString();
  const historyPath = path.join(outDir, "shadow-run-history.jsonl");
  const bothBootsOk = baseBoot.ok && candidateBoot.ok;
  const counts = summarizeCounts(routeRecords, policy.strictness, sample.sampled.length, bothBootsOk);
  const currentClean = bothBootsOk && counts.totalSampled > 0 && counts.divergent === 0;

  const historyEntry = {
    runId,
    finishedAt,
    signature: sample.signature,
    strictness: policy.strictness,
    clean: currentClean,
    counts: {
      totalSampled: counts.totalSampled,
      byteIdentical: counts.byteIdentical,
      noiseOnly: counts.noiseOnly,
      divergent: counts.divergent,
    },
  };
  appendLogEntry(historyPath, historyEntry);
  const history = readHistory(historyPath);
  appendLogEntry(path.join(outDir, "route-sample.jsonl"), {
    runId,
    signature: sample.signature,
    sampled: sample.sampled.map(routeKey),
    excludedByPolicy: sample.excluded.map(routeKey),
  });

  const extraReasons = [];
  if (!baseBoot.ok) extraReasons.push(`BASE engine boot failed: ${baseBoot.error ?? "unknown"}`);
  if (!candidateBoot.ok) extraReasons.push(`CANDIDATE engine boot failed: ${candidateBoot.error ?? "unknown"}`);
  if (!bothBootsOk) extraReasons.push("with an engine down, nothing was compared — a cutover behind a dead engine is never clean");

  const gate = evaluateCutoverGate({
    history,
    requiredRuns: policy.requireConsecutiveCleanRuns,
    divergentCount: counts.divergent,
    reasons: extraReasons,
  });

  const report = buildReport({
    runId,
    startedAt,
    finishedAt,
    base: {
      dir: path.resolve(opts.baseDir),
      rev: gitRev(opts.baseDir),
      instrument: baseInstrument,
      port: urls.basePort,
      bootOk: baseBoot.ok,
    },
    candidate: {
      dir: path.resolve(opts.candidateDir),
      rev: gitRev(opts.candidateDir),
      instrument: candidateInstrument,
      port: urls.candidatePort,
      bootOk: candidateBoot.ok,
    },
    mirror: {
      path: path.resolve(opts.mirrorPath),
      sha256: mirrorSha,
      copies: { base: copyBase, candidate: copyCandidate },
      copySha: { base: copyBaseSha, candidate: copyCandidateSha },
    },
    policy: {
      mode: policy.routing.mode,
      sampleRate: policy.routing.sampleRate,
      strictness: policy.strictness,
      requireConsecutiveCleanRuns: policy.requireConsecutiveCleanRuns,
      signature: sample.signature,
      source: opts.policyPath ? path.resolve(opts.policyPath) : "defaults",
    },
    sample: {
      requested: sample.sampled.length,
      excludedByPolicy: sample.excluded.length,
      routes: sample.sampled.map(routeKey),
    },
    routes: routeRecords,
    counts,
    boots: { base: baseBoot.ok, candidate: candidateBoot.ok },
    gate,
    limitations: [
      "S1 CLOSED in this build: view-lane routes are sampled and compared — the corpus canvas fixture views (open, closed, content, title; the capture label unknown_view_sentinel executes as definitely_not_a_view) render through each checkout's own vm-staging-server.mjs at GET /<name>?view=<view>, the engine's bare view lane (RenderEngine.render), the same surface the corpus replay grades.",
      "View-lane raise fidelity: a view render that raises emits the corpus sentinel shape 'CAPTURE_ERROR: <error class>: <message>' with the ENGINE's own error naming — base-vs-candidate comparison stays exact, but a corpus-recaptured reference for a RAISING view records Ruby's class taxonomy and will not byte-match the engine sentinel (successful views are unaffected).",
      "The comparison covers the read surface of the routes sampled; write surfaces are out of scope by design (the plan's safety posture).",
      "Classification is two-sided only when a --reference is supplied; without one, real divergences classify UNATTRIBUTED and fail the gate (safe default).",
    ],
  });

  writeFileSync(path.join(outDir, "shadow-run.json"), JSON.stringify(report, null, 2) + "\n");
  return { exitCode: EXIT_OK, report, teardownLog, outDir, runId };
}

function errorRecord(route, urlPath, outcome) {
  return {
    route: routeKey(route),
    path: urlPath,
    lane: routeLane(route),
    outcome,
    class: "FETCH-ERROR",
    firstDiff: -1,
    statusBase: null,
    statusCandidate: null,
    bytesBase: null,
    bytesCandidate: null,
    shaBase: null,
    shaCandidate: null,
    cfCarrierBase: null,
    cfCarrierCandidate: null,
  };
}

function summarizeCounts(routeRecords, strictness, requested, bothBootsOk) {
  const classCounts = {
    "ENGINE-GAP": 0,
    "CONTENT-CHANGED": 0,
    UNATTRIBUTED: 0,
    NOISE: 0,
    "FETCH-ERROR": 0,
  };
  let byteIdentical = 0;
  let noiseOnly = 0;
  // The per-lane noise-carrier census: routes whose base OR candidate bytes
  // carry the Cloudflare block, counted per comparison lane. The close-71
  // census measured page lanes carrying it (34/34 live pages) and view
  // lanes never (0/37 live views) — a nonzero view count in a run is the
  // anomaly this number exists to surface.
  const noiseCarriers = { page: 0, view: 0 };
  for (const r of routeRecords) {
    if (r.outcome === "byte-identical") byteIdentical += 1;
    else if (r.outcome === "noise-only") noiseOnly += 1;
    if (r.class !== null) classCounts[r.class] = (classCounts[r.class] ?? 0) + 1;
    if ((r.cfCarrierBase === true || r.cfCarrierCandidate === true) && (r.lane === "page" || r.lane === "view")) {
      noiseCarriers[r.lane] += 1;
    }
  }
  return {
    totalSampled: bothBootsOk ? requested : 0,
    requested,
    byteIdentical,
    noiseOnly,
    divergent: countDivergentAtStrictness(routeRecords, strictness),
    classCounts,
    noiseCarriers,
  };
}

// ===========================================================================
// 8. CLI
// ===========================================================================

export function shadowUsage(exitCode = EXIT_OK) {
  const lines = [
    "Usage: node bin/migration-parity-tool.mjs shadow --base <checkout-dir>",
    "                                                 --candidate <checkout-dir>",
    "                                                 --mirror <deck.sqlite>",
    "                                                 --out <run-dir> [options]",
    "",
    "Runs the CANDIDATE engine in parallel behind a routing policy over a LOCAL",
    "MIRROR deck (zero live-site requests) and reports cutover readiness.",
    "DRY-RUN BY DEFAULT: nothing executes without --execute.",
    "",
    "Required:",
    "  --base <dir>          BASE engine checkout (current engine build)",
    "  --candidate <dir>     CANDIDATE engine checkout (same tree, different commit/config)",
    "  --mirror <file>       Local SQLite deck both engines render (NEVER written;",
    "                        each side gets its own sha256-bound writable copy)",
    "  --out <dir>           Run directory: report, mirror copies, history, divergences",
    "",
    "Options:",
    "  --policy <file>           Routing policy JSON (schema in docs; mode/allowlist/",
    "                            blocklist/sampleRate + targetsFile/comparison/gate/reference)",
    "  --targets <file>          Route sample TSV: name<TAB>view per line. Valid views: page",
    "                            (default; the full page render) and the corpus canvas fixture",
    "                            views open, closed, content, title (rendered at",
    "                            /<name>?view=<view> through each checkout's own staging",
    "                            instrument), plus the capture label unknown_view_sentinel",
    "                            (executes as definitely_not_a_view). Default: the 5 standard",
    "                            probe pages (Home, Aikido, About, Eagle, Taking_Stock)",
    "  --reference <file>        Reference JSONL: {route, sha256, bodyFile} lines — enables",
    "                            two-sided classification (ENGINE-GAP vs CONTENT-CHANGED)",
    "  --strictness <level>      byte | normalized (default normalized — the documented",
    "                            two-region noise normalization; byte counts noise as divergence)",
    "  --gate-runs <n>           Cutover gate: N consecutive clean runs (default 1), scoped",
    "                            to the sample signature",
    "  --base-port <n>           BASE render server port (default 3110, binds 127.0.0.1)",
    "  --candidate-port <n>      CANDIDATE render server port (default 3111, binds 127.0.0.1)",
    "  --boot-timeout-ms <n>     Engine boot health-wait budget (default 60000)",
    "  --max-divergence-artifacts <n>  Divergent bodies kept for triage (default 20)",
    "  --instrument <path>       Render-server override used for BOTH sides (default: each",
    "                            checkout's own vm-staging-server.mjs; override = test seam)",
    "  --execute                 Actually spawn, fetch, compare, and write the report",
    "  --json                    Print the JSON report (with --execute)",
    "  --help, -h                This help",
    "",
    "Examples:",
    "  node bin/migration-parity-tool.mjs shadow --base ../decko-ts --candidate ../decko-ts-cand \\",
    "      --mirror deck.sqlite --out runs/shadow-1                # dry-run plan, nothing runs",
    "  node bin/migration-parity-tool.mjs shadow --base .. --candidate .. --mirror m.sqlite \\",
    "      --out runs/s1 --policy policy.json --execute            # real comparison run",
    "",
  ];
  console.log(lines.join("\n"));
  return exitCode;
}

export function parseShadowArgv(argv) {
  const opts = {
    baseDir: null,
    candidateDir: null,
    mirrorPath: null,
    outDir: null,
    policyPath: null,
    targetsPath: null,
    referencePath: null,
    strictness: null,
    gateRuns: undefined,
    basePort: undefined,
    candidatePort: undefined,
    bootTimeoutMs: undefined,
    maxDivergenceArtifacts: undefined,
    instrument: process.env.PARITY_SHADOW_INSTRUMENT || null,
    execute: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) fail(`flag ${a} needs a value (see --help)`);
      i += 1;
      return v;
    };
    switch (a) {
      case "--base": opts.baseDir = next(); break;
      case "--candidate": opts.candidateDir = next(); break;
      case "--mirror": opts.mirrorPath = next(); break;
      case "--out": opts.outDir = next(); break;
      case "--policy": opts.policyPath = next(); break;
      case "--targets": opts.targetsPath = next(); break;
      case "--reference": opts.referencePath = next(); break;
      case "--strictness": opts.strictness = next(); break;
      case "--gate-runs": opts.gateRuns = Number(next()); break;
      case "--base-port": opts.basePort = Number(next()); break;
      case "--candidate-port": opts.candidatePort = Number(next()); break;
      case "--boot-timeout-ms": opts.bootTimeoutMs = Number(next()); break;
      case "--max-divergence-artifacts": opts.maxDivergenceArtifacts = Number(next()); break;
      case "--instrument": opts.instrument = next(); break;
      case "--execute": opts.execute = true; break;
      case "--json": opts.json = true; break;
      case "--dry-run": opts.execute = false; break;
      default: fail(`unknown shadow argument: ${a} (see --help)`);
    }
  }
  if (opts.strictness !== null && !VALID_STRICTNESS.has(opts.strictness)) {
    fail(`--strictness must be "normalized" or "byte", got ${JSON.stringify(opts.strictness)} (see --help)`);
  }
  return opts;
}

function fail(msg) {
  console.error(`migration-parity-tool shadow: ${msg}`);
  process.exit(EXIT_USAGE);
}

/** Entry point for `migration-parity-tool.mjs shadow ...`. Returns exit code. */
export async function shadowMain(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return shadowUsage(EXIT_OK);
  }
  const opts = parseShadowArgv(argv);
  const result = await runShadow(opts);
  if (result.problems && result.problems.length > 0) {
    console.error("MISSING INPUTS — the shadow stage cannot start because:");
    console.error(result.problems.join("\n"));
    console.error("");
    console.error("Defaults are safe: dry-run, localhost-only, the mirror is never written.");
    return EXIT_USAGE;
  }
  if (result.dryRun) {
    console.log(result.planText);
    console.log("");
    console.log("Dry run complete — nothing was executed. Add --execute to run the comparison.");
    return EXIT_OK;
  }
  for (const line of result.teardownLog ?? []) console.log(line);
  if (opts.json) {
    console.log(JSON.stringify(result.report, null, 2));
  } else {
    console.log(renderReportText(result.report));
    console.log(`Report: ${path.join(result.outDir, "shadow-run.json")}`);
  }
  console.log(`History: ${path.join(result.outDir, "shadow-run-history.jsonl")}`);
  return result.report.verdict.verdict === "clean" ? EXIT_OK : EXIT_USAGE;
}

/** Entry point for `migration-parity-tool.mjs policy --check <file>. */
export function policyCheckMain(argv) {
  const usage = () => {
    console.log(
      [
        "Usage: node bin/migration-parity-tool.mjs policy --check <policy.json> [--sample-path /Name]",
        "",
        "Validates a shadow routing-policy file (the `shadow stage's config schema) and",
        "prints its resolved form. Exit 0 valid; exit 2 invalid with the named reason.",
        "--sample-path additionally prints the sampling decision for one URL path.",
      ].join("\n"),
    );
    return EXIT_OK;
  };
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return usage();
  if (argv[0] !== "--check") {
    console.error(`migration-parity-tool policy: expected --check <file>, got ${JSON.stringify(argv[0])}`);
    return EXIT_USAGE;
  }
  const file = argv[1];
  if (!file) {
    console.error("migration-parity-tool policy: --check needs a policy file path");
    return EXIT_USAGE;
  }
  let policy;
  try {
    policy = loadShadowPolicy(file);
  } catch (err) {
    console.error(`POLICY INVALID — ${err.message}`);
    return EXIT_USAGE;
  }
  const resolved = {
    mode: policy.routing.mode,
    sampleRate: policy.routing.sampleRate,
    strictness: policy.strictness,
    gate: { requireConsecutiveCleanRuns: policy.requireConsecutiveCleanRuns },
    targetsFile: policy.targetsFile,
    reference: policy.reference,
  };
  console.log(JSON.stringify(resolved, null, 2));
  const idx = argv.indexOf("--sample-path");
  if (idx >= 0 && argv[idx + 1] !== undefined) {
    const p = argv[idx + 1];
    const decision = shouldShadow(policy.routing, "GET", p);
    console.log(`sample-path ${JSON.stringify(p)} -> ${decision ? "SHADOW (candidate consulted)" : "SKIP (primary only)"}`);
  }
  return EXIT_OK;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // Direct invocation: node bin/migration-parity-shadow.mjs shadow ... (same
  // surface as going through migration-parity-tool.mjs).
  const argv = process.argv.slice(2);
  if (argv[0] === "shadow") {
    process.exit(await shadowMain(argv.slice(1)));
  } else if (argv[0] === "policy") {
    process.exit(policyCheckMain(argv.slice(1)));
  } else {
    process.exit(shadowUsage(EXIT_OK));
  }
}
