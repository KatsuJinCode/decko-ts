// The soft redirect (response.rb:54-62), measured against the PINNED
// DECK's own method.
//
// The completeness register's C3 row grades the port on `soft_redirect` -
// the ajax DEFAULT of the CUD success (response.rb:35-37,
// `Card::Env.ajax? ? "soft" : "hard"`). The method is five lines and each
// of them is a decision:
//
//   1. THE TARGET BECOMES THE CARD: `@card = success.target`.
//   2. THE GUARD: `require_card_for_soft_redirect!` raises
//      Card::Error("tried to do soft redirect without a card") unless the
//      card IS a Card (response.rb:83-87).
//   3. THE PARAMS SURGERY: `self.params = soft_redirect_params` where
//      soft_redirect_params (:64-69) CLONES the request params, DELETES the
//      :card and :action keys, and MERGES the success envelope's own params
//      (env/success.rb:67-69). The re-render sees the request WITHOUT the
//      card hash, plus the success envelope's parameters.
//   4. Card::Env.reset self.
//   5. load_action, then show - the card is re-rendered through the read
//      ladder, which answers 200 and the rendered slot.
//
// This file pins both sides:
//
//   fixtures/captured/soft-redirect-ruby-oracle.json is what
//   oracle-capture-soft-redirect-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned soft_redirect over the loading rig's recording
//   doubles: the params surgery (the :card and :action keys gone, the
//   success envelope's params merged, the rest kept), the card's calls
//   (select_action_by_params, format, act), the 200 render of the slot, and
//   the guard's Card::Error with the params untouched.
//
//   The port's side: the port's ajax default re-renders the saved card
//   through the host's render seam (src/server/write-routes.ts:2282-2312)
//   and answers 200 with the slot. Measured over the real HTTP write
//   surface in this row's parity test.
//
//   ONE NARROW DIVERGENCE, CLOSED IN ROUND FIVE: the pinned surgery keeps
//   the request's OWN view key (only :card and :action are deleted), so a
//   request whose URL carries ?view= re-renders THAT view. The port's slot
//   arm read the success envelope's view only
//   (`parsed.success["view"] || undefined`), so the request's own view did
//   not reach the ajax re-render. The arm now reads the envelope's view
//   first and falls back to the request's own view key - the pinned merge
//   order - and the case below asserts the pinned answer.
//
//   The port's DECKO_AJAX_SAVE_REDIRECT=1 exit hatch (write-routes.ts:
//   1006-1011, 2202-2211) is a PORT ADDITION and is named as such.
//
//   The recorded format NAME is the rig's own answer (the rig's registry
//   holds the names as strings), and the fixture labels that on its face.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/soft-redirect-ruby-oracle.json"), "utf8"),
) as {
  softRedirect: Array<{
    label: string;
    error: string | null;
    cardCalls: string[] | null;
    pageCalls: Array<{ view: string; format: string }> | null;
    paramsAfter: Record<string, unknown>;
    rendered: { body: string; status: number; content_type: string } | null;
    redirected: unknown;
  }>;
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;
let joeToken = "";

/** What the host's render seam was asked for, in order. */
const slotCalls: Array<{ name: string; view: string | undefined }> = [];
/** The render errors the seam swallowed (a view the card's type does not
 *  carry): the RECORDED view is what this row grades. */
const renderErrors: string[] = [];

// The rule deck the write surface needs (the write-routes suite's own
// seed): *all, Set, *update, *create, *delete, Anyone, Anyone Signed In,
// *type, *self, *default, the three *all -> *update / *create / *delete
// rules, the *all -> *default type rule, Basic, RichText and Joe User.
async function seedSoftDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: 2 });
  await seedCard(s, { id: 2, name: "Set", codename: "set", typeId: 2 });
  await seedCard(s, { id: 3, name: "*update", codename: "update", typeId: 2 });
  await seedCard(s, { id: 4, name: "*create", codename: "create", typeId: 2 });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete", typeId: 2 });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 2 });
  await seedCard(s, { id: 9, name: "*self", codename: "self", typeId: 2 });
  await seedCard(s, { id: 18, name: "*default", codename: "default", typeId: 2 });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: 14 });
  await seedCard(s, { id: 14, name: "Basic", typeId: 14 });
  await seedCard(s, { id: 16, name: "RichText", typeId: 16 });
  await seedCard(s, { id: 90, name: "Joe User" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedSoftDeck(storage);
  ctx = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    renderSlot: async (name, view) => {
      slotCalls.push({ name, view });
      storage!.engine.expireRenderCard(name);
      try {
        return await storage!.engine.render(name, view ?? "open");
      } catch (error) {
        // A view the card's type does not carry: the RECORDED view is what
        // this row grades; the render itself is the engine's own business.
        renderErrors.push(String(error));
        return `<div class="slot">view ${view ?? "open"}</div>`;
      }
    },
  };
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(90)).token;
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

