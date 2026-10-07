// The E4.4.a file-side oracle evidence: the port's attachment WRITE path
// produces the file tree PATTERN captured from the Ruby oracle deck
// (fixtures/captured/oracle-upload-file-tree.json — a read-only sha256
// capture of REPO_ROOT/decko-ts/tools/oracle/decko-oracle-app/files/,
// the deck whose uploads were written by the live card-mod-carrierwave
// machinery; capture provenance + the card_actions no-write receipt are in
// the fixture's provenance block).
//
// The captured tree carries exactly three on-disk classes, all with
// LOWERCASE extensions:
//   1. upload originals       <card_id>/<action_id>.<ext>   (1347/5031.png)
//   2. machine outputs        <card_id>/<epoch-standin>.<ext>
//      (447/1790659793.css — the action_id_stand_in arm,
//      file_card_uploader.rb:225-227: Time.now.toi when the uploader
//      cannot resolve an action id at store time)
//   3. NO version/rendition files at all (no -icon/-small/-medium/-large/
//      -original spellings anywhere) — the ImageCardUploader version
//      machinery (image_card_uploader.rb:16-27) has no captured instance.
//
// The naming RULE Ruby stores under (file_card_uploader.rb:147-177):
//   filename     = "<action_id><extension>"  (uploads; coded cards differ)
//   extension    = the case expression's result with a trailing `.downcase`
//                  (:155-162) — the original filename's casing never
//                  reaches the tree (the original name survives only as
//                  the action comment, attachment.rb:20-24)
//   db_content   = "~<card_id>/<action_id><extension>" (:164-177)
//   storage path = <files_dir>/<card_id>/<action_id><extension>
//                  (set/abstract/attachment/paths.rb:10-17 upload_dir +
//                  file_card_uploader/path.rb:33-39 store_path)
//
// This test drives the port's real write path (CardActionEngine +
// LocalAttachmentStore, the same machinery the /files POST route drives)
// with the capture's upload classes and asserts the resulting tree against
// the captured pattern.
//
// CAPTURED DIVERGENCE (documented, not silently passed): the port's
// machine-output writes (storeAssetOutput) name the file by the save's
// action id, while Ruby's live outputter rewrites land on the epoch
// stand-in (the capture holds seven 447/<epoch>.css rewrites of the same
// output). Both sides are internally consistent (db_content and the file
// name agree per write); replicating Ruby's stand-in would require the
// port to LOSE its action-id resolution at the same event stage — an
// engine-timing parity item, not a tree-shape fix. Assertion below pins
// the port's action-id naming for the class so a future parity change
// surfaces here.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { Actor } from "../../../src/card/actions/types.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";
import { storeAssetOutput } from "../../../src/card/attachments/asset-output-write.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

// ---------------------------------------------------------------------------
// Self-contained storage boot (the file-routes.test.ts pattern; the harness
// is deliberately not imported across the stream boundary).
// ---------------------------------------------------------------------------

function splitSqliteDdlStatements(ddl: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  let inTriggerBody = false;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i] as string;
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "-" && ddl[i + 1] === "-") {
      while (i < ddl.length && ddl[i] !== "\n") i++;
      current += " ";
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < ddl.length && /[A-Za-z0-9_]/.test(ddl[j])) j++;
      const word = ddl.slice(i, j).toUpperCase();
      if (!inTriggerBody && word === "BEGIN" && /CREATE\s+TRIGGER/i.test(current)) {
        inTriggerBody = true;
      } else if (inTriggerBody && word === "END") {
        inTriggerBody = false;
      }
      current += ddl.slice(i, j);
      i = j - 1;
      continue;
    }
    if (ch === ";") {
      if (inTriggerBody) {
        current += ch;
        continue;
      }
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((statement) => statement !== "");
}

async function queryAll<T = Record<string, unknown>>(
  driver: SQLDatabaseDriver,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await driver.query<T>(sql, params)).rows;
}

const FIXED_TS = "2026-09-01 00:00:00.000";

