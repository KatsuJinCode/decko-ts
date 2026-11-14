// The refresh before the writes: refresh_card (rest.rb:68-70) and the
// before_action table it rides (card_controller.rb:20-25), measured against
// the PINNED DECK's own table.
//
// The completeness register's B12 row grades the port on `refresh_card` -
// the one before_action that runs ONLY for the three write actions. The
// register's own note for the port is "PORTED (structurally)", so the
// capture's job is the PINNED side of the question, and the port's side is
// pinned where the difference is observable.
//
// This file pins both sides:
//
//   fixtures/captured/refresh-card-before-cud-ruby-oracle.json is what
//   oracle-capture-refresh-card-before-cud-ruby.rb (tests/server/) recorded
//   by EXECUTING the pinned controller file against the rig's recording
//   ActionController::Base and running the pinned refresh over the
//   recording doubles:
//
//     the table  card_controller.rb:20-25 - six before_actions, and
//               refresh_card is the LAST one with
//               `only: %i[create update delete]`.
//     the chains create, update and delete run
//               [setup, authenticate, load_card, refresh_card]; a read runs
//               [setup, authenticate, load_mark, load_card, load_action] and
//               NO refresh; the asset arm runs NOTHING.
//     the ask    the recorded call list is ["refresh"] and the controller's
//               card object is REPLACED by the refresh's answer (a different
//               object took its place).
//
//   The ORDER is the mechanism: the refresh runs AFTER load_card, so the
//   write that follows acts on the CURRENT row. In Ruby that matters to
//   the save's own guard - the conflict guard compares the request's held
//   revision against the card's last_action_id, and a stale card object
//   would compare against a stale revision.
//
//   The port's side: the port has NO shared card object, so it has nothing
//   to refresh. Each write request builds its own engine over the current
//   database state (src/server/write-routes.ts:1873,
//   createCardActionEngineForSession) and fetches the card per request
//   (write-routes.ts:2008, lookupLiveCard). The observable consequence is
//   the same as the pinned one - the write acts on the CURRENT row - and it
//   is measured here over the real HTTP write surface: a save carrying a
//   STALE revision is refused 409 (the port compared the request's held
//   revision against the row's current last_action_id), and a save
//   carrying the CURRENT revision lands.
//
//   The refresh's own answer is the rig's double (the pinned card gem's
//   refresh is an ActiveRecord reload; the rig has no database). The
//   capture records the ASK and the REPLACEMENT, and the fixture says so
//   on its face (rigArtifacts).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { ModLoader, modEngineHost } from "../../src/card/mod-loader.js";
import cardModHistory from "../../src/card/mod-loader/mods/card-mod-history.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/refresh-card-before-cud-ruby-oracle.json"), "utf8"),
) as {
  beforeActionTable: Array<{ name: string; only: string[]; except: string[] }>;
  actionChains: Array<{ action: string; chain: string[] }>;
  refreshAsk: {
    error: string | null;
    cardCalls: string[];
    cardBefore: string;
    cardAfter: string;
    replaced: boolean;
  };
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const ANN_ID = 91;
const NOTE_ID = 60;

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;
let historyLoader: ModLoader;
let joeToken = "";
let annToken = "";

// The minimum rule deck: *all+*update -> [[Anyone Signed In]] so both
// members may save, plus the account cards and a target note.
async function seedRefreshDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*update", codename: "update" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 14, name: "Basic" });
  await seedCard(s, { id: 15, leftId: 2, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
  await seedCard(s, { id: ANN_ID, name: "Ann Editor" });
  await seedCard(s, { id: NOTE_ID, name: "Guard Note", typeId: 14, dbContent: "note v1" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedRefreshDeck(storage);
  historyLoader = new ModLoader([{ manifest: cardModHistory }]);
  historyLoader.load();
  await historyLoader.installInto(modEngineHost(storage.engine, storage.fetcher));
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  bridge = await makeWriteRouteServer(storage, ctx);
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  annToken = (await sessions.createSession(ANN_ID)).token;
}, 90_000);

afterAll(() => {
  historyLoader?.reset();
  bridge?.server.close();
  storage?.close();
});

async function post(
  form: Record<string, string>,
  token: string,
): Promise<{ status: number; body: string }> {
  const params = new URLSearchParams(form);
  params.set("token", token);
  const res = await fetch(`${bridge.url}/update/Guard_Note`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

/** The card's current revision: the last NON-draft action's id
 *  (history set/all/history/last.rb:49-55), the value the edit form's
 *  conflict_tracker hidden field carries. */
async function currentRevisionId(): Promise<number | undefined> {
  const result = await storage.counting.query<{ id: number }>(
    `SELECT id FROM card_actions WHERE card_id = ? AND (draft IS NOT TRUE)
     ORDER BY id DESC LIMIT 1`,
    [NOTE_ID],
  );
  return result.rows[0]?.id;
}

async function dbContent(): Promise<string | null> {
  const result = await storage.counting.query<{ db_content: string | null }>(
    `SELECT db_content FROM cards WHERE id = ?`,
    [NOTE_ID],
  );
  return result.rows[0]?.db_content ?? null;
}

describe("the refresh before the writes, against the pinned deck gem", () => {
  it("the refresh runs for the THREE write actions and for nothing else", () => {
    const chains = Object.fromEntries(ORACLE.actionChains.map((row) => [row.action, row.chain]));
    expect(chains["create"]).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    expect(chains["update"]).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    expect(chains["delete"]).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    // A read does NOT refresh, and the asset arm runs nothing at all.
    expect(chains["read"]).toEqual(["setup", "authenticate", "load_mark", "load_card", "load_action"]);
    expect(chains["read"]).not.toContain("refresh_card");
    expect(chains["asset"]).toEqual([]);
  });

  it("the table says only: %i[create update delete], and the refresh is the LAST entry", () => {
    const table = ORACLE.beforeActionTable;
    const refresh = table.find((entry) => entry.name === "refresh_card")!;
    expect(refresh.only).toEqual(["create", "update", "delete"]);
    expect(refresh.except).toEqual([]);
    // The order is the mechanism: the refresh runs after load_card, so the
    // write that follows acts on the current row.
    expect(table[table.length - 1]!.name).toBe("refresh_card");
    const tableSource = ORACLE.sources["beforeActionTable"]!.map((row) => row.text).join("\n");
    expect(tableSource).toContain("before_action :refresh_card, only: %i[create update delete]");
  });

  it("the refresh asks the card to refresh, and the controller's card object is REPLACED", () => {
    const ask = ORACLE.refreshAsk;
    expect(ask.error).toBeNull();
    expect(ask.cardCalls).toEqual(["refresh"]);
    expect(ask.replaced).toBe(true);
    expect(ask.cardAfter).not.toBe(ask.cardBefore);
    // The pinned body, quoted: @card = card.refresh.
    const refresh = ORACLE.sources["refresh"]!.map((row) => row.text).join("\n");
    expect(refresh).toContain("def refresh_card");
    expect(refresh).toContain("@card = card.refresh");
  });

  it("the refresh's own answer is the rig's double, and the fixture says so", () => {
    expect(ORACLE.rigArtifacts.join(" ")).toContain("the rig's double");
  });
});

describe("the port's write path, against the pinned refresh", () => {
  it("the port has no shared card to refresh: a stale revision is refused 409, because the CURRENT row is read", async () => {
    // Joe's save creates the first action; the revision Ann's form would
    // have carried is the action id that predates Joe's. The port compares
    // it against the card's CURRENT last_action_id (a fresh read, because
    // the port builds a per-request engine over the current database state
    // and fetches the card per request), so the guard fires.
    const first = await post({ "card[content]": "b12 note v2 (joe)" }, joeToken);
    expect(first.status, first.body).toBe(303);
    const current = await currentRevisionId();
    expect(current).toBeTypeOf("number");

    const before = await dbContent();
    const conflicted = await post(
      {
        "card[content]": "b12 note v3 (ann, stale form)",
        "card[last_action_id_before_edit]": String(Number(current) - 1),
      },
      annToken,
    );
    expect(conflicted.status, conflicted.body).toBe(409);
    // Nothing was written: the refusal is a refusal.
    expect(await dbContent()).toBe(before);
  });

  it("a save carrying the CURRENT revision lands: the write acts on the current row", async () => {
    const current = await currentRevisionId();
    const accepted = await post(
      {
        "card[content]": "b12 note v4 (ann, current form)",
        "card[last_action_id_before_edit]": String(current),
      },
      annToken,
    );
    expect(accepted.status, accepted.body).toBe(303);
    expect(await dbContent()).toBe("b12 note v4 (ann, current form)");
  });
});
