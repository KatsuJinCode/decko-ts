// The E-16 instrument: the serving write surface must compose the DECK's
// mod-event runtime - the deck-boot seam (default-mod-deck.ts) - on EVERY
// save, the
// way Ruby composes once at boot and every save walks the same event space:
// Cardio::Mod::Dirs#initialize adds core + every gem mod (card-1.110.0
// lib/cardio/mod/dirs.rb:54-62), Loader.load_mods registers every set file
// (lib/cardio/mod/loader.rb:16-21), and the `event` DSL lands each
// declaration in that one space as its file loads (lib/card/set/event.rb:
// 71-74). The pre-fix seat composed a PRIVATE recaptcha-only loader and rode
// it only on armed saves, so deck/core bodies rode the engine's built-in
// equivalents (EVENT_TAKEOVER_BUILTINS never stood down) and custom mod
// bodies (comment's add_comment) never dispatched server-side.
//
// Arms:
//   (1) RED composition witness: an UNARMED serving update carrying the
//       flat comment param appends the comment block (comment.rb:7-9
//       append bytes; the same oracle card-mod-comment-save-event.test.ts
//       pins at the engine). Pre-fix: no runtime rides unarmed saves ->
//       content unchanged.
//   (2) the deck-boot runtime seam: defaultDeckEventRuntime() carries the
//       full deck's registry (takeover names + add_comment + recaptcha +
//       observer_create) and the merged predicate tables of all three
//       predicate-exporting mods. Pre-fix: the export does not exist.
//   (3) the takeover through the deck runtime: an engine save with
//       defaultDeckEventRuntime() + onReport fires refresh_references_out
//       through the REGISTERED body (the mod system is the mechanism;
//       name-level takeover, event-seam-save-path.test.ts pins the
//       contract for the core registry - this arm pins it for the SEAM's
//       runtime).
//   (4) regression guard: an ARMED serving DELETE still completes (303).
//       The deck runtime registers the integrate observer bodies, whose
//       write-path host answers fetchRenderCard with nothing
//       (observer.rb:20-21 nil rule -> [] - the zero-event-card
//       resolution); a host mishap would crash the :store stage and 500
//       this arm.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import type { WriteRouteContext } from "../../src/server/write-routes.js";
import type { CardActionRecaptchaConfig } from "../../src/card/actions/card-action-engine.js";
import {
  makeWriteRouteServer as makeServer,
  stubVerify,
} from "./write-routes-test-bridge.js";
import {
  CardActionEngine,
} from "../../src/card/actions/card-action-engine.js";
import type { ModEventStageReport } from "../../src/card/mod-loader/mod-event-dispatch.js";
import {
  defaultDeckEventRuntime,
} from "../../src/card/mod-loader/default-mod-deck.js";
import {
  createActionsTestStorage,
  seedStandardDeck,
  JOE,
  fakeClock,
} from "../card/actions/actions-test-storage.js";

const SET_TYPE_ID = 2;
const JOE_ID = 90;

async function seedCompositionDeck(s: RenderTestStorage): Promise<void> {
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
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: SET_TYPE_ID });
  await byId(13, "Commented Card", { dbContent: "body before comment" });
  await byId(14, "Basic");
  await seedCard(s, { id: 15, leftId: 14, rightId: 8, typeId: SET_TYPE_ID });
  await byId(JOE_ID, "Joe User");
}

interface CallResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

