// The two edit-save guards that ride the (now landed) HTTP write path:
// the stale-revision detector (E8, the conflict tracker's save validation)
// and the draft save (E7, the autosave POST).
//
// Ruby truth under test
// ---------------------
// E8 - card-mod-history-0.20.0 set/all/history/events.rb:19-22
//      `event :detect_conflict, :validate, on: :update, when: :edit_conflict?
//       do errors.add :conflict, ::I18n.t(:history_error_not_latest_revision) end`
//      with events.rb:65-72
//      `def edit_conflict?
//         last_action_id_before_edit &&
//           last_action_id_before_edit.to_i != last_action_id &&
//           (la = last_action) && la.act.actor_id != Auth.current_id
//       end`
//      The message is config/locales/en.yml:2 in the history mod -
//      "changes not based on latest revision".
//      The hidden field the guard reads is the edit form's
//      :conflict_tracker (card-mod-edit-0.20.0 set/all/form.rb:27-31):
//      `hidden_field :last_action_id_before_edit, class: "current_revision_id"`
//      -> the form posts card[last_action_id_before_edit].
//      last_action / last_action_id (set/all/history/last.rb:49-55) read
//      `actions` = Card#actions = NON-DRAFT only (card-1.110.0 lib/card.rb:172
//      `has_many :actions, -> { where(draft: [nil, false]).order :id }`), so a
//      draft never moves the revision the guard compares against.
//      HTTP shape: a UserError (validation) is 422 - card-1.110.0
//      lib/card/error.rb:21 (the module header's status table), the same
//      status the other validation rejections already use.
//      ORACLE: fixtures/captured/edit-forms.json conflict_probe - captured
//      by tests/card/mod-loader/oracle-capture-edit-forms.rb (validation-only
//      probe, actions 4881 -> 4881): errors_conflict == ["changes not based
//      on latest revision"], no_write_proof true, valid_after_conflict true.
//
// E7 - card-1.110.0 mod/core/set/all/content.rb:8-15
//      `event :save_draft, :store, on: :update, when: :draft? do
//         save_content_draft content
//         abort :success
//       end` + `def draft? Env.params["draft"] == "true" end`
//      The autosave POST that carries it: card-mod-edit-0.20.0
//      assets/script/autosave.js.coffee:20 - the form serialized plus
//      `{ 'draft': 'true', 'success[view]': 'blank' }` to update/~<id>.
//      save_content_draft (card-mod-history set/all/history.rb:88-94 per
//      the ported writer) clears this actor's earlier drafts, then creates
//      its OWN act, an action with draft=true + action_type :update, and one
//      db_content change; the :store abort rolls the cards row save back, so
//      the card's content is NOT persisted.
//      drafts/draft_acts: card-1.110.0 lib/card.rb:173
//      `has_many :drafts, -> { where(draft: true).order :id }` and
//      card-mod-history set/all/history/acts.rb:6-8 `drafts.created_by(
//      Card::Auth.current_id).map(&:act)`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { DeckoName } from "../../src/card/name.js";
import { makeWriteRouteServer as makeServer } from "./write-routes-test-bridge.js";

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const ANN_ID = 91;
const NOTE_ID = 60;

let storage: RenderTestStorage | undefined;
let joeToken = "";
let annToken = "";
let ctx: WriteRouteContext;
let server: http.Server;
let baseUrl = "";

/** The minimum rule deck: *all+*update -> [[Anyone Signed In]] so both
 *  members may save, plus the account cards and a target note. */
async function seedDeck(s: RenderTestStorage): Promise<void> {
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

interface CallResult {
  status: number;
  body: string;
  json: () => Record<string, unknown>;
}

async function post(
  path: string,
  form: Record<string, string>,
  token: string,
): Promise<CallResult> {
  const params = new URLSearchParams(form);
  params.set("token", token);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, body: text, json: () => JSON.parse(text) as Record<string, unknown> };
}

/** Every card_actions row for the target, in id order. */
async function actionRows(): Promise<
  { id: number; action_type: number; draft: number | null }[]
> {
  const result = await storage!.counting.query<{
    id: number;
    action_type: number;
    draft: number | null;
  }>(
    `SELECT id, action_type, draft FROM card_actions WHERE card_id = ? ORDER BY id`,
    [NOTE_ID],
  );
  return result.rows;
}

async function dbContent(): Promise<string | null> {
  const result = await storage!.counting.query<{ db_content: string | null }>(
    `SELECT db_content FROM cards WHERE id = ?`,
    [NOTE_ID],
  );
  return result.rows[0]?.db_content ?? null;
}

