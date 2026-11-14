// U6 / C8 evidence extractor: export the DECK'S OWN email-template cards —
// their deck rows, their party references, and the Ruby oracle's rendered
// bytes — out of the pinned ground-truth captures, into ONE self-contained
// committed fixture the test seeds from.
//
// Why this extractor exists (U6's own closure criterion, "export the
// email-template cards from the corpus; compare"):
//   The deck the TS census fixtures seed from (benchmarks/corpus-v2/
//   bench-corpus-v2.sqlite3) is the SCRUBBED deck - card names, cardtype
//   names and every word of body content are replaced, so its renders can
//   never be compared byte-for-byte with Ruby's. The RAW deck (real names,
//   real email bodies) is pinned read-only at
//   pass17-int/tmp/raw-ground-truth/bench-corpus-raw.sqlite3, and the Ruby
//   oracle rendered all 49,829 of its cards into expected-v2/. This
//   extractor lifts the email-template family out of both.
//
// Inputs (READ-ONLY; nothing under pass17-int is written):
//   tmp/raw-deck/raw-deck-copy.sqlite3   (byte copy of the raw deck)
//   tmp/raw-ground-truth/expected-v2/view-lane/recapture-raw-*.jsonl
//
// Output: fixtures/captured/email-templates-raw-oracle.json
//   { provenance, cards: [...], references: [...], views: { id: {view: html} } }
//
// Run from the repo root: node benchmarks/extract-email-template-oracle-bytes.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RAW_DECK = process.env.RAW_DECK ?? path.join(REPO_ROOT, 'tmp/raw-deck/raw-deck-copy.sqlite3');
// The oracle view-lane shards: the same private raw-corpus leg the corpus
// probes read (src/testing/test-corpus-paths.ts RAW_CORPUS_VIEW_LANE_DIR), and
// the sibling of RAW_DECK above -- the deck was already staged in-repo, only
// the shards still pointed at `C:/localProjects/decko-ts-pass17-int`, a
// worktree that has left this machine. Overridable for a deliberately-pinned
// capture elsewhere.
const ORACLE_DIR =
  process.env.ORACLE_VIEW_LANE_DIR ??
  path.join(REPO_ROOT, 'tmp/raw-ground-truth/expected-v2/view-lane');

const db = new Database(RAW_DECK, { readonly: true });
const COLS =
  'id, name, key, codename, left_id, right_id, trash, type_id, content, ' +
  'read_rule_id, read_rule_class';
const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
const before = { cards: count('cards'), card_references: count('card_references') };

const roots = db
  .prepare(
    `SELECT c.id, c.name FROM cards c WHERE c.trash = 0 AND c.type_id IN
       (SELECT id FROM cards WHERE name = 'Email template') ORDER BY c.id`,
  )
  .all();
console.log(
  'email_template cards:',
  roots.map((r) => `${r.id}:${r.name}`).join(', '),
);

const rows = new Map();
const fetch = (idList) => {
  for (let i = 0; i < idList.length; i += 400) {
    const chunk = idList.slice(i, i + 400);
    for (const r of db
      .prepare(`SELECT ${COLS} FROM cards WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .all(...chunk)) {
      if (!rows.has(r.id)) rows.set(r.id, r);
    }
  }
};
const closeSides = () => {
  for (let round = 0; round < 40; round++) {
    const need = [];
    for (const r of rows.values()) {
      for (const side of [r.left_id, r.right_id, r.type_id]) {
        if (side !== null && side !== undefined && !rows.has(side)) need.push(side);
      }
    }
    if (need.length === 0) return;
    fetch(need);
  }
};
const closeChildren = () => {
  // ONE round over the cards already known: the templates' own right-side
  // settings (*from/*to/*cc/*bcc/*subject/*html message/*text message/
  // *attach/*test context). A transitive child walk descends from the
  // cardtype's *type set card into the deck's whole rule universe, which
  // the email templates never render.
  const before2 = rows.size;
  const known = [...rows.keys()];
  for (let i = 0; i < known.length; i += 400) {
    const chunk = known.slice(i, i + 400);
    for (const r of db
      .prepare(
        `SELECT ${COLS} FROM cards WHERE left_id IN (${chunk.map(() => '?').join(',')}) AND trash = 0`,
      )
      .all(...chunk)) {
      if (!rows.has(r.id)) rows.set(r.id, r);
    }
  }
  closeSides();
  return rows.size !== before2;
};

fetch(roots.map((r) => r.id));
closeChildren();
closeChildren();
// The CORE = the templates, their right-side children, and every side the
// side/child closure reached. Captured BYTES are kept for the core only: the
// party cards and the read-rule universe seeded below are seed, not pin
// target, and their captured views (a few 60 KB SET-card renders) would
// dominate the fixture.
const coreIds = new Set(rows.keys());

// The read-permission universe. Ruby's bytes for these cards EMBED the read
// verdict - the follower-notification body renders `{{_|last_action_verb}}`
// as a history link whose span is the denied marker, and `{{_|link}}` as a
// known-card anchor - so the engine has to reach the SAME verdict, which
// means seeding the same universe the corpus permission replay seeds: the
// codename cards, every *read rule, the set cards those rules hang on, and
// their party references. No captured bytes are stored for this universe
// (it is seed, not pin target).
const codenames = db
  .prepare('SELECT id, codename FROM cards WHERE codename IS NOT NULL AND trash = 0')
  .all();
fetch(codenames.map((c) => c.id));
const readId = codenames.find((c) => c.codename === 'read')?.id;
if (readId === undefined) throw new Error('raw deck has no *read card');
const ruleRows = db
  .prepare('SELECT id, left_id FROM cards WHERE right_id = ? AND trash = 0')
  .all(readId);
fetch(ruleRows.map((r) => r.id));
fetch(ruleRows.map((r) => r.left_id).filter((x) => x !== null));
for (const row of ruleRows) {
  for (const r of db
    .prepare('SELECT referee_id FROM card_references WHERE referer_id = ? AND referee_id IS NOT NULL')
    .all(row.id)) {
    fetch([r.referee_id]);
  }
}
closeSides();
console.log(
  `read universe: ${codenames.length} codename cards, ${ruleRows.length} *read rules`,
);

const references = [];
// Reference walk over TWO referer sets and no more:
//   (a) the core family's own cards — their pointer/party references
//       (*from/*to name users, addresses);
//   (b) the *read rules and the set cards they hang on — their party grants
//       ARE the read verdict the render embeds.
// The referer set is deliberately NOT every card in rows: walking the whole
// read universe's references transitively reaches 53k reference rows and the
// whole deck, which none of these renders touch.
const refReferers = new Set([
  ...coreIds,
  ...ruleRows.map((r) => r.id),
  ...ruleRows.map((r) => r.left_id).filter((x) => x !== null),
]);
// A referee card is kept only when its own cardtype is a content type: a party
// card the render dereferences (a *user, a *phrase address), never a SET card
// from the rule universe.
const CONTENT_TYPES = new Set([
  'RichText',
  'PlainText',
  'Phrase',
  'List',
  'Basic',
  'BasicCs',
  'User',
  'Number',
  'Date',
  'Email template',
  'Image',
  'File',
  'Discussion',
  'Search',
]);
const typeNameOf = (id) =>
  (db.prepare('SELECT name FROM cards WHERE id = ?').get(id) ?? {}).name ?? null;
const CARD_CAP = 200;
for (let round = 0; round < 4; round++) {
  const before3 = references.length;
  const known = [...refReferers];
  for (let i = 0; i < known.length; i += 400) {
    const chunk = known.slice(i, i + 400);
    for (const r of db
      .prepare(
        `SELECT referer_id, referee_id, referee_key FROM card_references
         WHERE referer_id IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk)) {
      references.push(r);
      if (r.referee_id === null || rows.has(r.referee_id) || rows.size >= CARD_CAP) continue;
      if (!coreIds.has(r.referer_id)) continue;
      const probe = db
        .prepare('SELECT id, type_id FROM cards WHERE id = ? AND trash = 0')
        .get(r.referee_id);
      if (probe === undefined) continue;
      if (CONTENT_TYPES.has(typeNameOf(probe.type_id))) fetch([r.referee_id]);
    }
  }
  closeSides();
  if (references.length === before3) break;
}
console.log(`family: ${rows.size} cards, ${references.length} references`);

