// Type declarations for files.mjs (plain-JS tool module).

import type { SQLDatabaseDriver } from "../../src/server/driver.js";

/** card_changes.field for db_content. */
export const DB_CONTENT_FIELD: number;

export interface ParsedLocalIdentifier {
  cardId: number;
  actionId: number;
  ext: string;
}

/** Parse `~<card id>/<action id><ext>`; undefined for anything else. */
export function parseLocalIdentifier(content: unknown): ParsedLocalIdentifier | undefined;

/** Where a local identifier's bytes live under a files directory. */
export function localIdentifierPath(filesDir: string, parsed: ParsedLocalIdentifier): string;

export interface DeckFilesCopy {
  files: number;
  bytes: number;
  copied: number;
  alreadyPresent: number;
  /** Relative paths whose copy did not hash like its source (first 20). */
  mismatched: string[];
}

/** Copy the Ruby deck's files tree, checking every copy's SHA-256.
 *  Resumable: files already present with the source's bytes are skipped. */
export function copyDeckFiles(opts: { sourceDir: string; targetDir: string }): DeckFilesCopy;

export interface DeckFilesReport {
  /** ok; failed (a file the source has is missing or different in the
   *  target); not-migrated (the deck names local files and none were
   *  migrated). */
  status: "ok" | "failed" | "not-migrated";
  referenced: { current: number; history: number };
  present: { current: number; history: number };
  lost: number;
  lostSample: { cardId: number; actionId: number }[];
  absentInSource: { current: number; history: number };
  absentInSourceSample: { kind: "current" | "history"; cardId: number; actionId: number }[];
  copy: DeckFilesCopy | null;
}

/** Check every local file the deck names (current content and history). */
export function verifyDeckFiles(opts: {
  driver: SQLDatabaseDriver;
  sourceDir?: string;
  targetDir?: string;
  copy?: DeckFilesCopy;
}): Promise<DeckFilesReport>;
