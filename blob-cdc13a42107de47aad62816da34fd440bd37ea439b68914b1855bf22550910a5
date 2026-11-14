// files.mjs — move a Ruby deck's uploaded files and prove every card that
// names one can still reach it.
//
// Ruby Decko keeps uploads on disk, outside the database, under the deck's
// files directory (card-mod-carrierwave set/abstract/attachment/paths.rb:
// upload_dir = "<files>/<card id>", file_card_uploader.rb#filename =
// "<action id><ext>", ext lowercased). A card's db_content names its file
// with a LOCAL identifier, `~<card id>/<action id><ext>`. Image cards add
// their versions beside the original (`icon-<action id><ext>` and so on).
// The port reads the same layout (src/card/attachments/attachment-store.ts,
// LocalAttachmentStore; DECKO_FILES_DIR on the Node host), so the files
// move as a tree, unchanged.
//
// Coded files (`:codename/...`) live in mod code and web or cloud
// identifiers live elsewhere; neither is in the files directory, and both
// are counted, not copied.
//
// Everything here is content-free in its output: ids, counts, sizes and
// hashes, never file bytes or card content.

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/** card_changes.field for db_content (Card::Change tracked fields: name 0,
 *  type_id 1, db_content 2, trash 3, left_id 4, right_id 5). */
export const DB_CONTENT_FIELD = 2;

const LOCAL_IDENTIFIER = /^~(\d+)\/(\d+)(\.[a-z0-9]{1,10})?$/;

/** Parse `~<card id>/<action id><ext>`; undefined for anything else. The
 *  same grammar as src/card/attachments/attachment-content.ts. */
export function parseLocalIdentifier(content) {
  if (typeof content !== "string") return undefined;
  const match = LOCAL_IDENTIFIER.exec(content.trim());
  if (match === null) return undefined;
  return { cardId: Number(match[1]), actionId: Number(match[2]), ext: match[3] ?? "" };
}

/** Where a local identifier's bytes live under a files directory. */
export function localIdentifierPath(filesDir, parsed) {
  return join(filesDir, String(parsed.cardId), `${parsed.actionId}${parsed.ext}`);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function* walkFiles(root) {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) yield full;
    }
  }
}

/**
 * Copy every file under sourceDir to the same relative path under
 * targetDir, and check each copy's SHA-256 against its source.
 *
 * Resumable: a target file that already has the source's size and hash is
 * left alone; anything else is (re)written through a temporary name and a
 * rename, so an interruption never leaves a half-written file under the
 * real name.
 */
export function copyDeckFiles({ sourceDir, targetDir }) {
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error("files directory not found or not a directory");
  }
  const result = { files: 0, bytes: 0, copied: 0, alreadyPresent: 0, mismatched: [] };
  for (const source of walkFiles(sourceDir)) {
    const rel = relative(sourceDir, source);
    const target = join(targetDir, rel);
    const size = statSync(source).size;
    const sourceHash = sha256File(source);
    result.files += 1;
    result.bytes += size;
    if (existsSync(target) && statSync(target).size === size && sha256File(target) === sourceHash) {
      result.alreadyPresent += 1;
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.decko-import-partial`;
    copyFileSync(source, temporary);
    renameSync(temporary, target);
    result.copied += 1;
    if (sha256File(target) !== sourceHash) {
      if (result.mismatched.length < 20) result.mismatched.push(rel.split(sep).join("/"));
    }
  }
  return result;
}

/** Every local identifier the deck names: current content of live cards,
 *  and every db_content value its history recorded. */
async function referencedIdentifiers(driver) {
  const current = new Map();
  const cards = await driver.query(
    "SELECT id, db_content FROM cards WHERE trash = 0 AND db_content LIKE '~%'",
    [],
  );
  for (const row of cards.rows) {
    const parsed = parseLocalIdentifier(row.db_content);
    if (parsed !== undefined) current.set(row.db_content.trim(), parsed);
  }
  const history = new Map();
  const changes = await driver.query(
    "SELECT value FROM card_changes WHERE field = ? AND value LIKE '~%'",
    [DB_CONTENT_FIELD],
  );
  for (const row of changes.rows) {
    const parsed = parseLocalIdentifier(row.value);
    if (parsed !== undefined && !current.has(row.value.trim())) history.set(row.value.trim(), parsed);
  }
  return { current, history };
}

/**
 * Check that every file the deck names is where the port will look for it.
 * With a sourceDir, a file present in the source must be present in the
 * target with the same bytes; a file absent from both is a gap the source
 * deck already had, reported but not counted against the migration.
 * Without a targetDir (no files were migrated) the deck's references are
 * counted and the result fails whenever there is anything to migrate.
 */
export async function verifyDeckFiles({ driver, sourceDir, targetDir, copy }) {
  const { current, history } = await referencedIdentifiers(driver);
  const result = {
    status: "ok",
    referenced: { current: current.size, history: history.size },
    present: { current: 0, history: 0 },
    lost: 0,
    lostSample: [],
    absentInSource: { current: 0, history: 0 },
    absentInSourceSample: [],
    copy: copy ?? null,
  };
  if (targetDir === undefined) {
    result.status = current.size + history.size === 0 ? "ok" : "not-migrated";
    return result;
  }
  for (const [kind, refs] of [["current", current], ["history", history]]) {
    for (const parsed of refs.values()) {
      const target = localIdentifierPath(targetDir, parsed);
      const source = sourceDir === undefined ? undefined : localIdentifierPath(sourceDir, parsed);
      const inTarget = existsSync(target);
      const inSource = source !== undefined && existsSync(source);
      if (inTarget && (!inSource || sha256File(source) === sha256File(target))) {
        result.present[kind] += 1;
      } else if (inSource) {
        result.lost += 1;
        if (result.lostSample.length < 20) result.lostSample.push({ cardId: parsed.cardId, actionId: parsed.actionId });
      } else {
        result.absentInSource[kind] += 1;
        if (result.absentInSourceSample.length < 20) {
          result.absentInSourceSample.push({ kind, cardId: parsed.cardId, actionId: parsed.actionId });
        }
      }
    }
  }
  if (result.lost > 0 || (copy !== undefined && copy.mismatched.length > 0)) result.status = "failed";
  return result;
}
