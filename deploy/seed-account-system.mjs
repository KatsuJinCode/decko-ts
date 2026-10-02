// seed-account-system.mjs — generate deploy/migrations/0004-demo-account-substrate.sql,
// the ACCOUNT SUBSTRATE a fresh demo deck needs before the first-run journey can
// run at all.
//
// WHY IT EXISTS (the blocker, in one paragraph). The first-run lane
// (35e7b93, docs/first-run-demo-profile.md) built /setup and named what it
// cannot fix by code: the deploy deck's content chain ships no account system,
// so `setupWindowState` answers `account_system_absent`, `/setup` 404s with
// "This deck has no account system", and signin has no actor cards to
// authenticate. The engine has no mod-seeding capability, so the substrate has
// to arrive as deck DATA. This generator is that data.
//
// WHAT IS IN IT, and where each card comes from:
//
//   A. DECK BOOTSTRAP — the type skeleton, from the CORE gem
//      (card-1.110.0). NOT card-mod-account content, and NOT invented here:
//      `Card.default_type_id` (lib/card/director/card_class.rb; the port is
//      src/card/actions/type-resolution.ts:351-356) is the type_id of the
//      `*all+*default` rule row, and that is how ANY card the setup flow
//      creates gets a type. A deck without the row cannot create a card at all,
//      so without this block the /setup create aborts for a reason that has
//      nothing to do with accounts. Every row is transcribed from
//      mod/core/data/real.yml and/or the shipped seed fixture
//      mod/core/data/fixtures/real/cards.yml (loaded by db/seeds.rb through
//      Cardio::Seed.load — the fixture IS a real deck's card table).
//
//   B. THE ACCOUNT SUBSTRATE — from card-mod-account-0.20.0/data/real.yml:
//      the `*account` right card and its four field cards (*email, *password,
//      *salt, *status), the `User` cardtype the owner is created as, the two
//      system-actor cards (Decko Bot, Anonymous), and Decko Bot's `+*account`
//      junction with the three field children the port's create-time events
//      generate for it.
//
// TWO THINGS THE ASK GOT LOOSE ON, resolved against the Ruby source and
// disclosed in the generated header:
//
//   1. "DeckoBot + Anonymous account cards (type User with +*account
//      junctions...)". Ruby types BOTH system actors with the deck DEFAULT
//      type, not User: mod/core/data/fixtures/real/cards.yml cards_001 gives
//      Decko Bot type_id 2 (Rich Text), and card-mod-account's real.yml gives
//      Anonymous no `:type:` at all. `User` is the type of a SETUP-CREATED
//      owner (card-mod-account set/all/account.rb:3-5
//      `default_accounted_type_id = UserID`), never of the two seeded actors.
//      Typed as Ruby types them.
//
//   2. An `+*account` JUNCTION for Anonymous. card-mod-account's real.yml does
//      not declare one, and card-mod-account set/self/anonymous.rb:3-6
//      overrides the accessors to say there is not one:
//
//          include_set Abstract::AccountHolder
//          def account;  nil;        end
//          def account?; false;      end
//
//      So a stock Ruby deck's `+*account` census set is Decko Bot's row. Only
//      that row ships here. (The port's own first-run FIXTURE seeds two —
//      tests/card/auth/first-run-setup.test.ts:159-160 — which is a fixture
//      choice, not oracle truth; the census excludes both holders either way,
//      so the journey's result is identical. Pinned by the journey test.)
//
// IDEMPOTENCE. Every INSERT is guarded:
//   * a card with a codename is guarded on `codename` — cards_codename_index
//     is UNIQUE and covers trashed rows too, so the guard must too;
//   * a junction or field child is guarded on its (left_id, right_id) pair —
//     index_cards_on_left_id_and_right_id is UNIQUE (db/schema.sqlite.sql:69).
// Applying the file twice is therefore a no-op, and so is applying it to a
// database that already has SOME of these cards under different ids. That is
// the case this file is designed for: a demo database provisioned by the old
// 0001..0003 chain, which is exactly the situation migrations/0002's header
// describes for already-provisioned databases.
//
// OUTPUT: plain SQL for `wrangler d1 execute --file migrations/0004-demo-account-substrate.sql`.
// Run AFTER 0003 (ids do not collide — see the ID BLOCK below — so it is
// order-independent) and BEFORE `ANALYZE`, so the planner stats cover the new
// rows. Apply twice is a no-op.
//
// Run: node deploy/seed-account-system.mjs   (paths resolve relative to this file).