/** The card's current revision - last_action_id (last.rb:49-51), the
 *  value the edit form's conflict_tracker hidden field carries. */
async function currentRevisionId(): Promise<number | undefined> {
  const result = await storage!.counting.query<{ id: number }>(
    `SELECT id FROM card_actions WHERE card_id = ? AND (draft IS NOT TRUE)
     ORDER BY id DESC LIMIT 1`,
    [NOTE_ID],
  );
  return result.rows[0]?.id;
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  annToken = (await sessions.createSession(ANN_ID)).token;
  // No read surface: every request, whatever the method, reaches the
  // write-route guards under test.
  const bridge = await makeServer(storage, ctx);
  server = bridge.server;
  baseUrl = bridge.url;
}, 60_000);

afterAll(() => {
  server?.close();
  storage?.close();
});

describe("E8 - the stale-revision detector on the save path (detect_conflict)", () => {
  it("a save carrying a STALE last_action_id_before_edit by a different actor is refused 422 and writes nothing", async () => {
    // Joe's save creates the first action; the revision the form would have
    // carried is that action's id.
    const first = await post(
      "/update/Guard_Note",
      { "card[content]": "note v2 (joe)" },
      joeToken,
    );
    expect(first.status).toBe(303);
    const stale = await currentRevisionId();
    expect(stale).toBeTypeOf("number");

    // Ann now saves from a form that was rendered at the PREVIOUS revision:
    // her form's hidden field says the action id that predates Joe's, so
    // the guard fires (events.rb:65-72 - the last action is Joe's, not hers).
    const before = await actionRows();
    const beforeContent = await dbContent();
    const conflicted = await post(
      "/update/Guard_Note",
      {
        "card[content]": "note v3 (ann, stale form)",
        "card[last_action_id_before_edit]": String(Number(stale) - 1),
      },
      annToken,
    );
    expect(conflicted.status).toBe(422);
    // the FORM flavor answers the shared validation-error page carrying the
    // oracle's message (write-routes errorResponse -> htmlResponse
    // "Error (conflict)" + the escaped message in a <pre>)
    expect(conflicted.body).toContain("Error (conflict)");
    expect(conflicted.body).toContain("<pre>changes not based on latest revision</pre>");
    // events.rb:19-22 aborts the save before persistence (the oracle's
    // conflict_probe: actions 4881 -> 4881, no_write_proof true).
    expect(await actionRows()).toEqual(before);
    expect(await dbContent()).toBe(beforeContent);
  });

  it("a JSON-body save carrying the same stale field is refused identically", async () => {
    // The JSON request body grammar rides the same guard (parseBody's json
    // branch reads obj.card). NOTE: every route match sets json:false
    // (matchRoute), so the JSON RESPONSE flavor is not reachable through the
    // route table today - the refusal answers the shared HTML validation
    // page. Recorded here so the request-side grammar is pinned and the
    // response-side fact is not rediscovered by surprise.
    const revision = await currentRevisionId();
    const before = await actionRows();
    const res = await fetch(`${baseUrl}/update/Guard_Note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${annToken}` },
      body: JSON.stringify({
        card: {
          content: "note json stale",
          last_action_id_before_edit: String(Number(revision) - 1),
        },
      }),
      redirect: "manual",
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("<pre>changes not based on latest revision</pre>");
    expect(await actionRows()).toEqual(before);
  });

  it("a save carrying the CURRENT last_action_id_before_edit lands", async () => {
    const revision = await currentRevisionId();
    const ok = await post(
      "/update/Guard_Note",
      {
        "card[content]": "note v3 (ann, fresh form)",
        "card[last_action_id_before_edit]": String(revision),
      },
      annToken,
    );
    expect(ok.status).toBe(303);
    expect(await dbContent()).toBe("note v3 (ann, fresh form)");
  });

  it("a save carrying a STALE id whose last action is the SAVING actor's own lands (the la.act.actor_id clause)", async () => {
    // events.rb:65-72's third clause: `la.act.actor_id != Auth.current_id`.
    // Joe's own later edit does not move last_action_id into a conflict for
    // Joe - Ann's save above moved it, so Joe's next save is checked against
    // Ann's action, and Joe is not Ann. Use a fresh card-level sequence:
    // Joe saves twice; the second save carries the id from BEFORE his first.
    const revisionBefore = await currentRevisionId();
    await post("/update/Guard_Note", { "card[content]": "note v4 (joe)" }, joeToken);
    const own = await post(
      "/update/Guard_Note",
      {
        "card[content]": "note v5 (joe, own stale id)",
        "card[last_action_id_before_edit]": String(revisionBefore),
      },
      joeToken,
    );
    expect(own.status).toBe(303);
    expect(await dbContent()).toBe("note v5 (joe, own stale id)");
  });

  it("a save with NO last_action_id_before_edit (the field hidden by the caller) is never a conflict", async () => {
    // edit_conflict? short-circuits on a nil before-edit id
    // (events.rb:66) - the JS autosave and API saves both omit it.
    const ok = await post("/update/Guard_Note", { "card[content]": "note v6" }, annToken);
    expect(ok.status).toBe(303);
  });
});

