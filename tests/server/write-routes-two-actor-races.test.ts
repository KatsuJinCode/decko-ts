// Two signed-in actors whose writes INTERLEAVE — the races a single-actor
// journey never reaches. Each test drives the real HTTP write surface
// (handleWriteRequest through the shared bridge) as two separately
// authenticated actors, with the racing requests fired concurrently where
// the race is the point, and holds-then-acts where it is a stale-form race.
//
// The five interactions (one test each, plus a rename-order sibling):
//
//   1. SAME CARD, two actors, both save with different text and the same
//      held revision, concurrently. Expected: exactly one save lands, the
//      other is refused 409 with the conflict view ("changes not based on
//      latest revision") — the last save does NOT silently win. The
//      sequential form of this guard is pinned in
//      write-routes-edit-save-guards.test.ts; the concurrent form is what
//      this file adds (Ruby: detect_conflict, mod/history
//      set/all/history/events.rb:19-22, validated inside the save
//      transaction so both cannot pass the check before either writes —
//      the driver-level pin is tests/card/actions/concurrent-saves.test.ts).
//
//   2. A holds an edit form; B DELETES the card; A submits. Expected: the
//      stale update is refused (write-routes.ts never-mint guard: a held
//      revision naming a trashed card is a conflict, "Card changed or was
//      deleted while being edited"), the card stays trashed, its content
//      and history are unchanged, and no live card reappears under the
//      name. Ruby shape: uri_fetch retrieves nothing live, so the update
//      detours to create; manage_trash's pull_from_trash! (mod/core
//      set/all/trash.rb:22-27) takes over the trashed row's id, which
//      makes the save an update — and detect_conflict (on: :update) then
//      refuses it: the delete action is the last action and B, not A,
//      made it. Same refusal, same precondition (a held revision); the
//      port refuses at the route layer.
//
//   3. A holds an edit form; B RENAMES the card; A submits to the OLD
//      name. Expected (Ruby parity, rest.rb:17 `card.new_card? ? create`):
//      the old name resolves to nothing live (expire_old_name freed it),
//      so A's save follows the CREATE arm and stores at the freed old
//      name as a NEW card — it does not follow the rename and it is not
//      silently lost. The renamed card keeps B's state. The sibling test
//      pins the reverse order: A's save lands first, then B's rename
//      carries A's content to the new name.
//
//   4. Two actors CREATE the same new name in the same window. Expected:
//      one 303, the loser refused by the name-taken validation (Ruby
//      validate_uniqueness_of_name, mod/core set/all/name_events.rb:15-23)
//      — never a 500, never two cards. Engine-level pin (serialization via
//      the save transaction): concurrent-saves.test.ts; the HTTP layer is
//      what this file adds.
//
//   5. A and B edit DIFFERENT cards that share an embedded child
//      (Host One and Host Two both transclude {{Zed}}; B saves Zed while
//      A saves Host One). Expected: both saves land, neither corrupts the
//      other — B's child save does not move A's host revision (no
//      spurious conflict), A's host save does not touch Zed's row, and
//      the include reference Host One -> Zed stays present. Plus the
//      subcard channel measured below: a parent form that carries a
//      STALE subcard field overwrites a child another actor saved
//      directly — the measured Ruby-parity data-loss window (Ruby's
//      process_subcards assigns the posted content with no per-subcard
//      conflict guard; detect_conflict rides only the act card's
//      last_action_id_before_edit).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type http from "node:http";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { makeWriteRouteServer as makeServer } from "./write-routes-test-bridge.js";
import { ModLoader, modEngineHost } from "../../src/card/mod-loader.js";
import cardModHistory from "../../src/card/mod-loader/mods/card-mod-history.js";

const SET_TYPE_ID = 2;
const BASIC_TYPE_ID = 14;
const JOE_ID = 90;
const ANN_ID = 91;

let storage: RenderTestStorage | undefined;
let joeToken = "";
let annToken = "";
let ctx: WriteRouteContext;
let server: http.Server;
let baseUrl = "";
let historyLoader: ModLoader;

/** The rule deck (mirrors write-routes.test.ts's seedRuleDeck): the three
 *  *all write rules grant ANY SIGNED-IN actor create/update/delete, and
 *  *all+*default resolves new cards to Basic. */
