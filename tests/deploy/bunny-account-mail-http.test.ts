// Actual Bunny handler + BunnyDbDriver over a local Hrana HTTP service.
// The outbox is the production NotifyTransport interface's CaptureTransport;
// no external provider or remote database is contacted.
import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { runAuthMigrations } from "../../src/card/auth/index.js";
import { ensureFreshnessStamp } from "../../src/server/freshness-stamp.js";
import { CaptureTransport } from "../../src/card/notify/transport.js";
import { handleBunnyEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-handler.js";
import type { WorkersWriteContext } from "../../src/server/cloudflare-write-routes.js";
import { startMockHranaServer, type MockHranaServer } from "../server/drivers/mock-hrana-server.js";

let root: string, hrana: MockHranaServer, driver: BunnyDbDriver, http: Server, base: string;
const services: { accountMail?: WorkersWriteContext["accountMail"] } = {};
const outbox = new CaptureTransport("owned-local-outbox");
beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), "decko-bunny-mail-test-"));
  const database = path.join(root, "deck.sqlite3");
  cpSync(path.resolve("reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3"), database);
  hrana = await startMockHranaServer({ path: database });
  driver = new BunnyDbDriver({ url: hrana.url, authToken: "owned-test" });
  await runAuthMigrations(driver);
  await ensureFreshnessStamp(driver);
  const env = { DECKO_DB_URL: hrana.url, DECKO_DB_TOKEN: "owned-test", DECKO_WRITE_PATH: "1", DECKO_EDGE_DECK_PROFILE: "stock" };
  http = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const response = await handleBunnyEngineRequest(new Request(base + req.url, { method: req.method, headers: req.headers as Record<string, string>, ...(body.length ? { body } : {}) }), env, services);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      const cookies = response.headers.getSetCookie(); if (cookies.length) res.setHeader("set-cookie", cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.statusCode = 500; res.end(String(error)); }
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>(resolve => http?.close(() => resolve()));
  await hrana?.close();
  if (root) { expect(path.dirname(root)).toBe(path.resolve(os.tmpdir())); expect(path.basename(root).startsWith("decko-bunny-mail-test-")).toBe(true); rmSync(root, { recursive: true, force: true }); }
});
async function snapshot() {
  return Object.fromEntries(await Promise.all(["cards", "card_acts", "card_actions", "card_changes", "sqlite_sequence"].map(async table => [table, (await driver.query(`SELECT * FROM ${table} ORDER BY 1`, [])).rows])));
}
const post = (pathname: string, fields: Record<string, string>, cookie?: string) => fetch(base + pathname, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", origin: base, ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(fields) });
const signin = (email: string, password: string) => post("/update/*signin", { "card[subcards][+*email][content]": email, "card[subcards][+*password][content]": password });
// Submit the actual rendered controls. Hidden routing fields must come from
// the application form, so a working hand-authored request cannot mask a broken UI.
function formFields(html: string, action: string): Record<string, string> {
  // Layout chrome also contains hidden new/signin forms. The focal form
  // follows them in the document, as the real browser's visible controls do.
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].filter(([value]) => value.includes(`action="${action}"`)).at(-1)?.[0];
  expect(form, `rendered form ${action}`).toBeDefined();
  const fields: Record<string, string> = {};
  for (const [input] of form!.matchAll(/<input\b[^>]*>/g)) {
    const name = /\bname="([^"]+)"/.exec(input)?.[1];
    if (name) fields[name] = /\bvalue="([^"]*)"/.exec(input)?.[1] ?? "";
  }
  return fields;
}

it("refuses missing mail without writes; delivers real verification tokens through the handler and authenticates a fresh session", async () => {
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  expect(admin.status).toBe(303);
  const cookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  expect(cookie).toMatch(/decko_ts_session=[^;]+/);
  const signupId = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='signup'", [])).rows[0].id;
  const signupPage = await fetch(base + "/new/Sign_up");
  expect(signupPage.status).toBe(200);
  const form = formFields(await signupPage.text(), "/card/create");
  expect(form["card[type_id]"]).toBe(String(signupId));
  expect(Object.hasOwn(form, "card[subcards][+*account][subcards][+*email][content]")).toBe(true);
  expect(Object.hasOwn(form, "card[subcards][+*account][subcards][+*password][content]")).toBe(true);
  form["card[name]"] = "Edge Mail Signup";
  form["card[subcards][+*account][subcards][+*email][content]"] = "edge.signup@example.test";
  form["card[subcards][+*account][subcards][+*password][content]"] = "Edge signup pass 7#";
  const before = await snapshot();
  const missing = await post("/card/create", form, cookie);
  expect(missing.status).toBe(422);
  expect(await missing.text()).toContain("account mail is not configured");
  expect(await snapshot()).toEqual(before);
  expect(outbox.count()).toBe(0);

  services.accountMail = { transport: outbox, token: { secret: "owned-local-token-secret" }, origin: base, siteTitle: "My Deck" };
  const saved = await post("/card/create", form, cookie);
  expect(saved.status).toBe(200);
  const sent = outbox.drain().filter(m => m.to === "edge.signup@example.test" && /verification link/.test(m.subject));
  expect(sent).toHaveLength(1);
  const link = sent[0].textBody.match(/https?:\/\/[^\s<>]+/)![0];
  const configured = services.accountMail;
  delete services.accountMail;
  const pending = await snapshot();
  const unavailable = await fetch(link, { redirect: "manual" });
  expect(unavailable.status).toBe(503);
  expect(await snapshot()).toEqual(pending);
  services.accountMail = configured;
  const bad = new URL(link); bad.searchParams.set("token", "invalid-token");
  expect((await fetch(bad, { redirect: "manual" })).status).toBe(403);
  expect(await snapshot()).toEqual(pending);
  expect(outbox.count()).toBe(0);

  const activated = await fetch(link, { redirect: "manual" });
  expect(activated.status).toBe(303);
  expect(activated.headers.get("set-cookie")).toMatch(/decko_ts_session=[^;]+/);
  // Stock account data seeds an empty welcome template (no subject/body).
  const welcome = outbox.drain().filter(m => m.to === "edge.signup@example.test");
  expect(welcome).toHaveLength(1);
  expect(welcome[0]).toMatchObject({ subject: "", textBody: "" });
  const fresh = await signin("edge.signup@example.test", "Edge signup pass 7#");
  expect(fresh.status).toBe(303);
  expect(fresh.headers.get("set-cookie")).toMatch(/decko_ts_session=[^;]+/);
  expect(hrana.violations).toEqual([]);
}, 60_000);

