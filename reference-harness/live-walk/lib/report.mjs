// Writes the walk comparison's two reports: report.md (the human-readable
// verdict lines with links into the evidence) and report.json (the machine
// record). The report's first table is the normalization table — EVERY rule
// the instrument defines, with its scope and about-text, whether it was
// enabled this run, how many times each side applied it, and how many raw
// differences it absorbed — followed by the capture redaction (R1) row, the
// named exclusions, and the run's settings. Nothing is normalized away
// silently: a reader can see the whole rule set, the applications, and the
// raw evidence on disk beside every verdict.

import path from "node:path";
import { WALK_RULES } from "./normalize-exchange.mjs";

const rel = (p) => p.replaceAll("\\", "/");

export function journeyVerdict(journey) {
  const byteCounts = journey.bytes?.counts;
  const pixelPairs = journey.pixels ?? [];
  if (!journey.a?.completed || !journey.b?.completed) return "INCOMPLETE";
  const pixelBad = pixelPairs.some((p) => p.verdict === "pixel-delta" || p.verdict === "structural-difference");
  const byteBad = byteCounts && (byteCounts.differs > 0 || byteCounts.onlyOnA > 0 || byteCounts.onlyOnB > 0);
  if (byteBad && pixelBad) return "DIVERGES (bytes + pixels)";
  if (byteBad) return "DIVERGES (bytes)";
  if (pixelBad) return "DIVERGES (pixels)";
  return "MATCH";
}

