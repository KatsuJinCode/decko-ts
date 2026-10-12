// Replays a recorded Rails editing session against the TypeScript write
// path and diffs the resulting card/act/action/changes rows against the
// rows the manifest records for each step.
//
// The recording lives OUTSIDE this repo (machine-local artifact), located
// by DECKO_TS_EDIT_SESSION_CAPTURES: its manifest.json holds per-step
// request params, response status + sha256 + byte count, and the raw
// act/action/changes rows written after each state change. The fixture DB
// is a DISPOSABLE COPY of the source app's development.sqlite3 (env
// DECKO_TS_ORACLE_DB), rebuilt by every run via the sqlite backup API (so
// WAL content comes along), then rolled back to the pre-session state
// using the manifest's recorded row ids: the session's acts/actions/
// changes are deleted and the probe card's content is restored from its
// own create-action change row. The copy is the only thing this test ever
// writes to.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as netCreateServer } from "node:net";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureStagingServerDist } from "../card/auth/staging-server-dist-bootstrap.js";
import { describeOrSkipLoud } from "../support/describe-with-corpus.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const DEFAULT_CAPTURES =
  "CAPTURE_DIR/edit-session";
const CAPTURES_DIR = process.env.DECKO_TS_EDIT_SESSION_CAPTURES ?? DEFAULT_CAPTURES;
const MANIFEST_PATH = path.join(CAPTURES_DIR, "manifest.json");

// The source app's development.sqlite3, resolved relative to this file so
// the default stays valid wherever the repo is checked out;
// DECKO_TS_ORACLE_DB overrides for a deliberately-chosen source deck.
const DEFAULT_ORACLE = fileURLToPath(
  new URL("../../tools/oracle/decko-oracle-app/db/development.sqlite3", import.meta.url),
);
const ORACLE_DB = process.env.DECKO_TS_ORACLE_DB ?? DEFAULT_ORACLE;

const FIXTURE_PATH = path.join(REPO_ROOT, "tmp", "edit-session-replay-fixture.sqlite3");

// The source demo database's own test-issued credential; it holds no
// other HTTP-workable password.
const TOVA_EMAIL = "tova@example.com";
const TOVA_PASSWORD = "Capture-Probe-2026!";

interface CapturedRow {
  [key: string]: number | string | null;
}
interface StepEntry {
  step: string;
  label: string;
  request: {
    method: string;
    url: string;
    params?: Record<string, string>;
    [key: string]: unknown;
  };
  response: { status: number; bytes: number; sha256: string; [key: string]: unknown };
  db_after?: {
    card_acts: CapturedRow[];
    card_actions: CapturedRow[];
    card_changes: CapturedRow[];
    cards: CapturedRow[];
    db_poll_seconds?: number;
  };
}
interface Manifest {
  captured_at: string;
  server: string;
  db_baseline: {
    probe_card_id: number;
    protected_card_id: number;
    probe_last_action_id_before: number;
    protected_last_action_id_before: number;
    global_last_act_before: number;
    global_last_action_before: number;
  };
  steps: StepEntry[];
}

const describeIfFixture = describeOrSkipLoud(!(existsSync(MANIFEST_PATH) && existsSync(ORACLE_DB)), "tests/server/edit-session-replay.test.ts", "existsSync(MANIFEST_PATH) && existsSync(ORACLE_DB)");

let manifest: Manifest;
let server: ChildProcess | null = null;
let serverOutput = "";
let baseUrl = "";
let sessionCookie = "";
let tsAction1Id = 0;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function reserveEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = netCreateServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address === null || typeof address === "string") {
        srv.close();
        reject(new Error("unexpected address"));
        return;
      }
      const port = address.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** Form-encodes a params hash from the manifest. */
function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

const BROWSER_FORM_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const XHR_ACCEPT =
  "text/javascript, application/x-javascript, application/ecmascript, " +
  "application/x-ecmascript, */*; q=0.01";

