// The Session-card save REACHING THE BROWSER, through the booted staging
// server (vm-staging-server.mjs) — the navbar's role checkbox save.
//
// The write MODULE was already right: handleWriteRequest
// (src/server/write-routes.ts:1713-1721) reads the visitor cookie, lets the
// request mutate it, and hands the finished Set-Cookie value back on the
// response's own `visitorCookie` field, leaving the commit to the HOST. The
// Cloudflare host passes it on (cloudflare-write-routes.ts:565); this server
// read only `response.headers`, so a Session-type save was answered 200 —
// `{reload: true}`, exactly what the role-checkbox post expects — and then
// forgotten. The browser kept an empty `decko_visit` cookie, the next request
// re-read an empty session, and `<actor>+*enabled roles` never moved.
//
// Ruby's mechanism, for the record: the roles card is
// `assign_type :session` (mod/layout/set/right/enabled_roles.rb:3), its save
// runs `store_in_session` (mod/session/set/type/session.rb:37-40,
// `self.session_content = db_content; abort :success`) which writes
// `Env.session["_card_#{key}"]`, and Rails' own session middleware commits the
// mutated session into that response's Set-Cookie. There is no host seam in
// Ruby at all; the port has one, and this file pins that the host closes it.
//
// The deck is a DISPOSABLE COPY of the committed synthetic-v1 fixture. The
// fixture actor's credentials are read from deck.json at runtime, used only as
// an HTTP form body, and never written to a file, logged, or printed.

import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as netCreateServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { ensureStagingServerDist } from "../card/auth/staging-server-dist-bootstrap.js";
import {
  VISITOR_COOKIE_NAME,
  readVisitorSession,
  sessionCardContent,
} from "../../src/card/session/visitor-session.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SERVER_ENTRY = path.join(REPO_ROOT, "vm-staging-server.mjs");
const FIXTURE_DIR = path.join(REPO_ROOT, "reference-harness", "fixtures", "synthetic-v1");
const FIXTURE_DB = path.join(FIXTURE_DIR, "deck", "deck.sqlite3");
const MOD_PUBLIC_DIR = path.join(REPO_ROOT, "reference-harness", "oracle", "app", "public");

const WORK_DIR = path.join(REPO_ROOT, "tmp", "visitor-session-write-commit-endpoint");
const FIXTURE_PATH = path.join(WORK_DIR, "deck.sqlite3");
const FILES_DIR = path.join(WORK_DIR, "files");

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let server: ChildProcess | null = null;
let serverOutput = "";
let baseUrl = "";
/** The Session cardtype's id (hidden_form_tags' `card: { type_id: SessionID }`,
 *  enabled_roles.rb:47-49) — read from the fixture copy, never hardcoded. */
let sessionTypeId = -1;
let actorName = "";
let actorEmail = "";
let actorPassword = "";

async function reserveEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = netCreateServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address === null || typeof address === "string") {
        srv.close();
        reject(new Error("unexpected ephemeral address"));
        return;
      }
      const port = address.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** The Set-Cookie value this response carries for the visitor cookie, or
 *  undefined when it carries none. */
function visitorCookieOf(setCookie: string | null): string | undefined {
  if (setCookie === null) return undefined;
  for (const part of setCookie.split(/,\s*(?=[A-Za-z0-9_-]+=)/)) {
    const head = part.split(";")[0] ?? "";
    if (head.startsWith(`${VISITOR_COOKIE_NAME}=`)) return head;
  }
  return undefined;
}

function sessionValueOf(setCookie: string | null): { present: boolean; raw: string | undefined } {
  const cookie = visitorCookieOf(setCookie);
  if (cookie === undefined || cookie.endsWith("=")) return { present: false, raw: undefined };
  const state = readVisitorSession(cookie);
  return { present: true, raw: sessionCardContent(state, `${actorName}+*enabled roles`) };
}

/** The role boxes the navbar's own inline editor served, read off the live
 *  page: the class marks the control, and the name/value pair is what the
 *  click posts. Attribute ORDER is not assumed — the served bytes put value
 *  after class. */
function roleBoxes(html: string): Array<{ name: string; value: string }> {
  return [...html.matchAll(/<input\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes("pointer-checkbox-button"))
    .map((tag) => ({
      name: /name="([^"]*)"/.exec(tag)?.[1] ?? "",
      value: /value="([^"]*)"/.exec(tag)?.[1] ?? "",
    }))
    .filter((box) => box.name !== "" && box.value !== "");
}

/** The navbar role editor's form action (its own write target). */
function rolesFormAction(html: string): string | undefined {
  return /<form\b[^>]*action="([^"]*\*enabled_roles)"/.exec(html)?.[1];
}

