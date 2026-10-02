// Census probe: counts the cards the *structure rule universe actually
// governs on a COPY of the raw corpus deck. OPT-IN ONLY (STRUCTURE_CENSUS=1):
// the corpus copy it reads is uncommitted private data, so a fresh clone
// skips this suite instead of failing, and setting the flag without the copy
// fails loud (ENOENT on the sha-verified read below).
//
// Mission: count the rule rows themselves plus the cards whose type/sets
// resolve to them, to adjudicate whether the *structure branch of
// new_card_template (card-mod-content-0.20.0 set/all/templating.rb:52-65)
// is corpus-exposed and must be ported into the action layer's type
// resolution (src/card/actions/type-resolution.ts templateTypeId currently
// walks the :default leg only).
//
// Data discipline: runs on a COPY of the raw corpus dump inside this
// worktree, sha-verified here against the canonical raw-dump sha
// 6A44DFDC20CA941E66DA6BA08ADD7F1A5CF35EC1A3BA75CC43A70920E609440E before a
// single query runs. The original dump is never opened.
//
// Walk fidelity: every candidate walk is the PORT's own oracle-tested
// algebra (set-patterns/rule-names.ts#ruleNamesForCard over
// card-patterns.ts#patternsForCard); the universes are built with the
// port's own universe statement + canonicalizing mappers
// (rules/structure.ts#structureRuleUniverseStatement /
// structureUniverseFromResults / structureRuleTypesFromResults). No census
// logic hand-rolls pattern semantics.
//
// Ruby mechanisms counted (citations):
// - templating.rb:52-59 new_card_template: default = rule_card(:default);
//   structure = dup_structure(default&.type_id) — the DUP is typed with the
//   *default rule's type (or Card.default_type_id, type.rb:3-5) and the
//   *structure walk runs on the DUP (the dup's type decides the *type and
//   *type plus right candidates); _self content nils the rule card
//   (structure_rule_card, templating.rb:44-48).
// - type.rb:76-78 type_id_from_template = `name && template&.type_id`: a
//   NULL-content *structure rule still supplies its TYPE (only _self nils
//   the card); structured CONTENT (content/all.rb:25-27) falls through on
//   NULL — the two axes count differently and both are reported.
// - templating.rb:67-69 assign_type_to?: gates only the side-effect retype,
//   never the returned template.

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  structureRuleUniverseStatement,
  ruleUniverseStatementBySetting,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "../../../src/card/rules/structure.js";
