// roundtrip-report.mjs — counts-per-table in vs out for the generalized
// migration tool.
//
// The M4-generate milestone (decko-commons/decko#1282) requires a
// round-trip report so a human reader of the report can see, at a glance,
// how many rows of each table lived in the source and how many landed
// in the target. The mysqldump pipeline only checks count parity
// per-table (verify.mjs runs SELECT COUNT(*) on each target table); this
// module adds the SOURCE side (the importer already counts rows during
// the streaming pass, but the result lives inside importStats.counts
// keyed by the TARGET name, not by the source name).
//
// The new shape distinguishes:
//   - source: the row count in the source SQLite database (per source
//     table, including ones the importer skipped)
//   - target: the row count in the target SQLite database (per target
//     table, after the DDL is applied and the bulk load completes)
//   - delta:  source - target, positive means rows dropped, negative
//     means rows invented (which should never happen in the data-
//     faithful contract; reported as an error in the report when <0)
//   - map:    "core", "settings", or "unknown" (schema-map classify)

import { inventorySource } from "./source-sqlite.mjs";
import { classifySourceTable } from "./schema-map.mjs";

/** Compute the round-trip report from a source DB and an importStats
 *  shape. `targetCounts` is per-table target row counts
 *  ({ tableName: count }) produced by SELECT COUNT(*) on the target.
 *
 *  Returns:
 *    {
 *      generatedAt: string (ISO),
 *      sourcePath: string,
 *      rows: [
 *        {
 *          sourceTable: string|null,
 *          targetTable: string|null,
 *          source: number,
 *          target: number,
 *          delta: number,
 *          map: "core" | "settings" | "unknown" | "not-imported" |
 *               "empty-source"
 *        }, ...
 *      ],
 *      totals: { source: number, target: number },
 *      dropCount: number  (rows in source with no target table),
 *      unknownTables: string[]  (source tables outside the DDL)
 *    }
 */
export function buildRoundtripReport({ sourceDb, sourcePath, targetCounts, targetTableNames }) {
  const inventory = inventorySource(sourceDb);
  const rows = [];
  let totalSource = 0;
  let totalTarget = 0;
  let dropCount = 0;
  const unknownTables = [];
  // first: every source table, classified
  for (const [sourceName, info] of Object.entries(inventory).sort()) {
    const map = classifySourceTable(sourceName, targetTableNames);
    let targetTable = null;
    if (map === "core" || map === "core-positional") targetTable = sourceName;
    const target = targetTable !== null ? (targetCounts[targetTable] ?? 0) : 0;
    const delta = info.rowCount - target;
    totalSource += info.rowCount;
    if (targetTable !== null) totalTarget += target;
    if (map === "unknown") {
      unknownTables.push(sourceName);
      dropCount += info.rowCount;
    }
    rows.push({
      sourceTable: sourceName,
      targetTable,
      source: info.rowCount,
      target,
      delta,
      map,
    });
  }
  // second: target tables with no source counterpart (shouldn't happen
  // for a normal import; reported when present so the human reader
  // sees a target-only row).
  for (const t of targetTableNames) {
    if (inventory[t] !== undefined) continue;
    const target = targetCounts[t] ?? 0;
    rows.push({
      sourceTable: null,
      targetTable: t,
      source: 0,
      target,
      delta: -target,
      map: "not-imported",
    });
    totalTarget += target;
  }
  return {
    generatedAt: new Date().toISOString(),
    sourcePath,
    rows,
    totals: { source: totalSource, target: totalTarget },
    dropCount,
    unknownTables,
  };
}

/** Render the round-trip report as a markdown table. One-line per row;
 *  totals at the bottom. The content rule: source and target COUNTS are
 *  allowed (they're structural, not content); names of source tables
 *  are allowed (they're metadata); values are NEVER rendered. */
export function renderRoundtripMd(report) {
  const lines = [];
  lines.push(`# Round-trip report — ${report.sourcePath}`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`Totals: source ${report.totals.source} rows, target ${report.totals.target} rows.`);
  lines.push(`Dropped (source tables with no target map): ${report.dropCount}.`);
  if (report.unknownTables.length > 0) {
    lines.push(`Unknown source tables: ${report.unknownTables.join(", ")}.`);
  }
  lines.push("");
  lines.push("| source | target | map | source rows | target rows | delta |");
  lines.push("|--------|--------|-----|------------:|------------:|------:|");
  for (const row of report.rows) {
    lines.push(
      `| \`${row.sourceTable ?? "(none)"}\` | \`${row.targetTable ?? "(none)"}\` | ${row.map} | ${row.source} | ${row.target} | ${row.delta} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}