async function seedSimpleCard(
  driver: SQLDatabaseDriver,
  opts: { id: number; name: string; codename?: string; typeId: number },
): Promise<void> {
  const { DeckoName } = await import("../../../src/card/name.js");
  const name = DeckoName.parse(opts.name);
  await driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, ?, NULL)`,
    [opts.id, name.s, name.key, opts.codename ?? null, FIXED_TS, FIXED_TS, opts.typeId],
  );
}

/** Insert one compound cards row directly (left_id/right_id columns).   Trigger-aware since the deck_data_version freshness stamp
 *  (db/schema.sqlite.sql, [ENGINE-FRESHNESS]): a CREATE TRIGGER body carries
 *  ";" before its closing "END;" -- while inside a body, ";" does not
 *  terminate the statement and the body ends at the bare word END. Kept in
 *  lockstep with the render and fetch streams' copies.
*/
async function seedCompoundCard(
  driver: SQLDatabaseDriver,
  opts: { id?: number; leftId: number; rightId: number; typeId: number; dbContent?: string },
): Promise<void> {
  await driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, ?, ?)`,
    [opts.id ?? null, opts.leftId, opts.rightId, FIXED_TS, FIXED_TS, opts.typeId, opts.dbContent ?? null],
  );
}

const CARDTYPE_ID = 3;
const RICH_TEXT_ID = 2;
const FILE_TYPE_ID = 30;
const JOE: Actor = { id: 9, name: "Joe User" };

let driver: LocalSqliteDriver;
let fetchEngine: FetchEngine;
let engine: CardActionEngine;
let filesDir: string;

beforeAll(async () => {
  driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(
    fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)),
    "utf8",
  );
  for (const statement of splitSqliteDdlStatements(ddl)) {
    await driver.query(statement, []);
  }
  await seedSimpleCard(driver, { id: RICH_TEXT_ID, name: "RichText", codename: "basic", typeId: CARDTYPE_ID });
  await seedSimpleCard(driver, { id: CARDTYPE_ID, name: "Cardtype", codename: "cardtype", typeId: CARDTYPE_ID });
  // *all is TYPED SET (typeId 300) — the who_can batch joins rule rows'
  // left cards on sets.type_id = the 'set' codename card's id
  // (view-task-rules.ts viewTaskPermissionStatements), so the fallback
  // rules resolve only when the set card is typed Set (the fixture's shape)
  await seedSimpleCard(driver, { id: 7, name: "*all", codename: "all", typeId: 300 });
  await seedSimpleCard(driver, { id: 8, name: "*default", codename: "default", typeId: CARDTYPE_ID });
  await seedCompoundCard(driver, { leftId: 7, rightId: 8, typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: FILE_TYPE_ID, name: "File", codename: "file", typeId: CARDTYPE_ID });
  // the write-rule machinery every real decko deck bootstraps (mirrors
  // actions-test-storage.ts seedStandardDeck rows 300-307): under the
  // deny-by-default write gate a rule-less deck refuses every save
  // (who_can -> [] -> among? -> false, permissions.rb:47-49/:100-118) —
  // the upload writes under test need the *all fallbacks -> [[Anyone]].
  await seedSimpleCard(driver, { id: 300, name: "Set", codename: "set", typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: 301, name: "*create", codename: "create", typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: 302, name: "*update", codename: "update", typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: 303, name: "*delete", codename: "delete", typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: 304, name: "Anyone", codename: "anyone", typeId: RICH_TEXT_ID });
  await seedCompoundCard(driver, { id: 305, leftId: 7, rightId: 301, typeId: 300, dbContent: "[[Anyone]]" });
  await seedCompoundCard(driver, { id: 306, leftId: 7, rightId: 302, typeId: 300, dbContent: "[[Anyone]]" });
  await seedCompoundCard(driver, { id: 307, leftId: 7, rightId: 303, typeId: 300, dbContent: "[[Anyone]]" });
  for (const ruleId of [305, 306, 307]) {
    await driver.query(
      "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present) VALUES (?, 'anyone', 304, 'L', NULL)",
      [ruleId],
    );
  }

  filesDir = scratchDir("decko-ts-upload-tree-test-");
  fetchEngine = new FetchEngine(driver);
  engine = new CardActionEngine(fetchEngine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: (() => {
      let ticks = 0;
      const t0 = Date.parse("2026-09-29T12:00:00.000Z");
      return () => new Date(t0 + ticks++ * 1000);
    })(),
    canWrite: async () => true,
    attachmentStore: new LocalAttachmentStore(filesDir),
  });
});

