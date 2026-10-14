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
//     value, so no oracle capture can hold it. Under this declaration:
//       - in a `cards` row of a +*password card (right_id is the card with
//         codename `password`), a `db_content` that is a password digest of
//         either scheme is masked;
//       - in a `card_changes` row recorded by an action on such a card, a
//         `value` that is a password digest is masked;
//       - an update whose only change is such a masked digest (digest before
//         and digest after) is no change at all, so the sign-in upgrade,
//         which rewrites nothing but the digest, grades as the oracle's
//         empty delta.
//     Every other column of those rows, every other row, and every other
//     table is compared byte for byte as usual.

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
 * The +*password card ids and the card ids of every action of the fixture's
 * deck, read once from the deck file (Decko's schema is the persistence
 * contract). Rows a step creates are recognised from the step's own delta.
 */
export function passwordDigestContext(fixtureDir) {
  const deckPath = path.join(fixtureDir, "deck", "deck.sqlite3");
  const context = { passwordCodeId: undefined, passwordCards: new Set(), actionCards: new Map() };
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
    for (const row of db.prepare("SELECT id, card_id FROM card_actions").all()) context.actionCards.set(Number(row.id), row.card_id === null ? null : Number(row.card_id));
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
  const actionCards = new Map(context.actionCards);
  const isPasswordRow = (row) => context.passwordCodeId !== undefined && Number(row?.right_id) === context.passwordCodeId;
  // Rows this delta creates join the known sets first, so a step that
  // creates an account and its password is read with its own new ids.
  for (const row of out.cards?.inserted ?? []) if (isPasswordRow(row)) passwordCards.add(Number(row.id));
  for (const row of out.card_actions?.inserted ?? []) actionCards.set(Number(row.id), row.card_id === null ? null : Number(row.card_id));

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

  const passwordCard = (row) => isPasswordRow(row) || passwordCards.has(Number(row.id));
  maskRows("cards", out.cards?.inserted, "inserted", "db_content", passwordCard);
  maskRows("cards", out.cards?.deleted, "deleted", "db_content", passwordCard);
  maskUpdates("cards", "db_content", (entry) => passwordCards.has(Number(entry.id)));

  const changeOfPasswordCard = (row) => passwordCards.has(actionCards.get(Number(row.card_action_id)));
  maskRows("card_changes", out.card_changes?.inserted, "inserted", "value", changeOfPasswordCard);
  maskRows("card_changes", out.card_changes?.deleted, "deleted", "value", changeOfPasswordCard);
  // card_changes rows are written once and never updated (Card::Change is
  // an append-only record), so an updated card_changes row is left to the
  // ordinary comparison: the divergence does not describe it.

  for (const [table, d] of Object.entries(out)) {
    if (d && typeof d === "object" && Array.isArray(d.inserted) && Array.isArray(d.updated) && Array.isArray(d.deleted)) {
      if (d.inserted.length === 0 && d.updated.length === 0 && d.deleted.length === 0) delete out[table];
    }
  }
  return { delta: out, masked };
}
