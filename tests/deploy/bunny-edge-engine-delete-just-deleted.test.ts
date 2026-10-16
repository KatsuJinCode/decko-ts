// The Bunny edge's Delete button, driven END TO END through
// handleBunnyEngineRequest (deploy/bunny-worker-src/bunny-edge-engine-
// handler.ts), the second entry point of the delete confirmation
// (src/server/write-routes.test is the first, the write surface directly).
//
// The owner's Delete button is a remote GET link:
//   /delete/<name>?success[view]=just_deleted            (card-mod-edit
//   src/card/mod-loader/mods/card-mod-edit.ts deleteButton; Ruby
//   mod/edit/set/all/form_buttons.rb:53-78)
// The handler turns that GET into a DELETE (handler, /delete/ branch) and the
// write surface answers the ajax soft redirect with the just_deleted view
// (write-routes.ts configure_successful_deletion arms), rendered through the
// Bunny render seam (bunny-edge-signin-session-surface.ts renderSavedSlot ->
// liveRenderView with the absent-card flag).
//
// Ruby truth (decko-ruby-reference): configure_successful_deletion
// (mod/session/set/all/location_history.rb:9-17) non-main ajax -> soft
// redirect rendering success[view] (= just_deleted, editing.rb:46-48);
// response.rb:54-62 soft_redirect.
//
// RED/GREEN: the first case fails on the base source (the slot render throws
// "card not found" for the trashed card) and passes with the fix.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { DeckoName } from "../../src/card/name.js";
import { SessionStore } from "../../src/card/auth/session-store.js";
import {
  generatedEmail,
  generatedPassword,
} from "../../src/testing/generated-credentials.js";
import { handleBunnyEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-handler.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import { startMockHranaServer, type MockHranaServer } from "../server/drivers/mock-hrana-server.js";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TS = "2026-10-08 12:00:00.000";
const SALT = "SALT";
const HOLDER = { id: 9100, name: "Joe User" };
const IDS = { account: 9201, email: 9202, password: 9203, salt: 9204, status: 9205 } as const;
const JUNCTION_ID = 9101;
const IDS_RULE = {
  all: 1,
  set: 2,
  read: 3,
  update: 4,
  create: 13,
  delete: 5,
  anyone: 6,
  anyoneSignedIn: 7,
  type: 8,
  self: 9,
  catchAllRead: 20,
} as const;
const EMAIL = generatedEmail("bunny-edge-engine-delete");
const PASSWORD = generatedPassword("bunny-edge-engine-delete");
const DIGEST = createHash("sha1").update(`${SALT}--${PASSWORD}--`).digest("hex");
const DOOMED = "Doomed Edge Card";

let server: MockHranaServer;
let driver: BunnyDbDriver;
const env: Record<string, string> = {};

async function insertCard(opts: {
  id?: number;
  name?: string | null;
  key?: string | null;
  codename?: string | null;
  leftId?: number | null;
  rightId?: number | null;
  typeId?: number | null;
  dbContent?: string | null;
}): Promise<void> {
  const key = opts.key !== undefined ? opts.key : opts.name ? DeckoName.parse(opts.name).key : null;
  await driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, ?, ?)`,
    [
      opts.id ?? null,
      opts.name ?? null,
      key,
      opts.codename ?? null,
      opts.leftId ?? null,
      opts.rightId ?? null,
      TS,
      TS,
      opts.typeId ?? 2,
      opts.dbContent ?? null,
    ],
  );
}

function keyOf(name: string): string {
  return DeckoName.parse(name).key;
}

async function seedDeck(): Promise<void> {
  await insertCard({ id: IDS_RULE.all, name: "*all", codename: "all", typeId: IDS_RULE.set });
  await insertCard({ id: IDS_RULE.set, name: "Set", codename: "set" });
  await insertCard({ id: IDS_RULE.read, name: "*read", codename: "read", typeId: IDS_RULE.set });
  await insertCard({ id: IDS_RULE.update, name: "*update", codename: "update", typeId: IDS_RULE.set });
  await insertCard({ id: IDS_RULE.create, name: "*create", codename: "create", typeId: IDS_RULE.set });
  await insertCard({ id: IDS_RULE.delete, name: "*delete", codename: "delete", typeId: IDS_RULE.set });
  await insertCard({ id: IDS_RULE.anyone, name: "Anyone", codename: "anyone" });
  await insertCard({ id: IDS_RULE.anyoneSignedIn, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await insertCard({ id: IDS_RULE.type, name: "*type", codename: "type", typeId: IDS_RULE.set });
  await insertCard({ id: IDS_RULE.self, name: "*self", codename: "self", typeId: IDS_RULE.set });
  await insertCard({ id: 18, name: "*default", codename: "default", typeId: IDS_RULE.set });
  await insertCard({ id: 14, name: "Basic", codename: "basic" });
  await insertCard({ id: 16, name: "RichText", codename: "rich_text" });
  // Signed-in owners may update, create and delete (the rule the owner's
  // Delete button rides, *all+*delete -> [[Anyone Signed In]]).
  for (const [id, right] of [[10, IDS_RULE.update], [11, IDS_RULE.create], [12, IDS_RULE.delete]] as const) {
    await insertCard({
      id, leftId: IDS_RULE.all, rightId: right, typeId: IDS_RULE.set,
      dbContent: "[[Anyone Signed In]]",
    });
    await driver.query(
      `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
       VALUES (?, ?, ?, 'L', NULL)`,
      [id, keyOf("Anyone Signed In"), IDS_RULE.anyoneSignedIn],
    );
  }
  await insertCard({ id: 17, leftId: IDS_RULE.all, rightId: 18, typeId: 14 });
  // The deck's catch-all read rule grants Anyone, exactly like the owner's
  // live deck: the deleted card was readable before the delete, and the
  // confirmation renders the same card (read permission.rb:22 `alter_unknown
  // || denial` runs on it).
  await insertCard({
    id: IDS_RULE.catchAllRead, leftId: IDS_RULE.all, rightId: IDS_RULE.read,
    typeId: IDS_RULE.set, dbContent: "[[Anyone]]",
  });
  await driver.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
     VALUES (?, ?, ?, 'L', NULL)`,
    [IDS_RULE.catchAllRead, keyOf("Anyone"), IDS_RULE.anyone],
  );
  await insertCard({ id: 50, name: DOOMED, key: keyOf(DOOMED), typeId: 16, dbContent: "edge doomed body" });
  // The account mod's codename cards (the sign-in substrate).
  await insertCard({ id: IDS.account, name: "*account", key: keyOf("*account"), codename: "account", typeId: 1 });
  await insertCard({ id: IDS.email, name: "*email", key: keyOf("*email"), codename: "email", typeId: 1 });
  await insertCard({ id: IDS.password, name: "*password", key: keyOf("*password"), codename: "password", typeId: 1 });
  await insertCard({ id: IDS.salt, name: "*salt", key: keyOf("*salt"), codename: "salt", typeId: 1 });
  await insertCard({ id: IDS.status, name: "*status", key: keyOf("*status"), codename: "status", typeId: 1 });
  await insertCard({ id: HOLDER.id, name: HOLDER.name, key: keyOf(HOLDER.name), typeId: 2 });
  await insertCard({
    id: JUNCTION_ID, name: `${HOLDER.name}+*account`, key: null,
    leftId: HOLDER.id, rightId: IDS.account,
  });
  await insertCard({ id: 9301, name: `${HOLDER.name}+*account+*email`, key: null, leftId: JUNCTION_ID, rightId: IDS.email, dbContent: EMAIL });
  await insertCard({ id: 9302, name: `${HOLDER.name}+*account+*password`, key: null, leftId: JUNCTION_ID, rightId: IDS.password, dbContent: DIGEST });
  await insertCard({ id: 9303, name: `${HOLDER.name}+*account+*salt`, key: null, leftId: JUNCTION_ID, rightId: IDS.salt, dbContent: SALT });
  await insertCard({ id: 9304, name: `${HOLDER.name}+*account+*status`, key: null, leftId: JUNCTION_ID, rightId: IDS.status, dbContent: "active" });
}

beforeAll(async () => {
  server = await startMockHranaServer();
  driver = new BunnyDbDriver({ url: server.url, authToken: "bunny-edge-engine-delete-test" });
  for (const file of ["db/schema.sqlite.sql", "deploy/migrations/0005-auth-sessions.sql"]) {
    for (const statement of splitSqlStatements(readFileSync(`${REPO_ROOT}${file}`, "utf8"))) {
      await driver.query(statement, []);
    }
  }
  await seedDeck();
  env.BUNNY_DATABASE_URL = server.url;
  env.BUNNY_DATABASE_AUTH_TOKEN = "bunny-edge-engine-delete-test";
  env.DECKO_WRITE_PATH = "1";
});

afterAll(async () => {
  await server.close();
});

async function signIn(): Promise<string> {
  const response = await handleBunnyEngineRequest(
    new Request("https://script-placeholder.bunny.run/update/*signin", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        _method: "patch",
        "success[redirect]": "true",
        "success[mark]": "*previous",
        "card[subcards][+*email][content]": EMAIL,
        "card[subcards][+*password][content]": PASSWORD,
      }).toString(),
    }),
    env,
  );
  expect(response.status).toBe(303);
  const match = /^decko_ts_session=([^;]*)/.exec(response.headers.get("set-cookie") ?? "");
  expect(match, "sign-in must set a session cookie").not.toBeNull();
  return `decko_ts_session=${match![1]}`;
}

describe("bunny edge engine — the Delete button's confirmation", () => {
  it("the ajax Delete link (GET /delete/<name>?success[view]=just_deleted) answers the deleted-card confirmation", async () => {
    const cookie = await signIn();
    const response = await handleBunnyEngineRequest(
      new Request(`https://script-placeholder.bunny.run/delete/${encodeURIComponent(DOOMED)}?success%5Bview%5D=just_deleted`, {
        headers: { cookie, "X-Requested-With": "XMLHttpRequest" },
      }),
      env,
    );
    const body = await response.text();
    expect(response.status, body).toBe(200);
    expect(body).toContain('class="card-slot just_deleted-view');
    expect(body).toContain('data-card-name="Doomed Edge Card"');
    expect(body).toContain("deleted</div>");
  });
});
