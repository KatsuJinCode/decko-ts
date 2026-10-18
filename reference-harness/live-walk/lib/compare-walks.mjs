// Compares the two sides' walk records for one journey (see
// ../walk-and-compare.mjs). Three verdicts per journey, per the instrument:
//
//   bytes  every matched exchange identical, or every difference explained by
//          a NAMED normalization (the rule that explained it is listed, with
//          the count, in the report's normalization table); unmatched
//          exchanges are findings, never normalized away
//   pixels per screenshot pair: identical / pixel-delta (count + bounding
//          regions) / structural-difference
//   walk   completion on both sides
//
// Matching: same-origin exchanges only (third-party exchanges are counted and
// listed as a number in the report — they are the CDN's bytes, not the
// hosts'), harness machinery paths (/__harness/*, /_mail-log) excluded by the
// named exclusion, then matched by method + normalized URL (W7 masks volatile
// token params, so two walks' one-time links pair up), duplicates in order.

import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { newApplied, normalizeExchange, normalizeUrl } from "./normalize-exchange.mjs";
import { diffScreenshots } from "./pixel-diff.mjs";
import { HARNESS_PATH_PREFIXES } from "./walker.mjs";

const stableStringify = (value) => JSON.stringify(value, (_k, v) => (v === undefined ? null : v));

export function exchangeKey(exchange, rules, ledger) {
  return `${exchange.method} ${normalizeUrl(exchange.url, { on: (id) => rules.find((r) => r.id === id)?.enabled !== false, note: (id) => ledger?.note(id) })}`;
}

const isHarnessPath = (url) => {
  try {
    const p = new URL(url).pathname;
    return HARNESS_PATH_PREFIXES.some((prefix) => p.startsWith(prefix));
  } catch {
    return false;
  }
};

/** Line-level first-difference summary for two text bodies: differing line
 *  count and the first hunks (context 2), capped. */
export function textDiffSummary(aText, bText, { maxHunks = 12, context = 2, maxLine = 240 } = {}) {
  const a = String(aText ?? "").split("\n");
  const b = String(bText ?? "").split("\n");
  const n = Math.max(a.length, b.length);
  const diffLines = [];
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) diffLines.push(i);
  }
  const hunks = [];
  let i = 0;
  while (i < diffLines.length && hunks.length < maxHunks) {
    let end = i;
    while (end + 1 < diffLines.length && diffLines[end + 1] - diffLines[end] <= context * 2) end++;
    const start = Math.max(0, diffLines[i] - context), stop = Math.min(n - 1, diffLines[end] + context);
    hunks.push({
      atLine: diffLines[i] + 1,
      lines: Array.from({ length: stop - start + 1 }, (_, k) => {
        const idx = start + k;
        return { n: idx + 1, a: a[idx]?.slice(0, maxLine) ?? null, b: b[idx]?.slice(0, maxLine) ?? null };
      }),
    });
    i = end + 1;
  }
  return { differingLines: diffLines.length, linesA: a.length, linesB: b.length, hunks, hunksTruncated: diffLines.length > 0 && i < diffLines.length };
}

/** Compares one matched exchange pair under the enabled rules. Returns the
 *  pair's verdict and the normalized forms (for the diff evidence file).
 *  `originA`/`originB` are each side's own base origin for W8. */
