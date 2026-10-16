// seed-local-accounts.mjs — create the disposable test accounts in a LOCAL
// deck copy: one administrator-equivalent (holds the `administrator` role,
// which the engine's read rules treat as always_ok, so it can create, edit
// and delete), and one ordinary signed-in member (no role beyond the
// built-in Anyone Signed In).
//
// The rows follow the deck's own account shape: a Person card (type `user`,
// the Person cardtype), a junction `<holder>+account`, and `+email`, `+salt`,
// `+password`, `+status` fields under it. A role membership is a List card
// (`<role>+*members`, type `list`) whose left is the role card and whose
// right is the `*members` card, referencing each holder
// (src/card/permissions/read-rules.ts, rolePartyStatement).
//
// The password is hashed by the engine's own hashPassword, so sign-in
// verifies it through the engine's own path. Hashing happens BEFORE the
// database is written, and every insert runs in one transaction, so a
// insert failure rolls back. Permission metadata is derived before credentials
// are published; any preparation failure aborts this disposable fixture.
//
// Credentials are generated here, written to the credentials file the caller
// names (mode 0600), and never printed.

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const here = dirname(fileURLToPath(import.meta.url));

const ADMIN_NAME = "Harness Admin";
const MEMBER_NAME = "Harness Member";

const keyOf = (name) => name.toLowerCase().replace(/\s+/g, "_");
const stampNow = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/**
 * @param {{ deck: string, credentialsOut: string }} opts
 * @returns {Promise<{ admin: { name: string, email: string, id: number }, member: { name: string, email: string, id: number } }>}
 */
export async function seedLocalAccounts({ deck, credentialsOut }) {
  // Load after the harness build, so neither hashes nor derived permissions
  // can come from a stale distribution imported during runner startup.
  const [{hashPassword},{LocalSqliteDriver},{FetchEngine},{updateReadRule}]=await Promise.all([
    'src/card/auth/password-hash.js','src/server/drivers/local-sqlite.js',
    'src/card/fetch.js','src/card/permissions/set-read-rule.js',
  ].map(file=>import(pathToFileURL(join(here,'../../../dist',file)).href)));
  const db = new Database(deck);
  try {
    const codenameId = (codename) => {
      const row = db.prepare("SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1").get(codename);
      if (!row) throw new Error(`seed-local-accounts: deck has no ${codename} card`);
      return Number(row.id);
    };
    const ids = {
      account: codenameId("account"),
      email: codenameId("email"),
      password: codenameId("password"),
      salt: codenameId("salt"),
      status: codenameId("status"),
      basic: codenameId("basic"),
      phrase: codenameId("phrase"),
      person: codenameId("user"),
      list: codenameId("list"),
      members: codenameId("members"),
      administrator: codenameId("administrator"),
      bot: Number(db.prepare("SELECT id FROM cards WHERE codename = 'decko_bot' AND trash = 0 LIMIT 1").get()?.id ?? 1),
    };
    for (const name of [ADMIN_NAME, MEMBER_NAME]) {
      const clash = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE (name = ? OR key = ?) AND trash = 0").get(name, keyOf(name));
      if (Number(clash.n) > 0) throw new Error(`seed-local-accounts: a card named ${name} already exists; refusing to reuse it`);
    }

    // Everything slow (the PBKDF2 hashes) happens before the first write.
    const accounts = [
      { name: ADMIN_NAME, email: `harness-admin-${randomBytes(4).toString("hex")}@harness.invalid`, password: randomBytes(18).toString("base64url") + 'Ax7#', roles: [ids.administrator] },
      { name: MEMBER_NAME, email: `harness-member-${randomBytes(4).toString("hex")}@harness.invalid`, password: randomBytes(18).toString("base64url") + 'Ax7#', roles: [] },
    ];
    for (const account of accounts) {
      account.salt = randomBytes(16).toString("hex");
      account.hash = await hashPassword(account.password, account.salt);
    }

    const stamp = stampNow();
    const insertCard = db.prepare(
      "INSERT INTO cards (name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, ?)",
    );
    const insertReference = db.prepare("INSERT INTO card_references (referer_id, referee_id, referee_key) VALUES (?, ?, ?)");
    const written = {}, seededIds=[];
    db.transaction(() => {
      for (const account of accounts) {
        const holder = Number(insertCard.run(account.name, keyOf(account.name), null, null, null, stamp, stamp, ids.bot, ids.bot, ids.person, "").lastInsertRowid);
        const junction = Number(insertCard.run(null, null, null, holder, ids.account, stamp, stamp, ids.bot, ids.bot, ids.basic, null).lastInsertRowid);
        seededIds.push(holder,junction);
        const field = (codename, content) => {
          // Stock right/email, password, salt and status each assign Phrase.
          // Seeding RichText here creates a different editor from a real account.
          const inserted=insertCard.run(null, null, null, junction, ids[codename], stamp, stamp, ids.bot, ids.bot, ids.phrase, content);
          seededIds.push(Number(inserted.lastInsertRowid));
        };
        field("email", account.email);
        field("salt", account.salt);
        field("password", account.hash);
        field("status", "active");
        for (const roleId of account.roles) {
          // The role's membership list, `<role>+*members`, already exists in
          // the deck (the (left, right) pair is unique). Membership is a
          // reference from that list to the holder.
          const list = db.prepare("SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0").get(roleId, ids.members);
          if (!list) throw new Error(`seed-local-accounts: the deck has no ${roleId}+*members list to grant a role through`);
          insertReference.run(Number(list.id), holder, null);
        }
        written[account.name] = { id: holder, email: account.email, password: account.password };
      }
    })();

    // Normal card creation runs permissions.rb#set_read_rule. Direct fixture
    // inserts must derive that same metadata; NULL excludes an otherwise
    // readable card from CQL's stored read_rule_id filter for ordinary users.
    const driver=new LocalSqliteDriver({path:deck});
    try{
      const fetch=new FetchEngine(driver);
      await driver.transaction(async()=>{
        await fetch.codenames.ensureLoaded();
        const changed=new Set();
        for(const id of seededIds){
          if(changed.has(id))continue;
          changed.add(id);
          await updateReadRule({driver,fetch},id,changed);
        }
      });
    }finally{await driver.close();}

    const credentials = {
      note: "Disposable accounts for the local signed-in exercise, created in a local deck copy only.",
      admin: { ...written[ADMIN_NAME], name: ADMIN_NAME, holder_card_id: written[ADMIN_NAME].id, role: "administrator" },
      member: { ...written[MEMBER_NAME], name: MEMBER_NAME, holder_card_id: written[MEMBER_NAME].id, role: "none (signed in)" },
    };
    writeFileSync(credentialsOut, JSON.stringify(credentials, null, 2) + "\n", { mode: 0o600 });
    return {
      admin: { name: ADMIN_NAME, email: written[ADMIN_NAME].email, id: written[ADMIN_NAME].id },
      member: { name: MEMBER_NAME, email: written[MEMBER_NAME].email, id: written[MEMBER_NAME].id },
    };
  } finally {
    db.close();
  }
}