describe("staging server commits the Session-card write into the visitor cookie", () => {
  beforeAll(async () => {
    if (!existsSync(FIXTURE_DB)) throw new Error(`fixture deck missing: ${FIXTURE_DB}`);
    const spec = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "deck.json"), "utf8")) as {
      actors: Record<string, { card: string; email?: string; password?: string }>;
    };
    const admin = spec.actors["admin"];
    if (admin?.email === undefined || admin.password === undefined) {
      throw new Error("fixture deck.json has no admin actor with credentials");
    }
    actorName = admin.card;
    actorEmail = admin.email;
    actorPassword = admin.password;

    mkdirSync(WORK_DIR, { recursive: true });
    rmSync(FIXTURE_PATH, { force: true });
    copyFileSync(FIXTURE_DB, FIXTURE_PATH);
    mkdirSync(FILES_DIR, { recursive: true });
    {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(FIXTURE_PATH);
      db.exec(
        `CREATE TABLE IF NOT EXISTS "deck_data_version" ("id" INTEGER PRIMARY KEY CHECK ("id" = 1), "version" INTEGER NOT NULL DEFAULT 0);
         INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0);`,
      );
      db.close();
    }
    {
      const db = new Database(FIXTURE_PATH, { readonly: true });
      try {
        const row = db
          .prepare("SELECT id FROM cards WHERE codename = 'session' AND trash = 0")
          .get() as { id: number } | undefined;
        sessionTypeId = row?.id ?? -1;
      } finally {
        db.close();
      }
    }
    expect(sessionTypeId).toBeGreaterThan(0);

    await ensureStagingServerDist();
    const port = await reserveEphemeralPort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [SERVER_ENTRY, FIXTURE_PATH, String(port)], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DECKO_WRITE_PATH: "1",
        DECKO_DECK_PROFILE: "stock",
        DECKO_ASSET_REFRESH: "never",
        DECKO_FONT_AWESOME: "local",
        DECKO_PASSWORD_HASH: "legacy-sha1",
        DECKO_MOD_PUBLIC_DIR: MOD_PUBLIC_DIR,
        DECKO_FILES_DIR: FILES_DIR,
        COMPILED_ASSETS_DIR: FILES_DIR,
        DECKO_ORIGIN: baseUrl,
        // A test-local signing secret; never read back, never printed.
        DECKO_TOKEN_SECRET: "visitor-session-write-commit-secret",
      },
    });
    server.stdout?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });

    let ready = false;
    const deadline = Date.now() + 120_000;
    while (!ready && Date.now() < deadline) {
      try {
        ready = (await fetch(`${baseUrl}/_status`)).status === 200;
      } catch {
        /* not listening yet */
      }
      if (!ready) await delay(250);
    }
    if (!ready) {
      throw new Error(
        `staging server did not become ready on port ${port}\n--- server output ---\n${serverOutput}`,
      );
    }
  }, 240_000);

  afterAll(async () => {
    if (server !== null && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 3000);
        server?.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    server = null;
    rmSync(WORK_DIR, { recursive: true, force: true });
  });

  it("the role-checkbox save answers {reload:true} AND commits the session card", async () => {
    const signin = await fetch(`${baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: actorEmail, password: actorPassword }),
    });
    expect(signin.status).toBe(200);
    expect(((await signin.json()) as { ok: boolean }).ok).toBe(true);
    const session = /decko_ts_session=([A-Za-z0-9]+)/.exec(signin.headers.get("set-cookie") ?? "");
    expect(session).not.toBeNull();
    const cookie = `decko_ts_session=${session?.[1] as string}`;

    // The navbar's own inline role-checkbox editor, read from the live page:
    // its action IS the write target and its inputs ARE the roles on offer.
    const home = await fetch(`${baseUrl}/`, { headers: { cookie } });
    expect(home.status).toBe(200);
    const html = await home.text();
    const formAction = rolesFormAction(html);
    expect(formAction).toBeTruthy();
    const boxes = roleBoxes(html);
    expect(boxes.length).toBeGreaterThan(0);

    const target = boxes[0] as { name: string; value: string };
    const form = new URLSearchParams({
      // rails-ujs' own utf8 marker (the probe's captured post body carries it).
      utf8: "✓",
      "success[reload]": "true",
      "card[type_id]": String(sessionTypeId),
      "card[content]": target.value,
      [target.name]: target.value,
    });
    const save = await fetch(`${baseUrl}${formAction as string}`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      redirect: "manual",
    });

    // The pre-existing half of the contract: the save succeeds and answers the
    // reload JSON the role-checkbox post expects.
    expect(save.status).toBe(200);
    expect(((await save.json()) as { reload: boolean }).reload).toBe(true);

    // The half this file exists for: the session the save wrote is in the
    // Set-Cookie the BROWSER receives. Before the fix the response carried no
    // visitor cookie at all, so the selection never moved.
    const committed = sessionValueOf(save.headers.get("set-cookie"));
    expect(committed.present).toBe(true);
    expect(committed.raw).toBe(target.value);
  });

  it("a write that changes nothing in the session commits no cookie", async () => {
    // handleWriteRequest only stamps `visitorCookie` when the state actually
    // moved (write-routes.ts:1717-1721). Replaying the SAME save with the
    // cookie that save handed back must answer without a second visitor
    // cookie — the host must not mint one of its own either.
    const signin = await fetch(`${baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: actorEmail, password: actorPassword }),
    });
    expect(signin.status).toBe(200);
    const session = /decko_ts_session=([A-Za-z0-9]+)/.exec(signin.headers.get("set-cookie") ?? "");
    const cookie = `decko_ts_session=${session?.[1] as string}`;
    const home = await fetch(`${baseUrl}/`, { headers: { cookie } });
    const html = await home.text();
    const formAction = rolesFormAction(html);
    expect(formAction).toBeTruthy();
    const target = roleBoxes(html)[0] as { name: string; value: string };
    expect(target.value).toBeTruthy();
    const form = new URLSearchParams({
      utf8: "✓",
      "success[reload]": "true",
      "card[type_id]": String(sessionTypeId),
      "card[content]": target.value,
      [target.name]: target.value,
    });

    const first = await fetch(`${baseUrl}${formAction as string}`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      redirect: "manual",
    });
    expect(first.status).toBe(200);
    const committed = visitorCookieOf(first.headers.get("set-cookie"));
    expect(committed).toBeDefined();

    // The browser now HOLDS the committed cookie; the replay starts from it.
    const replay = await fetch(`${baseUrl}${formAction as string}`, {
      method: "POST",
      headers: {
        cookie: `${cookie}; ${committed as string}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      redirect: "manual",
    });
    expect(replay.status).toBe(200);
    expect(visitorCookieOf(replay.headers.get("set-cookie"))).toBeUndefined();
  });
});