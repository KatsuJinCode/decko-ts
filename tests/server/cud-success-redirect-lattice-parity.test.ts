// The CUD success's flavor lattice (rest.rb:80-89 + response.rb:25-33),
// measured against the PINNED DECK's own cud_success.
//
// The completeness register's C8 row grades the port on `cud_success` - the
// flavor lattice. Rows C4 and C5 already measured the two JSON rungs above
// this one (reload and slotter magic). What this row measures is the
// SUB-LATTICE UNDER the third rung, where the flavor is actually chosen:
//
//   the flavor switch   success.redirect || default_cud_success_redirect_type
//                       (response.rb:26) - the envelope's own redirect WINS;
//                       when the envelope's redirect answers false, the
//                       DEFAULT asks Card::Env.ajax? (response.rb:36) and
//                       answers "soft" or "hard".
//   the test            redirect_type.to_s == "soft" (response.rb:27) - an
//                       EXACT, case-sensitive string test, so "Soft" and
//                       true both take the hard branch.
//   the transport fork  hard_redirect (response.rb:42-49) - an AJAX request
//                       gets `render json: {redirect: url}` at 200 and the
//                       status argument is IGNORED; every other request gets
//                       redirect_to carrying the status it was handed, which
//                       for the CUD success is always 303.
//
// This file pins both sides:
//
//   fixtures/captured/cud-success-redirect-lattice-ruby-oracle.json is what
//   oracle-capture-cud-success-redirect-lattice-ruby.rb (tests/server/)
//   recorded by EXECUTING the pinned cud_success over the loading rig's
//   recording doubles: which rung answered, the URL the pinned redirect
//   carried, the status it carried, and the render each JSON rung produced.
//
//   The port's side: the port's own flavor switch
//   (src/server/write-routes.ts:2259-2271 for the hard arm, :2282-2313 for
//   the soft arm, and successResponse :1338-1364 for the non-ajax hard arm),
//   measured over the real HTTP write surface in this row's parity test.
//
//   THE SOFT ARM REACHES A NORMAL REQUEST (register-routes C8, the row's
//   unblock landing): the pinned flavor switch applies the envelope's
//   override REGARDLESS of ajax, so a NORMAL request carrying
//   success[redirect]=soft takes the soft branch and re-renders the slot at
//   200. The port's slot arm used to be gated on isAjax
//   (write-routes.ts), so that request answered the 303 - the divergence
//   this row carried since tranche 7, with its parity test pinning it as a
//   divergence. The gate now reads the flavor switch's own answer, and the
//   DELETE REWRITE keeps its precedence (configure_successful_deletion runs
//   before cud_success and rewrites the deleted card's own success to
//   redirect = true, so a delete stays hard and answers the 303).
//
//   A MEASURED LIMIT, carried on the fixture's face: `success.target ||= self
//   (response.rb:28) could not be executed end to end in the rig - the
//   fallback target resolves through the PINNED Cardname surface
//   (`@name.to_name.absolute`, card/env/success/target.rb:52), which the
//   rebuilt gemset does not carry. The soft branch itself IS measured end to
//   end on the rows that hand the envelope a Card as its target.

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
  readFileSync(path.join(REPO, "fixtures/captured/cud-success-redirect-lattice-ruby-oracle.json"), "utf8"),
) as {
  lattice: Array<{
    label: string;
    ajax: boolean;
    slotterMode: string | null;
    successArgs: Record<string, unknown>;
    successReloadQuestion: boolean;
    successRedirectAnswer: unknown;
    rendered: { json?: Record<string, unknown>; body?: string; status?: number } | null;
    redirected: { url: string; status: number } | null;
    cardCalls: string[];
    error: string | null;
  }>;
  redirectChecks: Record<string, unknown>;
  limits: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;
let joeToken = "";

/** What the host's render seam was asked for, in order. */
const slotCalls: Array<{ name: string; view: string | undefined }> = [];

// The rule deck the write surface needs (the write-routes suite's own seed),
// named for this row's own cases.
async function seedLatticeDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
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
  await seedLatticeDeck(storage);
  ctx = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    renderSlot: async (name, view) => {
      slotCalls.push({ name, view });
      storage!.engine.expireRenderCard(name);
      return await storage!.engine.render(name, view ?? "open");
    },
  };
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(90)).token;
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