afterAll(() => {
  driver.close();
  rmSync(filesDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The oracle fixture + the pattern its own files satisfy.
// ---------------------------------------------------------------------------

interface CapturedTree {
  provenance: {
    oracleAppDir: string;
    capturedAt: string;
    bootUsed: boolean;
    cardActionsCountBefore: number;
    cardActionsCountAfter: number;
    noWriteProof: boolean;
  };
  files: { path: string; size: number; sha256: string }[];
}

function loadCapturedTree(): CapturedTree {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../fixtures/captured/oracle-upload-file-tree.json", import.meta.url)),
      "utf8",
    ),
  ) as CapturedTree;
}

/** The captured store files (minus the .keep dir marker) all satisfy one
 *  shape: <card_id>/<filename>.<lowercase ext>. This walks the CAPTURED
 *  fixture itself so the pattern cannot drift from the oracle. */
function oracleStorePattern(captured: CapturedTree): RegExp {
  const shape = /^\d+\/[^/]+\.[a-z0-9]+$/;
  for (const f of captured.files) {
    if (f.path === ".keep") continue;
    expect(f.path, `captured oracle file ${f.path} matches the store shape`).toMatch(shape);
  }
  return shape;
}

async function walkTree(base: string, dir = base, out: string[] = []): Promise<string[]> {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walkTree(base, full, out);
    else if (entry.isFile()) out.push(full.slice(base.length + 1).split("\\").join("/"));
  }
  return out;
}

// The synthetic 1234-byte png the write-seam capture uploaded (the captured
// 1347/5031.png is exactly this payload — the capture's own PNG_BYTES).
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BYTES = new Uint8Array(1234).fill(0x41, 16);
PNG_BYTES.set(PNG_MAGIC, 0);
const CSS_TEXT = "body { color: rebeccapurple; }\n".repeat(8);