export function diffExchangePair(a, b, { rules, sessionCookieNames, originA, originB }) {
  const ledgerA = newApplied(), ledgerB = newApplied();
  const na = normalizeExchange(a, { rules, ledger: ledgerA, sessionCookieNames, ownOrigin: originA });
  const nb = normalizeExchange(b, { rules, ledger: ledgerB, sessionCookieNames, ownOrigin: originB });
  const fieldDiffs = [];
  if (na.status !== nb.status) fieldDiffs.push({ field: "status", a: na.status, b: nb.status });
  // Request headers after R1: exact.
  const reqNames = [...new Set([...Object.keys(na.requestHeaders), ...Object.keys(nb.requestHeaders)])].sort();
  for (const name of reqNames) {
    if (stableStringify(na.requestHeaders[name]) !== stableStringify(nb.requestHeaders[name])) {
      fieldDiffs.push({ field: `request-header ${name}`, a: na.requestHeaders[name], b: nb.requestHeaders[name] });
    }
  }
  // Response headers: a name only one side sends is a finding (never hidden);
  // shared names compare per value.
  const names = [...new Set([...Object.keys(na.headers), ...Object.keys(nb.headers)])].sort();
  for (const name of names) {
    const va = na.headers[name], vb = nb.headers[name];
    if (va === undefined || vb === undefined) {
      fieldDiffs.push({ field: `header ${name}`, a: va ?? "(absent)", b: vb ?? "(absent)" });
      continue;
    }
    if (va.length !== vb.length) {
      fieldDiffs.push({ field: `header ${name} (count)`, a: va, b: vb });
      continue;
    }
    for (let i = 0; i < va.length; i++) {
      if (va[i] !== vb[i]) {
        // Which rule, if any, absorbs this value difference? Re-run the same
        // rule set on both raw values is not how the mask works (context
        // matters), so the explanation is taken from the ledgers: a rule that
        // applied AND the normalized values equal while raw ones differ.
        fieldDiffs.push({ field: `header ${name}[${i}]`, a: va[i], b: vb[i], rawDiffer: true });
      }
    }
  }
  // Body.
  let bodyDiff = null;
  if (na.bodyKind === "binary" || nb.bodyKind === "binary") {
    if (na.contentSha256 !== nb.contentSha256) {
      bodyDiff = { kind: "binary", a: { sha256: na.contentSha256 }, b: { sha256: nb.contentSha256 } };
    }
  } else if ((na.bodyText ?? null) !== (nb.bodyText ?? null)) {
    const summary = textDiffSummary(na.bodyText, nb.bodyText);
    bodyDiff = { kind: na.bodyKind, differingLines: summary.differingLines, linesA: summary.linesA, linesB: summary.linesB, hunks: summary.hunks, hunksTruncated: summary.hunksTruncated };
  }
  if (na.bodyKind !== nb.bodyKind) fieldDiffs.push({ field: "bodyKind", a: na.bodyKind, b: nb.bodyKind });
  // Raw equality: were the two exchanges byte-equal before any rule ran?
  const rawEqual = a.status === b.status && stableStringify(collectRawHeaders(a)) === stableStringify(collectRawHeaders(b)) && bodiesRawEqual(a, b);
  const normalizedEqual = fieldDiffs.length === 0 && bodyDiff === null;
  // Which rules could have explained raw differences? Every rule that applied
  // on either side during this pair's normalization. When the pair was raw-
  // differing but normalized-equal, those applications are exactly what
  // absorbed the difference — credited per rule in the report's table.
  const applied = [...new Set([...ledgerA.appliedRuleIds(), ...ledgerB.appliedRuleIds()])];
  if (!rawEqual && normalizedEqual) {
    for (const id of applied) {
      ledgerA.explain(id);
      ledgerB.explain(id);
    }
  }
  return {
    verdict: rawEqual ? "identical" : normalizedEqual ? "normalization-explained" : "differs",
    applied,
    appliedA: ledgerA.snapshot(),
    appliedB: ledgerB.snapshot(),
    fieldDiffs,
    bodyDiff,
    normalizedA: na,
    normalizedB: nb,
  };
}

function collectRawHeaders(exchange) {
  const out = {};
  if (Array.isArray(exchange.headersArray)) for (const { name, value } of exchange.headersArray) (out[name.toLowerCase()] ??= []).push(value);
  if (Array.isArray(exchange.setCookieRaw)) out["set-cookie"] = exchange.setCookieRaw;
  return out;
}

function bodiesRawEqual(a, b) {
  if (a.bodySha256 && b.bodySha256) return a.bodySha256 === b.bodySha256;
  if (a.bodyText != null && b.bodyText != null) return a.bodyText === b.bodyText;
  return a.bodyError != null && b.bodyError != null; // both failed to read: no body evidence either side
}

/** Matches the two sides' exchanges and diffs every pair. `rules` is used
 *  for URL keys (W7); per-pair ledgers account applications. Same-origin
 *  exchanges only, unless the run said --include-third-party (its stated
 *  choice, printed in the report); harness paths never compare.
 *  `originA`/`originB` (each side's base origin) feed W8; when absent, each
 *  exchange's own origin is used. */
