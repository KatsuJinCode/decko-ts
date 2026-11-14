// name-reconstruct.mjs — reconstruct card name/key when the source row
// is a junction card with NULL name/key columns.
//
// The 2020 Lexicon convention: compound cards (left_id NOT NULL) store
// NULL in their name/key columns and let the fetch layer's Lexicon walk
// (src/card/fetch/lexicon.ts) compose the name from left_id/right_id at
// read time. The mysqldump pipeline preserves that convention by leaving
// the columns NULL (data-faithful: that's what production rows look like).
//
// The generalized SQLite-source path faces a related but distinct case:
// the SOURCE may not carry the name/key columns at all (a slimmed
// schema, or a sanitized source dump), or it may carry them but NULL for
// junction cards. The fetch layer's Lexicon walk still reconstructs the
// name at read time IF left_id/right_id are present. When they are
// absent too, the importer needs to INVENT the composed string from the
// imported cards table (the side already has the row).
//
// Three fallbacks, applied in order, each producing a string-or-NULL:
//
//   1. IN-COLUMN: source row's name/key columns are present and non-NULL.
//      Pass them through unchanged.)
//
//   2. LEXICON-WALK: source row's left_id/right_id are present. Recursively
//      walk the SAME imported target DB (NOT the source: the source may
//      be missing these rows). The walk is depth-capped (cycles must
//      surface as unresolved, not a hang). When both sides resolve to a
//      composed string, the result IS the name/key.
//
//   3. SETTINGS-IGNORE: settings-shaped rows (build-time metadata) never
//      produce a name; the importer skips them entirely (handled in
//      schema-map, not here).
//
// This module exposes the walk as a function the importer can call on
// each NULL-name junction row. It is invoked from generalized-import.mjs.

/** The fallback ladder result for one junction row: { name, key, via,
 *  resolved }. `via` records WHICH fallback produced the result (one of
 *  "in-column", "lexicon", "unresolved"). */
export async function reconstructCardName({
  sourceName,
  sourceKey,
  leftId,
  rightId,
  driver,
  maxDepth = 64,
}) {
  // Fallback 1: in-column values already present.
  if (typeof sourceName === "string" && sourceName.length > 0) {
    let key = sourceKey;
    if ((key === null || key === undefined) && typeof sourceName === "string") {
      // caller may supply a key deriver separately; this module only
      // reports what the rows already carry.
      key = null;
    }
    return { name: sourceName, key, via: "in-column", resolved: true };
  }

  // Fallback 2: junction walk on the imported target. The row being
  // imported may not exist there yet, so the walk starts from the two
  // junction sides rather than from a target row id.
  if (leftId !== null && leftId !== undefined) {
    const walked = await walkBySides(driver, leftId, rightId, 0, maxDepth);
    if (walked.resolved) {
      return { name: walked.name, key: null, via: "lexicon", resolved: true };
    }
  }

  return { name: null, key: null, via: "unresolved", resolved: false };
}

/** Recursive junction walk that takes sides (not a target row id).
 *  Depth-capped like the id-rooted walk in verify.mjs: a cycle surfaces
 *  as unresolved, never a hang. */
async function walkBySides(driver, leftId, rightId, depth, maxDepth) {
  if (depth > maxDepth) return { name: null, resolved: false, depth };
  const left = await fetchSimpleName(driver, leftId, depth + 1, maxDepth);
  if (left === null) return { name: null, resolved: false, depth };
  const right =
    rightId === null || rightId === undefined
      ? ""
      : (await fetchSimpleName(driver, rightId, depth + 1, maxDepth)) ?? "";
  return { name: `${left}+${right}`, resolved: true, depth };
}

/** Fetch the simple-name of one card (recursively if it's a junction).
 *  Reads the IMPORTED TARGET (the source might be missing rows). */
async function fetchSimpleName(driver, id, depth, maxDepth) {
  if (depth > maxDepth) return null;
  const r = await driver.query(
    "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1",
    [id],
  );
  const row = r.rows[0];
  if (row === undefined) return null;
  if (typeof row.name === "string" && row.name !== "") return row.name;
  if (row.left_id === null || row.left_id === undefined) return null;
  return (await walkBySides(driver, row.left_id, row.right_id, depth + 1, maxDepth)).name;
}

/** Count rows in the source where the name/key columns are NULL while
 *  left_id/right_id imply a junction. Used by the importer to surface
 *  the rows the reconstructor will need to resolve (and the rows it
 *  cannot). */
export async function countNullNameJunctions(driver, table = "cards") {
  const r = await driver.query(
    `SELECT COUNT(*) AS n FROM "${table}"
     WHERE left_id IS NOT NULL AND (name IS NULL OR name = '')`,
    [],
  );
  return Number(r.rows[0]?.n ?? 0);
}