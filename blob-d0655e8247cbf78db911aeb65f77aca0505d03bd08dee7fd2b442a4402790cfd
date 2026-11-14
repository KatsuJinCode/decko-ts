// Declared divergences: differences between an engine's stored rows and the
// oracle's that an engine configuration is known to make on purpose, declared
// to the grader by name so they are graded as declared instead of failing.
//
// A declared divergence is narrow by construction. It names one kind of value
// in one kind of row, masks exactly those values in the expected and the
// actual row deltas alike, and leaves every other byte to the ordinary
// comparison. A change the divergence does not describe still fails.
//
// The one divergence defined here:
//
//   password-digest
//     The port's default password policy stores PBKDF2-HMAC-SHA256 where
//     Ruby stores its salted SHA-1, and replaces a legacy SHA-1 digest with a
//     PBKDF2 hash when its owner signs in (src/card/auth/password-hash.ts;
//     docs/SECURITY.md, "Passwords"). Ruby cannot produce or verify that
//     value, so no oracle capture can hold it. The exception is exactly one
//     column, and nothing wider:
//       - `cards.db_content` of a +*password card (right_id is the card with
//         codename `password`), when the value is a password digest of
//         either scheme, is masked;
//       - an update of such a row whose only changed column is that digest
//         (digest before, digest after) is therefore left with no change and
//         is dropped, so the sign-in upgrade grades as the oracle's empty
//         delta.
//     WHAT THIS HIDES, stated plainly: Ruby does not write at sign-in; the
//     port, under PBKDF2, rewrites the digest of the account's password card.
//     The grade with this declaration says that write changes the digest and
//     nothing else; it does not say the port writes nothing.
//     Not masked: every other column of those rows, every other row, every
//     other table - including the `card_changes.value` history row a write
//     that SETS a password records. A write that stores a new PBKDF2 password
//     therefore still differs from Ruby in card_changes and fails the grade;
//     that is a known, unmasked difference, not exercised by synthetic-v1.

import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const MASKED_PASSWORD_DIGEST = "<password digest>";

/** Ruby's salted SHA-1 digest (card 1.110.0 lib/card/auth.rb:27-39). */
const LEGACY_DIGEST = /^[0-9a-f]{40}$/;
/** The port's PBKDF2 format (password-hash.ts): pbkdf2_sha256$<iterations>$<salt>$<hash>. */
const PBKDF2_DIGEST = /^pbkdf2_sha256\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/;

export function isPasswordDigest(value) {
  return typeof value === "string" && (LEGACY_DIGEST.test(value) || PBKDF2_DIGEST.test(value));
}

/** The divergences an engine configuration may declare, by name. */
export const KNOWN_DIVERGENCES = ["password-digest"];

/** The declaration's shape: `{ "<divergence name>": "why" }`. */
export function validateDeclaredDivergences(declared) {
  const bad = 'declaredDivergences must be { "<divergence name>": "why" }';
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) throw new TypeError(bad);
  for (const [name, why] of Object.entries(declared)) {
    if (!KNOWN_DIVERGENCES.includes(name)) throw new TypeError(`${bad}; unknown divergence "${name}" (known: ${KNOWN_DIVERGENCES.join(", ")})`);
    if (typeof why !== "string" || why.trim() === "") throw new TypeError(`${bad}; the why of "${name}" is not a non-empty string`);
  }
  return declared;
}

/**
 * The +*password card ids of the fixture's deck, read once from the deck file
 * (Decko's schema is the persistence contract). A password card a step
 * creates is recognised from the step's own delta.
 */
export function passwordDigestContext(fixtureDir) {
  const deckPath = path.join(fixtureDir, "deck", "deck.sqlite3");
  const context = { passwordCodeId: undefined, passwordCards: new Set() };
  if (!existsSync(deckPath)) return context;
  // The fixture deck's header is in WAL mode, and any handle on a WAL file -
  // read-only included - leaves -shm/-wal sidecars beside it, which the
  // fixture-manifest check reads as corruption. The ids are read from a
  // private copy instead.
  const work = mkdtempSync(path.join(os.tmpdir(), "decko-divergence-"));
  const copy = path.join(work, "deck.sqlite3");
  cpSync(deckPath, copy);
  const db = new DatabaseSync(copy);
  try {
    const code = db.prepare("SELECT id FROM cards WHERE codename = 'password'").get();
    if (code === undefined) return context;
    context.passwordCodeId = Number(code.id);
    for (const row of db.prepare("SELECT id FROM cards WHERE right_id = ?").all(context.passwordCodeId)) context.passwordCards.add(Number(row.id));
  } finally {
    db.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return context;
}

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Masks the password-digest divergence in one raw row delta
 * (`{ table: { inserted, updated, deleted } }`, deck-state.mjs rawDelta).
 * Returns the masked copy and the paths that were masked; the input is not
 * changed.
 */
export function maskPasswordDigests(delta, context) {
  const masked = [];
  if (delta === undefined || delta === null || typeof delta !== "object") return { delta, masked };
  const out = clone(delta);
  const passwordCards = new Set(context.passwordCards);
  const isPasswordRow = (row) => context.passwordCodeId !== undefined && Number(row?.right_id) === context.passwordCodeId;
  // A password card this delta creates is known by its own new id.
  for (const row of out.cards?.inserted ?? []) if (isPasswordRow(row)) passwordCards.add(Number(row.id));

  const maskRows = (table, rows, kind, column, applies) => {
    for (const row of rows ?? []) {
      if (applies(row) && isPasswordDigest(row[column])) {
        row[column] = MASKED_PASSWORD_DIGEST;
        masked.push(`${table}/${kind}/${row.id}/${column}`);
      }
    }
  };
  const maskUpdates = (table, column, applies) => {
    const d = out[table];
    if (!d) return;
    d.updated = (d.updated ?? []).filter((entry) => {
      const change = entry.changes?.[column];
      if (!applies(entry) || !Array.isArray(change) || !isPasswordDigest(change[0]) || !isPasswordDigest(change[1])) return true;
      delete entry.changes[column];
      masked.push(`${table}/updated/${entry.id}/${column}`);
      return Object.keys(entry.changes).length > 0;
    });
  };

  // The one masked column: cards.db_content of a +*password card.
  const passwordCard = (row) => isPasswordRow(row) || passwordCards.has(Number(row.id));
  maskRows("cards", out.cards?.inserted, "inserted", "db_content", passwordCard);
  maskRows("cards", out.cards?.deleted, "deleted", "db_content", passwordCard);
  maskUpdates("cards", "db_content", (entry) => passwordCards.has(Number(entry.id)));

  // Only a cards delta this pass emptied is dropped; every other table is
  // returned exactly as it came in.
  const cards = out.cards;
  if (masked.length > 0 && cards && cards.inserted.length === 0 && cards.updated.length === 0 && cards.deleted.length === 0) delete out.cards;
  return { delta: out, masked };
}