async function ajaxSave(
  form: Record<string, string>,
  query = "",
): Promise<{ status: number; location: string | undefined; body: string; contentType: string | null }> {
  const res = await fetch(`${bridge.url}/${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Bearer ${joeToken}`,
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams(form).toString(),
    redirect: "manual",
  });
  return {
    status: res.status,
    location: res.headers.get("location") ?? undefined,
    body: await res.text(),
    contentType: res.headers.get("content-type"),
  };
}

describe("the soft redirect, against the pinned deck gem", () => {
  it("the soft redirect re-renders through show: 200 and the slot", () => {
    const row = ORACLE.softRedirect[0]!;
    expect(row.error).toBeNull();
    expect(row.rendered).not.toBeNull();
    expect(row.rendered!.status).toBe(200);
    expect(row.rendered!.content_type).toBe("text/html");
    expect(row.redirected).toBeNull();
    // The card is read again through the read ladder: the action, the
    // format ask and the act that wraps the page.
    expect(row.cardCalls).toEqual(["select_action_by_params", "format", "act"]);
    expect(row.pageCalls!.length).toBe(1);
  });

  it("the params surgery: the card and action keys go, the success envelope's params come in, the rest stays", () => {
    const row = ORACLE.softRedirect[0]!;
    const after = row.paramsAfter;
    expect(after["card"]).toBeUndefined();
    expect(after["action"]).toBeUndefined();
    // The success envelope's own params are merged in (the capture set
    // {"mark" => "Target"}).
    expect(after["mark"]).toBe("Target");
    // The request's other keys survive - including its own view key, which
    // is what reaches the page.
    expect(after["keep"]).toBe("yes");
    expect(after["view"]).toBe("related");
    // The pinned surgery, quoted.
    const softRedirect = ORACLE.sources["softRedirect"]!.map((r) => r.text).join("\n");
    expect(softRedirect).toContain("new_params = params.clone");
    expect(softRedirect).toContain("new_params.delete :card");
    expect(softRedirect).toContain("new_params.delete :action");
    expect(softRedirect).toContain("new_params.merge Card::Env.success.params");
  });

  it("the request's own view key reaches the page: the re-render renders that view", () => {
    const row = ORACLE.softRedirect[0]!;
    expect(row.pageCalls![0]!.view).toBe("\"related\"");
  });

  it("the guard: a card that is not a Card raises Card::Error, and the params are untouched", () => {
    const row = ORACLE.softRedirect[1]!;
    expect(row.error).toContain("Card::Error");
    expect(row.error).toContain("tried to do soft redirect without a card");
    expect(row.rendered).toBeNull();
    expect(row.cardCalls).toEqual([]);
    // The raise comes BEFORE the surgery, so the card hash is still there.
    expect(row.paramsAfter["card"]).toEqual({ name: "Target" });
    const guard = ORACLE.sources["guard"]!.map((r) => r.text).join("\n");
    expect(guard).toContain("return if card.is_a? Card");
    expect(guard).toContain('raise Card::Error, "tried to do soft redirect without a card"');
  });

  it("the soft redirect is the AJAX DEFAULT of the CUD success", () => {
    const type = ORACLE.sources["defaultRedirectType"]!.map((r) => r.text).join("\n");
    expect(type).toContain('Card::Env.ajax? ? "soft" : "hard"');
  });
});