import { createHash } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, "migrations", "0004-demo-account-substrate.sql");

// Canonical timestamps, matching deploy/seed.mjs:32's convention. Fixed, not
// `now`, so regenerating the file is byte-stable and a second application
// cannot be distinguished from a first by its content.
const STAMP = "2026-10-02 00:00:00.000";

/**
 * The salt Decko Bot's +*account carries, computed the way Ruby computes it
 * rather than hand-written.
 *
 * card-mod-account set/right/account/events.rb:3-5 runs
 * `set_default_salt` on every `+*account` CREATE, which calls
 * `field(:salt).generate`; set/right/salt.rb:5-7 is
 * `Digest::SHA1.hexdigest "--#{Time.zone.now}--"`. The port reproduces the same
 * derivation in src/card/auth/first-run-setup.ts:704-705
 * (`sha1Hex(`--${rubyTimestamp(now)}--`)`), so the same input string shape is
 * used here: Ruby Time#to_s for a UTC Time, "YYYY-MM-DD HH:MM:SS UTC".
 *
 * The seeder's exact instant is not recoverable from the gem, and does not
 * matter: what a reader needs is the SHAPE (40-char lowercase hex) and the
 * derivation that produced it, and both are here. A hand-pinned hex would be a
 * fabricated oracle value; this is the value the event's own formula yields for
 * this file's STAMP.
 */
const SEED_INSTANT_UTC = new Date("2026-10-02T00:00:00.000Z");
const SALT_INPUT = `--${rubyToS(SEED_INSTANT_UTC)}--`;
const SALT = createHash("sha1").update(SALT_INPUT, "utf8").digest("hex");