async function get(pathName: string, cookie?: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${baseUrl}${pathName}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

async function post(
  pathName: string,
  params: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; location: string | null; setCookie: string }> {
  const res = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...headers,
    },
    body: formBody(params),
    redirect: "manual",
  });
  return {
    status: res.status,
    body: await res.text(),
    location: res.headers.get("location"),
    setCookie: res.headers.get("set-cookie") ?? "",
  };
}

/** Signs the demo member in through the staging front door and returns the
 *  raw session token from the issued cookie. */
async function frontDoorSignin(): Promise<string> {
  const res = await fetch(`${baseUrl}/_signin`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: formBody({ identifier: TOVA_EMAIL, password: TOVA_PASSWORD }),
  });
  expect(res.status).toBe(200);
  const payload = (await res.json()) as { ok: boolean; name: string };
  expect(payload.ok).toBe(true);
  expect(payload.name).toBe("Tova");
  const cookieHeader = res.headers.get("set-cookie") ?? "";
  expect(cookieHeader).not.toBe("");
  return cookieHeader.split(";")[0].split("=").slice(1).join("=");
}

/** Raw row dump from the fixture (fresh handle per read). */
function dumpRows(): {
  card_acts: CapturedRow[];
  card_actions: CapturedRow[];
  card_changes: CapturedRow[];
  cards: CapturedRow[];
} {
  const db = new Database(FIXTURE_PATH, { readonly: true });
  try {
    const {
      probe_card_id: probe,
      protected_card_id: prot,
      global_last_act_before: floorAct,
      global_last_action_before: floorAction,
    } = manifest.db_baseline;
    // Only rows the replayed session wrote are compared: the acts dump is
    // scoped to the session's OWN actions (the acts belong to the probe/
    // protected cards' actions above the floor) — the source database keeps
    // accumulating rows, and a global id-floor dump would sweep unrelated
    // activity into the comparison.
    const acts = db
      .prepare(
        `SELECT * FROM card_acts WHERE id > ? AND id IN
         (SELECT card_act_id FROM card_actions WHERE id > ? AND card_id IN (?, ?))
         ORDER BY id`,
      )
      .all(floorAct, floorAction, probe, prot) as unknown as CapturedRow[];
    const actions = db
      .prepare(
        "SELECT * FROM card_actions WHERE id > ? AND card_id IN (?, ?) ORDER BY id",
      )
      .all(floorAction, probe, prot) as unknown as CapturedRow[];
    const changes = db
      .prepare(
        `SELECT * FROM card_changes WHERE card_action_id IN
         (SELECT id FROM card_actions WHERE id > ? AND card_id IN (?, ?)) ORDER BY id`,
      )
      .all(floorAction, probe, prot) as unknown as CapturedRow[];
    const cards = db
      .prepare("SELECT * FROM cards WHERE id IN (?, ?)")
      .all(probe, prot) as unknown as CapturedRow[];
    return { card_acts: acts, card_actions: actions, card_changes: changes, cards };
  } finally {
    db.close();
  }
}

/** Comparable projection of the act/action/changes rows: values only, ids and
 *  clock fields stripped — compared by count + ordering + content. The ip
 *  column is kept separately because the source engine records NULL there
 *  while the TS engine records an address. */
function projectWriteRows(rows: {
  card_acts: CapturedRow[];
  card_actions: CapturedRow[];
  card_changes: CapturedRow[];
}): {
  acts: unknown[];
  actions: unknown[];
  changes: unknown[];
  actIps: unknown[];
} {
  return {
    acts: rows.card_acts.map((a) => [a.card_id, a.actor_id]),
    actIps: rows.card_acts.map((a) => a.ip_address),
    actions: rows.card_actions.map((a) => [a.card_id, a.action_type, a.super_action_id, a.draft]),
    changes: rows.card_changes.map((c) => [c.field, c.value]),
  };
}