describe("the port's ajax soft redirect, against the pinned soft redirect", () => {
  it("an ajax save re-renders the saved card: 200 and the slot", async () => {
    slotCalls.length = 0;
    const res = await ajaxSave({ "card[name]": "C3 Ajax", "card[content]": "c3 slot body" });
    expect(res.status, res.body).toBe(200);
    expect(res.contentType).toContain("text/html");
    expect(res.body).toContain("c3 slot body");
    expect(res.location).toBeUndefined();
    // The host's render seam was asked for the saved card.
    expect(slotCalls.length).toBe(1);
    expect(slotCalls[0]!.name).toBe("C3 Ajax");
  });

  it("the success envelope's view reaches the re-render", async () => {
    slotCalls.length = 0;
    const res = await ajaxSave({
      "card[name]": "C3 Viewed",
      "card[content]": "c3 viewed body",
      "success[view]": "related",
    });
    expect(res.status, res.body).toBe(200);
    // The seam was asked for the success envelope's view - the pinned
    // surgery merges the envelope's params into the re-render's params.
    expect(slotCalls[0]!.view).toBe("related");
  });

  it("CLOSED: the request's OWN view key reaches the port's re-render", async () => {
    // The pinned surgery keeps the request's own view key (only :card and
    // :action are deleted), so the pinned re-render renders that view - the
    // capture's first row measured exactly that ("related" on the page).
    // The port's slot arm read the SUCCESS envelope's view only, which was
    // the row's named remainder; the arm now reads the envelope's view
    // first and falls back to the request's own view key (the query's
    // ?view=), the pinned merge order (response.rb:64-69: the envelope's
    // params MERGE OVER the request's, so the envelope's view wins when it
    // carries one and the request's survives when it does not).
    slotCalls.length = 0;
    const res = await ajaxSave(
      { "card[name]": "C3 Request View", "card[content]": "c3 request view body" },
      "?view=related",
    );
    expect(res.status, res.body).toBe(200);
    expect(slotCalls[0]!.view).toBe("related");
    // The pinned side of the same shape, for the record.
    expect(ORACLE.softRedirect[0]!.pageCalls![0]!.view).toBe("\"related\"");
  });

  it("the success envelope's view still wins over the request's own (the pinned merge order)", async () => {
    // Hash#merge lets the ARGUMENT's keys overwrite: an envelope that
    // carries its own view beats the request's ?view=, which is what the
    // pinned surgery does to a request that carries both.
    slotCalls.length = 0;
    const res = await ajaxSave({
      "card[name]": "C3 Envelope Wins",
      "card[content]": "c3 envelope wins body",
      "success[view]": "just_deleted",
    }, "?view=related");
    expect(res.status, res.body).toBe(200);
    expect(slotCalls[0]!.view).toBe("just_deleted");
  });

  it("the port's DECKO_AJAX_SAVE_REDIRECT=1 exit hatch replaces the slot with the redirect JSON (a PORT ADDITION)", async () => {
    const before = process.env.DECKO_AJAX_SAVE_REDIRECT;
    process.env.DECKO_AJAX_SAVE_REDIRECT = "1";
    try {
      const res = await ajaxSave({ "card[name]": "C3 Hatch", "card[content]": "c3 hatch body" });
      expect(res.status, res.body).toBe(200);
      const payload = JSON.parse(res.body) as { redirect: string };
      expect(payload.redirect).toContain("C3_Hatch");
    } finally {
      if (before === undefined) delete process.env.DECKO_AJAX_SAVE_REDIRECT;
      else process.env.DECKO_AJAX_SAVE_REDIRECT = before;
    }
  });
});
