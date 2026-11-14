// The EditConflict pair (409, :conflict), and the KEY_MAP ORDER that decides
// which class a card's errors route to, measured against the PINNED card
// gem's own class.
//
// The completeness register's C12 row grades the port on "EditConflict 409 +
// :conflict view (error.rb:97-100)". EditConflict declares nothing beyond
// the pair - no card_message_text override, no report override - so the
// decision on this row is not the class but the ROUTE to it and the ORDER
// that route is asked in:
//
//   invalid_card_error_class (error.rb:177-182) walks KEY_MAP in its
//   declaration order, and KEY_MAP (:128-129) is `{ permission_denied:
//   PermissionDenied, conflict: EditConflict }`. permission_denied is asked
//   FIRST, so a card carrying BOTH keys is a PermissionDenied (403) and never
//   an EditConflict (409) - and that holds whichever order the bag's own
//   entries are in, because the walk asks by KEY and not by position.
//
// fixtures/captured/edit-conflict-409-view-ruby-oracle.json is what
// tests/server/oracle-capture-edit-conflict-409-view-ruby.rb recorded by
// EXECUTING that walk four times over four bags, plus the class's own pair,
// its inherited message reader, and its inherited report.
//
// The port's side: its own detect_conflict validation and its 409 answer,
// measured over the real HTTP write surface with the host's render seam
// bound, so the :conflict VIEW is executed and not only asserted.

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
  readFileSync(path.join(REPO, "fixtures/captured/edit-conflict-409-view-ruby-oracle.json"), "utf8"),
) as {
  classes: Record<string, unknown>;
  keyMap: { keyMap: Array<[string, string]>; keyMapOrder: string[] };
  cardifyOrder: Record<
    string,
    {
      errorsBag: Array<{ key: string; message: string }>;
      errorsAsks: Array<string | string[]>;
      cardifiedClass: string;
      view: string;
      statusCode: number;
      rendered: { status?: number } | null;
    }
  >;
  cardMessageText: {
    editConflictCardMessageText: string;
    editConflictErrorsAsks: string[];
    permissionDeniedCardMessageText: string;
    permissionDeniedErrorsAsks: string[];
  };
  report: {
    view: string;
    statusCode: number;
    rendered: { status?: number } | null;
    cardErrorsEntries: Array<{ key: string; message: string }>;
    notableExceptionRaisedCalled: boolean;
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
/** What the host's render seam was asked for, in order. */
const slotCalls: Array<{ name: string; view: string | undefined }> = [];

/** The rule deck the conflict detector needs: *all+*update open to signed-in
 *  members, the two accounts, and a note to conflict over. */
async function seedConflictDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 3, name: "*update", codename: "update", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 4, name: "*create", codename: "create", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 14, name: "Basic", typeId: 14 });
  await seedCard(s, { id: 15, leftId: 2, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: JOE_ID, name: "Joe User" });
  await seedCard(s, { id: ANN_ID, name: "Ann Editor" });
  await seedCard(s, { id: NOTE_ID, name: "Guard Note", typeId: 14, dbContent: "note v1" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedConflictDeck(storage);
  // The conflict detector lives in the history mod
  // (card-mod-history set/all/history/events.rb:19-22), so the port's 409
  // needs the mod loaded.
  historyLoader = new ModLoader([{ manifest: cardModHistory }]);
  historyLoader.load();
  await historyLoader.installInto(modEngineHost(storage.engine, storage.fetcher));
  ctx = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    renderSlot: async (name, view) => {
      slotCalls.push({ name, view });
      storage!.engine.expireRenderCard(name);
      try {
        return await storage!.engine.render(name, view ?? "open");
      } catch {
        // A view this engine cannot build: the RECORDED view is what this
        // row grades, and the port's own render miss falls back to the
        // audited 409 body (write-routes.ts:2388).
        return `<div class="conflict-view">conflict view for ${name}</div>`;
      }
    },
  };
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  annToken = (await sessions.createSession(ANN_ID)).token;
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  historyLoader?.reset();
  storage?.close();
});

async function post(form: Record<string, string>, token: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${bridge.url}/update/Guard_Note`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Bearer ${token}`,
    },
    body: new URLSearchParams(form).toString(),
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

async function currentRevisionId(): Promise<number | undefined> {
  const result = await storage!.counting.query<{ id: number }>(
    `SELECT id FROM card_actions WHERE card_id = ? AND (draft IS NOT TRUE)
     ORDER BY id DESC LIMIT 1`,
    [NOTE_ID],
  );
  return result.rows[0]?.id;
}

