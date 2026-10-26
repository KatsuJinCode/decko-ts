// The strict-parity flags at the HTTP write surface, both modes against the
// side-effects battery's recorded Ruby answers
// (tools/parity-side-effects/scenarios.json):
//
//   reset-unknown-email            ruby 422 "EMAIL: not recognized"
//                                  ts   303 /*signin/reset_password_success
//   admin-restore-file-revision    ruby 500 (the "Wild Card!" server_error
//                                  page, nothing stored)
//                                  ts   303 (the port restores the version)
//   admin-create-skin-bad-parent   ruby 500 (nothing stored)
//                                  ts   422 "ABORT: not a valid theme <name>"
//
// Each test runs its request twice over one fresh deck: the port's default
// (every flag off) answers the recorded ts pin; the strict flag on answers
// the recorded ruby pin. The 500 is the production surface both engines
// serve (compare.mjs cuts the same server_error block from both), so the
// strict 500 pins status 500 plus the "Wild Card!" block bytes, and pins
// that nothing was stored.

import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { configurePasswordHashing } from "../../src/card/auth/password-hash.js";
import { CaptureTransport } from "../../src/card/notify/transport.js";
import {
  configureStrictParity,
  type StrictParityFlags,
} from "../../src/card/parity/strict-parity-flags.js";
import type { WriteRouteContext } from "../../src/server/write-routes.js";
import { makeWriteRouteServer } from "./write-routes-test-bridge.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

const SET_TYPE_ID = 2;
const CARDTYPE_ID = 3;
const JOE_ID = 90;
const EMAIL = "parity.probe@example.com";
const SALT = "SALT";
const PASSWORD = "Correct horse battery 1!";
const DIGEST = createHash("sha1").update(`${SALT}--${PASSWORD}--`).digest("hex");

let storage: RenderTestStorage | undefined;
let joeToken = "";
let server: http.Server;
let baseUrl = "";

async function seedDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*update", codename: "update" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 9, name: "*default", codename: "default" });
  for (const [id, right] of [
    [10, 3],
    [11, 4],
    [12, 5],
  ]) {
    await seedCard(s, { id, leftId: 1, rightId: right, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, id, 7, "anyone signed in");
  }
  await seedCard(s, { id: 14, name: "Basic" });
  await seedCard(s, { id: 15, leftId: 2, rightId: 8, typeId: SET_TYPE_ID });
  // *all+*default: new cards take type Basic.
  await seedCard(s, { id: 17, leftId: 1, rightId: 9, typeId: 14 });
  await seedCard(s, { id: JOE_ID, name: "Joe Admin" });

  // The account system the sign-in and reset ladders walk: the codename
  // cards, a holder, and its +*account children (the active account with the
  // legacy-sha1 digest the test's password policy verifies).
  const ids = { account: 950, email: 951, password: 952, salt: 953, status: 954 } as const;
  for (const [codename, id] of Object.entries(ids)) {
    await seedCard(s, { id, name: `*${codename}`, codename });
  }
  await seedCard(s, { id: 40, name: "*signin", codename: "signin" });
  await seedCard(s, { id: 41, name: "reset_password_success" });
  await seedCard(s, { id: JOE_ID + 100, name: "Parity Admin" });
  await seedCard(s, { id: 960, name: "Parity Admin+*account", leftId: JOE_ID + 100, rightId: ids.account });
  await seedCard(s, { id: 961, name: "Parity Admin+*account+*email", leftId: 960, rightId: ids.email, dbContent: EMAIL });
  await seedCard(s, { id: 962, name: "Parity Admin+*account+*password", leftId: 960, rightId: ids.password, dbContent: DIGEST });
  await seedCard(s, { id: 963, name: "Parity Admin+*account+*salt", leftId: 960, rightId: ids.salt, dbContent: SALT });
  await seedCard(s, { id: 964, name: "Parity Admin+*account+*status", leftId: 960, rightId: ids.status, dbContent: "active" });

  // The File cardtype and the File card with the history the revert walks:
  // a create action storing one identifier and an update action storing
  // another, the shape the recorded restore reverts (to the create).
  await seedCard(s, { id: 60, name: "File", codename: "file", typeId: CARDTYPE_ID });
  await seedCard(s, { id: 61, name: "Parity Cached File", typeId: 60 });
  await s.counting.query(
    "INSERT INTO card_actions (id, card_id, card_act_id, action_type, draft) VALUES (900, 61, 900, 0, 0)", [],
  );
  await s.counting.query(
    "INSERT INTO card_changes (card_action_id, field, value) VALUES (900, 2, '~61/900.txt')", [],
  );
  await s.counting.query(
    "INSERT INTO card_actions (id, card_id, card_act_id, action_type, draft) VALUES (901, 61, 901, 1, 0)", [],
  );
  await s.counting.query(
    "INSERT INTO card_changes (card_action_id, field, value) VALUES (901, 2, '~61/901.txt')", [],
  );
  await s.counting.query("UPDATE cards SET current_revision_id = 901, db_content = '~61/901.txt' WHERE id = 61", []);

  // The Bootswatch skin surface: the cardtype, the *parent codename card the
  // theme walk resolves, and a plain card for the bad parent to name.
  await seedCard(s, { id: 62, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: CARDTYPE_ID });
  // The codename card the theme walk resolves, spelled as the recorded deck
  // spells it (the write-battery fixture's card is named "parent").
  await seedCard(s, { id: 63, name: "parent", codename: "parent" });
  await seedCard(s, { id: 64, name: "Parity Probe Card", dbContent: "brick" });
}

