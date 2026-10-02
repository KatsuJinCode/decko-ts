// The boot-time rule-card warm shared by the mods' prepareEngine boots -
// lib/card/rule/cache.rb:10-27's rule-cache join narrowed to setting
// codename(s), plus the multi-pass junction composition that gives the
// fetched side records their composed names (the prefetch's reached-CTE +
// composeAndCache shape). After warmRuleCards resolves, the mods'
// rule-card helpers read the prepared map synchronously - zero queries on
// the render path.

import { DeckoName } from "../../name.js";
import type { ModEngineHost } from "../mod-manifest.js";

/** The rule-card ids PLUS every transitive side id needed to compose their
 *  junction names: the rule-cache join (lib/card/rule/cache.rb:10-27)
 *  narrowed to the given setting codename(s), with the recursive side walk
 *  of the prefetch's reached-CTE shape. One codename emits
 *  `settings.codename = 'x'`; several emit an IN-list. */
export function ruleSidesStatement(
  setTypeId: number,
  settingTypeId: number,
  codenames: readonly [string] | readonly [string, string],
): { sql: string; params: unknown[] } {
  const predicate =
    codenames.length === 1
      ? `settings.codename = '${codenames[0]}'`
      : `settings.codename IN (${codenames.map((c) => `'${c}'`).join(", ")})`;
  const ruleJoin =
    "FROM cards rules\n" +
    "  JOIN cards sets ON rules.left_id = sets.id\n" +
    "  JOIN cards settings ON rules.right_id = settings.id\n" +
    `WHERE sets.type_id = ? AND settings.type_id = ? AND ${predicate}\n` +
    "  AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0";
  return {
    sql:
      "WITH RECURSIVE reached(id) AS (\n" +
      `  SELECT rules.id ${ruleJoin}\n` +
      "  UNION\n" +
      "  SELECT s.id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL\n" +
      ")\n" +
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)",
    params: [setTypeId, settingTypeId],
  };
}

/** One batch, once per codename set: every rule card with those setting
 *  codenames enters the prepared render-card map. Junction names compose
 *  in-memory from the fetched side records (multi-pass: sides first, then
 *  their junctions) - a rule card reached by ID has no name mark to seed
 *  the lexicon's on-demand composition. */
export async function warmRuleCards(
  host: ModEngineHost,
  setTypeId: number,
  settingTypeId: number,
  codenames: readonly [string] | readonly [string, string],
): Promise<void> {
  const results = await host.batch([
    ruleSidesStatement(setTypeId, settingTypeId, codenames),
  ]);
  type FetchedRow = {
    id: number;
    leftId: number | null;
    rightId: number | null;
    name: string | null;
  };
  const rows = (results[0] as { rows: FetchedRow[] } | undefined)?.rows ?? [];
  if (rows.length === 0) return;

  interface PreparedRecord {
    id: number;
    leftId: number | null;
    rightId: number | null;
    name: string | null;
    record: NonNullable<Awaited<ReturnType<ModEngineHost["fetchById"]>>>;
  }
  const byId = new Map<number, PreparedRecord>();
  for (const row of rows) {
    const record = await host.fetchById(row.id);
    if (record === undefined) continue;
    byId.set(row.id, {
      id: row.id,
      leftId: record.leftId ?? null,
      rightId: record.rightId ?? null,
      name: record.name?.s ?? null,
      record,
    });
  }

  // multi-pass junction composition (sides before junctions)
  const names = new Map<number, string>();
  let pending = [...byId.values()];
  for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
    const still: PreparedRecord[] = [];
    for (const row of pending) {
      let composed: string | undefined = row.name ?? undefined;
      if (composed === undefined && row.leftId !== null && row.rightId !== null) {
        const left = names.get(row.leftId);
        const right = names.get(row.rightId);
        if (left !== undefined && right !== undefined) composed = `${left}+${right}`;
      }
      if (composed === undefined) {
        still.push(row);
        continue;
      }
      names.set(row.id, composed);
    }
    if (still.length === pending.length) break; // unresolvable sides stay
    pending = still;
  }

  // Assign the composed name onto junction records and cache them (the
  // fetch ladder's assign_name semantics - a record reached by id carries
  // no name mark, so the composed name is assigned here).
  for (const row of byId.values()) {
    const composed = names.get(row.id);
    if (composed === undefined) continue;
    if (row.name === null) {
      row.record.name = DeckoName.parse(composed);
      row.record.key = DeckoName.parse(composed).key;
    }
    await host.cacheFetchedRecord(row.record);
  }
}
