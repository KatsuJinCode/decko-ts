// The card-mod-history render-time views (:history / :act / :action_summary)
// rendered through the real RenderEngine over the render-time history seam
// (RenderEngine#prepareHistoryRender -> src/card/history/render-seam.ts),
// byte-compared against the live Ruby oracle
// fixtures/captured/history-views.json.
//
// Oracle provenance: tools/oracle/history_capture.rb ran INSIDE the live
// decko-0.20.0 demo app (tools/oracle/decko-oracle-app, MariaDB rung
// 127.0.0.1:33061) via `bundle exec decko runner`, seeding a convergent
// six-act family ("History Probe" create / content update / rename /
// inclusion update + "+child" create / content update) and rendering the
// three views AS ANONYMOUS (the wiring evidence for "anonymous reads
// history exactly when it reads the card" - the views carry no perms
// directive). The fixture in this worktree was re-captured 2026-09-28 from
// the same script; normalized bytes are identical across runs.
//
// Capture normalizations (applied to the Ruby side at capture time; this
// test applies the SAME masks to its own renders):
// - data-slot-id -> RANDOMIZED (SecureRandom.hex(10) by design);
// - the time_ago_in_words phrase -> TIME_AGO (wall-clock dependent);
// - DB-local ids in the byte surface -> N (act-id-, revision-, act_id=,
//   action_id=, data-card-id); the raw ids live in the fixture's "state"
//   block and this test seeds the matching SHAPED rows through the real
//   write path (ActWriter), so the byte shapes - not the id values - are
//   the contract.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import { ActWriter, cardFieldStateFromRow } from "../../../src/card/history/write-path.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/history-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  rendered: Record<string, string>;
};

/** The capture's normalization masks (see the module doc), extended with
 *  the two id shapes the capture script's own masks miss: the slot-JSON
 *  form (`action_id&quot;:4982` - the URL-param mask cannot reach inside
 *  the escaped attribute) and the revert href's revert_actions[] ids. Both
 *  sides of every comparison run through this function. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/act-id-\d+/g, "act-id-N")
    .replace(/revision-\d+/g, "revision-N")
    .replace(/act_id=\d+/g, "act_id=N")
    .replace(/action_id=\d+/g, "action_id=N")
    .replace(/action_id&quot;:\d+/g, "action_id&quot;:N")
    .replace(/revert_actions%5B%5D=\d+/g, "revert_actions%5B%5D=N")
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="N"')
    .replace(
      /(less than a minute|less than \d+ seconds|\d+ seconds?|about \d+ (hours?|days?|months?|years?)|\d+ (minutes?|hours?|days?|months?|years?)) ago/g,
      "TIME_AGO ago",
    );
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

/** The seed state the comparisons need: probe/child ids, the per-request
 *  act/action ids (the fixture's are normalized to N). */
