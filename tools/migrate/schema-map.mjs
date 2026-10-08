// schema-map.mjs — source-to-target column mapping for the generalized
// migration tool.
//
// Each Ruby decko table that survives the import maps to the
// decko-ts target table through a COLUMN MAP (a function that, given the
// source column name, returns either the matching target column name or
// undefined to mean "skip"). A column that has no source counterpart
// (e.g. `current_revision_id`, which the corpus schema doesn't carry)
// is filled with NULL by the importer (data-faithful: the DDL says it
// is nullable, and 0 != NULL in decko's revision-id semantics).
//
// The mapping is intentionally permissive: it never throws on a missing
// source column. It returns a list of "warnings" so the importer can
// report what was filled with NULL, what was renamed, and what was
// dropped. This is the Generalized M4 generalization: the same importer
// code now handles the production mysqldump shape (verified on the
// 1.2 GB the reference deck dump) AND the bench corpus-v2 shape (sanitized
// SQLite source, columns renamed and trimmed to fit the sanitization
// constraints — verified during the M4-generalize milestone).
//
// The two operations the importer performs with these maps:
//   * column translation: sourceCol.name -> targetCol.name (or undefined)
//   * value padding: when a target column has no source, insert NULL

/** Well-known table aliases (variants seen across decko gems / forks):
 *  `content` and `db_content` are the same field; `setting` / `meta` /
 *  `settings` are the same idea. The aliases list is open: new variants
 *  discovered in the wild are added here, not in the importer. */
const TABLE_ALIASES = {
  cards: ["cards"],
  card_acts: ["card_acts"],
  card_actions: ["card_actions"],
  card_changes: ["card_changes"],
  card_references: ["card_references"],
  card_revisions: ["card_revisions"],
  card_virtuals: ["card_virtuals"],
  sessions: ["sessions"],
  schema_migrations: ["schema_migrations"],
  ar_internal_metadata: ["ar_internal_metadata"],
  transform_migrations: ["transform_migrations"],
  delayed_jobs: ["delayed_jobs"],
};

/** Source column -> target column (or undefined to drop). The keys here
 *  are the canonical decko target columns for `cards`. Every shape we've
 *  seen maps cleanly, including the corpus-v2 case (`content` ->
 *  `db_content` rename). */
const CARDS_COLUMN_MAP = {
  id: "id",
  name: "name",
  key: "key",
  codename: "codename",
  left_id: "left_id",
  right_id: "right_id",
  current_revision_id: "current_revision_id",
  created_at: "created_at",
  updated_at: "updated_at",
  creator_id: "creator_id",
  updater_id: "updater_id",
  read_rule_class: "read_rule_class",
  read_rule_id: "read_rule_id",
  references_expired: "references_expired",
  trash: "trash",
  type_id: "type_id",
  content: "db_content", // corpus-v2 shape (and some legacy decks)
  db_content: "db_content", // mysqldump shape
  // legacy / derived column variants seen across decko forks
  creator: "creator_id",
  updater: "updater_id",
  read_rule: "read_rule_class",
  rule_id: "read_rule_id",
};

/** card_references is structurally identical across the shapes seen so
 *  far — no column drift. Listed here so a future drift gets caught. */
const CARD_REFERENCES_COLUMN_MAP = {
  id: "id",
  referer_id: "referer_id",
  referee_key: "referee_key",
  referee_id: "referee_id",
  ref_type: "ref_type",
  is_present: "is_present",
};

/** Per-table column maps (extend as new drift is discovered). */
const COLUMN_MAPS = {
  cards: CARDS_COLUMN_MAP,
  card_acts: {
    id: "id",
    card_id: "card_id",
    actor_id: "actor_id",
    acted_at: "acted_at",
    ip_address: "ip_address",
  },
  card_actions: {
    id: "id",
    card_id: "card_id",
    card_act_id: "card_act_id",
    super_action_id: "super_action_id",
    action_type: "action_type",
    draft: "draft",
    comment: "comment",
  },
  card_changes: {
    id: "id",
    card_action_id: "card_action_id",
    field: "field",
    value: "value",
  },
  card_references: CARD_REFERENCES_COLUMN_MAP,
  card_revisions: {
    id: "id",
    created_at: "created_at",
    card_id: "card_id",
    creator_id: "creator_id",
    content: "content",
  },
  card_virtuals: {
    id: "id",
    left_id: "left_id",
    right_id: "right_id",
    content: "content",
    left_key: "left_key",
    updated_at: "updated_at",
  },
  sessions: {
    id: "id",
    session_id: "session_id",
    data: "data",
    updated_at: "updated_at",
  },
  schema_migrations: { version: "version" },
  ar_internal_metadata: {
    key: "key",
    value: "value",
    created_at: "created_at",
    updated_at: "updated_at",
  },
  transform_migrations: { version: "version" },
  delayed_jobs: {
    id: "id",
    priority: "priority",
    attempts: "attempts",
    handler: "handler",
    last_error: "last_error",
    run_at: "run_at",
    locked_at: "locked_at",
    failed_at: "failed_at",
    locked_by: "locked_by",
    queue: "queue",
    created_at: "created_at",
    updated_at: "updated_at",
  },
};

