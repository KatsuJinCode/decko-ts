import { describe, expect, it } from "vitest";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { buildFollowNotifyHook, CaptureTransport, fixedAuthAs, fixedFollowerResolver, fixedTemplateResolver } from "../../../src/card/notify/index.js";
import { createActionsTestStorage, seedStandardDeck, seedCard } from "./actions-test-storage.js";

async function deck() {
  const s = await createActionsTestStorage();
  await seedStandardDeck(s);
  await seedCard(s, { id: 500, name: "*derived file", codename: "asset_output" });
  await seedCard(s, { id: 501, name: "*asset output" }); // lookalike, no codename
  await seedCard(s, { id: 510, name: "Asset Holder" });
  const transport = new CaptureTransport();
  let otherCalls = 0;
  const engine = new CardActionEngine(s.engine, {
    actor: { id: 9, name: "Joe User" }, canWrite: () => true, notifyTransport: transport,
    integrationHooks: [
      buildFollowNotifyHook({
        followers: fixedFollowerResolver([{ followerId: 20, followerName: "Reader", followerEmail: "reader@example.test", followedSetName: "*all", followOption: "always" }]),
        template: fixedTemplateResolver({ to: "reader@example.test", from: "sender@example.test", subject: "Changed", textBody: "Changed", htmlBody: "Changed" }),
        authAs: fixedAuthAs({ id: 20, name: "Reader", email: "reader@example.test" }), defaultFrom: "sender@example.test",
      }),
      { stage: "integrate_with_delay", event: "synthetic_observer", notable: () => true, fire: async () => { otherCalls++; } },
    ],
  });
  return { s, engine, transport, otherCalls: () => otherCalls };
}
async function history(s: Awaited<ReturnType<typeof deck>>["s"]) {
  return Promise.all(["card_actions", "card_acts", "card_changes", "sqlite_sequence"].map(t => s.selectAll(`SELECT * FROM ${t} ORDER BY rowid`)));
}
async function snapshot(s: Awaited<ReturnType<typeof deck>>["s"]) {
  return Promise.all(["cards", "card_actions", "card_acts", "card_changes", "card_references", "sqlite_sequence"].map(t => s.selectAll(`SELECT * FROM ${t} ORDER BY rowid`)));
}

describe("asset-output stock history and follow opt-outs", () => {
  it("keeps aliased asset-output CRUD rows without history allocation or follow mail, preserving other hooks", async () => {
    const { s, engine, transport, otherCalls } = await deck();
    try {
      const before = await history(s);
      const made = await engine.createCard({ name: "Asset Holder+*derived file", content: "first" });
      await engine.updateCard({ cardId: made.cardId, content: "second" });
      await engine.deleteCard({ cardId: made.cardId });
      expect((await s.selectOne<{ trash: number; db_content: string }>("SELECT trash,db_content FROM cards WHERE id=?", [made.cardId]))).toEqual({ trash: 1, db_content: "second" });
      // The cards sequence necessarily advances for the real row; history sequences do not.
      expect((await history(s)).slice(0, 3)).toEqual(before.slice(0, 3));
      expect(await s.selectAll("SELECT * FROM sqlite_sequence WHERE name IN ('card_actions','card_acts','card_changes') ORDER BY name")).toEqual([]);
      expect(transport.count()).toBe(0);
      expect(otherCalls()).toBe(3);
    } finally { s.close(); }
  });
  it("does not suppress ordinary lookalike-named cards' history and notices", async () => {
    const { s, engine, transport } = await deck();
    try {
      const made = await engine.createCard({ name: "Asset Holder+*asset output", content: "ordinary" });
      await engine.updateCard({ cardId: made.cardId, content: "ordinary changed" });
      await engine.deleteCard({ cardId: made.cardId });
      expect(await s.count("card_actions")).toBe(3);
      expect(await s.count("card_acts")).toBe(3);
      expect(transport.count()).toBe(3);
    } finally { s.close(); }
  });
  it("keeps a missing parent's own action, without an asset-output action or allocation gap", async () => {
    const { s, engine, transport } = await deck();
    try {
      const made = await engine.createCard({ name: "Fresh Parent+*derived file", content: "derived" });
      const parent = await s.engine.fetchByName("Fresh Parent");
      const actions = await s.selectAll<{ id: number; card_id: number; super_action_id: number | null }>("SELECT id,card_id,super_action_id FROM card_actions ORDER BY id");
      expect(actions).toEqual([{ id: 1, card_id: parent!.id, super_action_id: null }]);
      expect(actions.some(a => a.card_id === made.cardId)).toBe(false);
      expect(transport.count()).toBe(0);
    } finally { s.close(); }
  });
  it("retains permission refusal atomicity for an asset-output update", async () => {
    const { s, engine } = await deck();
    try {
      const made = await engine.createCard({ name: "Asset Holder+*derived file", content: "kept" });
      const before = await snapshot(s);
      const denied = new CardActionEngine(s.engine, { actor: { id: 9, name: "Joe User" }, canWrite: () => false });
      await expect(denied.updateCard({ cardId: made.cardId, content: "refused" })).rejects.toThrow();
      expect(await snapshot(s)).toEqual(before);
    } finally { s.close(); }
  });
  it("keeps codename-based rename and revival history-less", async () => {
    const { s, engine, transport } = await deck();
    try {
      await seedCard(s, { id: 520, name: "Other Asset Holder" });
      const made = await engine.createCard({ name: "Asset Holder+*derived file", content: "first" });
      await engine.updateCard({ cardId: made.cardId, name: "Other Asset Holder+*derived file" });
      await engine.deleteCard({ cardId: made.cardId });
      const revived = await engine.createCard({ name: "Other Asset Holder+*derived file", content: "revived" });
      expect(revived.cardId).toBe(made.cardId);
      expect((await s.engine.fetchById(made.cardId))?.dbContent).toBe("revived");
      expect(await s.count("card_actions")).toBe(0);
      expect(await s.count("card_acts")).toBe(0);
      expect(transport.count()).toBe(0);
    } finally { s.close(); }
  });
  it("omits only asset-output child history when an ordinary parent is deleted", async () => {
    const { s, engine, transport } = await deck();
    try {
      const output = await seedCard(s, { leftId: 510, rightId: 500, dbContent: "derived" });
      const ordinary = await seedCard(s, { leftId: 510, rightId: 501, dbContent: "ordinary" });
      await engine.deleteCard({ cardId: 510 });
      const actions = await s.selectAll<{ card_id: number }>("SELECT card_id FROM card_actions ORDER BY id");
      expect(actions.map(a => a.card_id)).toEqual([510, ordinary.id]);
      expect((await s.selectOne<{ trash: number }>("SELECT trash FROM cards WHERE id=?", [output.id]))?.trash).toBe(1);
      expect(transport.count()).toBe(1); // the ordinary parent's notice still runs
    } finally { s.close(); }
  });
});
