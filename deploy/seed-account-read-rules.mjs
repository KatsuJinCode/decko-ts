// seed-account-read-rules.mjs — generate
// deploy/migrations/0009-demo-account-read-rules.sql, the READ RULES that make
// the demo deck's account substrate (0004) safe to serve.
//
// WHY IT EXISTS, in the reviewer's own reproduction. On the shipped demo deck,
// with the first-run owner created (DECKO_FIRST_RUN=1, DECKO_WRITE_PATH=1,
// after /setup), an ANONYMOUS requester could read:
//   * GET /victim+*account+*password/input   -> the PBKDF2 digest
//   * GET /victim+*account+*salt             -> the digest's salt
//   * POST /api/query {"cql":{"right":"*password"}} -> every digest
//   * POST /api/query {"cql":{"right":"*email"}}    -> every address
// Two mechanisms, ONE missing card.
//
//   * The HTML path never reached a rule walk at all. A deck with no catch-all
//     read rule has hasCatchAllReadRule=false (read-rules.ts:226-231, the
//     structural catchAll count), and canReadByRuleLookupDepth (:480) returns
//     undefined for that state — which the caller reads as ALLOWED, the
//     documented "rule-less deck" divergence. An unruled +*password or +*salt
//     field therefore rendered.
//   * The CQL permission filter was switched off wholesale by the same
//     predicate: cqlPermissionOptions (render.ts) answered `alwaysOk: true`
//     whenever the deck had no catch-all, so /api/query returned every row.
//
// The fix at the DECK level is card-mod-account-0.20.0's own rules, which the
// demo deck was missing:
//
//     - :name: "*password"
//       :codename: password
//       :fields:
//         :right:
//           :fields:
//             :read:
//               - :help_desk
//
// Wagn's real.yml loader materializes that as the card
// `*password+*right+*read` whose content names the Help Desk role, with a
// card_references row pointing at the Help Desk card. Five field cards carry
// such a `:read` field (real.yml:82-94 *account, :121-131 *email,
// :132-142 *password, :143-149 *salt, :150-160 *status), and every real deck
// also bootstraps the catch-all `*all+*read` (mod/core's cards_010) granting
// Anyone.
//
// WITH the catch-all the walk is enabled deck-wide and the five field rules are
// what deny; the catch-all is also what keeps every OTHER card of the demo
// deck readable exactly as Ruby leaves it.
//
// WHY A SEPARATE MIGRATION AND NOT MORE ROWS IN 0004. Two reasons, both
// mechanical:
//   1. Each rule is a card_references row whose referee is the Help Desk ROLE
//      card, and the roles ship in 0006 — which runs AFTER 0004. A rule row
//      written by 0004 would name a referee that does not exist yet, and the
//      read-rule cache statement (read-rules.ts:202-214) would never join it.
//      A rule with no party grants nobody — including the catch-all, which
//      would then deny the whole deck.
//   2. 0006's own header already deferred this file by name:
//      "`*account` right rules real.yml:82-117, 119-160 — the rules a role
//      would be a PARTY of. 0004 shipped the `*account` field card without
//      them and recorded why in its own NOT INCLUDED block."
//
// WHY 0009 AND NOT 0007. src/server/deploy-migrations.ts:73-75 reserves 0007:
// "0007 is skipped on purpose: seat-lineage databases record the stamp backfill
// as 0007-deck-data-version-stamp.sql ... and a second 0007 would make their
// ledgers ambiguous to read." That decision stands; this file takes the next
// free number.
//
// IDEMPOTENCE. Every INSERT is guarded:
//   * a card with a codename is guarded on `codename` — cards_codename_index
//     is UNIQUE over the column with no trash arm (db/schema.sqlite.sql:70);
//   * a junction is guarded on its (left_id, right_id) pair —
//     index_cards_on_left_id_and_right_id is UNIQUE (db/schema.sqlite.sql:69);
//   * a card_references row is guarded on (referer_id, referee_id) — THAT ONE
//     IS NEEDED HERE AND NOT IN 0004/0006, because card_references has an
//     AUTOINCREMENT id and no unique index over that pair
//     (db/schema.sqlite.sql:168-175 — its four indexes are single-column). An
//     unguarded second application would double every rule's party set.
// Applying the file twice is a no-op, and so is applying it to a database that
// already holds some of these cards under different ids.
//
// ADDITIVE ONLY. This file transforms no existing row.
//
// Run: node deploy/seed-account-read-rules.mjs   (paths resolve relative to this file).

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, "migrations", "0009-demo-account-read-rules.sql");