export function renderReport({ provenance, labelA, labelB, baseA, baseB, journeys, results, rules, options }) {
  const lines = [];
  lines.push(`# Walk comparison — ${labelA} vs ${labelB}`);
  lines.push("");
  lines.push(`- run: ${provenance.startedAt} · run-id \`${provenance.runId}\` · tool: \`reference-harness/live-walk\` · node ${provenance.node}`);
  lines.push(`- ${labelA}: ${baseA}`);
  lines.push(`- ${labelB}: ${baseB}`);
  lines.push(`- journeys: ${results.length}${options.filter ? ` (filter: \`${options.filter}\`)` : ""}`);
  lines.push(`- traffic gate: loopback only unless listed — --allow-live-walk: ${options.allowLiveWalk.length ? options.allowLiveWalk.join(", ") : "(none: this run walked local hosts only)"}`);
  lines.push("");
  lines.push("## Normalization table — nothing is hidden silently");
  lines.push("");
  lines.push("Every rule the instrument defines follows, applied zero times included. Raw evidence is on disk beside every verdict: response bodies under `<side>/<journey>/exchanges/`, redaction applied at capture (R1) before disk.");
  lines.push("");
  lines.push("| rule | kind | scope | enabled | applied A | applied B | absorbed diffs |");
  lines.push("|---|---|---|---|---|---|---|");
  const totalsA = new Map(), totalsB = new Map(), explained = new Map();
  const bump = (map, id, n) => map.set(id, (map.get(id) ?? 0) + n);
  for (const j of results) {
    for (const [id, n] of Object.entries(j.bytes?.appliedA ?? {})) bump(totalsA, id, n.applied ?? 0);
    for (const [id, n] of Object.entries(j.bytes?.appliedB ?? {})) bump(totalsB, id, n.applied ?? 0);
    for (const [id, n] of Object.entries(j.bytes?.appliedA ?? {})) bump(explained, id, n.explained ?? 0);
    for (const [id, n] of Object.entries(j.bytes?.appliedB ?? {})) bump(explained, id, n.explained ?? 0);
  }
  for (const rule of WALK_RULES) {
    const enabled = rule.alwaysOn ? "always (capture)" : rules.find((r) => r.id === rule.id)?.enabled === false ? "NO (--disable)" : "yes";
    lines.push(`| **${rule.id}** ${rule.name} | ${rule.kind} | ${rule.scope} | ${enabled} | ${totalsA.get(rule.id) ?? 0} | ${totalsB.get(rule.id) ?? 0} | ${explained.get(rule.id) ?? 0} |`);
  }
  lines.push("");
  for (const rule of WALK_RULES) lines.push(`- **${rule.id}** — ${rule.about}`);
  lines.push("");
  lines.push("Named exclusions from the byte comparison: third-party exchanges (the CDNs the stock layout links; counted per journey below) and harness machinery paths (`/__harness/*`, `/_mail-log`).");
  lines.push(`Settings: pixel-tolerance ${options.pixelTolerance} (channel max) · structural-fraction ${options.structuralFraction} · disabled rules: ${options.disabled.length ? options.disabled.join(", ") : "(none)"}.`);
  lines.push("");
  lines.push("## Verdicts");
  lines.push("");
  lines.push("| journey | walk A/B | exchanges (match / norm-explained / differ / only-A / only-B) | screenshots | verdict |");
  lines.push("|---|---|---|---|---|");
  for (const j of results) {
    const c = j.bytes?.counts;
    const shots = j.pixels ?? [];
    const shotLine = shots.length === 0 ? "none" : shots.map((s) => ({ "identical": "same", "pixel-delta": "DELTA", "structural-difference": "STRUCTURAL", "one-side-only": "ONE-SIDE" })[s.verdict] ?? s.verdict).join(" ");
    lines.push(`| [${j.id}](#${j.id.toLowerCase()}) | ${j.a?.completed ? "ok" : "FAILED"} / ${j.b?.completed ? "ok" : "FAILED"} | ${c ? `${c.matched} / ${c.normalizationExplained} / ${c.differs} / ${c.onlyOnA} / ${c.onlyOnB}` : "n/a"} (3rd-party A=${j.bytes?.thirdPartyCount?.A ?? "?"} B=${j.bytes?.thirdPartyCount?.B ?? "?"}) | ${shotLine} | **${journeyVerdict(j)}** |`);
  }
  lines.push("");
  for (const j of results) {
    lines.push(`<a id="${j.id.toLowerCase()}"></a>`);
    lines.push(`## ${j.id} — ${journeyVerdict(j)}`);
    lines.push("");
    for (const side of ["a", "b"]) {
      const r = j[side];
      const label = side === "a" ? labelA : labelB;
      if (!r) { lines.push(`- ${label}: no walk`); continue; }
      const failedStep = r.steps.find((s) => s.outcome === "failed");
      lines.push(`- ${label}: ${r.completed ? "completed" : "FAILED"}${failedStep ? ` at step ${failedStep.i} (${failedStep.error})` : ""} · ${r.steps.length} steps · ${r.exchanges.length} exchanges captured · evidence: \`${rel(path.join(side, r.id))}/\``);
    }
    lines.push("");
    lines.push("### Bytes");
    lines.push("");
    for (const p of j.bytes?.pairs ?? []) {
      const name = p.key;
      if (p.verdict === "only-on-A" || p.verdict === "only-on-B") {
        lines.push(`- \`${name}\` — **${p.verdict === "only-on-A" ? labelA : labelB} only** (no pair on the other side)`);
        continue;
      }
      if (p.verdict === "identical") {
        lines.push(`- \`${name}\` — identical (HTTP ${p.a.status})`);
        continue;
      }
      if (p.verdict === "normalization-explained") {
        lines.push(`- \`${name}\` — differences explained by ${p.applied.join(", ")} (HTTP ${p.a.status}/${p.b.status}; raw evidence kept)`);
        continue;
      }
      lines.push(`- \`${name}\` — **DIFFERS** (HTTP ${p.a?.status}/${p.b?.status})${p.bodyDiff ? ` · body: ${p.bodyDiff.kind}, ${p.bodyDiff.differingLines ?? "?"} differing lines of ${p.bodyDiff.linesA}/${p.bodyDiff.linesB}` : ""}${p.fieldDiffs.length ? ` · ${p.fieldDiffs.length} field diffs` : ""}`);
      for (const d of (p.fieldDiffs ?? []).slice(0, 8)) lines.push(`  - \`${d.field}\`: A=${JSON.stringify(d.a)?.slice(0, 200)} B=${JSON.stringify(d.b)?.slice(0, 200)}`);
      for (const h of (p.bodyDiff?.hunks ?? []).slice(0, 6)) {
        lines.push(`  - body around line ${h.atLine}:`);
        for (const l of h.lines.slice(0, 8)) lines.push(`    - ${l.n}: A=${JSON.stringify(l.a)?.slice(0, 160)} B=${JSON.stringify(l.b)?.slice(0, 160)}`);
      }
    }
    if (!j.bytes?.pairs?.length) lines.push("- (no matched exchanges)");
    lines.push("");
    lines.push("### Pixels");
    lines.push("");
    for (const s of j.pixels ?? []) {
      if (s.verdict === "identical") {
        lines.push(`- \`${s.a}\` — identical${s.identicalBytes ? " (byte-identical PNGs)" : ` (${s.dimensions})`}`);
      } else if (s.verdict === "pixel-delta") {
        lines.push(`- \`${s.a}\` vs \`${s.b}\` — **${s.deltaCount} differing pixels** (${(s.deltaFraction * 100).toFixed(2)}%), ${s.regionsTotal} region(s): ${s.regions.map((r) => `(${r.x},${r.y} ${r.w}×${r.h}, ${r.count}px)`).join(" ")} · A: \`${rel(path.join("a", j.id, "shots", s.a))}\` · B: \`${rel(path.join("b", j.id, "shots", s.b))}\`${s.mask ? ` · mask: \`${rel(path.join("pixels", j.id, s.mask))}\`` : ""}`);
      } else if (s.verdict === "structural-difference") {
        lines.push(`- \`${s.a ?? "(none)"}\` vs \`${s.b ?? "(none)"}\` — **structural-difference**: ${s.reason ?? (s.dimensionsB ? `dimensions ${s.dimensions} vs ${s.dimensionsB}` : "see evidence")}`);
      } else {
        lines.push(`- step ${s.step} (${s.name ?? "?"}) — **one-side-only**: only ${s.a ? labelA : labelB} has this screenshot`);
      }
    }
    if (!j.pixels?.length) lines.push("- (no screenshots)");
    lines.push("");
  }
  lines.push(`Evidence root: \`${rel(options.out)}\` — \`a/\` and \`b/\` per side (steps in \`<side>/<journey>.json\`, bodies under \`exchanges/\`, screenshots under \`shots/\`), diff masks under \`pixels/\`, machine record in \`report.json\`.`);
  return lines.join("\n") + "\n";
}

export function buildJsonReport({ provenance, labelA, labelB, baseA, baseB, rules, options, results }) {
  return {
    format: "decko-live-walk-comparison/1",
    provenance,
    labelA, labelB, baseA, baseB,
    options,
    rulesEnabled: Object.fromEntries(rules.map((r) => [r.id, r.enabled])),
    journeys: results.map((j) => ({
      id: j.id,
      verdict: journeyVerdict(j),
      walk: { a: j.a ? { completed: j.a.completed, steps: j.a.steps.length, exchanges: j.a.exchanges.length, error: j.a.error } : null, b: j.b ? { completed: j.b.completed, steps: j.b.steps.length, exchanges: j.b.exchanges.length, error: j.b.error } : null },
      bytes: j.bytes ? { counts: j.bytes.counts, thirdPartyCount: j.bytes.thirdPartyCount, appliedA: j.bytes.appliedA, appliedB: j.bytes.appliedB, pairs: j.bytes.pairs.map((p) => ({ key: p.key, verdict: p.verdict, applied: p.applied ?? [], fieldDiffs: p.fieldDiffs ?? [], bodyDiff: p.bodyDiff ? { ...p.bodyDiff, hunks: p.bodyDiff.hunks?.slice(0, 4) } : null })) } : null,
      pixels: j.pixels ?? [],
    })),
  };
}