async function seedRuleDeck(s: RenderTestStorage): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ) => seedCard(s, { id, name, ...extra });
  await byId(1, "*all", { codename: "all", typeId: SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(3, "*update", { codename: "update" });
  await byId(4, "*create", { codename: "create" });
  await byId(5, "*delete", { codename: "delete" });
  await byId(6, "Anyone", { codename: "anyone" });
  await byId(7, "Anyone Signed In", { codename: "anyone_signed_in" });
  await byId(8, "*type", { codename: "type" });
  await byId(9, "*self", { codename: "self" });
  await byId(18, "*default", { codename: "default" });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: BASIC_TYPE_ID });
  await byId(BASIC_TYPE_ID, "Basic");
  await seedCard(s, { id: 15, leftId: BASIC_TYPE_ID, rightId: 8, typeId: SET_TYPE_ID });
  await byId(JOE_ID, "Joe User");
  await byId(ANN_ID, "Ann Editor");
}

interface CallResult {
  status: number;
  body: string;
}

/** One actor's form POST/DELETE through the bridge, as a browser form would
 *  send it (urlencoded body, session cookie, manual redirects). */
async function call(
  method: string,
  path: string,
  form: Record<string, string> | undefined,
  token: string,
): Promise<CallResult> {
  const params = new URLSearchParams(form ?? {});
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `decko_ts_session=${token}`,
    },
    body: method === "DELETE" && form === undefined ? undefined : params.toString(),
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

/** A card this test owns, created by JOE through the real create route. */
async function createByName(name: string, content: string, extraForm: Record<string, string> = {}): Promise<void> {
  const res = await call("POST", "/card/create", { "card[name]": name, "card[content]": content, ...extraForm }, joeToken);
  expect(res.status, res.body).toBe(303);
}

async function cardRow(name: string): Promise<{ id: number; db_content: string | null; trash: number; key: string } | undefined> {
  const result = await storage!.counting.query<{
    id: number;
    db_content: string | null;
    trash: number;
    key: string;
  }>("SELECT id, db_content, trash, key FROM cards WHERE key = ?", [name.toLowerCase().replace(/[^a-z0-9]+/g, "_")]);
  return result.rows[0];
}

async function cardIdOf(name: string): Promise<number> {
  const row = await cardRow(name);
  expect(row, `fixture card ${name} absent`).toBeDefined();
  return row!.id;
}

/** The card's current revision — the non-draft last action id, the value
 *  an edit form's conflict_tracker hidden field carries. */
async function currentRevisionId(cardId: number): Promise<number | undefined> {
  const result = await storage!.counting.query<{ id: number }>(
    "SELECT id FROM card_actions WHERE card_id = ? AND (draft IS NOT TRUE) ORDER BY id DESC LIMIT 1",
    [cardId],
  );
  return result.rows[0]?.id;
}

async function actionCount(cardId: number): Promise<number> {
  const result = await storage!.counting.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ?",
    [cardId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedRuleDeck(storage);
  historyLoader = new ModLoader([{ manifest: cardModHistory }]);
  historyLoader.load();
  await historyLoader.installInto(modEngineHost(storage.engine, storage.fetcher));
  ctx = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    // the host render seam (the staging server wires its page/slot renderer
    // here): the 409 refusal renders the card's :conflict view through this
    // seam — the bytes a real browser shows as the conflict notice. The
    // VIEW argument is honored (the ajax soft redirect asks for "open",
    // the conflict arm asks for "conflict").
    renderSlot: async (name, view) => {
      storage!.engine.expireRenderCard(name);
      return storage!.engine.render(name, view === undefined ? "open" : view);
    },
  };
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  annToken = (await sessions.createSession(ANN_ID)).token;
  const bridge = await makeServer(storage, ctx);
  server = bridge.server;
  baseUrl = bridge.url;
}, 60_000);

afterAll(() => {
  historyLoader?.reset();
  server?.close();
  storage?.close();
});