it("renders typed attachment/structure editors and submits the legacy query-named create form through the actual handler", async () => {
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  expect(admin.status).toBe(303);
  const cookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  for (const [type, mount] of [["File", "file"], ["Image", "image"]]) {
    const response = await fetch(`${base}/new/${type}`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toMatch(new RegExp(`name=['"]card\\[${mount}\\]['"] type=['"]file['"]`));
    expect(html).toContain('name="attachment_type_id"');
    expect(html).toContain('name="file_card_name"');
    expect(html).not.toContain('class="tinymce-textarea');
  }
  const structured = await fetch(`${base}/new/Topic`, { headers: { cookie } });
  expect(structured.status).toBe(200);
  expect(await structured.text()).toContain('name="card[subcards][+summary][content]"');
  const mark = "tags+*right+*input_type";
  const legacy = await fetch(`${base}/card/new?${new URLSearchParams({ "card[name]": mark, type: "Phrase" })}`, { headers: { cookie } });
  expect(legacy.status).toBe(200);
  const fields = formFields(await legacy.text(), "/card/create");
  expect(fields["card[name]"]).toBe(mark);
  fields["card[content]"] = "checkbox";
  const saved = await post("/card/create", fields, cookie);
  expect(saved.status).toBe(200);
  const result = await saved.json() as { card_id: number; card: { name: string }; verb: string };
  expect(result).toMatchObject({ card: { name: mark }, verb: "create" });
  // Junction names/keys are derived from their parts, not materialized in
  // the stock fixture's cards row. Check the returned committed row ID.
  const persisted = (await driver.query<{ db_content: string; trash: number; left_id: number; right_id: number }>("SELECT db_content,trash,left_id,right_id FROM cards WHERE id = ?", [result.card_id])).rows;
  expect(persisted).toHaveLength(1);
  expect(persisted[0]).toMatchObject({ db_content: "checkbox", trash: 0 });
  expect(persisted[0].left_id).toBeGreaterThan(0);
  expect(persisted[0].right_id).toBeGreaterThan(0);
  expect(hrana.violations).toEqual([]);
}, 60_000);

it("completes a real reset email, token GET, account form write and fresh login while rejecting the old password", async () => {
  services.accountMail = { transport: outbox, token: { secret: "owned-local-token-secret" }, origin: base, siteTitle: "My Deck" };
  outbox.drain();
  const resetPage = await fetch(base + "/*signin/edit");
  expect(resetPage.status).toBe(200);
  const fields = formFields(await resetPage.text(), "/update/*signin");
  expect(fields["card[trigger]"]).toBe("send_reset_password_token");
  expect(fields["success[view]"]).toBe("reset_password_success");
  fields["card[subcards][+*email][content]"] = "mira.member@example.test";
  const crossSite = await fetch(base + "/update/*signin", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://attacker.example" },
    body: new URLSearchParams(fields), redirect: "manual",
  });
  expect(crossSite.status).toBe(403);
  expect(outbox.count()).toBe(0);
  const requested = await post("/update/*signin", fields);
  expect(requested.status).toBe(200);
  expect(await requested.json()).toMatchObject({ redirect: `${base}/*signin/reset_password_success` });
  const mail = outbox.drain().filter(m => m.to === "mira.member@example.test" && /reset/i.test(m.subject));
  expect(mail).toHaveLength(1);
  const link = mail[0].textBody.match(/https?:\/\/[^\s<>]+/)![0];
  const confirmed = await fetch(link, { redirect: "manual" });
  expect(confirmed.status).toBe(303);
  expect(confirmed.headers.get("location")).toBe(`${base}/Mira_Member+*account/edit`);
  const cookie = confirmed.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  expect(cookie).toMatch(/decko_ts_session=[^;]+/);
  const form = await fetch(confirmed.headers.get("location")!, { headers: { cookie } });
  expect(form.status).toBe(200);
  expect(await form.text()).toContain('name="card[subcards][+*password][content]"');
  const changed = await post("/update/Mira_Member+*account", {
    _method: "patch", "card[subcards][+*password][content]": "Edge reset pass 8#",
  }, cookie);
  expect(changed.status).toBe(200);
  const fresh = await signin("mira.member@example.test", "Edge reset pass 8#");
  expect(fresh.status).toBe(303);
  expect(fresh.headers.get("set-cookie")).toMatch(/decko_ts_session=[^;]+/);
  const old = await signin("mira.member@example.test", "Fixture member pass 1#");
  expect(old.status).toBe(422);
  expect(old.headers.get("set-cookie") ?? "").not.toMatch(/decko_ts_session=[^;]+/);
  // Production uniform-failure policy deliberately conceals which field failed.
  expect(await old.json()).toMatchObject({ error_status: 422, errors: { error: "Wrong email or password." } });
  expect(hrana.violations).toEqual([]);
}, 60_000);
