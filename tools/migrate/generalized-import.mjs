// generalized-import.mjs — stream a Ruby decko SQLite source database
// into a decko-ts target SQLite database.
//
// M4-generate milestone (decko-commons/decko#1282): the generalized
// any-Ruby-deck path. The source is a SQLite database file (any decko
// version: the production mysqldump pipeline handles mysqldump format;
// this module handles the SQLite source format the corpus-v2 and the
// future decko 0.20+ deployments use).
//
// Pipeline:
//   1. INVENTORY  source tables (source-sqlite.mjs); classify each
//                  as core / settings / unknown (schema-map.mjs).
//   2. DDL        apply the decko-ts DDL (tables first, indexes at the
//                  end - the bulk-load trick proven in import.mjs).
//   3. STREAM     iterate every source row, translate through the
//                  column map, batch into the target. settings tables
//                  are NOT imported (decko stores settings as cards).
//   4. NAME       for cards rows with NULL name/key columns that have
//                  a junction side, fall back to the Lexicon walk on
//                  the imported target (name-reconstruct.mjs).
//   5. CHECKSUMS  order-independent per-table FNV over the canonical
//                  row serialization (the same shape the verify pass
//                  uses on the target).
//   6. REPORT     assemble importStats + settingsInventory +
//                  per-table warnings so the round-trip report and
//                  the migration report can describe the result.
//
// Memory: rows stream source -> importer one at a time; INSERTs batched
// (default 1000 statements per transaction). Peak memory is O(batch +
// source chunk), the same bound the mysqldump pipeline proves.

import {
  inventorySource,
  openSourceSqlite,
  sourceTableRows,
} from "./source-sqlite.mjs";
import { classifySourceTable, mapRowToTarget } from "./schema-map.mjs";
import { inventorySettings } from "./settings-map.mjs";
import {
  parseTargetSchema,
  Checksum,
  IMPORT_PRAGMAS,
} from "./import.mjs";
import { reconstructCardName } from "./name-reconstruct.mjs";

const DEFAULT_BATCH_SIZE = 1000;

/**
 * Stream a Ruby decko SQLite source into a decko-ts SQLite target.
 *
 * opts:
 *   sourcePath      path to the Ruby decko SQLite database
 *   driver          LocalSqliteToolDriver over the target DB
 *   ddlPath         path to db/schema.sqlite.sql
 *   tables          restrict to which target tables to import (default: all
 *                   core tables the DDL declares)
 *   batchSize       rows per transaction (default 1000)
 *   deriveKey       (name) => key, the simple-card missing-key repair
 *   maxErrors       abort after this many per-row insert failures
 *   append          allow import into a populated target (default false)
 *   onProgress      (bytes, rows) callback
 *   signal          AbortSignal
 *
 * Returns:
 *   {
 *     counts, checksums, warnings, skippedTables, keyRepair, errors,
 *     bytesRead, rowsEmitted, elapsedMs,
 *     sourceInventory, settingsInventory, schemaMappings,
 *   }
 */