export function compareExchanges(exA, exB, options) {
  const { rules, includeThirdParty = false } = options;
  const originOf = (ex) => { try { return new URL(ex.url).origin; } catch { return null; } };
  const consider = (ex) => (includeThirdParty || (ex.sameOrigin && !ex.thirdParty)) && !isHarnessPath(ex.url);
  const listA = exA.filter(consider);
  const listB = exB.filter(consider);
  const thirdA = exA.filter((e) => e.thirdParty).length;
  const thirdB = exB.filter((e) => e.thirdParty).length;
  const keyLedger = newApplied();
  const keyOf = (ex) => exchangeKey(ex, rules, keyLedger);
  const groupsA = new Map(), groupsB = new Map();
  for (const ex of listA) (groupsA.get(keyOf(ex)) ?? groupsA.set(keyOf(ex), []).get(keyOf(ex))).push(ex);
  for (const ex of listB) (groupsB.get(keyOf(ex)) ?? groupsB.set(keyOf(ex), []).get(keyOf(ex))).push(ex);
  const pairs = [];
  const matchedA = new Set(), matchedB = new Set();
  for (const [key, group] of groupsA) {
    const other = groupsB.get(key) ?? [];
    const n = Math.max(group.length, other.length);
    for (let i = 0; i < n; i++) {
      if (group[i] && other[i]) {
        matchedA.add(group[i].seq); matchedB.add(other[i].seq);
        pairs.push({ key, a: group[i], b: other[i], ...diffExchangePair(group[i], other[i], { ...options, originA: options.originA ?? originOf(group[i]), originB: options.originB ?? originOf(other[i]) }) });
      } else if (group[i]) {
        pairs.push({ key, a: group[i], b: null, verdict: "only-on-A" });
      } else {
        pairs.push({ key, a: null, b: other[i], verdict: "only-on-B" });
      }
    }
  }
  for (const [key, group] of groupsB) {
    for (const ex of group) {
      if (!matchedB.has(ex.seq)) pairs.push({ key, a: null, b: ex, verdict: "only-on-B" });
    }
  }
  pairs.sort((x, y) => (x.a?.seq ?? x.b?.seq ?? 0) - (y.a?.seq ?? y.b?.seq ?? 0));
  return {
    pairs,
    thirdPartyCount: { A: thirdA, B: thirdB },
    counts: {
      consideredA: listA.length, consideredB: listB.length,
      matched: pairs.filter((p) => p.a && p.b).length,
      onlyOnA: pairs.filter((p) => p.verdict === "only-on-A").length,
      onlyOnB: pairs.filter((p) => p.verdict === "only-on-B").length,
      identical: pairs.filter((p) => p.verdict === "identical").length,
      normalizationExplained: pairs.filter((p) => p.verdict === "normalization-explained").length,
      differs: pairs.filter((p) => p.verdict === "differs").length,
    },
  };
}

/** Pairs screenshots by step order and diffs each pair. Returns per-shot
 *  verdicts and writes mask images under <outDir>/pixels/<journeyId>/. */
export function compareShots(shotsA, shotsB, dirA, dirB, outDir, journeyId, { pixelTolerance, structuralFraction }) {
  const pairs = [];
  const n = Math.max(shotsA.length, shotsB.length);
  for (let i = 0; i < n; i++) {
    const a = shotsA[i], b = shotsB[i];
    if (!a || !b) {
      pairs.push({ step: i, name: a?.name ?? b?.name, verdict: "one-side-only", a: a?.file ?? null, b: b?.file ?? null });
      continue;
    }
    let pngA, pngB;
    try {
      pngA = readFileSync(path.join(dirA, a.file));
      pngB = readFileSync(path.join(dirB, b.file));
    } catch (err) {
      pairs.push({ step: i, name: a.name, verdict: "structural-difference", reason: `unreadable: ${err.message}`, a: a.file, b: b.file });
      continue;
    }
    const diff = diffScreenshots(pngA, pngB, { pixelTolerance, structuralFraction });
    const maskFile = diff.maskPng ? `${String(i + 1).padStart(2, "0")}-${a.file.replace(/\.png$/, "")}.diff.png` : null;
    if (diff.maskPng && maskFile) {
      mkdirSync(path.join(outDir, "pixels", journeyId), { recursive: true });
      writeFileSync(path.join(outDir, "pixels", journeyId, maskFile), diff.maskPng);
    }
    pairs.push({
      step: i,
      name: a.name,
      verdict: diff.verdict,
      reason: diff.reason ?? null,
      dimensions: diff.width ? `${diff.width}x${diff.height}` : null,
      dimensionsB: diff.widthB ? `${diff.widthB}x${diff.heightB}` : null,
      deltaCount: diff.deltaCount,
      deltaFraction: diff.deltaFraction,
      regions: diff.regions.slice(0, 12),
      regionsTotal: diff.regions.length,
      identicalBytes: diff.identicalBytes,
      a: a.file, b: b.file, mask: maskFile,
      aUrl: a.url, bUrl: b.url,
    });
  }
  return pairs;
}