/** Settings-table shape: decko cards-as-settings convention. Source
 *  tables carrying system settings: `meta`, `settings`, `setting`,
 *  `card_settings`. Listed here so the importer knows what to do with
 *  them. None of these map to a decko-ts table (settings are cards;
 *  a `meta` table in the source is information about the corpus build,
 *  not application settings to migrate). */
export const SETTINGS_TABLE_VARIANTS = ["meta", "settings", "setting", "card_settings"];

/** Decide, given a source table name, what role it plays:
 *   - "core"      -> import via the per-table column map
 *   - "settings"  -> inventory, do NOT import (settings are cards in decko)
 *   - "unknown"   -> drop with a count (standard importer skip)
 */
export function classifySourceTable(sourceTable, targetTableNames) {
  if (targetTableNames.includes(sourceTable)) {
    // check if a per-table map covers it
    if (COLUMN_MAPS[sourceTable] !== undefined) return "core";
    // unknown core-table-like: still try to import positionally
    return "core-positional";
  }
  if (SETTINGS_TABLE_VARIANTS.includes(sourceTable)) return "settings";
  return "unknown";
}

/** Apply a source-side table to the target schema's column list:
 *  returns { columns, values, warnings } where columns/values are
 *  positional in the target DDL order. `null` values are inserted for
 *  any target column that has no source counterpart. */
export function mapRowToTarget(sourceTable, sourceColumns, sourceValues, targetColumns) {
  const colMap = COLUMN_MAPS[sourceTable];
  const warnings = [];
  // if a per-table map exists, use it; else positional fallback
  if (colMap === undefined) {
    const cols = targetColumns.slice(0, sourceValues.length);
    const vals = sourceValues.slice(0, targetColumns.length);
    const padded = vals.concat(
      new Array(targetColumns.length - vals.length).fill(null),
    );
    return { columns: cols, values: padded, warnings };
  }
  // build a { sourceCol -> sourceValue } lookup
  const srcByName = {};
  for (let i = 0; i < sourceColumns.length; i++) srcByName[sourceColumns[i]] = sourceValues[i];
  const outColumns = [];
  const outValues = [];
  const seen = new Set();
  for (const targetCol of targetColumns) {
    // is there a source column that maps to this target?
    let matched = null;
    for (const [srcName, tgtName] of Object.entries(colMap)) {
      if (tgtName === targetCol && srcByName[srcName] !== undefined && !seen.has(srcName)) {
        matched = srcName;
        break;
      }
    }
    if (matched !== null) {
      seen.add(matched);
      outColumns.push(targetCol);
      outValues.push(srcByName[matched]);
    } else {
      outColumns.push(targetCol);
      outValues.push(null);
    }
  }
  // count source columns that did not match any target column (dropped)
  const droppedSource = [];
  for (const srcName of sourceColumns) {
    if (!seen.has(srcName) && colMap[srcName] === undefined) {
      droppedSource.push(srcName);
    } else if (!seen.has(srcName) && colMap[srcName] !== undefined) {
      // colMap has it but no target column wanted it -> dropped
      droppedSource.push(srcName);
    }
  }
  if (droppedSource.length > 0) {
    warnings.push(
      `\`${sourceTable}\`: source columns dropped (no target column): ${droppedSource.join(", ")}`,
    );
  }
  // count target columns that were filled with NULL (no source column)
  const filledNull = [];
  for (let i = 0; i < outValues.length; i++) {
    if (outValues[i] === null) {
      const name = outColumns[i];
      if (srcByName[name] === undefined && srcByName[colMapInverse(colMap, name)] === undefined) {
        filledNull.push(name);
      }
    }
  }
  if (filledNull.length > 0) {
    warnings.push(
      `\`${sourceTable}\`: target columns filled with NULL (no source column): ${filledNull.join(", ")}`,
    );
  }
  return { columns: outColumns, values: outValues, warnings };
}

/** Reverse lookup: given a column map and a target column name, return
 *  the source column name that would supply it (first match wins). */
function colMapInverse(colMap, targetCol) {
  for (const [srcName, tgtName] of Object.entries(colMap)) {
    if (tgtName === targetCol) return srcName;
  }
  return undefined;
}

/** Identify the column map for a target table name (used by the
 *  importer to know what source column names are understood). */
export function getColumnMap(targetTable) {
  return COLUMN_MAPS[targetTable];
}

/** What source table name corresponds to a target table name (today:
 *  identity for the 12 core tables). */
export function targetToSourceTableName(targetTable) {
  return TABLE_ALIASES[targetTable]?.[0] ?? targetTable;
}