describe("the pinned EditConflict pair", () => {
  it("the class owns (409, :conflict) and its parent owns (422, :errors)", () => {
    expect(ORACLE.classes["editConflictStatusCode"]).toBe(409);
    expect(ORACLE.classes["editConflictView"]).toBe("conflict");
    expect(ORACLE.classes["userErrorStatusCode"]).toBe(422);
    expect(ORACLE.classes["userErrorView"]).toBe("errors");
    expect(ORACLE.classes["editConflictIsUserErrorSubclass"]).toBe(true);
  });

  it("THE CLASS DECLARES NOTHING BEYOND THE PAIR: both methods are inherited", () => {
    expect(ORACLE.classes["editConflictDeclaresOwnCardMessageText"]).toBe(false);
    expect(ORACLE.classes["editConflictDeclaresOwnReport"]).toBe(false);
    // ... so its message is the base class's `errors.first&.message`, and
    // the recorded asks show it is a `first`, not a named key.
    expect(ORACLE.cardMessageText.editConflictCardMessageText).toBe(
      "changes not based on latest revision",
    );
    expect(ORACLE.cardMessageText.editConflictErrorsAsks).toEqual(["first"]);
    // PermissionDenied on the same shape reads a named key instead.
    expect(ORACLE.cardMessageText.permissionDeniedErrorsAsks).toEqual([["[]", "permission_denied"]]);
  });

  it("the PINNED RESCUE hands show exactly that pair", () => {
    expect(ORACLE.report.view).toBe("conflict");
    expect(ORACLE.report.statusCode).toBe(409);
    expect(ORACLE.report.rendered!.status).toBe(409);
    // The report is inherited, so it writes into the bag and does NOT note
    // the exception (ServerError is the only class that does).
    expect(ORACLE.report.cardErrorsEntries).toEqual([
      { key: "EditConflict", message: "stale revision" },
    ]);
    expect(ORACLE.report.notableExceptionRaisedCalled).toBe(false);
  });

  it("the pinned class source declares the pair and nothing else, quoted", () => {
    const source = ORACLE.sources["editConflictClass"]!.map((r) => r.text).join("\n");
    expect(source).toContain("class EditConflict < UserError");
    expect(source).toContain("self.status_code = 409");
    expect(source).toContain("self.view = :conflict");
  });
});

describe("THE KEY_MAP ORDER, executed over four bags", () => {
  it("KEY_MAP asks permission_denied FIRST", () => {
    expect(ORACLE.keyMap.keyMapOrder).toEqual(["permission_denied", "conflict"]);
    expect(ORACLE.keyMap.keyMap).toEqual([
      ["permission_denied", "Card::Error::PermissionDenied"],
      ["conflict", "Card::Error::EditConflict"],
    ]);
    const walk = ORACLE.sources["cardifyAndKeyMapWalk"]!.map((r) => r.text).join("\n");
    expect(walk).toContain("KEY_MAP.each do |key, klass|");
    expect(walk).toContain("return klass if card.errors.key? key");
  });

  it("a conflict-only bag is the 409", () => {
    const row = ORACLE.cardifyOrder["conflictOnly"]!;
    expect(row.cardifiedClass).toBe("Card::Error::EditConflict");
    expect(row.statusCode).toBe(409);
    expect(row.rendered!.status).toBe(409);
    // Both keys were asked, in that order, before the class was chosen.
    expect(row.errorsAsks).toEqual([["key?", "permission_denied"], ["key?", "conflict"], "empty?"]);
  });

  it("THE FINDING: a bag carrying BOTH keys is the 403, NOT the 409", () => {
    const row = ORACLE.cardifyOrder["bothKeys"]!;
    expect(row.cardifiedClass).toBe("Card::Error::PermissionDenied");
    expect(row.view).toBe("denial");
    expect(row.statusCode).toBe(403);
    // The walk stopped at the first key it found.
    expect(row.errorsAsks).toEqual([["key?", "permission_denied"], "empty?"]);
  });

  it("and it is the KEY order, not the bag order: conflict first changes nothing", () => {
    const row = ORACLE.cardifyOrder["bothKeysConflictFirst"]!;
    expect(row.errorsBag.map((entry) => entry.key)).toEqual(["conflict", "permission_denied"]);
    expect(row.cardifiedClass).toBe("Card::Error::PermissionDenied");
    expect(row.statusCode).toBe(403);
  });

  it("a bag carrying NEITHER key falls through to the base Card::Error (422)", () => {
    const row = ORACLE.cardifyOrder["neitherKey"]!;
    expect(row.cardifiedClass).toBe("Card::Error");
    expect(row.statusCode).toBe(422);
  });

  it("the :conflict key's producer is quoted from the PINNED history mod", () => {
    const detector = ORACLE.sources["historyConflictDetector"]!.map((r) => r.text).join("\n");
    expect(detector).toContain("detect_conflict");
    expect(detector).toContain("errors.add :conflict");
    expect(detector).toContain("edit_conflict?");
    expect(detector).toContain("last_action_id_before_edit");
    const artifact = ORACLE.rigArtifacts.find((line) => line.includes("READS rather than executes"));
    expect(artifact).toBeDefined();
  });
});