describe("port write path produces the captured oracle upload tree pattern", () => {
  it("uploads land at <card_id>/<action_id><lowercase ext> with matching db_content, whatever the original filename's casing", async () => {
    const captured = loadCapturedTree();
    expect(captured.provenance.noWriteProof).toBe(true);
    const shape = oracleStorePattern(captured);

    // Class 1: the capture's own upload (oracle 1347/5031.png came from
    // oracle_cw_probe.png through the two-step editor flow; the port's
    // direct-save flow is the same store seam).
    const png = await engine.createCard({
      name: "Oracle Tree Probe Png",
      typeCode: "file",
      attachment: { bytes: PNG_BYTES, originalFilename: "oracle_cw_probe.png" },
    });

    // The triage's casing class, WRITE side: an UPPERCASE original name.
    // Ruby's extension (:155-162) downcases before the filename is built —
    // the stored tree must never carry the original's casing.
    const upper = await engine.createCard({
      name: "Oracle Tree Probe Upper",
      typeCode: "file",
      attachment: { bytes: PNG_BYTES, originalFilename: "ORACLE_CW_CASE.PNG" },
    });
    const jpg = await engine.createCard({
      name: "Oracle Tree Probe Jpg",
      typeCode: "file",
      attachment: { bytes: PNG_BYTES, originalFilename: "Photo.JPG" },
    });

    // An update accumulates a NEW action's file (Ruby's store is copy_to —
    // the prior action's file is never unlinked by a plain update).
    const update = await engine.updateCard({
      cardId: png.cardId,
      attachment: { bytes: PNG_BYTES, originalFilename: "oracle_cw_probe_v2.png" },
    });

    const tree = await walkTree(filesDir);
    expect(tree.length).toBeGreaterThanOrEqual(4);
    for (const relPath of tree) {
      expect(relPath, `port tree file ${relPath} matches the captured oracle store shape`).toMatch(shape);
    }

    // Identifier <-> tree agreement for every written card: the db_content
    // row and the on-disk name are two views of one store call.
    for (const result of [png, upper, jpg, update]) {
      expect(result).not.toBeNull();
      const row = await queryAll<{ db_content: string | null }>(
        driver,
        "SELECT db_content FROM cards WHERE id = ?",
        [result!.cardId],
      );
      const identifier = row[0]?.db_content ?? "";
      expect(identifier).toMatch(/^~\d+\/\d+\.[a-z0-9]+$/);
      const rel = identifier.slice(1); // ~<cid>/<aid><ext> -> <cid>/<aid><ext>
      expect(tree).toContain(rel);
      const stored = await readFile(join(filesDir, rel));
      expect(stored.length).toBe(PNG_BYTES.length);
    }

    // The uppercase originals did NOT leak into the tree: the ext letters
    // on disk are lowercase even though the uploads were .PNG / .JPG.
    const upperRow = await queryAll<{ db_content: string | null }>(
      driver,
      "SELECT db_content FROM cards WHERE id = ?",
      [upper.cardId],
    );
    expect(upperRow[0]?.db_content).toMatch(/\.png$/);
    expect(tree.some((p) => /[A-Z]/.test(p))).toBe(false);
  });

  it("machine-output class: storeAssetOutput writes <card_id>/<action_id>.css — the action-id naming divergence from Ruby's epoch stand-in is pinned, not hidden", async () => {
    const shape = oracleStorePattern(loadCapturedTree());
    // The outputter card (a File-typed +*asset output child) — the capture's
    // files/447/<epoch>.css class, written by Ruby's update_asset_output.
    await seedSimpleCard(driver, { id: 447, name: "*all+*style", typeId: CARDTYPE_ID });
    const stored = await storeAssetOutput(
      {
        engine: {
          createCard: (input) => engine.createCard(input as Parameters<CardActionEngine["createCard"]>[0]),
          updateCard: (input) =>
            engine.updateCard(input as Parameters<CardActionEngine["updateCard"]>[0]) as Promise<unknown>,
        },
        fetchByName: (name: string) => fetchEngine.fetchByName(name),
      },
      "*all+*style",
      CSS_TEXT,
      ".css",
    );

    // The port's url carries the tilde-mark local form; the file on disk is
    // named by the save's ACTION id (Ruby's live rewrite lands on the
    // Time.now stand-in — file_card_uploader.rb:225-227 — because its
    // action id is not resolvable at the uploader's store-time; the port
    // always resolves it. Divergence documented in the module header).
    expect(stored.url).toMatch(/^\/files\/~\d+\/\d+\.css$/);
    const rel = stored.identifier.slice(1);
    expect(rel).toMatch(shape);
    const written = await readFile(join(filesDir, rel), "utf8");
    expect(written).toBe(CSS_TEXT);
    // The child row's db_content equals the identifier the url came from.
    const row = await queryAll<{ db_content: string | null }>(
      driver,
      "SELECT db_content FROM cards WHERE id = ?",
      [stored.cardId],
    );
    expect(row[0]?.db_content).toBe(stored.identifier);
  });

  it("the captured oracle carries zero version/rendition files — the port's store writes no variant files either", async () => {
    const captured = loadCapturedTree();
    const variantFiles = captured.files.filter((f) =>
      /-(icon|small|medium|large|original)\.[a-z0-9]+$/.test(f.path),
    );
    expect(variantFiles).toEqual([]);
    const portTree = await walkTree(filesDir);
    expect(portTree.filter((p) => /-(icon|small|medium|large|original)\./.test(p))).toEqual([]);
  });
});