describeIfFixture(
  "captured Rails edit session replayed against the TS write path",
  { timeout: 240_000 },
  () => {
    beforeAll(async () => {
      manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;

      // 1. Disposable copy via the backup API (includes WAL content).
      mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      rmSync(FIXTURE_PATH, { force: true });
      rmSync(`${FIXTURE_PATH}-wal`, { force: true });
      rmSync(`${FIXTURE_PATH}-shm`, { force: true });
      const source = new Database(ORACLE_DB, { readonly: true });
      // backup() exists at runtime (better-sqlite3 online backup API); the
      // repo's type defs predate it.
      await (
        source as unknown as { backup(destination: string): Promise<void> }
      ).backup(FIXTURE_PATH);
      source.close();

      // 2. Roll the probe/protected cards back to the captured pre-session
      //    state using the manifest's own row ids (re-runnable: the deletes
      //    are idempotent; the content restore reads the create-action change
      //    row, which the session never touched).
      const db = new Database(FIXTURE_PATH);
      try {
        const {
          probe_card_id: probe,
          probe_last_action_id_before: probeCreateActionId,
          global_last_action_before: floorAction,
        } = manifest.db_baseline;
        const sessionActionIds = manifest.steps
          .flatMap((s) => s.db_after?.card_actions ?? [])
          .map((a) => Number(a.id));
        const sessionActIds = manifest.steps
          .flatMap((s) => s.db_after?.card_acts ?? [])
          .map((a) => Number(a.id));
        db.exec("BEGIN");
        const rollback = () => {
          if (sessionActionIds.length > 0) {
            db.prepare(
              `DELETE FROM card_changes WHERE card_action_id IN (${sessionActionIds.join(",")})`,
            ).run();
            db.prepare(
              `DELETE FROM card_actions WHERE id IN (${sessionActionIds.join(",")})`,
            ).run();
          }
          if (sessionActIds.length > 0) {
            db.prepare(`DELETE FROM card_acts WHERE id IN (${sessionActIds.join(",")})`).run();
          }
          const revOne = db
            .prepare(
              "SELECT value FROM card_changes WHERE card_action_id = ? AND field = 2",
            )
            .get(probeCreateActionId) as { value: string } | undefined;
          if (revOne === undefined) throw new Error("probe create-action content change missing");
          db.prepare("UPDATE cards SET db_content = ?, updater_id = 1 WHERE id = ?").run(
            revOne.value,
            probe,
          );
        };
        try {
          rollback();
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        const remaining = db
          .prepare(
            "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ? AND id > ?",
          )
          .get(manifest.db_baseline.probe_card_id, floorAction) as { n: number };
        if (remaining.n !== 0) throw new Error("rollback left session action rows behind");
      } finally {
        db.close();
      }

      // 3. Boot the staging server on the copy, write path on.
      await ensureStagingServerDist();
      const port = await reserveEphemeralPort();
      baseUrl = `http://127.0.0.1:${port}`;
      server = spawn(
        process.execPath,
        [path.join(REPO_ROOT, "vm-staging-server.mjs"), FIXTURE_PATH, String(port)],
        {
          cwd: REPO_ROOT,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, DECKO_WRITE_PATH: "1" },
        },
      );
      server.stdout?.on("data", (chunk: Buffer) => {
        serverOutput += chunk.toString();
      });
      server.stderr?.on("data", (chunk: Buffer) => {
        serverOutput += chunk.toString();
      });
      let ready = false;
      for (let attempt = 0; attempt < 240 && !ready; attempt += 1) {
        await delay(500);
        try {
          const res = await fetch(`${baseUrl}/`, { redirect: "manual" });
          if (res.status > 0) ready = true;
        } catch {
          // not up yet
        }
      }
      if (!ready) {
        throw new Error(`staging server never became ready; output:\n${serverOutput.slice(-2000)}`);
      }
    }, 240_000);

    afterAll(() => {
      server?.kill();
      const lines = serverOutput.split("\n");
      const tail = lines.slice(-12).join("\n");
      console.log("[edit-session-replay] staging server log tail:\n" + tail);
    });

    it("fixture rollback landed the probe back at revision 1", () => {
      const { cards } = dumpRows();
      const probe = cards.find((c) => Number(c.id) === manifest.db_baseline.probe_card_id);
      expect(probe).toBeDefined();
      // revision-one content = the create action's own field-2 change value
      const db = new Database(FIXTURE_PATH, { readonly: true });
      try {
        const revOne = db
          .prepare("SELECT value FROM card_changes WHERE card_action_id = ? AND field = 2")
          .get(manifest.db_baseline.probe_last_action_id_before) as { value: string };
        expect((probe as CapturedRow).db_content).toBe(revOne.value);
      } finally {
        db.close();
      }
    });

    it("step-02 exact shape: POST /update/*signin signs Tova in (303 to *previous, cookie, zero rows)", async () => {
      // Ruby: the :signin event (signin.rb:10-12) authenticates the
      // +*email/+*password subcard contents, signin_success aborts the save
      // (signin.rb:15-17 — no card rows), and the controller hard-redirects
      // 303 to *previous (signin.rb:171), the fresh session history's first
      // entry (location_history.rb:6-9).
      const step = manifest.steps.find((s) => s.step === "step-02-signin-post");
      const params = { ...(step?.request.params ?? {}) } as Record<string, string>;
      // the manifest redacts the password; the real request carried it
      params["card[subcards][+*email][content]"] = TOVA_EMAIL;
      params["card[subcards][+*password][content]"] = TOVA_PASSWORD;
      // host-swapped replay: same request shape, Origin rewritten to the
      // replay server's own base rather than the one the manifest recorded.
      const res = await post("/update/*signin", params, {
        origin: baseUrl,
        accept: BROWSER_FORM_ACCEPT,
      });
      expect(res.status).toBe(303); // hard redirect to *previous
      expect(res.location).toBe(`${baseUrl}/`); // card_url absolute; *previous = "/" fresh
      expect(res.setCookie).toContain("decko_ts_session="); // Auth.signin bound the session
      // the aborted save wrote zero card rows
      const rows = dumpRows();
      expect(rows.card_actions.length).toBe(0);
      expect(rows.card_acts.length).toBe(0);
    });

    it("TS front door: POST /_signin signs Tova in (session cookie issued)", async () => {
      const signed = await fetch(`${baseUrl}/_signin`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: formBody({ identifier: TOVA_EMAIL, password: TOVA_PASSWORD }),
      });
      expect(signed.status).toBe(200);
      const payload = (await signed.json()) as { ok: boolean; name: string };
      expect(payload.ok).toBe(true);
      expect(payload.name).toBe("Tova");
      const cookieHeader = signed.headers.get("set-cookie") ?? "";
      expect(cookieHeader).not.toBe("");
      sessionCookie = cookieHeader.split(";")[0];
    });

    it("step-03 shape: ?view=edit renders the live edit-form page (LIVE: 200, 23,628B)", async () => {
      // The edit view chain (:edit -> :edit_form -> :input) is registered by
      // the edit-forms mod; the deck-boot wiring (defaultDeckLoader in
      // vm-staging-server.mjs) is what makes mod-registered views visible to
      // the SERVING surface — without it the seed-only view registry answers
      // UnsupportedViewError 422. Ruby's unsupported-view UserError 422
      // (format/render.rb:60-64, error.rb:21) fires only for genuinely
      // unregistered names (asserted in the routes test below).
      const res = await get(`/Session_Replay_Probe_G_2026-09-28?view=edit`, sessionCookie);
      expect(res.status).toBe(200);
      // the edit form the browser round-trips — the :edit modal grammar:
      // the /update/<mark> action with the _method patch spoof, the conflict
      // tracker hidden field, the content textarea, the modal
      // Save-and-Close submit + the data-bs-dismiss cancel button
      expect(res.body).toContain(`action="/update/Session_Replay_Probe_G_2026_09_28"`);
      expect(res.body).toContain(`name="_method"`);
      expect(res.body).toContain(`value="patch"`);
      expect(res.body).toContain(`name="card[content]"`);
      expect(res.body).toContain(`name="card[last_action_id_before_edit]"`);
      expect(res.body).toContain(`data-cy="submit-modal"`);
      expect(res.body).toContain(`Save and Close</button>`);
      expect(res.body).toContain(`data-bs-dismiss="modal"`);
    });

    it("step-03 routing proof: a PORTED view (?view=titled) renders that view (200)", async () => {
      // the positive half: the param drives the render.
      const res = await get(`/Session_Replay_Probe_G_2026-09-28?view=titled`, sessionCookie);
      expect(res.status).toBe(200);
      expect(res.body).toContain("Session Replay Probe G 2026-09-28");
    });

    it("the edit URL forms the live chrome emits render the same edit page (engine_routes.rb:51,25)", async () => {
      // The signed-in page chrome's edit links carry the two-segment path
      // form. Ruby routes:
      //   config/engine_routes.rb:51  get ":mark/:view(.:format)" => "card#read"
      //   :24                          get ":mark/view/:view(.:format)"
      //   :25                          get "card/:view(/:mark)", view: new|edit
      // All three resolve to card#read — the same render the ?view= form
      // produces above.
      for (const [label, path] of [
        [":mark/:view (engine_routes.rb:51)", "/Session_Replay_Probe_G_2026-09-28/edit"],
        [":mark/view/:view (engine_routes.rb:24)", "/Session_Replay_Probe_G_2026-09-28/view/edit"],
        ["card/:view/:mark legacy (engine_routes.rb:25)", "/card/edit/Session_Replay_Probe_G_2026-09-28"],
      ] as const) {
        const res = await get(path, sessionCookie);
        expect(res.status, label).toBe(200);
        expect(res.body, label).toContain(`action="/update/Session_Replay_Probe_G_2026_09_28"`);
        expect(res.body, label).toContain(`name="card[content]"`);
      }
    });

    it("the cancel target /:mark/unknown renders (the :edit_buttons cancel href)", async () => {
      // The edit form's cancel button href="/<mark>/unknown" — the same
      // :mark/:view grammar (engine_routes.rb:51) with view :unknown (the
      // seed unknownView: the createable-gated unknown-link slot).
      const res = await get("/Session_Replay_Probe_G_2026-09-28/unknown", sessionCookie);
      expect(res.status).toBe(200);
      expect(res.body).toContain("Session Replay Probe G 2026-09-28");
    });

    it("the main script asset URL serves the COMPILED bundle with the tinymce editor entrypoints (tinymce-assets lane)", { timeout: 900_000 }, async () => {
      // Ruby serves /files/~<id>/<rev>.js from the *all+*script+*asset
      // output file card's stored bytes — the compiled form of the
      // *all+*script manifest (asset_outputter.rb:20-25; the script
      // :compressed view's Uglifier(harmony) arm under compress_assets=true).
      // The staging server mirrors that OUTPUT contract: the output card
      // resolves by codename and the compiled bytes are produced in process
      // from the pinned assembled input (compiled-script-bundle.ts), so the
      // rich-text editor's initialization entrypoints exist in the served
      // bytes instead of the uncompiled manifest text.
      const res = await fetch(`${baseUrl}/files/~307/1790061390.js`, {
        headers: sessionCookie ? { cookie: sessionCookie } : {},
        redirect: "manual",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("x-decko-asset-note") ?? "").toMatch(/^compiled-/);
      expect(res.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
      const bodyText = await res.text();
      // the compiled bundle, not the manifest text: the tinymce dist leaf +
      // the decko editor hook that binds rich-text edit forms
      expect(bodyText).toContain("// script_tinymce.js\n");
      expect(bodyText).toContain("window.tinymce");
      expect(bodyText).toContain('decko.editors.add(".tinymce-textarea"');
      expect(bodyText).toContain("// tinymce_config.js.coffee\n");
      // and NOT the uncompiled manifest's first manifest line
      expect(bodyText).not.toContain("mod: format+*script");
    });

    it("unported view names 422 and deep paths 404 (Ruby's format-lacking shapes)", async () => {
      // An unported view name: Ruby's unsupported-view UserError 422
      // (format/render.rb:60-64, error.rb:21) — via either URL form.
      const param = await get(`/Session_Replay_Probe_G_2026-09-28?view=not_a_real_view`, sessionCookie);
      expect(param.status).toBe(422);
      const pathForm = await get("/Session_Replay_Probe_G_2026-09-28/not_a_real_view", sessionCookie);
      expect(pathForm.status).toBe(422);
      // Deeper paths: Ruby's bad_address wildcard (engine_routes.rb:54) is
      // an unported view; the staging server answers its own 404 stub.
      const deep = await get("/a/b/c", sessionCookie);
      expect(deep.status).toBe(404);
    });

    it("step-04 exact shape: cookie-only token-less XHR save — 200 slot, rows byte-exact", async () => {
      // Ruby: the ajax flavor soft-redirects (response.rb:36) and
      // re-renders through `show` (response.rb:54-62); no forgery gate
      // exists (module header), so the token-less cookie post saves.
      const step = manifest.steps.find((s) => s.step === "step-04-save-rev2");
      const params = { ...(step?.request.params ?? {}) } as Record<string, string>;
      const res = await post(
        "/update/Session_Replay_Probe_G_2026_09_28",
        params,
        {
          origin: baseUrl,
          referer: `${baseUrl}/Session_Replay_Probe_G_2026-09-28?view=edit`,
          cookie: sessionCookie,
          "x-requested-with": "XMLHttpRequest",
          accept: XHR_ACCEPT,
        },
      );
      expect(res.status).toBe(200);
      expect(res.body).toContain("titled");
      expect(res.body).toContain("EDIT ONE");

      // row parity vs the manifest's step-04 db_after
      const rows = dumpRows();
      const projected = projectWriteRows(rows);
      expect(projected.acts).toEqual([[manifest.db_baseline.probe_card_id, 1217]]);
      // the manifest records the source run's ip_address ("::1", the Rails
      // oracle's loopback); the staging dispatch writes the v4 loopback
      // literal for these replays
      expect(projected.actIps).toEqual(["127.0.0.1"]);
      expect(projected.actions).toEqual([[manifest.db_baseline.probe_card_id, 1, null, 0]]);
      const capturedChange = step?.db_after?.card_changes[0];
      expect(projected.changes).toEqual([
        [capturedChange?.field, capturedChange?.value],
      ]);
      tsAction1Id = Number(rows.card_actions[rows.card_actions.length - 1].id);
    });

    it("step-05 parity: read view carries the new content", async () => {
      const res = await get("/Session_Replay_Probe_G_2026-09-28", sessionCookie);
      // 200 with EDIT ONE visible in the rendered page.
      expect(res.status).toBe(200);
      expect(res.body).toContain("EDIT ONE");
      expect(res.body).not.toContain("revision one");
    });

    it("step-06 shape: ?view=history renders the live history page (LIVE: 200, 23,174B)", async () => {
      // The :history view is registered by the history mod
      // (card-mod-history.ts, views.rb:4-9) and reaches the serving surface
      // through the same deck-boot wiring as step-03.
      const res = await get(`/Session_Replay_Probe_G_2026-09-28?view=history`, sessionCookie);
      expect(res.status).toBe(200);
      // the history view's act-listing machinery (act_listing.rb:20-26
      // legend row + the acts accordion) around the card's title
      expect(res.body).toContain(`class="accordion"`);
      expect(res.body).toContain("Session Replay Probe G 2026-09-28");
      const titled = await get(`/Session_Replay_Probe_G_2026-09-28?view=titled`, sessionCookie);
      expect(titled.status).toBe(200);
      expect(titled.body).toContain("Session Replay Probe G 2026-09-28");
    });

    it("step-07 rows: cookie-only plain-form save reaches revision 3 byte-exactly (303)", async () => {
      // Plain HTML form flavor: redirect_cud_success hard-redirects 303
      // (response.rb:31) with the card_url-absolute Location (response.rb:41).
      const step = manifest.steps.find((s) => s.step === "step-07-save-rev3");
      const params = { ...(step?.request.params ?? {}) } as Record<string, string>;
      // the manifest's conflict tracker carries the action id from the
      // source run; the replay must carry the TS action id written by save 1
      // (same role: the id the edit form's hidden field showed at save time)
      params["card[last_action_id_before_edit]"] = String(tsAction1Id);
      const res = await post("/update/Session_Replay_Probe_G_2026_09_28", params, {
        origin: baseUrl,
        cookie: sessionCookie,
        accept: BROWSER_FORM_ACCEPT,
      });
      expect(res.status).toBe(303);
      expect(res.location).toBe(`${baseUrl}/Session_Replay_Probe_G_2026-09-28`);

      // row parity vs the manifest's step-07 db_after (two saves total)
      const rows = dumpRows();
      const projected = projectWriteRows(rows);
      expect(projected.acts).toEqual([
        [manifest.db_baseline.probe_card_id, 1217],
        [manifest.db_baseline.probe_card_id, 1217],
      ]);
      expect(projected.actions).toEqual([
        [manifest.db_baseline.probe_card_id, 1, null, 0],
        [manifest.db_baseline.probe_card_id, 1, null, 0],
      ]);
      const capturedChanges = step?.db_after?.card_changes ?? [];
      expect(projected.changes).toEqual(
        capturedChanges.map((c) => [c.field, c.value]),
      );
      // card content parity: the probe row carries EDIT TWO byte-exactly
      const probe = rows.cards.find(
        (c) => Number(c.id) === manifest.db_baseline.probe_card_id,
      );
      const capturedProbe = step?.db_after?.cards.find(
        (c) => Number(c.id) === manifest.db_baseline.probe_card_id,
      );
      expect(probe?.db_content).toBe(capturedProbe?.db_content);
      expect(probe?.updater_id).toBe(1217);
    });

    it("step-08 parity: anonymous token-less POST hits Ruby's permission gate (403, zero rows)", async () => {
      // Ruby has no CSRF layer, so the anonymous post reaches
      // ok_to_update? and is denied there (PermissionDenied, 403). The TS
      // gate order matches: no forgery gate, permission denial.
      const step = manifest.steps.find((s) => s.step === "step-08-anon-denied");
      const params = { ...(step?.request.params ?? {}) } as Record<string, string>;
      const res = await post(
        "/update/Session_Replay_Probe_Protected_G_2026-09-28",
        params,
        { origin: baseUrl, accept: BROWSER_FORM_ACCEPT },
      );
      expect(res.status).toBe(403);
      const rows = dumpRows();
      const protectedActions = rows.card_actions.filter(
        (a) => Number(a.card_id) === manifest.db_baseline.protected_card_id,
      );
      expect(protectedActions.length).toBe(0); // zero NEW protected rows (floored dump)
      const protectedRow = rows.cards.find(
        (c) => Number(c.id) === manifest.db_baseline.protected_card_id,
      );
      expect(protectedRow?.db_content).toBe("Protected probe body, revision one.\n");
    });
  },
);
