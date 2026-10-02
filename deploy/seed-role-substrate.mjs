// seed-role-substrate.mjs — generate deploy/migrations/0006-demo-role-substrate.sql,
// the ROLE SUBSTRATE the demo-account-seeding lane (972b727) deliberately omitted.
//
// WHAT 0004 LEFT OUT, in its own words. deploy/migrations/0004-demo-account-substrate.sql:53-55
// (generated from deploy/seed-account-system.mjs:488-490) records the omission:
//
//     NOT INCLUDED, and why (also recorded in the lane receipt):
//       * roles, signup, email verification, `*account settings`, `*roles`,
//         `*signin`, the email templates. None is read by the census, the create,
//         or signinAccount.
//
// Roles are not read by the census, the create, or signinAccount — correct, and
// still the wrong reason to leave them out. The lane flagged the consequence: the
// deck has no role set at all, so the account-settings permission surface has
// nothing to grant, and src/card/permissions/read-rules.ts:236-252
// (rolePartyStatement) resolves NO roles for ANY actor because
// `lists.right_id = (SELECT id FROM cards WHERE codename = 'members')` and
// `roles.type_id = (SELECT id FROM cards WHERE codename = 'role')` both select
// NULL on a 0001..0004 deck. `alwaysOk` (read-rules.ts:314-318) is therefore
// reachable only through the Decko Bot arm (read-rules.ts:317), never through
// the Administrator arm (:318).
//
// WHAT IS IN IT — every row transcribed from card-mod-account-0.20.0/data/real.yml,
// with the gem's own line numbers in the generated comments:
//
//   * the `Role` CARDTYPE                                          real.yml:4-10
//   * `*members` — the roles list card, codename `members`        real.yml:12-13
//   * the six shipped roles:                                       real.yml:18-68
//       Anyone           real.yml:18-23
//       Anyone Signed In real.yml:24-29
//       Administrator    real.yml:30-41
//       Eagle            real.yml:42-46
//       Shark            real.yml:47-57
//       Help Desk        real.yml:58-68
//
// The ask named "Anyone, Anyone Signed In, Administrator + the roles list card".
// real.yml ships SIX roles, not three: Eagle (42-46) and Shark (47-57) sit
// between Administrator and Help Desk in the file and are the same shape
// (`:type: :role`, a codename, a description). They are Ruby-shipped rows, so
// they ship. Shipping three of six would be a partial deck pretending to be
// the gem's set.
//
// IDEMPOTENCE. Every INSERT is guarded, the same two guards 0004 uses:
//   * a card with a codename is guarded on `codename` — cards_codename_index
//     is UNIQUE over the column with no trash arm (db/schema.sqlite.sql:70),
//     so a trashed row with the codename still blocks the insert and the
//     guard has to see it;
//   * a junction is guarded on its (left_id, right_id) pair —
//     index_cards_on_left_id_and_right_id is UNIQUE (db/schema.sqlite.sql:69).
// Applying the file twice is a no-op, and so is applying it to a database that
// already holds some of these cards under different ids.
//
// ADDITIVE ONLY. This file transforms no existing row. 0003's four cards,
// 0004's nineteen rows, and every other shipped row are untouched. The ids
// below start at 1201 precisely because 0004 owns 1101..1143 and 0003 owns
// 1..4.
//
// THE ONE real.yml ROW IN THE ROLE BLOCK THIS FILE DOES NOT SHIP, and why
// (the honest gap, stated here rather than narrowed silently):
//
//     real.yml:74-80
//       - :name:
//           - :role
//           - :members
//           - :type_plus_right
//           - :update
//         :content:
//           - :help_desk
//
//   1. It cannot be materialised as written without INVENTING a card. The
//      right-hand part is `*update`, a structural set-module anchor that no
//      gem's data/real.yml declares as a card — `grep` over
//      C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/*/data/real.yml for `- :name: "*update"`
//      returns nothing, and `card-1.110.0` has no `UpdateID` constant. A
//      cards-table row needs a real right_id, so shipping this junction means
//      fabricating the `*update` card. Not done.
//   2. It would be INERT in this port even if it shipped. The `+*update` of a
//      `+*type plus right` card is the set-module registration; the port
//      resolves set modules from the STATIC mod manifests, not from that
//      card's content — src/card/mod-loader.ts:769-799 matches the manifest
//      setPath, and `type_plus_right/role/members` is registered statically at
//      src/card/mod-loader/mods/card-mod-account.ts:776-780. No statement in
//      src/ reads the content of a `+*type plus right+*update` card.
//   3. The gem's own `:content:` is wrong. `:help_desk` names no set module;
//      the module that actually backs `<Role>+*members` is
//      `type_plus_right/role/members`
//      (card-mod-account-0.20.0/set/type_plus_right/role/members.rb:1-7 —
//      `include_set Abstract::IdList`, `assign_type :list`). Transcribing the
//      literal would put a wrong value in a demo deck for no functional gain.
//
//   What the port DOES have, from the same gem file, is the registration the
//   row would have carried: card-mod-account.ts:776-780. So the role list
//   surface is present in the port exactly as far as this port can carry it.
//
// NOT INCLUDED, with line citations (all in card-mod-account-0.20.0/data/real.yml
// unless noted), because none of them is part of the ROLE substrate and each
// would drag in a second module's cards:
//   * `Anonymous`            real.yml:69-72  — 0004 already ships it (id 1131);
//                                         the guard on `codename` would no-op.
//   * `*account` + its four right rules   real.yml:82-117, 119-160 — the
//                                         permission RULES a role would be a
//                                         party of. 0004 shipped the `*account`
//                                         field card without its rule rows and
//                                         said why (0004 header, "NOT INCLUDED");
//                                         rule rows are a separate surface.
//   * `*account settings`    real.yml:162-171 — a `*right` card whose
//                                         `:structure:` names `+*roles`.
//   * `*signin`              real.yml:270-276 — a `*right` with `:update: Anyone`.
//   * `*roles`               real.yml:277-285 — the account's roles FIELD
//                                         (`:input_type: checkbox` + a
//                                         search_type content_options JSON).
//                                         Shipping the field without a
//                                         `*members` write path would give the
//                                         demo a checkbox that saves nothing.
//   * `*enabled roles`       real.yml:288-289 — the DISABLED-roles list, the
//                                         flip side (set/type/role.rb:3-5
//                                         `disabled?` reads it, and
//                                         card-mod-account.ts:319-331 renders the
//                                         checkbox against it). Not the grant
//                                         path.
//   * `*account links`       real.yml:290-291 — card-mod-account's own
//                                         navigation, not a role.
//   * the `List` cardtype    card-1.110.0 mod/core/data/fixtures/real/cards.yml
//                                         cards_004 — `*members` is declared
//                                         with no `:type:` in real.yml:12-13, so
//                                         per the same rule 0004 applied to
//                                         `Anonymous` it takes the deck DEFAULT
//                                         type, not `List`. See DEFAULT_TYPE
//                                         below.
//
// OUTPUT: plain SQL for
// `wrangler d1 execute --file migrations/0006-demo-role-substrate.sql`.
// Run AFTER 0004 and BEFORE `ANALYZE`. Apply twice is a no-op.
//
// Run: node deploy/seed-role-substrate.mjs   (paths resolve relative to this file).

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, "migrations", "0006-demo-role-substrate.sql");