/** Ruby's Time#to_s for a UTC Time (first-run-setup.ts:792-798). */
function rubyToS(when) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${when.getUTCFullYear()}-${p(when.getUTCMonth() + 1)}-${p(when.getUTCDate())} ` +
    `${p(when.getUTCHours())}:${p(when.getUTCMinutes())}:${p(when.getUTCSeconds())} UTC`
  );
}

// ---------------------------------------------------------------------------
// ID BLOCK — why these ids and not Ruby's
// ---------------------------------------------------------------------------
//
// Ruby's seed fixture uses ids 1..11 (cards_001..cards_011). Those ids are
// TAKEN on a deploy database: 0003-demo-seed.sql is db/seed.sql verbatim and
// uses ids 1 (Home), 2 (Hello World), 3 (the Home+Hello World junction) and 4
// (About). Ids are deck-local and every consumer in the port resolves these
// cards BY CODENAME, never by number:
//
//   * the system actors — actor.ts:74-87, `actorByCodename`, and the gem's own
//     mechanism behind it (card-1.110.0/lib/card/codename.rb:108
//     `const_get_or_set("DeckoBotID") { id }` over codename "decko_bot");
//   * the account field cards — signin.ts:124-138, `resolveAccountCodenameIds`;
//   * the `User` cardtype the owner is created as — first-run-setup.ts:718.
//
// So the ids below are an OFFSET of Ruby's, chosen in a block no shipped row
// occupies (100+). Reusing 1..11 would collide with 0003's Home card and make
// this file a destructive edit to existing seed rows, which the lane forbids.
// The RELATIONSHIPS are the part that carries meaning and they are exact:
// `*all+*default` here is (1105, 1106) pointing at the `*all` and `*default`
// cards, exactly as cards_011 is (7, 8) pointing at cards_007 and cards_008.

const ID = {
  // A. deck bootstrap — card-1.110.0
  cardtype: 1101, // cards_003 / real.yml:13-18
  richText: 1102, // cards_002 (name RichText, key rich_text, codename basic)
  set: 1103, // cards_005
  setting: 1104, // cards_006 / real.yml:29-31
  all: 1105, // cards_007 / real.yml:50-53
  default: 1106, // cards_008
  allPlusDefault: 1107, // cards_011 — Card.default_type_id is THIS row's type_id

  // B. account substrate — card-mod-account-0.20.0
  user: 1120, // core real.yml:41-46 (the type the owner is created as)
  account: 1121, // real.yml:80-81
  email: 1122, // real.yml:121-122
  password: 1123, // real.yml:132-133
  salt: 1124, // real.yml:143-144
  status: 1125, // real.yml:150-151
  deckoBot: 1130, // core real.yml:17-19 / cards_001
  anonymous: 1131, // real.yml "Anonymous" (codename anonymous)
  botAccount: 1140, // real.yml: the [:decko_bot, :account] junction
  botEmail: 1141, //   its :email: no-reply@decko.org field child
  botSalt: 1142, //   +*salt, from set_default_salt (events.rb:3-5)
  botStatus: 1143, //   +*status, from set_default_status (events.rb:7-9)
};

// Ruby's default type for this file's cards: cards_011 (`*all+*default`) has
// type_id 2 = the `basic` cardtype, so Card.default_type_id on this deck is
// ID.richText. Every card whose Ruby row declares no `:type:` is typed with it,
// which is what Wagn's real.yml loader does for a typeless entry and what
// cards_001 (Decko Bot, type_id 2) shows in the fixture.
const DEFAULT_TYPE = ID.richText;

function q(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * One simple (named) card. Guarded on `codename`: cards_codename_index is
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
    `  '${STAMP}', '${STAMP}', ${q(card.authorId)}, ${q(card.authorId)},`,
    `  NULL, NULL, NULL, 0, ${q(card.typeId)}, ${q(card.content ?? null)}`,
    `WHERE NOT EXISTS (SELECT 1 FROM cards WHERE codename = ${q(card.codename)});`,
  ].join("\n");
}

/**
 * One junction or field child. Guarded on (left_id, right_id), the pair
 * index_cards_on_left_id_and_right_id makes UNIQUE (db/schema.sqlite.sql:69).
 * name/key stay NULL, which is the 2020 Lexicon convention the deploy seed's
 * own header records: a compound-name card is addressed through its sides, and
 * the engine writes them that way too (first-run-setup.test.ts:196-206 reads
 * the created field children by (left_id, right_id), not by name).
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
    `  '${STAMP}', '${STAMP}', ${q(card.authorId)}, ${q(card.authorId)},`,
    `  NULL, NULL, NULL, 0, ${q(card.typeId)}, ${q(card.content ?? null)}`,
    `WHERE NOT EXISTS (SELECT 1 FROM cards WHERE left_id = ${q(card.leftId)} AND right_id = ${q(card.rightId)});`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// A. DECK BOOTSTRAP — the type skeleton
// ---------------------------------------------------------------------------
//
// Everything below is authored by the bot: card-1.110.0/cardio/seed.rb:106-108
// stamps `author_id = Card::DeckoBotID` on every seeded card, and the fixture
// rows all carry creator_id 1 / updater 1 with Decko Bot at id 1. Here the
// author is the Decko Bot card this file itself creates (ID.deckoBot), which
// is the same statement with the id resolved locally.

const bootstrapCards = [
  {
    id: ID.cardtype,
    name: "Cardtype",
    key: "cardtype",
    codename: "cardtype",
    typeId: ID.cardtype, // self-typed, as in every real deck
    label: "the Cardtype cardtype (real.yml:13-18; cards_003)",
  },
  {
    id: ID.richText,
    name: "RichText",
    key: "rich_text",
    codename: "basic",
    typeId: ID.cardtype,
    label: "the `basic` cardtype (cards_002) — the deck's default type target",
  },
  {
    id: ID.set,
    name: "Set",
    key: "set",
    codename: "set",
    typeId: DEFAULT_TYPE,
    label: "the Set cardtype (cards_005) — `*all` must BE a Set for the rule walk",
  },
  {
    id: ID.setting,
    name: "Setting",
    key: "setting",
    codename: "setting",
    typeId: ID.cardtype,
    label: "the Setting cardtype (real.yml:29-31; cards_006) — `*default` is Setting-typed",
  },
  {
    id: ID.all,
    name: "*all",
    key: "*all",
    codename: "all",
    typeId: ID.set,
    content: "{}",
    label: "the *all set card (real.yml:50-53; cards_007, content \"{}\")",
  },
  {
    id: ID.default,
    name: "*default",
    key: "*default",
    codename: "default",
    typeId: ID.setting,
    label: "the *default rule right card (cards_008)",
  },
];

const bootstrapSides = [
  {
    id: ID.allPlusDefault,
    leftId: ID.all,
    rightId: ID.default,
    typeId: DEFAULT_TYPE,
    label:
      "*all+*default (cards_011) — Card.default_type_id IS this row's type_id " +
      "(type-resolution.ts:351-356); without it the engine cannot type a new card",
  },
];

// ---------------------------------------------------------------------------
// B. THE ACCOUNT SUBSTRATE
// ---------------------------------------------------------------------------

// The Anonymous card's content, transcribed from card-mod-account-0.20.0
// data/real.yml (the "Anonymous" entry). HTML, not member data.
const ANONYMOUS_CONTENT =
  "<p>Edits made by people who are not signed in are credited to Anonymous. " +
  "<a href=\"http://decko.org/account\">Learn more about accounts</a>.</p>";

// Decko Bot's content, transcribed from card-1.110.0 mod/core/data/real.yml:17-21.
const DECKO_BOT_CONTENT =
  "<p>\n  This is the account that makes any automated updates &mdash; cards\n" +
  "  created when someone signs up, link updates when renaming cards, etc.\n</p>";

// The email real.yml gives Decko Bot's account, verbatim: the
// `[:decko_bot, :account]` entry's `:email:` key. A public no-reply address
// from the gem, not member content.
const DECKO_BOT_EMAIL = "no-reply@decko.org";

const accountCards = [
  {
    id: ID.user,
    name: "User",
    key: "user",
    codename: "user",
    typeId: ID.cardtype,
    label:
      "the User cardtype (core real.yml:41-46) — set/all/account.rb:3-5 " +
      "`default_accounted_type_id = UserID`, so the setup-created owner is typed User",
  },
  {
    id: ID.account,
    name: "*account",
    key: "*account",
    codename: "account",
    typeId: DEFAULT_TYPE,
    label: "the *account right card (real.yml:80-81) — the junction's right part",
  },
  {
    id: ID.email,
    name: "*email",
    key: "*email",
    codename: "email",
    typeId: DEFAULT_TYPE,
    label: "the +*email field card (real.yml:121-122) — right/account.rb:5 card_accessor :email",
  },
  {
    id: ID.password,
    name: "*password",
    key: "*password",
    codename: "password",
    typeId: DEFAULT_TYPE,
    label: "the +*password field card (real.yml:132-133) — right/account.rb:6 card_accessor :password",
  },
  {
    id: ID.salt,
    name: "*salt",
    key: "*salt",
    codename: "salt",
    typeId: DEFAULT_TYPE,
    label: "the +*salt field card (real.yml:143-144) — right/account.rb:7 card_accessor :salt",
  },
  {
    id: ID.status,
    name: "*status",
    key: "*status",
    codename: "status",
    typeId: DEFAULT_TYPE,
    label: "the +*status field card (real.yml:150-151) — right/account.rb:8 card_accessor :status",
  },
  {
    id: ID.deckoBot,
    name: "Decko Bot",
    key: "decko_bot",
    codename: "decko_bot",
    typeId: DEFAULT_TYPE, // cards_001 type_id 2 — the deck default, NOT User
    content: DECKO_BOT_CONTENT,
    label: "the Decko Bot actor card (core real.yml:17-21; cards_001)",
  },
  {
    id: ID.anonymous,
    name: "Anonymous",
    key: "anonymous",
    codename: "anonymous",
    typeId: DEFAULT_TYPE, // real.yml declares no :type: for it
    content: ANONYMOUS_CONTENT,
    label: "the Anonymous actor card (card-mod-account real.yml) — cards.yml does not carry it",
  },
];

const accountSides = [
  {
    id: ID.botAccount,
    leftId: ID.deckoBot,
    rightId: ID.account,
    typeId: DEFAULT_TYPE,
    label:
      "Decko Bot+*account (real.yml's [:decko_bot, :account] entry) — the one " +
      "seeded +*account row the census excludes; Anonymous gets none, per " +
      "set/self/anonymous.rb:3-6 (`def account; nil; end`)",
  },
  {
    id: ID.botEmail,
    leftId: ID.botAccount,
    rightId: ID.email,
    content: DECKO_BOT_EMAIL,
    typeId: DEFAULT_TYPE,
    label: "its +*email (real.yml `:email: no-reply@decko.org`)",
  },
  {
    id: ID.botSalt,
    leftId: ID.botAccount,
    rightId: ID.salt,
    content: SALT,
    typeId: DEFAULT_TYPE,
    label:
      "its +*salt — set_default_salt (right/account/events.rb:3-5) runs on every " +
      `+*account CREATE; right/salt.rb:5-7 is Digest::SHA1.hexdigest "--<t>--", so this is SHA-1("${SALT_INPUT}")`,
  },
  {
    id: ID.botStatus,
    leftId: ID.botAccount,
    rightId: ID.status,
    content: "active",
    typeId: DEFAULT_TYPE,
    label:
      "its +*status — set_default_status (right/account/events.rb:7-9) writes " +
      "`accounted&.try(:default_account_status) || \"active\"`; " +
      "abstract/account_holder.rb:24-26 is `def default_account_status; \"active\"; end`",
  },
];

