// cud_success's reload and slotter-magic arms (register-routes C4 + C5)
// over the REAL HTTP write surface:
// decko-0.20.0/lib/card_controller/rest.rb:80-89 -
//     def cud_success
//       success = Card::Env.success.in_context card.name
//       if success.reload?        # env/success.rb:41-43: @reload.to_s == "true"
//         reload                  #   -> {reload: true} (response.rb:71-73)
//       elsif slotter_magic?      # response.rb:79-81: slotter_mode in
//         slotter_magic_response  #   %w[silent-success update-modal-origin
//       else                      #   update-origin] -> {magic: true}
//         redirect_cud_success success
//       end
// - checked on EVERY save, before any redirect shape. The port honored
// reload on the Session-cardtype save arm alone (the register's C4: two
// live Ruby producers push success {reload: true} - card-mod-assets
// set/abstract/asset_inputter.rb:78 and card-mod-layout
// set/right/enabled_roles.rb:44 - while the port's other saves redirected)
// and had no slotter arm at all (C5: zero slotter_mode hits; the decko.js
// slotter itself sets the param - slot.js.coffee:5).
//
// Live producers note: the PORTED asset/layout mod views do not emit
// success[reload] in their forms (that is the mods family's emission
// concern); the ROUTE-level honor pinned here is what a save carrying
// success[reload]=true or slotter_mode=<magic> answers, byte-shaped.
//
// The pinned side of both rows is measured in
// tests/server/cud-reload-slotter-parity.test.ts, against
// fixtures/captured/cud-reload-slotter-ruby-oracle.json.
//
// Driven through the REAL HTTP write surface over the granted-rule deck
// (update -> [[Anyone]]), so the anonymous save reaches cud_success.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard } from "../card/render/render-test-storage.js";
import { runAuthMigrations } from "../../src/card/auth/index.js";

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedCard(storage, { id: 30, name: "RichText", codename: "basic", typeId: 30 });
  await seedCard(storage, { id: 1, name: "*all", codename: "all", typeId: 2 });
  await seedCard(storage, { id: 2, name: "Set", codename: "set", typeId: 3 });
  await seedCard(storage, { id: 3, name: "*update", codename: "update", typeId: 7 });
  await seedCard(storage, { id: 4, name: "*create", codename: "create", typeId: 7 });
  await seedCard(storage, { id: 5, name: "*delete", codename: "delete", typeId: 7 });
  await seedCard(storage, { id: 6, name: "Anyone", codename: "anyone", typeId: 3 });
  await seedCard(storage, { id: 14, name: "Anonymous User", codename: "anonymous", typeId: 3 });
  await seedCard(storage, { id: 11, leftId: 1, rightId: 3, dbContent: "[[Anyone]]" });
  await seedCard(storage, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone]]" });
  await seedCard(storage, { id: 16, leftId: 1, rightId: 4, dbContent: "[[Anyone]]" });
  for (const ruleId of [11, 12, 16]) {
    await storage.counting.query(
      `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
       VALUES (?, 'anyone', 6, 'L', NULL)`,
      [ruleId],
    );
  }
  await seedCard(storage, { id: 100, name: "Target", typeId: 30, dbContent: "Target body original" });
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

async function putWith(form: Record<string, string>): Promise<{ status: number; body: string; location?: string }> {
  const res = await fetch(`${bridge.url}/Target`, {
    method: "PUT",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "card[content]": "put body", ...form }).toString(),
    redirect: "manual",
  });
  const location = res.headers.get("location") ?? undefined;
  return { status: res.status, body: await res.text(), location };
}

describe("cud_success's reload and slotter-magic arms (C4 + C5)", () => {
  it("success[reload]=true answers {reload: true} at 200 instead of a redirect", async () => {
    const res = await putWith({ "success[reload]": "true" });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ reload: true });
    expect(res.location).toBeUndefined();
  });

  it("success[reload]=false is NOT reload? (env/success.rb:41-43's string compare) - the redirect answers", async () => {
    const res = await putWith({ "success[reload]": "false" });
    expect(res.status).toBe(303);
  });

  it("slotter_mode=silent-success answers {magic: true} at 200", async () => {
    const res = await putWith({ slotter_mode: "silent-success" });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ magic: true });
  });

  it("slotter_mode=update-modal-origin and update-origin answer {magic: true} too", async () => {
    for (const mode of ["update-modal-origin", "update-origin"]) {
      const res = await putWith({ slotter_mode: mode });
      expect(res.status, mode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ magic: true });
    }
  });

  it("an unlisted slotter_mode is not slotter_magic? - the plain redirect answers", async () => {
    const res = await putWith({ slotter_mode: "bogus-mode" });
    expect(res.status).toBe(303);
    expect(res.body).not.toContain("magic");
  });

  it("reload outranks slotter magic (Ruby's if/elsif order)", async () => {
    const res = await putWith({ "success[reload]": "true", slotter_mode: "silent-success" });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ reload: true });
  });
});