import { ruleNamesForCard } from "../../../src/card/set-patterns/rule-names.js";
import type { PatternCardInput } from "../../../src/card/set-patterns/types.js";
import { DeckoName } from "../../../src/card/name.js";
import type { SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const COPY_PATH = path.resolve(
  REPO_ROOT,
  "tmp",
  "census-corpus-copy",
  "bench-corpus-raw.census-copy.sqlite3",
);
const CANONICAL_RAW_SHA256 =
  "6a44dfdc20ca941e66da6ba08add7f1a5cf35ec1a3ba75cc43a70920e609440e";

// OPT-IN GATE: the census reads the uncommitted corpus copy at COPY_PATH.
// Without STRUCTURE_CENSUS=1 the suite skips (a fresh clone has no copy);
// with the flag set, a missing or sha-mismatched copy fails loud instead of
// silently shrinking the census.
const CENSUS_REQUESTED = process.env.STRUCTURE_CENSUS === "1";
const describeIfCorpus = CENSUS_REQUESTED ? describe : describe.skip;

interface CardRow {
  id: number;
  composed: string | null;
  parts: number;
  type_id: number | null;
  left_id: number | null;
  right_id: number | null;
  codename: string | null;
}

/** All-cards name composition — the universe statement's walk shape
 *  (rules/structure.ts#ruleUniverseStatementBySetting), rooted at EVERY
 *  simple row (trashed intermediates included: rule lookups walk through
 *  trashed junctions). */
const ALL_CARDS_SQL =
  `WITH RECURSIVE name_walk(id, composed, depth) AS (\n` +
  `  SELECT id, COALESCE("key", ''), 1 FROM cards\n` +
  `  WHERE left_id IS NULL AND right_id IS NULL\n` +
  `  UNION ALL\n` +
  `  SELECT c.id, COALESCE(w.composed, '') || '+' || COALESCE(r."key", ''), w.depth + 1\n` +
  `  FROM cards c\n` +
  `  JOIN name_walk w ON w.id = c.left_id\n` +
  `  JOIN cards r ON r.id = c.right_id\n` +
  `)\n` +
  `SELECT c.id AS id, w.composed AS composed, w.depth AS parts,\n` +
  `  c.type_id AS type_id, c.left_id AS left_id, c.right_id AS right_id,\n` +
  `  c.codename AS codename\n` +
  `FROM cards c LEFT JOIN name_walk w ON w.id = c.id`;

describeIfCorpus("structure governance census — raw corpus copy (sha 6A44DFDC)", () => {
  it("counts *structure rule rows and the cards whose candidate walks resolve to them", { timeout: 170_000 }, () => {
    // ---- data gate: the copy must byte-match the canonical dump ----
    const sha = createHash("sha256").update(readFileSync(COPY_PATH)).digest("hex");
    expect(sha).toBe(CANONICAL_RAW_SHA256);
    const db = new Database(COPY_PATH, { readonly: true });

    const asResult = (rows: unknown[]): SQLQueryResult =>
      ({ rows }) as unknown as SQLQueryResult;
    // The RAW dump's cards table stores the content column as `content`
    // (PRAGMA table_info: id, name, key, codename, ..., content, ...); the
    // port's statement names the seeded engine column `db_content`. Same
    // value, different column name per schema — string-mapped here, no
    // logic touched. Statement parameters bind through unchanged.
    const prepareStatement = (stmt: SQLStatement) =>
      db.prepare(stmt.sql.replace(/r\.db_content/g, "r.content")).all(...(stmt.params as string[]));
    const structureRows = prepareStatement(
      structureRuleUniverseStatement(),
    ) as Array<Record<string, unknown>>;
    const defaultRows = prepareStatement(
      ruleUniverseStatementBySetting("*default"),
    ) as Array<Record<string, unknown>>;
    const structureContents = structureUniverseFromResults(asResult(structureRows));
    const structureTypes = structureRuleTypesFromResults(asResult(structureRows));
    const defaultTypes = structureRuleTypesFromResults(asResult(defaultRows));

    const allRows = db.prepare(ALL_CARDS_SQL).all() as unknown as CardRow[];
    const byId = new Map<number, CardRow>();
    for (const row of allRows) byId.set(row.id, row);

    const globalDefaultKey = DeckoName.parse("*all+*default").key;
    const globalDefaultType = defaultTypes.get(globalDefaultKey);
    const settingRows = allRows.filter((r) => r.codename === "setting");
    const setRows = allRows.filter((r) => r.codename === "set");
    expect(settingRows.length).toBeGreaterThan(0);
    expect(setRows.length).toBeGreaterThan(0);
    const settingTypeId = settingRows[0].id;
    const setTypeId = setRows[0].id;

    // part-type lookups by NAME SEGMENTS — orphan junction rows (sides
    // NULL, name+key stored; 9,739 in this deck) must classify too, so
    // rule? is derived from stored keys via a key -> row map.
    const keyToRow = new Map<string, CardRow>();
    for (const row of allRows) {
      if (row.composed !== null && row.composed !== "") {
        keyToRow.set(row.composed, row);
      }
    }
    const typeOfPartKey = (key: string): number | null =>
      keyToRow.get(key)?.type_id ?? null;
    const isRuleCard = (row: CardRow): boolean => {
      // lib/card/rule/all.rb:33-43 rule?: standard_rule? || preference?
      const segments = (row.composed ?? "").split("+");
      if (segments.length < 2) return false;
      const rightType = typeOfPartKey(segments[segments.length - 1]);
      if (rightType !== settingTypeId) return false;
      // standard_rule? (all.rb:37-40): name.left type == SetID — for a
      // 3-part name the left is its first two parts (all.rb:39 via
      // name.left).
      const leftKey = segments.slice(0, -1).join("+");
      if (typeOfPartKey(leftKey) === setTypeId) return true;
      // preference? (all.rb:41-43): parts > 2 && name[0..-3] type == SetID
      if (segments.length > 2 && typeOfPartKey(segments.slice(0, -2).join("+")) === setTypeId) {
        return true;
      }
      return false;
    };

    const typeNameById = new Map<number, string | null>();
    for (const row of allRows) {
      if (row.parts === 1 && row.composed) typeNameById.set(row.id, row.composed);
    }

    const leftTypeNameOf = (row: CardRow): string | null => {
      if (row.left_id === null) return null;
      const left = byId.get(row.left_id);
      if (left === undefined || left.type_id === null) return null;
      return typeNameById.get(left.type_id) ?? null;
    };

    // First-walk helper: the port's candidate order, keyed canonical, first
    // universe hit decides (the exact shape resolveStructuredContent /
    // templateTypeId / resolveVirtualCardStructure walk).
    const firstHit = (
      input: PatternCardInput,
      setting: string,
      universe: Map<string, string | null>,
    ): { key: string; content: string | null } | undefined => {
      for (const candidate of ruleNamesForCard(input, setting)) {
        const key = DeckoName.parse(candidate).key;
        if (universe.has(key)) return { key, content: universe.get(key) ?? null };
      }
      return undefined;
    };

    const counts = {
      liveCards: 0,
      skippedNoName: 0,
      ruleRows: structureRows.length,
      ruleRowsSelf: 0,
      ruleRowsNullContent: 0,
      ruleRowsByPattern: new Map<string, number>(),
      defaultRuleRows: defaultRows.length,
      // persisted-shape walk (isNew=false — the R2-ported existing-card path)
      persistedGoverned: 0,
      persistedContentSubstituting: 0,
      // new-card untyped shape (the current fetch-hook / virtual-cards shape)
      newUntypedGoverned: 0,
      // new-card dup-typed shape (Ruby's dup_structure, templating.rb:61-65)
      newDupGoverned: 0,
      newDupSelfKilled: 0,
      newDupNullContentGoverned: 0,
      dupNuanceDiffs: 0,
      // type axis: the branch's outcome for type resolution
      typeAxisStructureWins: 0,
      typeAxisTypeDiffersFromDefault: 0,
      typeAxisStructureTypeNull: 0,
      examplesTypeDiffers: [] as string[],
      examplesDupNuance: [] as string[],
    };

    // (trash lives on cards but the CTE above does not select it; query the
    // live id set once and filter by it.)
    const liveIds = new Set(
      (db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>).map(
        (r) => r.id,
      ),
    );

    for (const row of allRows) {
      if (!liveIds.has(row.id)) continue;
      counts.liveCards += 1;
      const nameStr = row.composed ?? "";
      if (nameStr === "") {
        counts.skippedNoName += 1;
        continue;
      }
      const isRule = isRuleCard(row);
      const leftTypeName = leftTypeNameOf(row);
      const ownTypeName = row.type_id !== null ? typeNameById.get(row.type_id) ?? null : null;

      // ---- rule-row classification (this card IS a *structure rule row) ----
      if (row.right_id !== null && nameStr.endsWith("+*structure")) {
        const setPart = nameStr.slice(0, -"+*structure".length);
        const tag = setPart.split("+").pop() ?? "?";
        counts.ruleRowsByPattern.set(tag, (counts.ruleRowsByPattern.get(tag) ?? 0) + 1);
        const content = structureContents.get(DeckoName.parse(nameStr).key) ?? null;
        if (content !== null && content.trim() === "_self") counts.ruleRowsSelf += 1;
        if (content === null) counts.ruleRowsNullContent += 1;
      }

      // ---- persisted shape (the R2-ported existing-card path) ----
      const persistedInput: PatternCardInput = {
        name: nameStr,
        isNew: false,
        typeId: row.type_id,
        typeName: ownTypeName,
        leftTypeName,
        isRule,
      };
      const persistedHit = firstHit(persistedInput, "*structure", structureContents);
      if (persistedHit !== undefined) {
        counts.persistedGoverned += 1;
        if (persistedHit.content !== null && persistedHit.content.trim() !== "_self") {
          counts.persistedContentSubstituting += 1;
        }
      }

      // ---- new-card untyped shape (current fetch-hook shape) ----
      const untypedInput: PatternCardInput = { name: nameStr, isNew: true, leftTypeName };
      const untypedHit = firstHit(untypedInput, "*structure", structureContents);
      const untypedGoverned =
        untypedHit !== undefined && (untypedHit.content === null || untypedHit.content.trim() !== "_self");
      if (untypedGoverned) counts.newUntypedGoverned += 1;

      // ---- new-card DUP-TYPED shape (Ruby dup_structure) ----
      // default leg first: rule_card(:default) over the placeholder shape
      // (type-resolution.ts templateTypeId's exact input), anchorless *all
      // included — Ruby's rule_card walks ALL candidates; the port's tail
      // (defaultTypeId) is the same *all+*default row.
      const placeholderInput: PatternCardInput = {
        name: nameStr,
        isNew: true,
        typeId: null,
        typeName: null,
        leftTypeName: null,
        isRule,
      };
      let defaultType: number | undefined;
      for (const candidate of ruleNamesForCard(placeholderInput, "*default")) {
        const key = DeckoName.parse(candidate).key;
        if (defaultTypes.has(key)) {
          defaultType = defaultTypes.get(key);
          break;
        }
      }
      if (defaultType === undefined) defaultType = globalDefaultType;

      const dupInput: PatternCardInput = {
        name: nameStr,
        isNew: true,
        typeId: defaultType ?? null,
        typeName: defaultType !== undefined ? typeNameById.get(defaultType) ?? null : null,
        leftTypeName,
        isRule,
      };
      const dupHit = firstHit(dupInput, "*structure", structureContents);
      const dupSelfKilled = dupHit !== undefined && dupHit.content !== null && dupHit.content.trim() === "_self";
      const dupGoverned = dupHit !== undefined && !dupSelfKilled;
      if (dupGoverned) {
        counts.newDupGoverned += 1;
        if (dupHit.content === null) counts.newDupNullContentGoverned += 1;
        // ---- the branch's TYPE-AXIS outcome vs the ported default leg ----
        const dupStructureType = structureTypes.get(dupHit.key);
        if (dupStructureType === undefined) counts.typeAxisStructureTypeNull += 1;
        counts.typeAxisStructureWins += 1;
        if (dupStructureType !== undefined && defaultType !== undefined && dupStructureType !== defaultType) {
          counts.typeAxisTypeDiffersFromDefault += 1;
          if (counts.examplesTypeDiffers.length < 5) {
            counts.examplesTypeDiffers.push(
              `${nameStr} -> ${dupHit.key} (structure type ${dupStructureType} vs default-leg type ${defaultType})`,
            );
          }
        }
      }
      if (dupSelfKilled) counts.newDupSelfKilled += 1;
      if (dupGoverned !== untypedGoverned) {
        counts.dupNuanceDiffs += 1;
        if (counts.examplesDupNuance.length < 5) {
          counts.examplesDupNuance.push(
            `${nameStr}: dup-typed ${dupGoverned ? `GOVERNED (${dupHit?.key})` : "not governed"} vs untyped ${untypedGoverned ? `GOVERNED (${untypedHit?.key})` : "not governed"}`,
          );
        }
      }
    }

    // The census's standing artifact is the smoke pair below: the corpus
    // carries *structure rule rows, and the live population has the
    // expected magnitude.
    expect(counts.ruleRows).toBeGreaterThan(0);
    expect(counts.liveCards).toBeGreaterThan(40_000);
  });
});