async function save(
  form: Record<string, string>,
  opts: { ajax: boolean },
): Promise<{ status: number; location: string | undefined; body: string; contentType: string | null }> {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    authorization: `Bearer ${joeToken}`,
  };
  if (opts.ajax) headers["x-requested-with"] = "XMLHttpRequest";
  const res = await fetch(bridge.url, {
    method: "POST",
    headers,
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

describe("the pinned flavor lattice: which rung answers, and with what", () => {
  it("RUNG 1: reload outranks the magic rung and the flavor switch", () => {
    const row = ORACLE.lattice[0]!;
    expect(row.error).toBeNull();
    expect(row.successReloadQuestion).toBe(true);
    expect(row.rendered).toEqual({ json: { reload: true } });
    expect(row.redirected).toBeNull();
  });

  it("RUNG 1: reload also outranks an explicit soft override on an ajax request", () => {
    const row = ORACLE.lattice[1]!;
    expect(row.error).toBeNull();
    expect(row.successReloadQuestion).toBe(true);
    // The envelope carried a soft override and the request was ajax:
    // neither was consulted.
    expect(row.successArgs["redirect"]).toBe("soft");
    expect(row.successRedirectAnswer).toBe("soft");
    expect(row.ajax).toBe(true);
    expect(row.rendered).toEqual({ json: { reload: true } });
    expect(row.redirected).toBeNull();
  });

  it("RUNG 2: slotter magic outranks the flavor switch", () => {
    const row = ORACLE.lattice[2]!;
    expect(row.error).toBeNull();
    expect(row.successReloadQuestion).toBe(false);
    expect(row.successRedirectAnswer).toBe("soft");
    expect(row.slotterMode).toBe("silent-success");
    expect(row.rendered).toEqual({ json: { magic: true } });
    expect(row.redirected).toBeNull();
  });

  it("RUNG 3, the soft branch: it renders the ENVELOPE'S target card at 200", () => {
    const row = ORACLE.lattice[6]!;
    expect(row.error).toBeNull();
    expect(row.successRedirectAnswer).toBe("soft");
    expect(row.rendered!.status).toBe(200);
    expect(row.rendered!.body).toContain("PAGE(");
    expect(row.redirected).toBeNull();
    expect(row.successArgs["mark"]).toBe("Card(Target)");
  });

  it("RUNG 3, the non-ajax default: hard, and the 303 rides the redirect with an absolute url", () => {
    const row = ORACLE.lattice[4]!;
    expect(row.error).toBeNull();
    expect(row.successRedirectAnswer).toBe(false);
    expect(row.redirected).toEqual({ url: "https://deck.test/Elsewhere", status: 303 });
    expect(row.rendered).toBeNull();
  });

  it("the flavor switch is an OVERRIDE, both directions: soft on a NORMAL request", () => {
    const row = ORACLE.lattice[5]!;
    expect(row.error).toBeNull();
    expect(row.ajax).toBe(false);
    expect(row.successRedirectAnswer).toBe("soft");
    expect(row.rendered!.status).toBe(200);
    expect(row.redirected).toBeNull();
    expect(row.successArgs["mark"]).toBe("Card(Target)");
  });

  it("THE TRANSPORT FORK: a hard flavor on an ajax request answers JSON at 200 and DROPS the 303", () => {
    const row = ORACLE.lattice[7]!;
    expect(row.error).toBeNull();
    expect(row.ajax).toBe(true);
    expect(row.successRedirectAnswer).toBe("hard");
    expect(row.rendered).toEqual({ json: { redirect: "https://deck.test/Elsewhere" } });
    // No redirect_to ran at all, so the 303 never reached the wire.
    expect(row.redirected).toBeNull();
  });

  it("the string test is exact and case-sensitive: a capitalized Soft takes the hard branch", () => {
    const row = ORACLE.lattice[8]!;
    expect(row.successRedirectAnswer).toBe("Soft");
    expect(row.redirected!.status).toBe(303);
  });

  it("the string test is a to_s test: a boolean true takes the hard branch", () => {
    const row = ORACLE.lattice[9]!;
    expect(row.successRedirectAnswer).toBe(true);
    expect(row.redirected!.status).toBe(303);
  });

  it("THE || GAP: an empty redirect is not an override, and on ajax it lands on the String target the soft guard refuses", () => {
    const row = ORACLE.lattice[11]!;
    expect(row.error).toContain("Card::Error");
    expect(row.error).toContain("tried to do soft redirect without a card");
    // The redirect answer is what makes the default take over.
    expect(row.successRedirectAnswer).toBe(false);
    // The same empty redirect on a normal request is a plain hard redirect.
    const normal = ORACLE.lattice[10]!;
    expect(normal.error).toBeNull();
    expect(normal.redirected!.status).toBe(303);
  });

  it("the pinned envelope's redirect answer: present? decides, and everything present? rejects answers false", () => {
    expect(ORACLE.redirectChecks["absent"]).toBe(false);
    expect(ORACLE.redirectChecks['"" (String)']).toBe(false);
    expect(ORACLE.redirectChecks['" " (String)']).toBe(false);
    expect(ORACLE.redirectChecks['"soft" (String)']).toBe("soft");
    expect(ORACLE.redirectChecks['"Soft" (String)']).toBe("Soft");
    expect(ORACLE.redirectChecks['"hard" (String)']).toBe("hard");
    expect(ORACLE.redirectChecks["true (TrueClass)"]).toBe(true);
    expect(ORACLE.redirectChecks["false (FalseClass)"]).toBe(false);
  });

  it("the measured limit is carried on the fixture's face, not asserted as behavior", () => {
    expect(ORACLE.limits.length).toBeGreaterThan(0);
    expect(ORACLE.limits[0]).toContain("success.target ||= self");
    // The soft branch itself is measured on the rows that carry a Card
    // target; only the ||='s fallback resolution is out of reach here.
    expect(ORACLE.lattice[5]!.error).toBeNull();
  });

  it("the pinned sources are quoted: the switch, the exact test, and the ajax default", () => {
    const redirect = ORACLE.sources["redirectCudSuccess"]!.map((r) => r.text).join("\n");
    expect(redirect).toContain("success.redirect || default_cud_success_redirect_type");
    expect(redirect).toContain('if redirect_type.to_s == "soft"');
    expect(redirect).toContain("success.target ||= self");
    expect(redirect).toContain("hard_redirect success.to_url, 303");
    expect(redirect).toContain('Card::Env.ajax? ? "soft" : "hard"');
    const hard = ORACLE.sources["hardRedirect"]!.map((r) => r.text).join("\n");
    expect(hard).toContain("render json: { redirect: url }");
    expect(hard).toContain("redirect_to url, status: status");
  });
});

describe("the port's flavor lattice, against the pinned one", () => {
  it("the ajax default is soft: 200 and the slot", async () => {
    slotCalls.length = 0;
    const res = await save({ "card[name]": "C8 Ajax", "card[content]": "c8 ajax body" }, { ajax: true });
    expect(res.status, res.body).toBe(200);
    expect(res.contentType).toContain("text/html");
    expect(res.body).toContain("c8 ajax body");
    expect(res.location).toBeUndefined();
    expect(slotCalls[0]!.name).toBe("C8 Ajax");
  });

  it("the non-ajax default is hard: 303 and an absolute Location", async () => {
    const res = await save({ "card[name]": "C8 Normal", "card[content]": "c8 normal body" }, { ajax: false });
    expect(res.status, res.body).toBe(303);
    expect(res.location).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/C8_Normal$/);
    expect(res.body).toBe("");
  });

  it("an explicit soft override on an ajax request is soft: 200 and the slot", async () => {
    slotCalls.length = 0;
    const res = await save(
      {
        "card[name]": "C8 Soft Ajax",
        "card[content]": "c8 soft ajax body",
        "success[redirect]": "soft",
      },
      { ajax: true },
    );
    expect(res.status, res.body).toBe(200);
    expect(res.body).toContain("c8 soft ajax body");
    expect(res.location).toBeUndefined();
    expect(slotCalls[0]!.name).toBe("C8 Soft Ajax");
  });

  it("an explicit hard override on an ajax request is the JSON redirect at 200", async () => {
    const res = await save(
      {
        "card[name]": "C8 Hard Ajax",
        "card[content]": "c8 hard ajax body",
        "success[redirect]": "hard",
      },
      { ajax: true },
    );
    expect(res.status, res.body).toBe(200);
    const payload = JSON.parse(res.body) as { redirect: string };
    expect(payload.redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/C8_Hard_Ajax$/);
    expect(res.location).toBeUndefined();
    // The pinned side of the same shape, for the record.
    expect(ORACLE.lattice[7]!.rendered).toEqual({ json: { redirect: "https://deck.test/Elsewhere" } });
  });

  it("the exact, case-sensitive test holds on the port too: a capitalized Soft is the hard arm", async () => {
    const res = await save(
      {
        "card[name]": "C8 Capitalized",
        "card[content]": "c8 capitalized body",
        "success[redirect]": "Soft",
      },
      { ajax: true },
    );
    expect(res.status, res.body).toBe(200);
    const payload = JSON.parse(res.body) as { redirect: string };
    expect(payload.redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/C8_Capitalized$/);
    expect(ORACLE.lattice[8]!.redirected!.status).toBe(303);
  });

  it("THE || GAP holds on the port too: an empty redirect is not an override", async () => {
    // Empty + ajax: the slot arm answers, which is the pinned ajax default.
    slotCalls.length = 0;
    const ajaxRes = await save(
      { "card[name]": "C8 Empty Ajax", "card[content]": "c8 empty ajax", "success[redirect]": "" },
      { ajax: true },
    );
    expect(ajaxRes.status, ajaxRes.body).toBe(200);
    expect(ajaxRes.body).toContain("c8 empty ajax");
    // Empty + non-ajax: the 303 answers, which is the pinned non-ajax default.
    const normalRes = await save(
      { "card[name]": "C8 Empty Normal", "card[content]": "c8 empty normal", "success[redirect]": "" },
      { ajax: false },
    );
    expect(normalRes.status, normalRes.body).toBe(303);
    expect(normalRes.location).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/C8_Empty_Normal$/);
  });

  it("THE PINNED ANSWER: a soft override on a NORMAL request is the soft arm", async () => {
    // The pinned flavor switch applies the envelope's override REGARDLESS of
    // ajax (response.rb:26-32): success.redirect is "soft", so the soft
    // branch runs and re-renders the slot at 200 - the capture measured
    // exactly that on a normal request (lattice[5]: ajax false, rendered
    // 200, no redirect).
    slotCalls.length = 0;
    const res = await save(
      {
        "card[name]": "C8 Soft Normal",
        "card[content]": "c8 soft normal body",
        "success[redirect]": "soft",
      },
      { ajax: false },
    );
    expect(res.status, res.body).toBe(200);
    expect(res.body).toContain("c8 soft normal body");
    expect(res.location).toBeUndefined();
    expect(slotCalls.length).toBe(1);
    expect(slotCalls[0]!.name).toBe("C8 Soft Normal");
    // The pinned side of the same shape, for the record.
    expect(ORACLE.lattice[5]!.ajax).toBe(false);
    expect(ORACLE.lattice[5]!.rendered!.status).toBe(200);
  });

  it("THE DELETE REWRITE KEEPS ITS PRECEDENCE: a normal delete's own target is the hard arm", async () => {
    // configure_successful_deletion (location_history.rb:12-17) runs BEFORE
    // cud_success (the :finalize event) and REWRITES the success of a delete
    // whose target is the deleted card itself: success.redirect = true,
    // success.target = :previous. A true is not "soft" (the to_s test), so
    // the flavor is hard and the delete answers the 303 to the previous
    // location - even when the request carried success[redirect]=soft.
    //
    // The card is created first (a plain save), then deleted with the soft
    // override in the body.
    const created = await save(
      { "card[name]": "C8 Soft Delete", "card[content]": "c8 soft delete body" },
      { ajax: false },
    );
    expect(created.status, created.body).toBe(303);

    slotCalls.length = 0;
    const res = await fetch(`${bridge.url}/C8_Soft_Delete`, {
      method: "DELETE",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${joeToken}`,
      },
      body: new URLSearchParams({ "success[redirect]": "soft" }).toString(),
      redirect: "manual",
    });
    const body = await res.text();
    expect(res.status, body).toBe(303);
    expect(res.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
    expect(slotCalls.length).toBe(0);
  });
});