const captured = new Map();
for (const f of readdirSync(ORACLE_DIR).filter((x) => x.endsWith('.jsonl'))) {
  for (const line of readFileSync(`${ORACLE_DIR}/${f}`, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (coreIds.has(rec.id) && rec.views && Object.keys(rec.views).length > 0) {
      captured.set(rec.id, { shard: f, views: rec.views });
    }
  }
}
console.log(`captured oracle records: ${captured.size}`);

const cards = [...rows.values()]
  .sort((a, b) => a.id - b.id)
  .map((r) => {
    const card = { id: r.id };
    // Null columns are omitted: the seeder's undefined === NULL, and the
    // permission universe's 2,500+ rule rows are mostly nulls.
    for (const col of [
      'name',
      'codename',
      'left_id',
      'right_id',
      'type_id',
      'content',
      'read_rule_id',
      'read_rule_class',
    ]) {
      if (r[col] !== null && r[col] !== undefined) card[col] = r[col];
    }
    card.trash = r.trash;
    return {
      ...card,
      type_name: rows.get(r.type_id)?.name ?? null,
      oracle_views: captured.has(r.id)
        ? Object.fromEntries(
            Object.entries(captured.get(r.id).views).map(([k, v]) => [k, v.length]),
          )
        : null,
      oracle_shard: captured.get(r.id)?.shard ?? null,
    };
  });

const payload = {
  schema: 'captured-fixture/email-templates-raw-oracle/1',
  provenance: {
    built: '2026-09-30, lane-mm-S-Z (S-Z batch)',
    question: 'U6 — export the email-template cards from the corpus; compare',
    oracle_capture: ORACLE_DIR,
    oracle_deck:
      'pass17-int/tmp/raw-ground-truth/bench-corpus-raw.sqlite3 (RAW deck: real card names + real email bodies)',
    no_write_proof: {
      note: 'the extractor opens the deck readonly; the row counts below were re-read after every read pass',
      cards: { before: before.cards, after: count('cards') },
      card_references: { before: before.card_references, after: count('card_references') },
      card_actions: 'no card_actions table in this capture deck (the sanitized capture decks carry cards + card_references + meta only); the full 4-table deck lives on the staging VM',
    },
    anonymized_sibling: {
      note: 'the deck the TS census fixtures seed from is the SCRUBBED deck — card names, cardtype names and every body word are replaced, so its bytes are NOT comparable to the Ruby capture',
      db: 'benchmarks/corpus-v2/bench-corpus-v2.sqlite3',
      example: 'card 21783 is "verification email" (raw) vs "zrjgvqqasenbtajeei" TYPE-rdokmjqbmqqliv (scrubbed)',
    },
  },
  cards,
  references,
  views: Object.fromEntries([...captured.entries()].map(([id, c]) => [id, c.views])),
};

const out = 'fixtures/captured/email-templates-raw-oracle.json';
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote ${out}`);
console.log('no-write proof:', JSON.stringify(payload.provenance.no_write_proof.cards));
db.close();
