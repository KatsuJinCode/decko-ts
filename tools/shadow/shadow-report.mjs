// shadow-report.mjs — aggregate a shadow log (JSONL) into a human-readable
// summary: total volume, same/diff percentages, diff clusters by URL-path
// pattern, and the worst-offending individual paths.
//
// Mechanism:
//   1. Stream-read the log file; parse one JSONL record per line.
//   2. Bucket by path pattern: /cards/<id> | /cards/<name> | /<segment>
//      (anything that looks like a card id or slug collapses into the
//      same bucket so a single broken card doesn't dominate the report).
//   3. For each pattern, track total / same / diff / skipped / ts-error
//      counts and per-path detail.
//   4. Sort worst-offenders by (diffRate desc, total desc) — the paths
//      that differ most often, breaking ties by traffic volume.
//   5. Emit a small text summary by default, or JSON with --json.
//
// CLI:
//   node tools/shadow/shadow-report.mjs tools/shadow/shadow.log.jsonl
//   node tools/shadow/shadow-report.mjs shadow.log.jsonl --json

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ===========================================================================
// Aggregation
// ===========================================================================

/** Aggregate a JSONL text blob into a summary object. Pure: no I/O beyond
 *  what the caller passes in. The optional `now` arg is for deterministic
 *  test runs (unused here but reserved for date-window filters). */