// Canonical timestamps, matching deploy/seed.mjs:32 and seed-account-system.mjs:89.
// Fixed, not `now`, so regenerating the file is byte-stable.
const STAMP = "2026-10-02 00:00:00.000";

/**
 * THE IDS THIS FILE CREATES. Chosen in a decade no other migration owns:
 * 0003-demo-seed uses 1..4, 0004 uses 1101..1143, 0006 uses 1201..1215.
 *
 * THE IDS THIS FILE REFERENCES, and which file owns each. These are NOT
 * resolved at generation time against a database — they are the other
 * migrations' published ids, the same way 0006 writes ID.role into every
 * role's type_id. A deck that holds these cards under DIFFERENT ids still
 * works: the (left_id, right_id) guards then insert the missing junctions
 * beside them, and the codename guard leaves the differently-id'd cards
 * alone. What cannot be recovered that way is a referee that does not exist
 * at all — hence the ordering requirement recorded in the header.
 */
const ID = {
  // created here
  read: 1301, // cards_009 — the `*read` SETTING card (name *read, codename read)
  right: 1302, // set_pattern/07_right.rb#pattern_card_name — the `*right` pattern
  allPlusRead: 1303, // cards_010 — the catch-all read rule

  // created here, one (set card, rule card) pair per account field card
  // that real.yml declares a `:right + *read` field on
  accountSet: 1304,
  accountRule: 1305,
  emailSet: 1306,
  emailRule: 1307,
  passwordSet: 1308,
  passwordRule: 1309,
  saltSet: 1310,
  saltRule: 1311,
  statusSet: 1312,
  statusRule: 1313,

  // owned by 0004-demo-account-substrate.sql
  set: 1103, //   the Set cardtype
  setting: 1104, //   the Setting cardtype
  all: 1105, //   the `*all` set card — the catch-all's left, and what
  //                statement 3's structural catchAll test subselects
  //                (read-rules.ts:226-228)
  defaultType: 1102, //   the `basic` cardtype = Card.default_type_id on this deck
  account: 1121, //   the `*account` right card
  email: 1122, //   the `*email` field card
  password: 1123, //   the `*password` field card
  salt: 1124, //   the `*salt` field card
  status: 1125, //   the `*status` field card
  deckoBot: 1130, //   the author of every row (cardio/seed.rb:106-108)

  // owned by 0006-demo-role-substrate.sql
  anyone: 1210, // real.yml:18-23 — the party the catch-all grants
  helpDesk: 1215, // real.yml:58-68 — the party every field rule grants
};

// Ruby's default type for a card whose real.yml row declares no `:type:`:
// cards_011 (`*all+*default`) has type_id 2 = the `basic` cardtype, which is
// what 0004 created at id 1102. Same resolution seed-role-substrate.mjs:186
// applies, for the same reason (a typeless real.yml entry takes the deck
// default — what Wagn's loader does, and what cards_001 shows in the fixture).
const DEFAULT_TYPE = ID.defaultType;
const AUTHOR_ID = ID.deckoBot;