/** The card's current identifier and its action count. */
async function fileRow(): Promise<{ db_content: string | null; actions: number }> {
  const row = (
    await storage!.counting.query<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = 61", [],
    )
  ).rows[0];
  const actions = Number(
    (
      await storage!.counting.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = 61", [],
      )
    ).rows[0]?.n ?? 0,
  );
  return { db_content: row?.db_content ?? null, actions };
}

async function totalActions(): Promise<number> {
  return Number(
    (
      await storage!.counting.query<{ n: number }>("SELECT COUNT(*) AS n FROM card_actions", [])
    ).rows[0]?.n ?? 0,
  );
}

async function post(
  path: string,
  form: Record<string, string>,
): Promise<{ status: number; location: string; body: string }> {
  const params = new URLSearchParams(form);
  params.set("token", joeToken);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    redirect: "manual",
  });
  const body = await res.text();
  return {
    status: res.status,
    location: res.headers.get("location") ?? "",
    body,
  };
}

async function put(
  path: string,
  form: Record<string, string>,
): Promise<{ status: number; location: string; body: string }> {
  const params = new URLSearchParams(form);
  params.set("token", joeToken);
  params.set("_method", "put");
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    redirect: "manual",
  });
  const body = await res.text();
  return {
    status: res.status,
    location: res.headers.get("location") ?? "",
    body,
  };
}

const OFF: StrictParityFlags = {
  signinDetailedErrors: false,
  revisionRestore500: false,
  skinCreate500: false,
  scriptBundleClockNames: false,
};
const strictOf = (flag: keyof StrictParityFlags): StrictParityFlags => ({ ...OFF, [flag]: true });

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedDeck(storage);
  // The deck Ruby built runs the storage policy a deck Ruby also serves
  // (legacy-sha1): the seeded digest verifies without an upgrade. The
  // iterations field is required by the policy type and unused in this mode.
  configurePasswordHashing({ mode: "legacy-sha1", iterations: 600_000 });
  const ctx: WriteRouteContext = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    accountMail: {
      transport: new CaptureTransport(),
      token: { secret: "strict-parity-test-secret", now: () => 1_760_000_000 },
      origin: "http://127.0.0.1",
      siteTitle: "Parity Deck",
    },
  };
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(JOE_ID)).token;
  const bridge = await makeWriteRouteServer(storage, ctx);
  server = bridge.server;
  baseUrl = bridge.url;
}, 60_000);

afterAll(() => {
  server?.close();
  storage?.close();
});

afterEach(() => {
  configureStrictParity(undefined);
});