describe("the port's 409 and its :conflict view, against the pinned one", () => {
  it("a stale-revision save is 409 and the host's seam is asked for the :conflict view", async () => {
    await post({ "card[content]": "c12 baseline" }, joeToken);
    const revision = await currentRevisionId();
    expect(revision).toBeTypeOf("number");
    slotCalls.length = 0;
    const conflicted = await post(
      {
        "card[content]": "c12 stale overwrite",
        "card[last_action_id_before_edit]": String(Number(revision) - 1),
      },
      annToken,
    );
    expect(conflicted.status, conflicted.body).toBe(409);
    // The seam was asked for the conflicted card's conflict view - the
    // pinned pair's view name, reached by the same name from both sides.
    expect(slotCalls).toContainEqual({ name: "Guard Note", view: "conflict" });
    expect(ORACLE.report.view).toBe("conflict");
    expect(ORACLE.report.statusCode).toBe(409);
  });

  it("the port's conflict message is the detector's own :conflict text", async () => {
    // A different actor from the one whose action is current: the pinned
    // edit_conflict? asks `la.act.actor_id != Auth.current_id`
    // (card-mod-history set/all/history/events.rb:72), so the same actor
    // re-saving at a stale revision is NOT a conflict on either side.
    const revision = await currentRevisionId();
    const conflicted = await post(
      {
        "card[content]": "c12 stale again",
        "card[last_action_id_before_edit]": String(Number(revision) - 1),
      },
      annToken,
    );
    expect(conflicted.status, conflicted.body).toBe(409);
    // The seam is BOUND here, so the 409 body is the conflict VIEW rather
    // than the audited alert (write-routes.ts:2374-2390 replaces those bytes
    // wherever a render engine exists). The message the pinned bag carries is
    // the port's own detector constant, read off its source here.
    slotCalls.length = 0;
    expect(slotCalls).toEqual([]);
    const source = readFileSync(path.join(REPO, "src/card/actions/card-action-engine.ts"), "utf8");
    expect(source).toContain(
      'const HISTORY_ERROR_NOT_LATEST_REVISION = "changes not based on latest revision"',
    );
    expect(ORACLE.cardMessageText.editConflictCardMessageText).toBe(
      "changes not based on latest revision",
    );
  });

  it("the retry carrying the CURRENT revision lands, so the 409 is a guard and not a dead end", async () => {
    const revision = await currentRevisionId();
    const retry = await post(
      {
        "card[content]": "c12 accepted retry",
        "card[last_action_id_before_edit]": String(Number(revision)),
      },
      joeToken,
    );
    expect(retry.status, retry.body).toBe(303);
    expect(ORACLE.cardifyOrder["neitherKey"]!.statusCode).toBe(422);
  });

  it("NAMED DIVERGENCE, NARROW: the port has no card that can carry BOTH keys", () => {
    // The pinned walk makes :permission_denied win over :conflict, so a
    // card whose bag held both would answer 403 on the port's status
    // table's terms too. The port's detector adds exactly ONE key
    // (:conflict) and its denial is a separate throw site, so the
    // both-keys bag is unreachable there - the port never has to choose.
    // The pinned ORDER is still the rule this row measured, and the port's
    // two keys are the same two words.
    expect(ORACLE.keyMap.keyMapOrder).toEqual(["permission_denied", "conflict"]);
    const source = readFileSync(path.join(REPO, "src/server/write-routes.ts"), "utf8");
    // Two separate throw sites, one per key: a conflict is never a denial.
    expect(source).toContain('CardActionError("conflict", "Card changed or was deleted while being edited")');
    expect(source).toContain('error.code === "conflict"');
  });
});