function q(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * One simple (named) card. Guarded on `codename` — cards_codename_index is
 * UNIQUE over the column with no trash arm, so a trashed row with the codename
 * still blocks the insert and the guard has to see it.
 */
function namedCardSql(card) {
  return [
    `-- ${card.label}`,
    `INSERT INTO cards (`,
    `  id, name, key, codename, left_id, right_id, current_revision_id,`,
    `  created_at, updated_at, creator_id, updater_id,`,
    `  read_rule_class, read_rule_id, references_expired, trash, type_id, db_content`,
    `) SELECT`,
    `  ${q(card.id)}, ${q(card.name)}, ${q(card.key)}, ${q(card.codename)},`,
    `  NULL, NULL, NULL,`,
    `  '${STAMP}', '${STAMP}', ${AUTHOR_ID}, ${AUTHOR_ID},`,
    `  NULL, NULL, NULL, 0, ${q(card.typeId)}, ${q(card.content ?? null)}`,
    `WHERE NOT EXISTS (SELECT 1 FROM cards WHERE codename = ${q(card.codename)});`,
  ].join("\n");
}

/**
 * One junction (a set card, or a rule card hanging off one). Guarded on
 * (left_id, right_id) — index_cards_on_left_id_and_right_id is UNIQUE
 * (db/schema.sqlite.sql:69). name/key stay NULL, the 2020 Lexicon convention
 * every other migration here follows: a compound-name card is addressed
 * through its sides.
 */
function sideCardSql(card) {
  return [
    `-- ${card.label}`,
    `INSERT INTO cards (`,
    `  id, name, key, codename, left_id, right_id, current_revision_id,`,
    `  created_at, updated_at, creator_id, updater_id,`,
    `  read_rule_class, read_rule_id, references_expired, trash, type_id, db_content`,
    `) SELECT`,
    `  ${q(card.id)}, NULL, NULL, NULL,`,
    `  ${q(card.leftId)}, ${q(card.rightId)}, NULL,`,
    `  '${STAMP}', '${STAMP}', ${AUTHOR_ID}, ${AUTHOR_ID},`,
    `  NULL, NULL, NULL, 0, ${q(card.typeId)}, ${q(card.content ?? null)}`,
    `WHERE NOT EXISTS (SELECT 1 FROM cards WHERE left_id = ${q(card.leftId)} AND right_id = ${q(card.rightId)});`,
  ].join("\n");
}

/**
 * One card_references row: the PARTY a rule card grants. This is the half of a
 * rule that decides WHO may read through it. db_content is what the rule
 * EDITOR shows; card_references is the table the read-rule cache statement
 * actually joins (read-rules.ts:202-214):
 *
 *   SELECT refs.referee_id AS partyId, read_rules.id AS readRuleId
 *     FROM cards read_rules JOIN card_references refs ON refs.referer_id = read_rules.id ...
 *
 * A rule card with no card_references row grants NOBODY — including the
 * catch-all, which would then deny the entire deck. See the header's IDEMPOTENCE
 * note for why this insert needs its own guard.
 */
function rulePartyReferenceSql(ref) {
  return [
    `-- ${ref.label}`,
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)`,
    `SELECT ${q(ref.refererId)}, '', ${q(ref.refereeId)}, 'L', 1`,
    `WHERE NOT EXISTS (`,
    `  SELECT 1 FROM card_references`,
    `   WHERE referer_id = ${q(ref.refererId)} AND referee_id = ${q(ref.refereeId)}`,
    `);`,
  ].join("\n");
}

const header = [
  "-- ============================================================================",
  "-- 0009-demo-account-read-rules.sql — GENERATED by deploy/seed-account-read-rules.mjs.",
  "-- Do not edit; edit the generator.",
  "--",
  "-- WHAT THIS IS: the read rules the demo deck's account substrate needs to be",
  "-- SAFE TO SERVE. What it closes, reproduced in workerd and against a",
  "-- deployed deck with the first-run owner created: an anonymous requester",
  "-- could read the owner's PBKDF2 digest, its salt and its email address —",
  "-- on the page path AND on /api/query.",
  "--",
  "-- THE MECHANISM, one missing card, two consequences:",
  "--   * a deck with no catch-all read rule has hasCatchAllReadRule=false",
  "--     (the structural catchAll count, read-rules.ts:226-231), and",
  "--     canReadByRuleLookupDepth (:480) returns undefined for that state —",
  "--     which the caller reads as ALLOWED, the documented rule-less-deck",
  "--     divergence. An unruled +*password / +*salt field rendered.",
  "--   * the same predicate switched the CQL permission filter off wholesale",
  "--     (RenderEngine#cqlPermissionOptions), so /api/query returned every row.",
  "--",
  "-- THE RULES ARE THE GEM'S OWN, transcribed field for field from",
  "-- card-mod-account-0.20.0/data/real.yml. Each of the five field cards",
  "-- declares `:fields: :right: :fields: :read: [:help_desk]`, which Wagn's",
  "-- real.yml loader materializes as `<field>+*right+*read` with content",
  "-- [[Help Desk]]:",
  "--   * `*account`  real.yml:82-94    * `*password`  real.yml:132-142",
  "--   * `*email`    real.yml:121-131  * `*salt`      real.yml:143-149",
  "--                                * `*status`     real.yml:150-160",
  "-- Plus the catch-all `*all+*read` every real deck bootstraps",
  "-- (mod/core data/fixtures/real/cards.yml cards_010), granting Anyone —",
  "-- which is what keeps every OTHER card of the deck readable exactly as Ruby",
  "-- leaves it, and what turns the rule walk back on deck-wide.",
  "--",
  "-- APPLY AFTER 0006 (the roles) and BEFORE ANALYZE:",
  "--   npx wrangler d1 execute decko-ts --remote \\",
  "--     --file migrations/0009-demo-account-read-rules.sql",
  "--   npx wrangler d1 execute decko-ts --remote --command \"ANALYZE\"",
  "-- Apply it TWICE if you like: every INSERT is guarded (see IDEMPOTENCE below),",
  "-- so a second application is a no-op.",
  "--",
  "-- ORDERING IS LOAD-BEARING. Each rule below is a card_references row whose",
  "-- referee is the Help Desk role card, and the roles ship with 0006. Applied",
  "-- before them, every reference would name a referee that does not exist and",
  "-- read_rule_cache.rb would join nothing — a rule granting nobody, which for",
  "-- the catch-all means denying the entire deck. The lexical filename order",
  "-- puts this file after 0006 by itself; the deploy chain's manifest",
  "-- (src/server/deploy-migrations.ts) names it there too.",
  "--",
  "-- IDEMPOTENCE: each named card is guarded on `codename`",
  "-- (cards_codename_index is UNIQUE over the column, trashed rows included —",
  "-- db/schema.sqlite.sql:70) and each junction on its (left_id, right_id) pair",
  "-- (index_cards_on_left_id_and_right_id is UNIQUE — db/schema.sqlite.sql:69),",
  "-- the same two guards 0004 and 0006 use. Each card_references row adds a",
  "-- THIRD guard on (referer_id, referee_id): card_references has an",
  "-- AUTOINCREMENT id and NO unique index over that pair",
  "-- (db/schema.sqlite.sql:168-175 — its four indexes are single-column), so",
  "-- without it a second application would double every rule's party set.",
  "-- Applying to a database that already holds some of these cards under OTHER",
  "-- ids inserts only what is missing.",
  "--",
  "-- ADDITIVE ONLY: this file transforms no existing row. 0003's four cards,",
  "-- 0004's nineteen rows, 0006's role rows and every other shipped row are",
  "-- untouched. The ids created here start at 1301 precisely because 0003 owns",
  "-- 1..4, 0004 owns 1101..1143 and 0006 owns 1201..1215.",
  "--",
  "-- NOT INCLUDED, and why:",
  "--   * the `:create` / `:update` / `:delete` rules real.yml pairs with the",
  "--     same `:read` (real.yml:86-94, 125-131, 135-142, 152-160). They grant",
  "--     ADMINISTRATOR/HELP_DESK WRITE on the account fields, which is the",
  "--     signup-and-administration surface, not the anonymous-read surface this",
  "--     file exists to close — and DECKO_WRITE_PATH is off by default, so a",
  "--     write rule with no write path behind it is inert.",
  "--   * `*account`'s `:create: [:administrator]` arm, same reason.",
  "--   * the `List` cardtype for the rule cards' own type. cards_010 is",
  "--     List-typed in the fixture, but nothing in src/ reads a rule card's",
  "--     type_id: the permission statements key off the rule's LEFT being",
  "--     Set-typed (read-rules.ts:210-211) and off codenames. Every card here",
  "--     whose Ruby row declares no `:type:` takes the deck default, by the",
  "--     same rule 0004 and 0006 applied.",
  "--",
  "-- Re-generate: node deploy/seed-account-read-rules.mjs",
  "-- ============================================================================",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// THE ROWS
// ---------------------------------------------------------------------------

/** The two cards the rules themselves hang off: the `*read` setting every
 *  permission statement subselects on, and the `*right` set PATTERN that
 *  real.yml's `:right:` fields compile to. */
const settingCards = [
  {
    id: ID.read,
    name: "*read",
    key: "*read",
    codename: "read",
    typeId: ID.setting,
    label:
      "the *read setting card (cards_009) — every permission statement " +
      "subselects on this codename (read-rules.ts:209 for the read_rule_cache, " +
      ":230 for the gate count); without it both select NULL",
  },
  {
    id: ID.right,
    name: "*right",
    key: "*right",
    codename: "right",
    typeId: ID.set,
    label:
      "the *right set PATTERN card (card-1.110.0 " +
      "mod/core/set_pattern/07_right.rb#pattern_card_name) — the anchor " +
      "real.yml's `:right:` fields compile to, and what makes a " +
      "`<field>+*right` card a SET card of the fields carrying that right",
  },
];

/** The catch-all read rule, plus the five per-field rules, as the junction
 *  rows the walk composes: `<set>+*read`, where `<set>` is Set-typed so the
 *  read_rule_cache statement's `sets.type_id = SetID` filter (read-rules.ts:210-211)
 *  keeps it. */
const ruleJunctions = [
  {
    id: ID.allPlusRead,
    leftId: ID.all,
    rightId: ID.read,
    typeId: DEFAULT_TYPE,
    content: "Anyone",
    label:
      "*all+*read (cards_010) — the catch-all. Identified structurally as the " +
      "catch-all by its left being the `*all` card (read-rules.ts:226-228); " +
      "granting Anyone is what keeps every card with no more specific rule " +
      "readable, exactly as Ruby leaves it, AND what turns the rule walk on " +
      "deck-wide (without it the walk never runs at all)",
  },
  // *account — real.yml:82-94
  {
    id: ID.accountSet,
    leftId: ID.account,
    rightId: ID.right,
    typeId: ID.set,
    label:
      "*account+*right (real.yml:85 the `:right:` field) — the Set-typed set " +
      "card the rule hangs off",
  },
  {
    id: ID.accountRule,
    leftId: ID.accountSet,
    rightId: ID.read,
    typeId: DEFAULT_TYPE,
    content: "Help Desk",
    label:
      "*account+*right+*read (real.yml:89-90 `:read: [:help_desk]`) — grants " +
      "the Help Desk role and nobody else",
  },
  // *email — real.yml:121-131
  {
    id: ID.emailSet,
    leftId: ID.email,
    rightId: ID.right,
    typeId: ID.set,
    label:
      "*email+*right (real.yml:124 the `:right:` field) — the Set-typed set " +
      "card the rule hangs off",
  },
  {
    id: ID.emailRule,
    leftId: ID.emailSet,
    rightId: ID.read,
    typeId: DEFAULT_TYPE,
    content: "Help Desk",
    label:
      "*email+*right+*read (real.yml:126-127 `:read: [:help_desk]`) — grants " +
      "the Help Desk role and nobody else. The anonymous viewer's parties are " +
      "[Anyone, Anonymous] (read-rules.ts:350-353, account_holder.rb:118), " +
      "neither of which is Help Desk, so the walk denies",
  },
  // *password — real.yml:132-142
  {
    id: ID.passwordSet,
    leftId: ID.password,
    rightId: ID.right,
    typeId: ID.set,
    label:
      "*password+*right (real.yml:135 the `:right:` field) — the Set-typed set " +
      "card the rule hangs off",
  },
  {
    id: ID.passwordRule,
    leftId: ID.passwordSet,
    rightId: ID.read,
    typeId: DEFAULT_TYPE,
    content: "Help Desk",
    label:
      "*password+*right+*read (real.yml:137-138 `:read: [:help_desk]`) — the " +
      "rule that keeps the PBKDF2 digest out of anonymous reach on BOTH " +
      "surfaces",
  },
  // *salt — real.yml:143-149
  {
    id: ID.saltSet,
    leftId: ID.salt,
    rightId: ID.right,
    typeId: ID.set,
    label:
      "*salt+*right (real.yml:146 the `:right:` field) — the Set-typed set " +
      "card the rule hangs off",
  },
  {
    id: ID.saltRule,
    leftId: ID.saltSet,
    rightId: ID.read,
    typeId: DEFAULT_TYPE,
    content: "Help Desk",
    label:
      "*salt+*right+*read (real.yml:148-149 `:read: [:help_desk]`) — keeps the " +
      "digest's salt out of anonymous reach. right/salt.rb declares no " +
      "ok_to_read? override, so this rule is the ONLY thing that denies a " +
      "+*salt card",
  },
  // *status — real.yml:150-160
  {
    id: ID.statusSet,
    leftId: ID.status,
    rightId: ID.right,
    typeId: ID.set,
    label:
      "*status+*right (real.yml:153 the `:right:` field) — the Set-typed set " +
      "card the rule hangs off",
  },
  {
    id: ID.statusRule,
    leftId: ID.statusSet,
    rightId: ID.read,
    typeId: DEFAULT_TYPE,
    content: "Help Desk",
    label:
      "*status+*right+*read (real.yml:155-156 `:read: [:help_desk]`) — the " +
      "account's lifecycle state (unapproved/unverified/active/blocked) is " +
      "nobody's business but the Help Desk's",
  },
];

/** One party reference per rule card. Without these the rule cards grant
 *  NOBODY — the catch-all included, which would deny the whole deck. */
const ruleParties = [
  {
    refererId: ID.allPlusRead,
    refereeId: ID.anyone,
    label:
      "*all+*read grants Anyone (0006's id 1210) — read_rule_cache.rb's join " +
      "(read-rules.ts:202-214) reaches the rule through this row, and nothing else",
  },
  {
    refererId: ID.accountRule,
    refereeId: ID.helpDesk,
    label: "*account+*right+*read grants Help Desk (0006's id 1215)",
  },
  {
    refererId: ID.emailRule,
    refereeId: ID.helpDesk,
    label: "*email+*right+*read grants Help Desk (0006's id 1215)",
  },
  {
    refererId: ID.passwordRule,
    refereeId: ID.helpDesk,
    label: "*password+*right+*read grants Help Desk (0006's id 1215)",
  },
  {
    refererId: ID.saltRule,
    refereeId: ID.helpDesk,
    label: "*salt+*right+*read grants Help Desk (0006's id 1215)",
  },
  {
    refererId: ID.statusRule,
    refereeId: ID.helpDesk,
    label: "*status+*right+*read grants Help Desk (0006's id 1215)",
  },
];

const body =
  [
    ...settingCards.map(namedCardSql),
    ...ruleJunctions.map(sideCardSql),
    ...ruleParties.map(rulePartyReferenceSql),
  ].join("\n\n") + "\n";
const sql = header + body;

// Guard: this generator is the only place ids are assigned, so a collision
// inside the file — or with a decade another migration owns — is a programming
// error worth a loud failure rather than a database UNIQUE violation at apply
// time. A junction naming a left or right this file does not create, or a
// party reference naming a referee that is neither created here nor owned by
// 0004/0006, would insert a row nothing can ever join.
const OWNED_RANGES = [
  { from: 1, to: 4, owner: "0003-demo-seed.sql" },
  { from: 1101, to: 1143, owner: "0004-demo-account-substrate.sql" },
  { from: 1201, to: 1215, owner: "0006-demo-role-substrate.sql" },
];
const createdHere = new Set([...settingCards, ...ruleJunctions].map((c) => c.id));
const referencedElsewhere = new Map([
  [ID.all, "0004-demo-account-substrate.sql"],
  [ID.set, "0004-demo-account-substrate.sql"],
  [ID.setting, "0004-demo-account-substrate.sql"],
  [ID.account, "0004-demo-account-substrate.sql"],
  [ID.email, "0004-demo-account-substrate.sql"],
  [ID.password, "0004-demo-account-substrate.sql"],
  [ID.salt, "0004-demo-account-substrate.sql"],
  [ID.status, "0004-demo-account-substrate.sql"],
  [ID.anyone, "0006-demo-role-substrate.sql"],
  [ID.helpDesk, "0006-demo-role-substrate.sql"],
]);

const seen = new Map();
for (const card of [...settingCards, ...ruleJunctions]) {
  if (seen.has(card.id)) {
    console.error(`seed-account-read-rules: duplicate id ${card.id} (${card.label})`);
    process.exit(1);
  }
  seen.set(card.id, card.label);
  const collision = OWNED_RANGES.find((r) => card.id >= r.from && card.id <= r.to);
  if (collision !== undefined) {
    console.error(
      `seed-account-read-rules: id ${card.id} collides with ${collision.owner} ` +
        `(${collision.from}..${collision.to})`,
    );
    process.exit(1);
  }
}
const known = (id) => createdHere.has(id) || referencedElsewhere.has(id);
for (const card of ruleJunctions) {
  for (const [side, id] of [
    ["left", card.leftId],
    ["right", card.rightId],
  ]) {
    if (!known(id)) {
      console.error(
        `seed-account-read-rules: ${card.label} names a ${side} (${id}) that ` +
          `neither this file nor 0004/0006 creates`,
      );
      process.exit(1);
    }
  }
}
for (const ref of ruleParties) {
  for (const [role, id] of [
    ["referer", ref.refererId],
    ["referee", ref.refereeId],
  ]) {
    if (!known(id)) {
      console.error(
        `seed-account-read-rules: ${ref.label} names a ${role} (${id}) that ` +
          `neither this file nor 0004/0006 creates`,
      );
      process.exit(1);
    }
  }
}

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, sql, "utf8");

const bytes = statSync(TARGET).size;
console.log(
  `seed-account-read-rules: wrote ${TARGET} (${bytes} bytes, ` +
    `${settingCards.length} named + ${ruleJunctions.length} junction/field rows + ` +
    `${ruleParties.length} rule-party references)`,
);
if (bytes >= 1024 * 1024) {
  console.error("seed-account-read-rules: OVER THE 1 MB BUDGET — shrink the rules");
  process.exit(1);
}