const header = [
  "-- ============================================================================",
  "-- 0004-demo-account-substrate.sql — GENERATED by deploy/seed-account-system.mjs.",
  "-- Do not edit; edit the generator.",
  "--",
  `-- Generated salt derivation: SHA-1("${SALT_INPUT}") = ${SALT}`,
  "--",
  "-- WHAT THIS IS: the account substrate a fresh demo deck needs before the",
  "-- first-run journey can run at all. Before it, 0003 ships a 4-card browse-only",
  "-- deck with no `*account` codename card, so setupWindowState answers",
  "-- `account_system_absent` (src/card/auth/first-run-setup.ts:376-378), /setup",
  "-- 404s with \"This deck has no account system\", and signinAccount returns the",
  "-- same reason (signin.ts:213, :256-257). The engine has no mod-seeding",
  "-- capability, so the substrate arrives as deck data.",
  "--",
  "-- APPLY AFTER 0003 and BEFORE ANALYZE:",
  "--   npx wrangler d1 execute decko-ts --remote \\",
  "--     --file migrations/0004-demo-account-substrate.sql",
  "--   npx wrangler d1 execute decko-ts --remote --command \"ANALYZE\"",
  "-- Apply it TWICE if you like: every INSERT is guarded (see IDEMPOTENCE below),",
  "-- so a second application is a no-op.",
  "--",
  "-- IDEMPOTENCE: each named card is guarded on `codename`",
  "-- (cards_codename_index is UNIQUE over the column, trashed rows included —",
  "-- db/schema.sqlite.sql:70) and each junction/field child on its",
  "-- (left_id, right_id) pair (index_cards_on_left_id_and_right_id is UNIQUE —",
  "-- db/schema.sqlite.sql:69). Applying to a database that already holds some of",
  "-- these cards under OTHER ids inserts only what is missing.",
  "--",
  "-- ADDITIVE ONLY: this file transforms no existing row. 0003's four cards and",
  "-- every other shipped row are untouched, and the ids below start at 1101",
  "-- precisely because 0003 owns ids 1..4.",
  "--",
  "-- THE TWO CARDS RUBY DOES NOT SHIP THE WAY THE BRIEF DESCRIBED, resolved",
  "-- against the gem rather than followed (both disclosed in the generator):",
  "--   * Decko Bot and Anonymous are typed with the deck DEFAULT type, not User.",
  "--     mod/core/data/fixtures/real/cards.yml cards_001 gives Decko Bot",
  "--     type_id 2 (Rich Text = the `*all+*default` type), and card-mod-account's",
  "--     real.yml gives Anonymous no `:type:` at all. `User` is the type of a",
  "--     SETUP-CREATED owner (set/all/account.rb:3-5), never of the two seeded",
  "--     actors.",
  "--   * Anonymous gets NO `+*account` junction. set/self/anonymous.rb:3-6",
  "--     overrides the accessors: `def account; nil; end` /",
  "--     `def account?; false; end`. Only Decko Bot's junction ships.",
  "--",
  "-- NOT INCLUDED, and why (also recorded in the lane receipt):",
  "--   * the `*all+*read` read rule (cards_010). Signin and first-run issue no",
  "--     SQL naming read_rule_class or read_rule_id — `grep -rn read_rule",
  "--     src/card/auth/ src/server/first-run-routes.ts` returns ZERO hits — and",
  "--     an absent read rule is already this deck's state (0003's four cards and",
  "--     all fifteen of deploy/seed/seed.sql carry NULL, and they render).",
  "--     Stamping the rule onto existing cards is the one thing this lane is",
  "--     forbidden to do.",
  "--   * roles, signup, email verification, `*account settings`, `*roles`,",
  "--     `*signin`, the email templates. None is read by the census, the create,",
  "--     or signinAccount.",
  "--",
  "-- Re-generate: node deploy/seed-account-system.mjs",
  "-- ============================================================================",
  "",
].join("\n");