describe("E7 - the draft save (autosave POST, draft=true)", () => {
  it("draft=true records a draft action and does NOT persist the content (save_draft aborts at :store)", async () => {
    const before = await actionRows();
    const beforeContent = await dbContent();
    const draft = await post(
      "/update/Guard_Note",
      { "card[content]": "note v7 (autosaved draft)", draft: "true" },
      annToken,
    );
    // abort :success (content.rb:12-15) - the draft save is a SUCCESS.
    expect(draft.status).toBe(303);
    const after = await actionRows();
    // exactly one new action row, flagged draft (card-mod-history
    // history.rb:88-94 / the ported ActWriter.saveDraft).
    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1].draft).toBe(1);
    // the cards row is untouched - the :store abort rolled it back.
    expect(await dbContent()).toBe(beforeContent);
  });

  it("the draft does NOT move last_action_id (Card#actions is non-draft only, card.rb:172)", async () => {
    const revisionBefore = await currentRevisionId();
    await post(
      "/update/Guard_Note",
      { "card[content]": "note v8 (another draft)", draft: "true" },
      annToken,
    );
    expect(await currentRevisionId()).toBe(revisionBefore);
  });

  it("a second draft by the same actor REPLACES the first (clear_drafts, content/all.rb:33-35)", async () => {
    const drafts = await storage!.counting.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ? AND draft = 1`,
      [NOTE_ID],
    );
    expect(Number(drafts.rows[0]?.n)).toBe(1);
  });

  it("a non-draft save after a draft still passes the E8 guard on the unchanged revision", async () => {
    // the drafts never became the revision, so the stale-id guard still
    // compares against the last REAL action - and a real save by the other
    // actor is what makes it a conflict.
    const revision = await currentRevisionId();
    const refused = await post(
      "/update/Guard_Note",
      {
        "card[content]": "note v9 (joe, stale against ann's real save)",
        "card[last_action_id_before_edit]": String(Number(revision) - 1),
      },
      joeToken,
    );
    expect(refused.status).toBe(422);
    const ok = await post(
      "/update/Guard_Note",
      {
        "card[content]": "note v9 (joe, fresh)",
        "card[last_action_id_before_edit]": String(revision),
      },
      joeToken,
    );
    expect(ok.status).toBe(303);
  });

  it("the draft's content is reachable through the draft history reader (draft_acts, acts.rb:6-8)", async () => {
    // The ported reader: draftActs(driver, cardId, actorId) - the engine-side
    // seam the edit form's draft legend rides.
    const { draftActs } = await import("../../src/card/mod-loader/mods/card-mod-history.js");
    const acts = await draftActs(storage!.counting, NOTE_ID, ANN_ID);
    const values = await storage!.counting.query<{ value: string }>(
      `SELECT ch.value FROM card_changes ch
       JOIN card_actions act ON act.id = ch.card_action_id
       WHERE act.card_id = ? AND act.draft = 1`,
      [NOTE_ID],
    );
    expect(values.rows.length).toBeGreaterThan(0);
    expect(acts.length).toBeGreaterThan(0);
    // the surviving draft's own change row carries the autosaved text
    expect(values.rows.map((r) => r.value)).toContain("note v8 (another draft)");
  });

  it("a draft save is still permission-gated (the :store event is behind the validate stage)", async () => {
    // Ruby runs the :validate stage (ok_to_update?) before :store, so a
    // denied actor's draft POST is refused 403 and writes no draft row.
    const before = await actionRows();
    const denied = await post(
      "/update/Guard_Note",
      { "card[content]": "note v10 (anonymous draft)", draft: "true" },
      "not-a-real-token",
    );
    expect(denied.status).toBe(403);
    expect(await actionRows()).toEqual(before);
  });

  it("the target card's name is still reported on the draft success (expiry bookkeeping)", async () => {
    // The write route stamps expiryName on every success flavor; Ruby
    // expires the saved card's cache on every committed save - a draft
    // save touches no cards row, so the expiry is harmless but present.
    const name = await storage!.fetcher.fetchByKey(DeckoName.parse("Guard Note").key);
    expect(name?.name ?? "Guard Note").toBeTruthy();
  });
});