let ids: {
  probeId: number;
  childId: number;
  actIds: number[];
  actionIds: number[];
} | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename/type/actor infrastructure (the set keys, the type-name
  // algebra, and the actor link bytes read these)
  await seedCard(s, { id: 1, name: "Decko Bot", typeId: 2 }); // the acts' actor
  await seedCard(s, { id: 2, name: "RichText" }); // the cardtypes' type card
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // *anon is the Anonymous card (Codename[:anonymous]) - the seam's
  // Card::Auth.current_id resolution reads it (Card::AnonymousID).
  await seedCard(s, { id: 15, name: "*anon", codename: "anonymous", typeId: 14 });
  // the read rule the anonymous verdict rides: *all+*read -> [[Anyone]]
  await seedCard(s, { id: 16, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 17, name: "*all+*read", leftId: 10, rightId: 16, typeId: 14, dbContent: "[[Anyone]]" });
  await seedCard(s, { id: 18, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedReference(s, 17, 18, "anyone");
  // the junction tag card (the child's right_id; the capture's right_id
  // 1314 is the demo deck's own "child" tag row)
  await seedCard(s, { id: 19, name: "child", typeId: 2 });

  // ---- the six-act family through the REAL write path (one request = one
  // act = one ActWriter, mirroring the capture's Card.create!/update!
  // sequence) ----
  const T0 = Date.parse("2026-09-28T06:00:00.000Z");
  let ticks = 0;
  const clock = () => new Date(T0 + ticks++ * 1000);
  const request = () =>
    new ActWriter({ driver: s.counting, actorId: 1, ipAddress: "127.0.0.1", now: clock });

  const created = await request().createCard({
    name: "History Probe",
    key: "history_probe",
    type_id: 2,
    db_content: "first body",
  });
  const probeId = created.cardId;
  const probeState = async () =>
    cardFieldStateFromRow(
      (await s.counting.query("SELECT * FROM cards WHERE id = ?", [probeId])).rows[0]! as never,
    );
  let before = await probeState();
  const upd1 = (await request().updateCard({
    cardId: probeId,
    before,
    after: { ...before, db_content: "second body" },
  }))!;
  before = await probeState();
  const renamed = (await request().updateCard({
    cardId: probeId,
    before,
    after: { ...before, name: "History Probe Renamed" },
    key: "history_probe_renamed",
  }))!;
  before = await probeState();
  const upd2 = (await request().updateCard({
    cardId: probeId,
    before,
    after: { ...before, db_content: "<p>third body with inclusion {{History Probe Renamed+child}}</p>" },
  }))!;

  // The child's request creates the junction AND - in the SAME act - the
  // simple "child" tag card: the capture's act carries both create actions
  // (4983 junction + 4984 tag; the demo deck's current state, re-captured
  // 2026-09-28). The tag ROW is seeded above (id 19, the junction's
  // right_id anchor); its CREATE ACTION rides the child's act between the
  // junction's and the child-update's action ids, exactly where the
  // capture places it. The INSERT mirrors the ActWriter's create-action
  // row shape (action_type 0 = create; no change rows - the capture's tag
  // create renders <i>empty</i>).
  const childCreated = await request().createCard({
    // compound cards store NULL name/key (P1.3.a) - the name resolves
    // through the junction chain (left History Probe Renamed + right child)
    name: null,
    key: null,
    type_id: 2,
    db_content: "child body",
    left_id: probeId,
    right_id: 19,
  });
  await storage!.counting.query(
    "INSERT INTO card_actions (card_id, card_act_id, action_type, draft) VALUES (19, ?, 0, 0)",
    [childCreated.actId],
  );
  const childId = childCreated.cardId;
  const childState = async () =>
    cardFieldStateFromRow(
      (await s.counting.query("SELECT * FROM cards WHERE id = ?", [childId])).rows[0]! as never,
    );
  const childBefore = await childState();
  const childUpd = (await request().updateCard({
    cardId: childId,
    before: childBefore,
    after: { ...childBefore, db_content: "child body v2" },
  }))!;

  // The {{inclusion}} reference the probe's content carries
  // (card_references ref_type I; history_card_ids walks it - history.rb:11-13).
  await seedReference(s, probeId, childId, "history_probe_renamed+child", "I");

  ids = {
    probeId,
    childId,
    actIds: [created.actId, upd1.actId, renamed.actId, upd2.actId, childCreated.actId, childUpd.actId],
    actionIds: [
      created.actionId,
      upd1.actionId,
      renamed.actionId,
      upd2.actionId,
      childCreated.actionId,
      childUpd.actionId,
    ],
  };

  loader = new ModLoader([{ manifest: cardModHistory }]);
  loader.load();
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The probe card's CURRENT row state name (renamed at act 3). */
const PROBE = "History Probe Renamed";

describe("card-mod-history render-time views vs the live Ruby oracle", () => {
  // TEST ORDER = THE CAPTURE SCRIPT'S RENDER ORDER (history -> act x3 ->
  // action_summary x3): the action-level ContentDiff memo
  // (differ.rb:79-86, lives on the cached Action record) makes the toggle
  // byte sequence-dependent - the FIRST render of an action checks
  // summary_omits_content? before the summary rendered (no toggle), later
  // renders see the memoized state (toggle). The oracle's standalone
  // :action_summary bytes were captured AFTER its :history render in the
  // same Ruby process, so this suite must reproduce that sequence.
  it("anonymous :history matches the captured revisions list byte-for-byte", async () => {
    const html = normalize(await storage!.engine.render(PROBE, "history"));
    expect(html).toBe(normalize(FIXTURE.rendered["probe#history"]));
  });
  it("anonymous :act (explicit parent act) matches the captured accordion item", async () => {
    const html = normalize(
      await storage!.engine.render(PROBE, "act", { actId: String(ids!.actIds[1]) }),
    );
    expect(html).toBe(normalize(FIXTURE.rendered["probe#act(parent_act_2)"]));
  });
  it("anonymous :act (act on the nested child) renders the child's action", async () => {
    const html = normalize(
      await storage!.engine.render(PROBE, "act", { actId: String(ids!.actIds[4]) }),
    );
    expect(html).toBe(normalize(FIXTURE.rendered["probe#act(child_act)"]));
  });
  it("anonymous :act (no act_id) falls to the last action's act", async () => {
    const html = normalize(await storage!.engine.render(PROBE, "act"));
    expect(html).toBe(normalize(FIXTURE.rendered["probe#act(no_param)"]));
  });
  it("anonymous :action_summary (update action) matches the captured diff bytes", async () => {
    // the capture's update_action = the FIRST content update
    // (parent_actions.find { update && id > first.id })
    const html = normalize(
      await storage!.engine.render(PROBE, "action_summary", {
        actionId: String(ids!.actionIds[1]),
      }),
    );
    expect(html).toBe(normalize(FIXTURE.rendered["probe#action_summary(update_action)"]));
  });
  it("anonymous :action_summary (create action) is the all-added diff", async () => {
    const html = normalize(
      await storage!.engine.render(PROBE, "action_summary", {
        actionId: String(ids!.actionIds[0]),
      }),
    );
    expect(html).toBe(normalize(FIXTURE.rendered["probe#action_summary(create_action)"]));
  });
  it("anonymous :action_summary (rename-only action) renders <i>empty</i>", async () => {
    const html = normalize(
      await storage!.engine.render(PROBE, "action_summary", {
        actionId: String(ids!.actionIds[2]),
      }),
    );
    expect(html).toBe(normalize(FIXTURE.rendered["probe#action_summary(rename_action)"]));
  });
  it("anonymous :action_expanded (update action) matches the captured complete-diff bytes", async () => {
    // PORTED 2026-09-30 (surfaces-batch2): the former negative pin
    // ("action_expanded stays the named remainder") flips — the view is
    // action_content's :expanded viewKind (the unconditional expand_less
    // toggle + the ContentDiff complete form). The capture's
    // action_expanded(update_action) was taken in the same Ruby process
    // AFTER :history (the ContentDiff memo warm) — this suite's render
    // order (the action_summary pins above rendered the same action first)
    // reproduces that memo state.
    const html = normalize(
      await storage!.engine.render(PROBE, "action_expanded", {
        actionId: String(ids!.actionIds[1]),
      }),
    );
    expect(html).toBe(normalize(FIXTURE.rendered["probe#action_expanded(update_action)"]));
  });

  it("anonymous :last_action_verb (last act = update) renders the edited anchor", async () => {
    // PORTED 2026-09-30 (surfaces-batch2): the probe's last act is the
    // inclusion update (upd2) whose action on the probe is an update — the
    // :edited arm. RENDERED-UNPINNED (no capture shard renders the name):
    // the anchor bytes are gem-source-derived — see the view fn's
    // derivation note (slotterify + add_to_path + the html link_to +
    // Rails 7.2 hash-insertion attribute order).
    const html = await storage!.engine.render(PROBE, "last_action_verb");
    expect(html).toBe(
      `<a class="last-edited slotter" rel="nofollow" href="/History_Probe_Renamed?view=history"` +
        ` data-remote="true">edited</a>`,
    );
  });

  it("anonymous :last_action_verb (last act = the create-only act) renders added", async () => {
    // The tag card (id 19) has exactly ONE act — its create (the act the
    // child's creation request opened, whose action on card 19 is
    // action_type 0). act.action_on(card.id) filters the act's actions to
    // the tag's own row, so the :create arm emits the bare verb.
    const html = await storage!.engine.render("child", "last_action_verb");
    expect(html).toBe("added");
  });
});