describe("two-actor interleaved write races over HTTP", () => {
  it("race 1 — both actors save the SAME card at once with different text: one lands, the other is refused 409 with the conflict notice; the last save does not silently win", async () => {
    const name = "Race Same Card";
    await createByName(name, "race base");
    const cardId = await cardIdOf(name);
    const revision = await currentRevisionId(cardId);
    expect(revision).toBeTypeOf("number");

    // Both forms were rendered at `revision`. Both actors hit submit in the
    // same window: the two requests race through the route layer together.
    const [joeSave, annSave] = await Promise.all([
      call("POST", `/update/${name.replace(/ /g, "_")}`, {
        "card[content]": "joe race text",
        "card[last_action_id_before_edit]": String(revision),
      }, joeToken),
      call("POST", `/update/${name.replace(/ /g, "_")}`, {
        "card[content]": "ann race text",
        "card[last_action_id_before_edit]": String(revision),
      }, annToken),
    ]);

    // Exactly one save landed; the stale one was refused 409.
    const statuses = [joeSave.status, annSave.status].sort();
    expect(statuses, `joe=${joeSave.status} ann=${annSave.status}`).toEqual([303, 409]);
    const loser = joeSave.status === 409 ? joeSave : annSave;
    const winnerText = joeSave.status === 303 ? "joe race text" : "ann race text";
    const loserText = joeSave.status === 409 ? "joe race text" : "ann race text";
    // the conflict notice: the refusal rendered the card's :conflict view
    // (error.rb:96-100 EditConflict, view :conflict) — the "Conflict!"
    // alert, the CURRENT revision id in new-current-revision-id, and the
    // other actor's "has also been making changes" line. The browser
    // journey (checks-conflict.mjs) pins the form-refresh behavior on top
    // of these bytes.
    const freshRevision = await currentRevisionId(cardId);
    expect(loser.body).toContain("Conflict!");
    expect(loser.body).toContain("new-current-revision-id");
    expect(loser.body).toContain("has also been making changes");
    expect(loser.body).toContain(String(freshRevision));
    expect(loser.body).not.toContain(loserText); // the refused text renders nowhere

    // Stored state: the winner's text; the loser's text is stored NOWHERE.
    const row = await cardRow(name);
    expect(row?.db_content).toBe(winnerText);
    const loserWrites = await storage!.counting.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_changes WHERE value = ?", [loserText],
    );
    expect(Number(loserWrites.rows[0]?.n)).toBe(0);
    // Exactly TWO actions on the card: the create + the winner's update.
    expect(await actionCount(cardId)).toBe(2);
  });

  it("race 2 — A holds an edit form while B DELETES the card: A's submit is refused 409, the card stays trashed with its history frozen, nothing is resurrected", async () => {
    const name = "Race Delete Target";
    await createByName(name, "content before delete");
    const cardId = await cardIdOf(name);
    const revision = await currentRevisionId(cardId);
    const actionsAtHold = await actionCount(cardId);

    // B deletes through the RESTful verb while A's form is open.
    const deleted = await call("DELETE", `/${name.replace(/ /g, "_")}`, undefined, annToken);
    expect(deleted.status, deleted.body).toBe(303);
    const afterDelete = await cardRow(name);
    expect(afterDelete?.trash).toBe(1);
    const actionsAtDelete = await actionCount(cardId);

    // A submits the held form against the now-deleted card.
    const stale = await call("POST", `/update/${name.replace(/ /g, "_")}`, {
      "card[content]": "joe text into a deleted card",
      "card[last_action_id_before_edit]": String(revision),
    }, joeToken);
    expect(stale.status, stale.body).toBe(409);
    expect(stale.body).toContain("Card changed or was deleted while being edited");

    // No resurrection, no content loss on the stored side, no new history.
    const after = await cardRow(name);
    expect(after?.trash).toBe(1);
    expect(after?.db_content).toBe("content before delete");
    expect(after?.id).toBe(cardId);
    const liveRows = await storage!.counting.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards WHERE key = ? AND trash = 0", [after!.key],
    );
    expect(Number(liveRows.rows[0]?.n)).toBe(0);
    expect(await actionCount(cardId)).toBe(actionsAtDelete);
    expect(actionsAtDelete).toBeGreaterThanOrEqual(actionsAtHold);
    // A's refused text is stored nowhere.
    const refusedWrites = await storage!.counting.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_changes WHERE value = ?", ["joe text into a deleted card"],
    );
    expect(Number(refusedWrites.rows[0]?.n)).toBe(0);
  });

  it("race 3 — A holds an edit form while B RENAMES the card: A's save follows the CREATE arm and stores at the freed old name as a new card; the renamed card keeps its state (Ruby uri_fetch parity)", async () => {
    const name = "Race Rename Target";
    const moved = "Race Rename Target Moved";
    await createByName(name, "content before rename");
    const originalId = await cardIdOf(name);
    const revision = await currentRevisionId(originalId);

    // B renames through the form's card[name] field.
    const renamed = await call("POST", `/update/${name.replace(/ /g, "_")}`, {
      "card[name]": moved,
      _method: "patch",
    }, annToken);
    expect(renamed.status, renamed.body).toBe(303);
    const movedRow = await cardRow(moved);
    expect(movedRow?.id).toBe(originalId);
    expect(movedRow?.db_content).toBe("content before rename");
    expect(await cardRow(name)).toBeUndefined();

    // A submits the held form to the OLD name.
    const stale = await call("POST", `/update/${name.replace(/ /g, "_")}`, {
      "card[content]": "joe text into the old name",
      "card[last_action_id_before_edit]": String(revision),
    }, joeToken);
    // The old name resolves to nothing live, so rest.rb:17 routes the save
    // to create: a SUCCESS (303), not a conflict and not a silent loss.
    expect(stale.status, stale.body).toBe(303);

    // A's text survived — on a NEW card at the freed old name.
    const orphanRow = await cardRow(name);
    expect(orphanRow?.id).toBeGreaterThan(originalId);
    expect(orphanRow?.trash).toBe(0);
    expect(orphanRow?.db_content).toBe("joe text into the old name");
    // The renamed card is untouched by A's save.
    expect((await cardRow(moved))?.db_content).toBe("content before rename");
    expect((await cardRow(moved))?.id).toBe(originalId);
    // A's save created no new history on the RENAMED card.
    const renamedActions = await storage!.counting.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ?", [originalId],
    );
    const orphanActions = await storage!.counting.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ?", [orphanRow!.id],
    );
    expect(Number(orphanActions.rows[0]?.n)).toBe(1); // its own create only
    expect(Number(renamedActions.rows[0]?.n)).toBeGreaterThan(0);
  });

  it("race 3 sibling — A's save lands BEFORE B's rename: the rename carries A's fresh content to the new name (no loss, no orphan)", async () => {
    const name = "Race Rename After Save";
    const moved = "Race Rename After Save Moved";
    await createByName(name, "base before the dance");
    const cardId = await cardIdOf(name);
    const revision = await currentRevisionId(cardId);

    const saved = await call("POST", `/update/${name.replace(/ /g, "_")}`, {
      "card[content]": "joe fresh text",
      "card[last_action_id_before_edit]": String(revision),
    }, joeToken);
    expect(saved.status, saved.body).toBe(303);

    const renamed = await call("POST", `/update/${name.replace(/ /g, "_")}`, {
      "card[name]": moved,
      _method: "patch",
    }, annToken);
    expect(renamed.status, renamed.body).toBe(303);

    const row = await cardRow(moved);
    expect(row?.id).toBe(cardId);
    expect(row?.db_content).toBe("joe fresh text");
    expect(await cardRow(name)).toBeUndefined();
  });

  it("race 4 — two actors create the SAME NEW NAME in the same window: one card exists, the loser is refused by the name-taken validation, never a 500", async () => {
    const name = "Race Duplicate Name";
    const path = `/card/create/${name.replace(/ /g, "_")}`;
    // Both creates fire in the same window; the mark carries the name so
    // each request is a plain uri_fetch create with its own content.
    const [joeCreate, annCreate] = await Promise.all([
      call("POST", path, { "card[content]": "joe duplicate text" }, joeToken),
      call("POST", path, { "card[content]": "ann duplicate text" }, annToken),
    ]);

    const statuses = [joeCreate.status, annCreate.status].sort((a, b) => a - b);
    expect(statuses[0], `joe=${joeCreate.status} ann=${annCreate.status}`).toBe(303);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    expect(statuses[1]).toBeLessThan(500); // a validation refusal, not a crash
    const loser = joeCreate.status === 303 ? annCreate : joeCreate;
    expect(loser.body).toContain("Error (");

    const rows = await storage!.counting.query<{ db_content: string | null; trash: number }>(
      "SELECT db_content, trash FROM cards WHERE key = ?", ["race_duplicate_name"],
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].trash).toBe(0);
    const loserText = joeCreate.status === 303 ? "ann duplicate text" : "joe duplicate text";
    const loserWrites = await storage!.counting.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_changes WHERE value = ?", [loserText],
    );
    expect(Number(loserWrites.rows[0]?.n)).toBe(0);
  });

  it("race 5 — B saves the SHARED EMBEDDED CHILD while A saves a host card: both land, A's revision is unmoved by B's child save, the include reference stays present", async () => {
    const child = "Race Zed";
    const hostOne = "Race Host One";
    const hostTwo = "Race Host Two";
    await createByName(child, "zed v1");
    await createByName(hostOne, "see {{Race Zed}}");
    await createByName(hostTwo, "also {{Race Zed}}");
    const zedId = await cardIdOf(child);
    const hostOneId = await cardIdOf(hostOne);
    const hostTwoId = await cardIdOf(hostTwo);
    const hostRevision = await currentRevisionId(hostOneId);
    const hostActionsBefore = await actionCount(hostOneId);

    // B saves the child while A saves one of its host cards, concurrently.
    const [zedSave, hostSave] = await Promise.all([
      call("POST", `/update/${child.replace(/ /g, "_")}`, {
        "card[content]": "zed v2 by ann",
      }, annToken),
      call("POST", `/update/${hostOne.replace(/ /g, "_")}`, {
        "card[content]": "host one v2 see {{Race Zed}}",
        "card[last_action_id_before_edit]": String(hostRevision),
      }, joeToken),
    ]);
    expect(zedSave.status, zedSave.body).toBe(303);
    expect(hostSave.status, hostSave.body).toBe(303);

    // Both edits landed on their own cards; nothing corrupted either side.
    expect((await cardRow(child))?.db_content).toBe("zed v2 by ann");
    expect((await cardRow(hostOne))?.db_content).toBe("host one v2 see {{Race Zed}}");
    expect((await cardRow(hostTwo))?.db_content).toBe("also {{Race Zed}}");
    // B's child save did NOT move A's host revision: A's own save is the
    // only new action on Host One (no spurious conflict, no phantom act).
    expect(await actionCount(hostOneId)).toBe(hostActionsBefore + 1);
    // The include reference Host One -> Zed survived both saves: A's save
    // rebuilt the referer's out-rows from content that still nests Zed, so
    // an "I" row naming Zed's id exists. (is_present stays NULL — Ruby's
    // create_references_out insert omits it, all.rb:105-110, and the port
    // reproduces that exactly; refresh-references-out.ts:10-12.)
    const refs = await storage!.counting.query<{ ref_type: string; referee_id: number | null }>(
      "SELECT ref_type, referee_id FROM card_references WHERE referer_id = ?",
      [hostOneId],
    );
    expect(refs.rows, JSON.stringify(refs.rows)).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref_type: "I", referee_id: zedId })]),
    );
  });

  it("race 5 subcard channel — a parent form carrying a STALE subcard field overwrites the child another actor saved directly (measured Ruby-parity window: no per-subcard conflict guard)", async () => {
    const parent = "Race Parent";
    await createByName(parent, "parent v1", { "card[subcards][+note][content]": "note v1" });
    // Junction cards store NULL name/key columns — the parts carry the
    // identity (lexicon [left_id, right_id]); read the child through the
    // engine's own junction resolution, the reader the site itself uses.
    const junctionName = "Race Parent+note";
    const readChild = async () =>
      (await storage!.fetcher.fetchByName(junctionName))?.dbContent ?? null;
    expect(await readChild()).toBe("note v1");

    // B saves the child DIRECTLY while the parent's form sits open.
    const direct = await call("POST", "/update/Race_Parent+note", {
      "card[content]": "note v2 by ann (direct)",
    }, annToken);
    expect(direct.status, direct.body).toBe(303);
    expect(await readChild()).toBe("note v2 by ann (direct)");

    // A submits the parent form whose subcard field still holds note v1.
    const parentRevision = await currentRevisionId(await cardIdOf(parent));
    const parentSave = await call("POST", `/update/${parent.replace(/ /g, "_")}`, {
      "card[content]": "parent v2",
      "card[subcards][+note][content]": "note v1 (stale form copy)",
      "card[last_action_id_before_edit]": String(parentRevision),
    }, joeToken);
    expect(parentSave.status, parentSave.body).toBe(303);

    // MEASURED (parity, not aspiration): the parent's save assigns the
    // posted subcard content — B's direct child edit is overwritten with
    // A's stale form copy, silently. Ruby behaves identically: subcards
    // save through process_subcards with no last_action_id_before_edit of
    // their own, and detect_conflict rides only the act card
    // (mod/history set/all/history/events.rb:19-22, on: :update for the
    // fetched card; the nested +note params carry content only).
    const after = await readChild();
    expect(after).toBe("note v1 (stale form copy)");
    // The overwrite is real history on the child (its actions grew by the
    // parent act's subcard store) — reachable through the child's history
    // view, not a torn row.
    const junctionRow = await storage!.fetcher.fetchByName(junctionName);
    expect(junctionRow?.id).toBeTypeOf("number");
    const childActions = await storage!.counting.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ?", [junctionRow!.id!],
    );
    expect(Number(childActions.rows[0]?.n)).toBeGreaterThanOrEqual(2);
  });
});