export function aggregateLog(jsonlText) {
  const lines = jsonlText.split("\n").filter((l) => l.length > 0);
  const summary = {
    total: 0,
    same: 0,
    diff: 0,
    skipped: 0,
    errors: 0,
    samePct: 0,
    patterns: [],
    worstOffenders: [],
    diffOffsetHistogram: [],
  };
  if (lines.length === 0) return summary;

  // pattern -> { total, same, diff, skipped, errors, paths: Map<path, {total, same, diff, firstDiffs:[]}> }
  const byPattern = new Map();
  // Collect first-diff offsets for the histogram.
  const diffOffsets = [];

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      summary.errors += 1; // malformed lines count as errors
      continue;
    }
    summary.total += 1;
    const verdict = entry.verdict;
    if (verdict === "same") summary.same += 1;
    else if (verdict === "diff") summary.diff += 1;
    else if (verdict === "ts-error" || verdict === "ruby-error") summary.errors += 1;
    else summary.skipped += 1; // includes "skipped" and unknown future verdicts

    const pattern = classifyPath(String(entry.path ?? ""));
    let pb = byPattern.get(pattern);
    if (!pb) {
      pb = {
        pattern,
        total: 0,
        same: 0,
        diff: 0,
        skipped: 0,
        errors: 0,
        paths: new Map(),
      };
      byPattern.set(pattern, pb);
    }
    pb.total += 1;
    if (verdict === "same") pb.same += 1;
    else if (verdict === "diff") pb.diff += 1;
    else if (verdict === "ts-error" || verdict === "ruby-error") pb.errors += 1;
    else pb.skipped += 1;

    const rawPath = String(entry.path ?? "");
    let pathEntry = pb.paths.get(rawPath);
    if (!pathEntry) {
      pathEntry = { path: rawPath, total: 0, same: 0, diff: 0, firstDiffs: [] };
      pb.paths.set(rawPath, pathEntry);
    }
    pathEntry.total += 1;
    if (verdict === "same") pathEntry.same += 1;
    else if (verdict === "diff") pathEntry.diff += 1;
    if (verdict === "diff" && Number.isFinite(entry.firstDiffOffset)) {
      pathEntry.firstDiffs.push(entry.firstDiffOffset);
    }
    if (verdict === "diff" && Number.isFinite(entry.firstDiffOffset)) {
      diffOffsets.push(entry.firstDiffOffset);
    }
  }

  summary.samePct =
    summary.total > 0
      ? Math.round((summary.same / summary.total) * 1000) / 10
      : 0;

  summary.patterns = [...byPattern.values()]
    .map((pb) => ({
      pattern: pb.pattern,
      total: pb.total,
      same: pb.same,
      diff: pb.diff,
      skipped: pb.skipped,
      errors: pb.errors,
      samePct:
        pb.total > 0 ? Math.round((pb.same / pb.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.diff - a.diff || b.total - a.total);

  summary.worstOffenders = [...byPattern.values()]
    .flatMap((pb) =>
      [...pb.paths.values()]
        .filter((pe) => pe.diff > 0)
        .map((pe) => ({
          pattern: pb.pattern,
          path: pe.path,
          total: pe.total,
          same: pe.same,
          diff: pe.diff,
          diffRate:
            pe.total > 0 ? Math.round((pe.diff / pe.total) * 1000) / 10 : 0,
          firstDiffOffsets: pe.firstDiffs.slice(0, 5),
        })),
    )
    .sort(
      (a, b) =>
        b.diffRate - a.diffRate ||
        b.diff - a.diff ||
        b.total - a.total,
    )
    .slice(0, 25);

  summary.diffOffsetHistogram = histogram(diffOffsets, [
    0, 1, 10, 100, 1000, 10000, Infinity,
  ]);

  return summary;
}

/** Classify a URL path into a pattern. The query string is dropped first.
 *  Heuristics:
 *    /                       -> "/"
 *    /<segment>              -> "/<segment>"
 *    /<head>/<numeric>       -> "/<head>/<id>"
 *    /<head>/<slug-or-name>  -> "/<head>/<name>"
 *    /<head>/<other>         -> "/<head>/<segment>"
 *  This is intentionally simple: the report's purpose is to surface
 *  patterns, not to perfectly model Decko's URL grammar. */
export function classifyPath(path) {
  const url = path.split("?")[0] || "/";
  const parts = url.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  const head = parts[0];
  if (parts.length === 1) return `/${head}`;
  const second = parts[1];
  if (/^\d+$/.test(second)) return `/${head}/<id>`;
  if (
    second.includes("+") ||
    second.includes(".") ||
    /^[a-z0-9]+-[a-z0-9]+/.test(second)
  ) {
    return `/${head}/<name>`;
  }
  return `/${head}/<segment>`;
}

function histogram(values, bins) {
  // bins[i] inclusive, bins[i+1] exclusive, last is Infinity.
  const counts = new Array(bins.length - 1).fill(0);
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    for (let i = 0; i < bins.length - 1; i++) {
      if (v >= bins[i] && v < bins[i + 1]) {
        counts[i] += 1;
        break;
      }
    }
  }
  return bins.slice(0, -1).map((lo, i) => ({
    rangeStart: lo,
    rangeEnd: bins[i + 1] === Infinity ? "inf" : bins[i + 1],
    count: counts[i],
  }));
}

// ===========================================================================
// Rendering
// ===========================================================================

function renderText(summary, source) {
  const lines = [];
  lines.push(`Shadow log summary: ${source}`);
  lines.push(
    `Total: ${summary.total}   same: ${summary.samePct}%   ` +
      `diff: ${summary.diff}   skipped: ${summary.skipped}   ` +
      `errors: ${summary.errors}`,
  );
  lines.push("");
  lines.push("By path pattern:");
  for (const p of summary.patterns) {
    const line =
      `  ${p.pattern.padEnd(28)} total=${String(p.total).padStart(5)} ` +
      `same=${String(p.samePct + "%").padStart(7)} ` +
      `diff=${String(p.diff).padStart(4)} err=${String(p.errors).padStart(3)}`;
    lines.push(line);
  }
  lines.push("");
  lines.push("Worst offenders:");
  if (summary.worstOffenders.length === 0) {
    lines.push("  (none — every request matched the shadow)");
  } else {
    for (const w of summary.worstOffenders.slice(0, 15)) {
      lines.push(
        `  ${w.pattern.padEnd(28)} ${w.path.padEnd(48)} ` +
          `diff=${w.diff}/${w.total} (${w.diffRate}%)`,
      );
    }
  }
  lines.push("");
  lines.push("First-diff offset histogram (bytes into body):");
  for (const b of summary.diffOffsetHistogram) {
    lines.push(
      `  [${String(b.rangeStart).padStart(6)} .. ${String(b.rangeEnd).padStart(6)}): ${b.count}`,
    );
  }
  return lines.join("\n") + "\n";
}

// ===========================================================================
// CLI
// ===========================================================================

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    process.stderr.write(
      "usage: node shadow-report.mjs <log.jsonl> [--json]\n",
    );
    process.exit(2);
  }
  const logPath = args[0];
  const wantJson = args.includes("--json");
  const text = readFileSync(logPath, "utf8");
  const summary = aggregateLog(text);
  if (wantJson) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    process.stdout.write(renderText(summary, logPath));
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