describe("DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS at the write surface", () => {
  // reset-unknown-email's pins.
  it("reset of an unknown address: default answers the sent-reset redirect, strict answers Ruby's 422", async () => {
    const form = {
      "card[trigger]": "send_reset_password_token",
      "card[subcards][+*email][content]": "nobody@example.com",
      "success[view]": "reset_password_success",
    };
    const def = await put("/update/*signin", form);
    expect(def.status).toBe(303);
    // compare.mjs drops the host from a Location before comparing; the
    // recorded pin is the path.
    expect(new URL(def.location).pathname).toBe("/*signin/reset_password_success");

    configureStrictParity(strictOf("signinDetailedErrors"));
    const strict = await put("/update/*signin", form);
    expect(strict.status).toBe(422);
    expect(strict.body).toContain("EMAIL");
    expect(strict.body).toContain("not recognized");
  });

  // signin-unknown's and signin-wrong-password's pins: the route renders the
  // ladder message under the SIGNIN key.
  it("failed sign-ins: default answers uniformly, strict answers Ruby's per-field messages", async () => {
    const unknownForm = {
      "card[subcards][+*email][content]": "nobody@example.com",
      "card[subcards][+*password][content]": PASSWORD,
    };
    const wrongForm = {
      "card[subcards][+*email][content]": EMAIL,
      "card[subcards][+*password][content]": "Wrong horse battery 2@",
    };
    const uniform = (body: string): boolean => body.includes("Wrong email or password.");
    const unknownDefault = await put("/update/*signin", unknownForm);
    const wrongDefault = await put("/update/*signin", wrongForm);
    expect(unknownDefault.status).toBe(422);
    expect(wrongDefault.status).toBe(422);
    expect(uniform(unknownDefault.body)).toBe(true);
    expect(uniform(wrongDefault.body)).toBe(true);

    configureStrictParity(strictOf("signinDetailedErrors"));
    const unknownStrict = await put("/update/*signin", unknownForm);
    const wrongStrict = await put("/update/*signin", wrongForm);
    expect(unknownStrict.status).toBe(422);
    expect(wrongStrict.status).toBe(422);
    expect(unknownStrict.body).toContain("Unrecognized email.");
    expect(wrongStrict.body).toContain("Wrong password");
    expect(uniform(unknownStrict.body)).toBe(false);
    expect(uniform(wrongStrict.body)).toBe(false);
  });
});

describe("DECKO_STRICT_PARITY_REVISION_RESTORE_500 at the write surface", () => {
  it("default restores the File card's version; strict answers Ruby's 500 and stores nothing", async () => {
    // The restore request, the recorded shape: the create action's revision.
    const revert = (id: number) =>
      put("/update/Parity_Cached_File?assign=true", {
        "revert_actions[]": String(id),
        "card[skip]": "validate_renaming",
      });

    const def = await revert(900);
    expect(def.status).toBe(303);
    expect((await fileRow()).db_content).toBe("~61/900.txt");
    const actionsAfterDefault = await totalActions();
    const fileActionsAfterDefault = (await fileRow()).actions;

    configureStrictParity(strictOf("revisionRestore500"));
    const strict = await revert(900);
    expect(strict.status).toBe(500);
    // The production server_error page both engines answer (compare.mjs cuts
    // this same block from the recorded Ruby pages).
    expect(strict.body).toContain("Wild Card!");
    expect(strict.body).toContain("500 Server Error");
    expect(strict.body).toContain("Yuck, sorry about that.");
    expect(strict.location).toBe("");
    // Nothing stored: the strict crash answers before any write, so the
    // card keeps its restored content and no action row joins the deck.
    expect((await fileRow()).db_content).toBe("~61/900.txt");
    expect((await fileRow()).actions).toBe(fileActionsAfterDefault);
    expect(await totalActions()).toBe(actionsAfterDefault);
  });
});

describe("DECKO_STRICT_PARITY_SKIN_CREATE_500 at the write surface", () => {
  it("default refuses a bad-parent skin create with 422; strict answers Ruby's 500 and stores nothing", async () => {
    const create = () =>
      post("/", {
        "card[name]": "Parity Child Skin",
        "card[type]": "Bootswatch skin",
        "card[subcards][+parent][content]": "[[Parity Probe Card]]",
      });

    const def = await create();
    expect(def.status).toBe(422);
    // The alert renders the key and message as
    // <p><strong>ABORT:</strong> not a valid theme ...</p>; compare.mjs's
    // extractor strips the tags to the recorded "ABORT: not a valid theme
    // Parity Probe Card".
    expect(def.body).toContain("<strong>ABORT:</strong>");
    expect(def.body).toContain("not a valid theme Parity Probe Card");
    const rowsAfterDefault = await totalActions();

    configureStrictParity(strictOf("skinCreate500"));
    const strict = await create();
    expect(strict.status).toBe(500);
    expect(strict.body).toContain("Wild Card!");
    expect(strict.body).toContain("500 Server Error");
    expect(strict.body).toContain("Yuck, sorry about that.");
    expect(strict.location).toBe("");
    expect(await totalActions()).toBe(rowsAfterDefault);
    // And the deck itself holds no such card on either arm.
    const row = await storage!.counting.query(
      "SELECT id FROM cards WHERE key = 'parity_child_skin' AND trash = 0", [],
    );
    expect(row.rows.length).toBe(0);
  });
});