// Every card in both blocks is authored by the bot (cardio/seed.rb:106-108
// stamps `author_id = Card::DeckoBotID` on every seeded card). The author is the
// Decko Bot card this file itself creates, so the same statement holds here
// with the id resolved locally instead of from a boot-time constant.
const allCards = [...bootstrapCards, ...accountCards].map((card) => ({ ...card, authorId: ID.deckoBot }));
const allSides = [...bootstrapSides, ...accountSides].map((card) => ({ ...card, authorId: ID.deckoBot }));

const body = [...allCards.map(namedCardSql), ...allSides.map(sideCardSql)].join("\n\n") + "\n";
const sql = header + body;

// Guard: the generators above are the only place ids are assigned, so a
// collision inside this file is a programming error worth a loud failure
// rather than a database UNIQUE violation at apply time.
const seen = new Map();
for (const card of [...allCards, ...allSides]) {
  if (seen.has(card.id)) {
    console.error(`seed-account-system: duplicate id ${card.id} (${card.label})`);
    process.exit(1);
  }
  seen.set(card.id, card.label);
  if (card.id <= 4) {
    console.error(
      `seed-account-system: id ${card.id} collides with 0003-demo-seed.sql's Home/Hello World rows`,
    );
    process.exit(1);
  }
}

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, sql, "utf8");

const bytes = statSync(TARGET).size;
console.log(
  `seed-account-system: wrote ${TARGET} (${bytes} bytes, ` +
    `${allCards.length} named + ${allSides.length} junction/field rows)`,
);
if (bytes >= 1024 * 1024) {
  console.error("seed-account-system: OVER THE 1 MB BUDGET — shrink the substrate");
  process.exit(1);
}