export async function importFromSqlite(opts) {
  const {
    sourcePath,
    driver,
    ddlPath,
    tables,
    batchSize = DEFAULT_BATCH_SIZE,
    maxErrors = 0,
    append = false,
  } = opts;
  const started = Date.now();
  const sourceDb = openSourceSqlite(sourcePath);
  try {
    const inv = inventorySource(sourceDb);
    const settingsInventory = inventorySettings(sourceDb, inv);
    const schema = parseTargetSchema(ddlPath);
    const targetTableSet = tables ? new Set(tables) : new Set(Object.keys(schema.tableColumns));
    const sourceColumnsByTable = {};
    for (const [name, info] of Object.entries(inv)) sourceColumnsByTable[name] = info.columns;

    const stats = {
      counts: {},
      checksums: {},
      warnings: [],
      skippedTables: {},
      keyRepair: { derived: 0, nullSimpleKeys: 0, lexResolved: 0, lexUnresolved: 0 },
      errors: [],
      bytesRead: 0,
      rowsEmitted: 0,
      elapsedMs: 0,
      sourceInventory: inv,
      settingsInventory,
      schemaMappings: {},
    };

    for (const pragma of IMPORT_PRAGMAS) await driver.query(pragma, []);
    for (const pragma of schema.pragmas) await driver.query(pragma, []);

    if (!append) {
      const existing = await driver.query(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'cards'",
        [],
      );
      if ((existing.rows[0]?.n ?? 0) > 0) {
        const count = await driver.query("SELECT COUNT(*) AS n FROM cards", []);
        if ((count.rows[0]?.n ?? 0) > 0) {
          throw new Error(
            "target database already contains cards rows; refusing to import over them (pass append:true to override)",
          );
        }
      }
    }
    for (const statement of schema.createTables) await driver.query(statement, []);

    const makeInsert = (table, columns) => {
      const quoted = columns.map((c) => `"${c}"`).join(", ");
      const slots = columns.map(() => "?").join(", ");
      return `INSERT INTO "${table}" (${quoted}) VALUES (${slots})`;
    };

    let batch = [];
    const flush = async () => {
      if (batch.length === 0) return;
      try {
        await driver.batch(batch);
      } catch (err) {
        for (const s of batch) {
          try {
            await driver.query(s.sql, s.params);
          } catch (rowErr) {
            if (stats.errors.length >= maxErrors) {
              rowErr.__failingTable = s.__table;
              throw rowErr;
            }
            stats.errors.push({
              table: s.__table,
              rowId: s.params[s.__idIdx] ?? null,
              message: String(rowErr?.message ?? rowErr).slice(0, 300),
            });
          }
        }
      }
      batch = [];
    };

    // iterate every source table in deterministic name order
    for (const sourceName of Object.keys(inv).sort()) {
      const role = classifySourceTable(sourceName, [...targetTableSet]);
      stats.schemaMappings[sourceName] = role;
      if (role === "settings") {
        // settings tables are inventoried, not imported. They are the
        // corpus-build metadata (corpus-v2 meta) or pre-2014 settings
        // rows that decko-ts stores as cards already.
        continue;
      }
      if (role === "unknown" || !targetTableSet.has(sourceName)) {
        // count the rows we are dropping (so the round-trip report can
        // show the delta); do not import.
        let dropped = 0;
        for await (const _ of sourceTableRows(sourceDb, sourceName)) {
          dropped += 1;
        }
        stats.skippedTables[sourceName] = dropped;
        stats.warnings.push(
          `skipped source table \`${sourceName}\`: not part of decko-ts DDL (${dropped} rows dropped; recorded in roundtripReport)`,
        );
        continue;
      }
      const targetColumns = schema.tableColumns[sourceName];
      if (targetColumns === undefined) {
        // DDL doesn't carry this table (shouldn't happen because we
        // filtered above, but be loud if it does).
        stats.warnings.push(`no target DDL for \`${sourceName}\`; skipping`);
        continue;
      }
      const sourceColumns = inv[sourceName].columns;
      let tableRows = 0;
      for await (const row of sourceTableRows(sourceDb, sourceName)) {
        // row.values is positional in sourceColumns order
        let { columns, values, warnings } = mapRowToTarget(
          sourceName,
          sourceColumns,
          row.values,
          targetColumns,
        );
        for (const w of warnings) {
          if (!stats.warnings.includes(w)) stats.warnings.push(w);
        }
        // cards-specific: name reconstruction + key repair
        if (sourceName === "cards") {
          const idx = {
            name: columns.indexOf("name"),
            key: columns.indexOf("key"),
            leftId: columns.indexOf("left_id"),
            rightId: columns.indexOf("right_id"),
            content: columns.indexOf("db_content"),
          };
          // key repair: simple card with non-null name but null key
          if (idx.key >= 0 && idx.name >= 0) {
            const name = values[idx.name];
            const leftId = idx.leftId >= 0 ? values[idx.leftId] : null;
            if (
              values[idx.key] === null &&
              typeof name === "string" &&
              name !== "" &&
              (leftId === null || leftId === undefined)
            ) {
              if (opts.deriveKey !== undefined) {
                const derived = opts.deriveKey(name);
                if (derived !== undefined) {
                  values[idx.key] = derived;
                  stats.keyRepair.derived += 1;
                } else {
                  stats.keyRepair.nullSimpleKeys += 1;
                }
              } else {
                stats.keyRepair.nullSimpleKeys += 1;
              }
            }
          }
          // name reconstruction for junction cards with NULL name/key
          // (the corpus-v2 shape: every junction card carries its
          // already-composed name in the column, so this is a no-op for
          // corpus-v2; it fires only for sources that omit the column).
          if (idx.name >= 0 && (values[idx.name] === null || values[idx.name] === "")) {
            const leftId = idx.leftId >= 0 ? values[idx.leftId] : null;
            const rightId = idx.rightId >= 0 ? values[idx.rightId] : null;
            if (leftId !== null && leftId !== undefined) {
              const rec = await reconstructCardName({
                sourceName: values[idx.name],
                sourceKey: idx.key >= 0 ? values[idx.key] : null,
                leftId,
                rightId,
                driver,
              });
              if (rec.resolved) {
                if (rec.via === "lexicon") stats.keyRepair.lexResolved += 1;
                values[idx.name] = rec.name;
                if (idx.key >= 0 && rec.key !== null && values[idx.key] === null) {
                  values[idx.key] = rec.key;
                }
              } else {
                stats.keyRepair.lexUnresolved += 1;
              }
            }
          }
        }
        // checksum + insert
        if (stats.checksums[sourceName] === undefined) {
          stats.counts[sourceName] = 0;
          stats.checksums[sourceName] = new Checksum();
        }
        stats.counts[sourceName] += 1;
        stats.checksums[sourceName].addRow(values, columns.indexOf("id"));
        const sql = makeInsert(sourceName, columns);
        batch.push({
          sql,
          params: values,
          __table: sourceName,
          __idIdx: columns.indexOf("id"),
        });
        tableRows += 1;
        if (batch.length >= batchSize) await flush();
      }
      stats.rowsEmitted += tableRows;
      opts.onProgress?.(stats.rowsEmitted, stats.rowsEmitted);
    }
    await flush();
    for (const statement of schema.createIndexes) await driver.query(statement, []);
    await driver.query("PRAGMA synchronous = NORMAL", []);
    await driver.query("PRAGMA wal_checkpoint(TRUNCATE)", []);

    stats.elapsedMs = Date.now() - started;
    if (settingsInventory.warning !== undefined && !stats.warnings.includes(settingsInventory.warning)) {
      stats.warnings.push(settingsInventory.warning);
    }
    // flatten checksums
    const checksumsOut = {};
    for (const [t, cs] of Object.entries(stats.checksums)) {
      checksumsOut[t] = { sum: cs.sum, count: cs.count, minId: cs.minId, maxId: cs.maxId };
    }
    stats.checksums = checksumsOut;
    return stats;
  } finally {
    sourceDb.close();
  }
}