// Canonical timestamp, matching deploy/seed-account-system.mjs:89 and
// deploy/seed.mjs's convention. Fixed, not `now`, so regenerating the file is
// byte-stable.
const STAMP = "2026-10-02 00:00:00.000";

// ---------------------------------------------------------------------------
// ID BLOCK — continuing 0004's offset scheme
// ---------------------------------------------------------------------------
//
// 0004 documents its own scheme (seed-account-system.mjs:122-143): Ruby's seed
// fixture uses ids 1..11, 0003-demo-seed.sql owns 1..4, so 0004 took the
// 1100 decade and every consumer resolves these cards BY CODENAME, never by
// number (actor.ts:74-87, signin.ts:124-138, first-run-setup.ts:718). This file
// takes the NEXT decade, 1200, so the two files cannot collide and a reader can
// tell at a glance which migration a row came from. The relationships are the
// part that carries meaning and they are exact: `Administrator`'s type_id below
// is the same relation Ruby has, `<Role>+*members` is `<Role>` on the left and
// `*members` on the right.
const ID = {
  role: 1201, // real.yml:4-10 — the Role cardtype
  members: 1202, // real.yml:12-13 — the roles list card
  anyone: 1210, // real.yml:18-23
  anyoneSignedIn: 1211, // real.yml:24-29
  administrator: 1212, // real.yml:30-41
  eagle: 1213, // real.yml:42-46
  shark: 1214, // real.yml:47-57
  helpDesk: 1215, // real.yml:58-68
};

