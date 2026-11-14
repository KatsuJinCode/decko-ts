import { afterEach, beforeEach, expect, it } from "vitest";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "../render/render-test-storage.js";
import { prepareFollowRender } from "../../../src/card/follow/follow-render-seam.js";
import { DeckoName } from "../../../src/card/name.js";
import type { RenderCard } from "../../../src/card/render/format.js";

let storage: RenderTestStorage;
beforeEach(async () => {
  storage = await createRenderTestStorage();
  for (const card of [
    { id: 2, name: "Basic", codename: "basic" },
    { id: 3, name: "User", codename: "user" },
    { id: 10, name: "*all", codename: "all", typeId: 13 },
    { id: 11, name: "*self", codename: "self", typeId: 13 },
    { id: 12, name: "*type", codename: "type", typeId: 13 },
    { id: 13, name: "Set", codename: "set" },
    { id: 14, name: "Setting", codename: "setting" },
    { id: 110, name: "*follow", codename: "follow", typeId: 14 },
    { id: 112, name: "*always", codename: "always" },
    { id: 113, name: "*never", codename: "never" },
    { id: 300, name: "Fixture Actor", typeId: 3 },
    { id: 301, name: "Second Actor", typeId: 3 },
    { id: 200, name: "Follow Target", typeId: 2 },
    // Modern junction rows deliberately have neither a name nor a key.
    { id: 210, leftId: 200, rightId: 11, typeId: 13 },
    { id: 215, leftId: 210, rightId: 300 },
    { id: 220, leftId: 215, rightId: 110, dbContent: "*always" },
    { id: 230, leftId: 10, rightId: 10 },
    { id: 231, leftId: 230, rightId: 110, dbContent: "*never" },
  ]) await seedCard(storage, card);
});
afterEach(() => storage?.close());

async function renderCard(name = "Follow Target"): Promise<RenderCard> {
  const record = await storage.fetcher.fetchByName(name);
  if (!record) throw new Error("Fixture root missing");
  return { record, name: DeckoName.parse(name), key: DeckoName.parse(name).key,
    typeName: "Basic", typeId: 2, typeCode: "basic", id: record.id,
    dbContent: record.dbContent ?? "", setKeys: "" };
}

it("counts applicable followers and excludes the all-user fallback identity", async () => {
  const bundle = await prepareFollowRender(storage.fetcher, { signedIn: true, actorId: 300 }, await renderCard(), "engage_tab");
  expect(bundle.followed).toBe(true);
  expect(bundle.followerCount).toBe(1);
});

it("reflects a saved never preference on the next render without counting it", async () => {
  const root = await renderCard();
  expect((await prepareFollowRender(storage.fetcher, { signedIn: true, actorId: 300 }, root, "engage_tab")).followed).toBe(true);
  await storage.counting.query("UPDATE cards SET db_content = '*never' WHERE id = 220", []);
  const before = await storage.counting.query("SELECT * FROM cards ORDER BY id", []);
  const bundle = await prepareFollowRender(storage.fetcher, { signedIn: true, actorId: 300 }, root, "engage_tab");
  expect(bundle.followed).toBe(false);
  expect(bundle.followerCount).toBe(0);
  expect(await storage.counting.query("SELECT * FROM cards ORDER BY id", [])).toEqual(before);
});

it("does not borrow another actor's follow state", async () => {
  const bundle = await prepareFollowRender(storage.fetcher, { signedIn: true, actorId: 301 }, await renderCard(), "follow_section");
  expect(bundle.followed).toBe(false);
  expect(bundle.followerCount).toBe(1);
});

it("reads the specific editor preference through modern NULL-key junctions", async () => {
  await seedCard(storage, { id: 114, name: "*following", codename: "following" });
  await seedCard(storage, { id: 250, leftId: 200, rightId: 114 });
  const bundle = await prepareFollowRender(storage.fetcher, { signedIn: true, actorId: 300 }, await renderCard("Follow Target+*following"), "rule_editor");
  expect(bundle.leftFollowPreference).toBe("*always");
  expect(bundle.ruleEditorTargetName).toBe("*always");
});