async function call(
  base: string,
  method: string,
  path: string,
  opts: { form?: Record<string, string>; token?: string } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const params = new URLSearchParams(opts.form);
    if (opts.token !== undefined) params.set("token", opts.token);
    body = params.toString();
  } else if (opts.token !== undefined) {
    headers["Authorization"] = `Bearer ${opts.token}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers, body, redirect: "manual" });
  const text = await res.text();
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  return { status: res.status, headers: responseHeaders, body: text };
}

const FROZEN_NOW = () => new Date(Date.UTC(2026, 8, 29, 12, 0, 0));

function armedRecaptchaConfig(stub: ReturnType<typeof stubVerify>): CardActionRecaptchaConfig {
  return { siteKey: "k", secretKey: "s", verify: stub.verify };
}

let storage: RenderTestStorage | undefined;
let joeToken = "";
let server: http.Server;
let baseUrl = "";

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedCompositionDeck(storage);
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;

  const ctx: WriteRouteContext = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    now: FROZEN_NOW,
  };
  const bridge = await makeServer(storage, ctx, { get: "record-404" });
  server = bridge.server;
  baseUrl = bridge.url;
});

afterAll(() => {
  server?.close();
});

describe("E-16: the serving write surface composes the deck's mod-event runtime", () => {
  it("an UNARMED serving update carrying the comment param appends the comment block", async () => {
    const res = await call(baseUrl, "POST", "/Commented_Card", {
      token: joeToken,
      form: {
        _method: "patch",
        "card[content]": "body before comment",
        comment: "served through the route",
      },
    });
    expect(res.status).toBe(303);
    const record = await storage!.fetcher.fetchByKey("commented_card");
    expect(record?.dbContent).toBe(
      "body before comment" +
        "\n<hr>\n<p>served through the route</p>\n" +
        '<div class="w-comment-author">[[Joe User]].....2026-09-29 12:00:00 UTC</div>',
    );
  });

  it("the stock comment form's card attribute appends to the existing content", async () => {
    const before = await storage!.fetcher.fetchByKey("commented_card");
    const res = await call(baseUrl, "POST", "/Commented_Card", {
      token: joeToken,
      form: { _method: "patch", "card[comment]": "posted by the stock comment form" },
    });
    expect(res.status).toBe(303);
    const after = await storage!.fetcher.fetchByKey("commented_card");
    expect(after?.dbContent).toBe(before!.dbContent +
      '\n<hr>\n<p>posted by the stock comment form</p>\n' +
      '<div class="w-comment-author">[[Joe User]].....2026-09-29 12:00:00 UTC</div>');
  });

  it("a blank stock comment does not fall back to a conflicting flat comment", async () => {
    const before = await storage!.fetcher.fetchByKey("commented_card");
    const res = await call(baseUrl, "POST", "/Commented_Card", {
      token: joeToken,
      form: { _method: "patch", "card[comment]": "", comment: "must not append" },
    });
    expect(res.status).toBeLessThan(400);
    expect((await storage!.fetcher.fetchByKey("commented_card"))?.dbContent).toBe(before!.dbContent);
  });

  it("an unnamed HTTP create reaches the model's autoname rule", async () => {
    await seedCard(storage!,{id:10000,name:'*autoname',codename:'autoname'});
    await seedCard(storage!,{id:10001,leftId:1,rightId:10000,dbContent:'HttpAuto001'});
    storage!.fetcher.codenames.resetCache();
    const response=await call(baseUrl,'POST','/card/create',{
      token:joeToken,form:{'card[type_id]':'14','card[content]':'autonamed through HTTP'},
    });
    expect(response.status).toBe(303);
    const stored=await storage!.fetcher.fetchByName('HttpAuto001');
    expect(stored?.dbContent).toBe('autonamed through HTTP');
    expect(stored?.typeId).toBe(14);
  });

  it("the deck-boot runtime seam carries the whole deck's registry + merged predicates", () => {
    const runtime = defaultDeckEventRuntime();
    const names = new Set(runtime.registry.all().map((e) => e.event));
    // the takeover batch (core's reference janitors, EVENT_TAKEOVER_BUILTINS)
    for (const janitor of [
      "refresh_references_out",
      "update_referer_content",
      "update_referer_references_out",
      "refresh_references_in",
      "clear_references",
    ]) {
      expect(names.has(janitor), janitor).toBe(true);
    }
    // the custom mod body + the recaptcha guard event + the integrate observers
    for (const name of ["add_comment", "recaptcha", "observer_create"]) {
      expect(names.has(name), name).toBe(true);
    }
    // every predicate-exporting mod's table resolves through the composition
    expect(typeof runtime.predicates?.["comment"]).toBe("function");
    expect(typeof runtime.predicates?.["skip_update_referers?"]).toBe("function");
    expect(typeof runtime.predicates?.["validate_recaptcha"]).toBe("function");
  });

  it("an engine save with the deck runtime fires refresh_references_out through the registered body", async () => {
    const actions = await createActionsTestStorage();
    await seedStandardDeck(actions);
    const reports: ModEventStageReport[] = [];
    const runtime = defaultDeckEventRuntime();
    const observed = { ...runtime, onReport: (r: ModEventStageReport) => reports.push(r) };
    const engine = new CardActionEngine(actions.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      now: fakeClock(),
      modEvents: observed,
    });
    await engine.createCard({
      name: "Takeover Probe",
      content: "probe body",
    });
    const finalizeReports = reports.filter((r) => r.stage === "finalize");
    expect(finalizeReports.length).toBeGreaterThan(0);
    const fired = finalizeReports.flatMap((r) => r.fired);
    expect(fired).toContain("refresh_references_out");
  });

  it("an ARMED serving DELETE still completes (the write-path host keeps :store observer bodies at zero-card resolution)", async () => {
    const armedStorage = await createRenderTestStorage();
    await runAuthMigrations(armedStorage.counting);
    await seedCompositionDeck(armedStorage);
    const armedSessions = new SessionStore({ driver: armedStorage.counting });
    const token = (await armedSessions.createSession(JOE_ID)).token;
    const stub = stubVerify({ success: true, score: 0.9, action: "delete" });
    const ctx: WriteRouteContext = {
      driver: armedStorage.counting,
      fetcher: armedStorage.fetcher,
      now: FROZEN_NOW,
      recaptcha: armedRecaptchaConfig(stub),
    };
    const bridge = await makeServer(armedStorage, ctx, { get: "record-404" });
    try {
      const res = await call(bridge.url, "DELETE", "/Commented_Card", { token });
      expect(res.status).toBe(303);
    } finally {
      bridge.server.close();
    }
  });
});