// The `role` codename card is what `rolePartyStatement`'s type filter resolves
// (read-rules.ts:247-248). Its id is written into every role's type_id below —
// the join the whole role surface hangs off.
const ROLE_TYPE = ID.role;

// The deck DEFAULT type, resolved exactly as 0004 resolved it
// (seed-account-system.mjs:170-175): cards_011 (`*all+*default`) has type_id 2 =
// the `basic` cardtype, so `Card.default_type_id` on this deck is the `basic`
// cardtype 0004 created at id 1102. Every card whose Ruby row declares no
// `:type:` takes it, which is what Wagn's real.yml loader does for a typeless
// entry and what cards_001 (Decko Bot, type_id 2) shows in the fixture. The
// AUTHOR of every row is 0004's Decko Bot card (id 1130), the same
// cardio/seed.rb:106-108 stamp 0004 applied.
const DEFAULT_TYPE = 1102;
const AUTHOR_ID = 1130;

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

const header = [
  "-- ============================================================================",
  "-- 0006-demo-role-substrate.sql — GENERATED by deploy/seed-role-substrate.mjs.",
  "-- Do not edit; edit the generator.",
  "--",
  "-- WHAT THIS IS: the role substrate the demo-account-seeding lane (972b727)",
  "-- deliberately omitted. 0004 shipped the account system and said so in its",
  "-- own header (0004:53-55, generated from seed-account-system.mjs:488-490):",
  "-- \"NOT INCLUDED ... roles ... None is read by the census, the create, or",
  "-- signinAccount.\" That is true and it is the wrong reason: the deck then has",
  "-- no role set at all, so the account permission surface has nothing to grant.",
  "-- Concretely, src/card/permissions/read-rules.ts:236-252 (rolePartyStatement,",
  "-- the port of Self::Role.generate_rolehash, card-mod-account",
  "-- set/self/role.rb:33-40) resolves NO roles for ANY actor, because",
  "-- `lists.right_id = (SELECT id FROM cards WHERE codename = 'members')`",
  "-- (:244-245) and `roles.type_id = (SELECT id FROM cards WHERE codename =",
  "-- 'role')` (:247-248) both select NULL on a 0001..0004 deck. alwaysOk",
  "-- (read-rules.ts:314-318) is then reachable only through the Decko Bot arm",
  "-- (:317), never through the Administrator arm (:318).",
  "--",
  "-- EVERY ROW IS TRANSCRIBED FROM card-mod-account-0.20.0/data/real.yml, with",
  "-- the gem's own line numbers in the comment above each INSERT:",
  "--   * the Role CARDTYPE                              real.yml:4-10",
  "--   * `*members`, the roles list card, codename",
  "--     `members`                                      real.yml:12-13",
  "--   * Anyone                (role)                   real.yml:18-23",
  "--   * Anyone Signed In      (role)                   real.yml:24-29",
  "--   * Administrator         (role)                   real.yml:30-41",
  "--   * Eagle                 (role)                   real.yml:42-46",
  "--   * Shark                 (role)                   real.yml:47-57",
  "--   * Help Desk             (role)                   real.yml:58-68",
  "-- Six roles ship because real.yml ships six. The lane brief named three",
  "-- (Anyone, Anyone Signed In, Administrator); Eagle and Shark are the same",
  "-- shape in the same file and three of six would be a partial deck wearing",
  "-- the gem's name.",
  "--",
  "-- APPLY AFTER 0004 and BEFORE ANALYZE:",
  "--   npx wrangler d1 execute decko-ts --remote \\",
  "--     --file migrations/0006-demo-role-substrate.sql",
  "--   npx wrangler d1 execute decko-ts --remote --command \"ANALYZE\"",
  "-- Apply it TWICE if you like: every INSERT is guarded (see IDEMPOTENCE below),",
  "-- so a second application is a no-op.",
  "--",
  "-- IDEMPOTENCE: each named card is guarded on `codename`",
  "-- (cards_codename_index is UNIQUE over the column, trashed rows included —",
  "-- db/schema.sqlite.sql:70) exactly as 0004 guards its rows. Applying to a",
  "-- database that already holds some of these cards under OTHER ids inserts",
  "-- only what is missing.",
  "--",
  "-- ADDITIVE ONLY: this file transforms no existing row. 0003's four cards,",
  "-- 0004's nineteen rows and every other shipped row are untouched. The ids",
  "-- below start at 1201 because 0004 owns 1101..1143 and 0003 owns 1..4 — the",
  "-- next decade of 0004's offset scheme (seed-account-system.mjs:122-143), so",
  "-- neither file can collide with the other and a reader can tell which",
  "-- migration a row came from.",
  "--",
  "-- ONE real.yml ROW IN THE ROLE BLOCK IS NOT SHIPPED — real.yml:74-80, the",
  "-- `[:role, :members, :type_plus_right, :update]` set-module registration:",
  "--   1. It cannot be materialised as written without INVENTING a card. Its",
  "--      right part is `*update`, a structural set-module anchor that no gem's",
  "--      data/real.yml declares as a card (grep for `- :name: \"*update\"` over",
  "--      C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/*/data/real.yml returns nothing)",
  "--      and card-1.110.0 has no UpdateID constant. A cards row needs a real",
  "--      right_id, so shipping it means fabricating the `*update` card.",
  "--   2. It would be INERT here even if it shipped. That `+*update` field is",
  "--      where a Ruby deck records which set module a type+right pair gets;",
  "--      this port resolves set modules from the STATIC mod manifests",
  "--      (src/card/mod-loader.ts:769-799 matches the manifest setPath), and",
  "--      `type_plus_right/role/members` is registered statically at",
  "--      src/card/mod-loader/mods/card-mod-account.ts:776-780. No statement in",
  "--      src/ reads the content of a `+*type plus right+*update` card.",
  "--   3. The gem's own content is wrong: `:help_desk` (real.yml:80) names no",
  "--      set module. The module that backs `<Role>+*members` is",
  "--      `type_plus_right/role/members`",
  "--      (card-mod-account-0.20.0/set/type_plus_right/role/members.rb:1-7 —",
  "--      `include_set Abstract::IdList`, `assign_type :list`).",
  "-- The port therefore HAS the registration the row would have carried, from",
  "-- the same gem file (card-mod-account.ts:776-780), and the role list surface",
  "-- is present exactly as far as this port can carry it.",
  "--",
  "-- ALSO NOT INCLUDED, each with its real.yml line, because none is part of the",
  "-- ROLE substrate and each drags a second module's cards with it:",
  "--   * `Anonymous`          real.yml:69-72  — 0004 already ships it (id 1131);",
  "--                                       the `codename` guard would no-op.",
  "--   * `*account` right rules  real.yml:82-117, 119-160 — the rules a role",
  "--                                       would be a PARTY of. 0004 shipped",
  "--                                       the `*account` field card without",
  "--                                       them and recorded why in its own",
  "--                                       NOT INCLUDED block.",
  "--   * `*account settings`  real.yml:162-171",
  "--   * `*signin`            real.yml:270-276",
  "--   * `*roles`             real.yml:277-285 — the account's roles FIELD",
  "--                                       (`:input_type: checkbox` plus a",
  "--                                       search_type content_options JSON).",
  "--                                       Shipping the field with no",
  "--                                       `*members` write path would give the",
  "--                                       demo a checkbox that saves nothing.",
  "--   * `*enabled roles`     real.yml:288-289 — the DISABLED-roles list, the",
  "--                                       flip side (set/type/role.rb:3-5",
  "--                                       `disabled?` reads it). Not the",
  "--                                       grant path.",
  "--   * `*account links`     real.yml:290-291 — card-mod-account's own",
  "--                                       navigation, not a role.",
  "--   * the `List` cardtype  card-1.110.0 mod/core/data/fixtures/real/cards.yml",
  "--                                       cards_004 — `*members` is declared",
  "--                                       with no `:type:` at real.yml:12-13, so",
  "--                                       by the same rule 0004 applied to",
  "--                                       `Anonymous` it takes the deck DEFAULT",
  "--                                       type, not List.",
  "--",
  "-- NEW, NOT RUBY: nothing in this file. Every row above is a transcription.",
  "-- What IS port-specific is the ID BLOCK, for the reason given above.",
  "--",
  "-- Re-generate: node deploy/seed-role-substrate.mjs",
  "-- ============================================================================",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// THE ROWS
// ---------------------------------------------------------------------------
//
// `description` values are the gem's `:description:` block scalars transcribed
// with Ruby's `|-` semantics (the final newline stripped, interior newlines and
// the trailing space on real.yml:9 kept — `|-` only strips the LAST newline).
// They are inert until a card is SAVED (the reference events run on
// `:save, changed: :content`, lib/card/reference/all.rb:47-50), so an INSERT
// here writes no card_references row. When a save does happen, the references
// the descriptions name are the ones Ruby would make: `[[_left+:members|...]]`
// self-references are skipped (all.rb:93), and the external decko.org links are
// explicit-resource links that carry no reference (link.rb:82-83).
const ROLES = [
  {
    id: ID.role,
    name: "Role",
    key: "role",
    codename: "role",
    typeId: ID.role, // `:type: :cardtype` (real.yml:5) — a cardtype is self-typed,
    // the shape cards_003 / cards_006 show in the core fixture
    content:
      "Each [[user]] can be given roles to organize site permissions. \n" +
      "[[http://decko.org/Role|Learn more about roles]].",
    label:
      "the Role cardtype (real.yml:4-10) — `:type: :cardtype` so it is " +
      "self-typed like cards_003; every role's type_id below is this row's id, " +
      "which is the `role` codename read-rules.ts:247-248 filters on",
  },
  {
    id: ID.members,
    name: "*members",
    key: "*members",
    codename: "members",
    typeId: DEFAULT_TYPE, // real.yml:12-13 declares no `:type:`
    label:
      "the `*members` roles list card (real.yml:12-13) — the right part of " +
      "every `<Role>+*members` row, and the `members` codename " +
      "read-rules.ts:244-245 filters on (Self::Role.generate_rolehash, " +
      "set/self/role.rb:33-40, searches `right_id: MembersID`); " +
      "set/type_plus_right/role/members.rb:1-7 is what makes it an IdList",
  },
  {
    id: ID.anyone,
    name: "Anyone",
    key: "anyone",
    codename: "anyone",
    typeId: ROLE_TYPE,
    content:
      "Everyone has this role, whether signed in or not. " +
      "[[http://decko.org/account|more]]",
    label:
      "the Anyone role (real.yml:18-23) — the party read-rules.ts:303,320 puts " +
      "first in every signed-in viewer's party list",
  },
  {
    id: ID.anyoneSignedIn,
    name: "Anyone Signed In",
    key: "anyone_signed_in",
    codename: "anyone_signed_in",
    typeId: ROLE_TYPE,
    content:
      "Anyone who is signed in has this role. " +
      "[[http://decko.org/account|more]]",
    label:
      "the Anyone Signed In role (real.yml:24-29) — the party " +
      "read-rules.ts:321 pushes second for a signed-in viewer, the port of " +
      "account_holder.rb:111-113 `[AnyoneSignedInID] + ...`",
  },
  {
    id: ID.administrator,
    name: "Administrator",
    key: "administrator",
    codename: "administrator",
    typeId: ROLE_TYPE,
    content:
      "[[_left+:members|Administrators]] can create, read, update and delete " +
      "any card.\n[[http://decko.org/permissions|more]]",
    label:
      "the Administrator role (real.yml:30-41) — the role whose membership sets " +
      "alwaysOk (read-rules.ts:305, :314-318, the port of auth/permissions.rb:8-13 " +
      "`always_ok?` -> account_holder.rb:63-65 `role? AdministratorID`)",
  },
  {
    id: ID.eagle,
    name: "Eagle",
    key: "eagle",
    codename: "eagle",
    typeId: ROLE_TYPE,
    content: "[[Eagle+:members|Eagle users]] can add and edit content.",
    label:
      "the Eagle role (real.yml:42-46) — the third of the six roles real.yml " +
      "ships; the brief named three roles, the gem has six",
  },
  {
    id: ID.shark,
    name: "Shark",
    key: "shark",
    codename: "shark",
    typeId: ROLE_TYPE,
    content:
      "[[_left+:members|Shark users]] can configure the deck and create " +
      "structures.",
    label:
      "the Shark role (real.yml:47-57) — the fourth of the six; real.yml:53-57 " +
      "gives it a `:members: :fields: :self: :fields: :update: Administrator` " +
      "block, i.e. a nested rule over the member list, not card data, and this " +
      "file ships no rule rows (see the NOT INCLUDED block above)",
  },
  {
    id: ID.helpDesk,
    name: "Help Desk",
    key: "help_desk",
    codename: "help_desk",
    typeId: ROLE_TYPE,
    content:
      "[[_left+*members|Help Desk users]] can manage accounts and edit help " +
      "text.",
    label:
      "the Help Desk role (real.yml:58-68) — the fifth of the six, and the role " +
      "real.yml:74-80's (unshipped) `+*update` registration names; its " +
      "`:members: :fields: :self: :fields: :update: Administrator` block " +
      "(real.yml:64-68) is a nested rule, not card data",
  },
];

const body = ROLES.map(namedCardSql).join("\n\n") + "\n";
const sql = header + body;

// Guard: this generator is the only place ids are assigned, so a collision
// inside the file — or with the decade 0004 owns — is a programming error worth
// a loud failure rather than a database UNIQUE violation at apply time.
const seen = new Map();
for (const card of ROLES) {
  if (seen.has(card.id)) {
    console.error(`seed-role-substrate: duplicate id ${card.id} (${card.label})`);
    process.exit(1);
  }
  seen.set(card.id, card.label);
  // 0003 owns 1..4 (0004's own guard, seed-account-system.mjs:517-522) and
  // 0004 owns 1101..1143 (read off deploy/migrations/0004-demo-account-substrate.sql).
  if (card.id <= 4 || (card.id >= 1101 && card.id <= 1143)) {
    console.error(
      `seed-role-substrate: id ${card.id} collides with 0003-demo-seed.sql (1..4) ` +
        `or 0004-demo-account-substrate.sql (1101..1143)`,
    );
    process.exit(1);
  }
}

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, sql, "utf8");

const bytes = statSync(TARGET).size;
console.log(
  `seed-role-substrate: wrote ${TARGET} (${bytes} bytes, ${ROLES.length} named cards)`,
);
if (bytes >= 1024 * 1024) {
  console.error("seed-role-substrate: OVER THE 1 MB BUDGET — shrink the substrate");
  process.exit(1);
}
