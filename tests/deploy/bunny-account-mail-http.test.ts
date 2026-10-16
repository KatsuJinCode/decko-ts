// Actual Bunny handler + BunnyDbDriver over a local Hrana HTTP service.
// The outbox is the production NotifyTransport interface's CaptureTransport;
// no external provider or remote database is contacted.
import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { runAuthMigrations } from "../../src/card/auth/index.js";
import { ensureFreshnessStamp } from "../../src/server/freshness-stamp.js";
import { CaptureTransport } from "../../src/card/notify/transport.js";
import { decodeAuthToken } from "../../src/card/auth/token.js";
import { handleBunnyEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-handler.js";
import type { WorkersWriteContext } from "../../src/server/cloudflare-write-routes.js";
import { startMockHranaServer, type MockHranaServer } from "../server/drivers/mock-hrana-server.js";
// @ts-expect-error - the owned HTTP emulator has a JSDoc JavaScript surface.
import { startMockBunnyStorage } from "../server/mock-bunny-storage.mjs";

let root: string, hrana: MockHranaServer, driver: BunnyDbDriver, http: Server, base: string;
let storage: Awaited<ReturnType<typeof startMockBunnyStorage>>;
const originalFetch = globalThis.fetch;
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
  storage = await startMockBunnyStorage({ filesRoot: path.join(root, "files") });
  globalThis.fetch = (input, init) => {
    const value = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const prefix = `https://${storage.host}/`;
    return originalFetch(value.startsWith(prefix) ? `http://${storage.host}/${value.slice(prefix.length)}` : input, init);
  };
  const env = { DECKO_DB_URL: hrana.url, DECKO_DB_TOKEN: "owned-test", DECKO_WRITE_PATH: "1", DECKO_EDGE_DECK_PROFILE: "stock", DECKO_STORAGE_ZONE: storage.zone, DECKO_STORAGE_PASSWORD: storage.password, DECKO_STORAGE_HOST: storage.host };
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
  await storage?.stop();
  globalThis.fetch = originalFetch;
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
  const phraseId = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='phrase'", [])).rows[0].id;
  expect(form["card[subcards][+*account][subcards][+*email][type_id]"]).toBe(String(phraseId));
  expect(form["card[subcards][+*account][subcards][+*password][type_id]"]).toBe(String(phraseId));
  expect(form["success[mark]"]).toBe("signup_success");
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
  const claims = await decodeAuthToken(services.accountMail.token, new URL(link).searchParams.get("token")!);
  expect(claims).toMatchObject({ anonymous: true });
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
  const holder = (await driver.query<{ id: number; type_id: number }>("SELECT id,type_id FROM cards WHERE name='Edge Mail Signup'", [])).rows[0];
  const userId = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='user'", [])).rows[0].id;
  expect(holder.type_id).toBe(userId);
  const accountId = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE left_id=? AND right_id=(SELECT id FROM cards WHERE codename='account')", [holder.id])).rows[0].id;
  const anonymousId = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='anonymous'", [])).rows[0].id;
  const stamps = (await driver.query<{ id: number; updater_id: number }>("SELECT id,updater_id FROM cards WHERE id IN (?,?) OR (left_id=? AND right_id=(SELECT id FROM cards WHERE codename='status')) ORDER BY id", [holder.id, accountId, accountId])).rows;
  expect(stamps).toEqual(expect.arrayContaining([{ id: holder.id, updater_id: holder.id }, { id: accountId, updater_id: anonymousId }]));
  expect(stamps.filter(row => row.id !== accountId).every(row => row.updater_id === holder.id)).toBe(true);
  const act = (await driver.query<{ id: number; card_id: number; actor_id: number; ip_address: string }>("SELECT id,card_id,actor_id,ip_address FROM card_acts ORDER BY id DESC LIMIT 1", [])).rows[0];
  expect(act).toMatchObject({ card_id: accountId, actor_id: holder.id, ip_address: "127.0.0.1" });
  const changed = (await driver.query<{ card_id: number }>("SELECT card_id FROM card_actions WHERE card_act_id=? ORDER BY id", [act.id])).rows;
  expect(changed).toHaveLength(2);
  expect(changed[1].card_id).toBe(holder.id);
  // Stock account data seeds an empty welcome template (no subject/body).
  const welcome = outbox.drain().filter(m => m.to === "edge.signup@example.test");
  expect(welcome).toHaveLength(1);
  expect(welcome[0]).toMatchObject({ subject: "", textBody: "" });
  const fresh = await signin("edge.signup@example.test", "Edge signup pass 7#");
  expect(fresh.status).toBe(303);
  expect(fresh.headers.get("set-cookie")).toMatch(/decko_ts_session=[^;]+/);
  const page = await fetch(base + "/Edge_Mail_Signup", { headers: { cookie: fresh.headers.getSetCookie().map(x => x.split(";")[0]).join("; ") } });
  expect(page.status).toBe(200);
  expect(await page.text()).not.toContain("Send verification email");
  expect(hrana.violations).toEqual([]);
}, 60_000);

it("returns the deck's actual Signup Success page and resolves a plain _self create redirect", async () => {
  const page = await fetch(base + "/new/Sign_up");
  expect(page.status).toBe(200);
  const fields = formFields(await page.text(), "/card/create");
  fields["card[name]"] = "HTTP Pending Signup";
  fields["card[subcards][+*account][subcards][+*email][content]"] = "http.pending@example.test";
  fields["card[subcards][+*account][subcards][+*password][content]"] = "HTTP pending pass 8#";
  fields["success[redirect]"] = "true";
  const submitted = await fetch(base + "/card/create", { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded", "x-requested-with": "XMLHttpRequest" }, body: new URLSearchParams(fields) });
  expect(submitted.status).toBe(200);
  expect(await submitted.json()).toMatchObject({ redirect: `${base}/Signup_Success` });
  const thanks = await fetch(base + "/Signup_Success");
  expect(thanks.status).toBe(200);
  expect(await thanks.text()).toContain("Thank you for signing up with");
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  const cookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  const form = await fetch(`${base}/card/new?${new URLSearchParams({ "card[name]": "HTTP Self Redirect", type: "Phrase" })}`, { headers: { cookie } });
  const self = formFields(await form.text(), "/card/create");
  expect(self["success[mark]"]).toBe("_self");
  self["card[content]"] = "saved";
  const created = await fetch(base + "/card/create", { method: "POST", redirect: "manual", headers: { cookie, origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(self) });
  expect(created.status).toBe(303);
  expect(created.headers.get("location")).toBe(`${base}/HTTP_Self_Redirect`);
}, 60_000);

it("uploads real bytes, renders the actual selected draft preview and saves/downloads the cached attachment", async () => {
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  expect(admin.status).toBe(303);
  const cookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  const typeId = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='file'", [])).rows[0].id;
  const bytes = "Owned real upload contents.\n";
  const data = new FormData();
  data.append("card[type_id]", String(typeId));
  data.append("attachment_upload", "card[file]");
  data.append("card[file]", new Blob([bytes], { type: "text/plain" }), "owned-minutes.txt");
  const uploaded = await fetch(base + "/card/create", { method: "POST", redirect: "manual", headers: { cookie, origin: base, "x-requested-with": "XMLHttpRequest" }, body: data });
  const preview = await uploaded.text();
  expect(uploaded.status, preview).toBe(200);
  expect(preview).toContain("owned-minutes.txt");
  const selected = /name=['"]card\[action_id_of_cached_upload\]['"][^>]*value=['"](\d+)['"]/.exec(preview)?.[1];
  expect(selected).toMatch(/^\d+$/);
  const saved = await post("/card/create", { "card[name]": "Owned HTTP Upload", "card[type_id]": String(typeId), "card[action_id_of_cached_upload]": selected! }, cookie);
  expect(saved.status).toBe(200);
  const result = await saved.json() as { card_id: number };
  const card = (await driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id=?", [result.card_id])).rows[0];
  expect(card.db_content).toMatch(new RegExp(`^~${result.card_id}/\\d+\\.txt$`));
  const download = await fetch(`${base}/files/${card.db_content}`, { headers: { cookie } });
  expect(download.status).toBe(200);
  expect(await download.text()).toBe(bytes);
  expect(hrana.violations).toEqual([]);
}, 60_000);

it("serves the selected cached image's real temporary bytes before save and removes that draft after final create", async () => {
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  const cookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  const image = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='image'", [])).rows[0];
  const newFile = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='new_file'", [])).rows[0];
  const bytes = readFileSync("reference-harness/browser/files/gradient.png");
  const data = new FormData();
  data.append("card[type_id]", String(image.id));
  data.append("attachment_upload", "card[image]");
  data.append("card[image]", new Blob([bytes], { type: "image/png" }), "owned-gradient.png");
  const uploaded = await fetch(base + "/card/create", { method: "POST", redirect: "manual", headers: { cookie, origin: base, "x-requested-with": "XMLHttpRequest" }, body: data });
  const preview = await uploaded.text();
  expect(uploaded.status, preview).toBe(200);
  const selected = /name=['"]card\[action_id_of_cached_upload\]['"][^>]*value=['"](\d+)['"]/.exec(preview)?.[1];
  const src = /<img[^>]*src=['"]([^'"]+)['"]/.exec(preview)?.[1];
  expect(src).toMatch(new RegExp(`/files/~\\d+/${selected}-medium\\.png$`));
  const before = await snapshot();
  const thumbnail = await fetch(base + src, { headers: { cookie } });
  expect(thumbnail.status).toBe(200);
  expect(thumbnail.headers.get("content-type")).toBe("image/png");
  const thumb = Buffer.from(await thumbnail.arrayBuffer());
  expect(thumb.subarray(0, 8)).toEqual(bytes.subarray(0, 8));
  expect(thumb.readUInt32BE(16)).toBeGreaterThan(0);
  const original = await fetch(base + src!.replace("-medium", ""), { headers: { cookie } });
  expect(original.status).toBe(200);
  expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
  const head = await fetch(base + src, { method: "HEAD", headers: { cookie } });
  expect(head.status).toBe(200); expect(head.headers.get("content-length")).toBe(String(thumb.length)); expect(await head.text()).toBe("");
  expect((await fetch(`${base}/files/~${newFile.id}/${selected}-medium.png`, { headers: { cookie } })).status).toBe(404);
  expect(await snapshot()).toEqual(before);
  const saved = await post("/card/create", { "card[name]": "Owned Cached Image", "card[type_id]": String(image.id), "card[action_id_of_cached_upload]": selected! }, cookie);
  expect(saved.status).toBe(200);
  const result = await saved.json() as { card_id: number };
  const card = (await driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id=?", [result.card_id])).rows[0];
  const final = await fetch(`${base}/files/${card.db_content}`, { headers: { cookie } });
  expect(final.status).toBe(200); expect(Buffer.from(await final.arrayBuffer())).toEqual(bytes);
  expect((await fetch(base + src, { headers: { cookie } })).status).toBe(404);
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
  const beforeForm = await snapshot();
  const requestsBeforeForm = hrana.requests.length;
  const legacy = await fetch(`${base}/card/new?${new URLSearchParams({ "card[name]": mark, "card[content]": "checkbox", type: "Phrase" })}`, { headers: { cookie } });
  expect(legacy.status).toBe(200);
  const fields = formFields(await legacy.text(), "/card/create");
  expect(fields["card[name]"]).toBe(mark);
  expect(fields["card[content]"]).toBe("checkbox");
  // The real HTTP driver must batch this form as well as its chrome.
  // A raw form boot regresses to hundreds of serial name-lookup requests.
  expect(hrana.requests.length - requestsBeforeForm).toBeLessThan(20);
  expect(await snapshot()).toEqual(beforeForm);
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

it("returns the committed Date's real HTML slot without serial response-render queries", async () => {
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  const cookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  const typeId = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='date'", [])).rows[0].id;
  const created = await post("/card/create", { "card[name]": "HTTP Saved Date", "card[type_id]": String(typeId), "card[content]": "2028-02-28" }, cookie);
  expect(created.status).toBe(200);
  const { card_id: cardId } = await created.json() as { card_id: number };
  const actsBefore = (await driver.query<{ n: number }>("SELECT count(*) AS n FROM card_acts", [])).rows[0].n;
  const beforeRequests = hrana.requests.length;
  const saved = await fetch(base + "/update/HTTP_Saved_Date", { method: "POST", headers: { cookie, origin: base, "content-type": "application/x-www-form-urlencoded", accept: "text/html", "x-requested-with": "XMLHttpRequest" }, body: new URLSearchParams({ "card[content]": "2028-02-29", "success[redirect]": "soft" }) });
  expect(saved.status).toBe(200);
  expect(saved.headers.get("content-type")).toContain("text/html");
  const html = await saved.text();
  expect(html).toContain("February 29, 2028");
  expect(html).toContain('class="edit-link slotter"');
  expect(hrana.requests.length - beforeRequests).toBeLessThan(90);
  const row = (await driver.query<{ db_content: string; type_id: number }>("SELECT db_content,type_id FROM cards WHERE id=?", [cardId])).rows[0];
  expect(row).toEqual({ db_content: "2028-02-29", type_id: typeId });
  expect((await driver.query<{ n: number }>("SELECT count(*) AS n FROM card_acts", [])).rows[0].n).toBe(actsBefore + 1);
  const focal = await fetch(base + `/~${cardId}/titled?main=HTTP%20Saved%20Date&slot[main]=true&slot[home_view]=titled`, { headers: { cookie, "x-requested-with": "XMLHttpRequest" } });
  expect(focal.status).toBe(200);
  expect(await focal.text()).toContain("February 29, 2028");
  expect(hrana.violations).toEqual([]);
}, 60_000);

it("batches the actual RichText XHR edit modal and focal slot without changing stored rows", async () => {
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  const cookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  const typeId = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='basic'", [])).rows[0].id;
  const created = await post("/card/create", { "card[name]": "HTTP Rich Modal", "card[type_id]": String(typeId), "card[content]": "<p>Actual rich modal content</p>" }, cookie);
  expect(created.status).toBe(200);
  const { card_id: cardId } = await created.json() as { card_id: number };
  const before = await snapshot();
  const requestsBefore = hrana.requests.length;
  const response = await fetch(base + "/HTTP_Rich_Modal/edit?main=HTTP%20Rich%20Modal", { headers: { cookie, "x-requested-with": "XMLHttpRequest" } });
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("modal-body");
  expect(html).toContain("tinymce-textarea");
  expect(html).toContain("Actual rich modal content");
  expect(html).not.toMatch(/<!doctype html>/i);
  expect(hrana.requests.length - requestsBefore).toBeLessThan(20);
  const beforeSlotRequests = hrana.requests.length;
  const slot = await fetch(base + `/~${cardId}/titled?main=HTTP%20Rich%20Modal&main=HTTP%20Rich%20Modal&is_main=true&slot[view]=titled&slot[nest_name]=_main&slot[nest_syntax]=_main%7Ctitled&slot[main]=true&slot[home_view]=titled&slot[main_view]=true&slot[layout]=Default%20Layout`, { headers: { cookie, "x-requested-with": "XMLHttpRequest" } });
  expect(slot.status).toBe(200);
  const slotHtml = await slot.text();
  expect(slotHtml).toContain("Actual rich modal content");
  expect(slotHtml).toContain("_main|titled");
  expect(hrana.requests.length - beforeSlotRequests).toBeLessThan(20);
  expect(slotHtml).not.toMatch(/<!doctype html>/i);
  expect(await snapshot()).toEqual(before);
  expect(hrana.violations).toEqual([]);
}, 60_000);

it("keeps typed create denials focal and actor-specific after a committed permission change", async () => {
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  const adminCookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  const byCode = async (code: string) => (await driver.query<{ id: number; name: string }>("SELECT id,name FROM cards WHERE codename=?", [code])).rows[0];
  const phrase = await byCode("phrase"), type = await byCode("type"), create = await byCode("create");
  const anyone = await byCode("anyone_signed_in"), bot = await byCode("decko_bot");
  const ruleName = `${phrase.name}+${type.name}+${create.name}`;
  const mark = encodeURIComponent(ruleName.replaceAll(" ", "_"));
  const rule = (await driver.query<{ id: number; db_content: string }>("SELECT r.id,r.db_content FROM cards r JOIN cards s ON s.id=r.left_id WHERE s.left_id=? AND s.right_id=? AND r.right_id=? AND r.trash=0", [phrase.id,type.id,create.id])).rows[0];
  const ruleType = (await driver.query<{ type_id: number }>("SELECT type_id FROM cards WHERE right_id=? AND trash=0 LIMIT 1", [create.id])).rows[0].type_id;
  expect((await post(rule ? `/update/${mark}` : "/card/create", { "card[content]": `[[${anyone.name}]]`, ...(rule ? {} : { "card[name]": ruleName, "card[type_id]": String(ruleType) }) }, adminCookie)).status).toBe(200);
  try {
    const member = await signin("mira.member@example.test", "Fixture member pass 1#");
    const cookie = member.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
    const allowed = await fetch(`${base}/new/Phrase`, { headers: { cookie } });
    expect(allowed.status).toBe(200);
    const fields = formFields(await allowed.text(), "/card/create");
    expect((await post(`/update/${mark}`, { "card[content]": `[[${bot.name}]]` }, adminCookie)).status).toBe(200);
    const before = await snapshot();
    const denied = await fetch(`${base}/new/Phrase`, { headers: { cookie } });
    expect(denied.status).toBe(403);
    expect(await denied.text()).toContain("Sorry!");
    const permitted = await fetch(`${base}/new/Phrase`, { headers: { cookie: adminCookie } });
    expect(permitted.status).toBe(200);
    fields["card[name]"] = "Refused Stale Form";
    expect((await post("/card/create", fields, cookie)).status).toBe(403);
    expect(await snapshot()).toEqual(before);
  } finally {
    expect((await post(`/update/${mark}`, { "card[content]": rule?.db_content ?? `[[${anyone.name}]]` }, adminCookie)).status).toBe(200);
  }
}, 60_000);

it("follows the stock remote GET link through a real save, requested follow slot and captured follower mail", async () => {
  services.accountMail = { transport: outbox, token: { secret: "owned-local-token-secret" }, origin: base, siteTitle: "My Deck" };
  outbox.drain();
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  const cookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  const page = await fetch(base + "/Topic_008/follow_section", { headers: { cookie, "x-requested-with": "XMLHttpRequest" } });
  expect(page.status).toBe(200);
  const board = await page.text();
  const href = [...board.matchAll(/<a\b[^>]*href=['"]([^'"]+)['"][^>]*>/g)].map(m => m[1].replaceAll("&amp;", "&")).find(h => h.startsWith("/update/Topic_008+") && h.includes("card%5Bcontent%5D"));
  expect(href).toBeDefined();
  const followed = await fetch(base + href, { headers: { cookie, referer: base + "/Topic_008?view=board", "x-requested-with": "XMLHttpRequest" } });
  const slot = await followed.text();
  expect(followed.status, slot).toBe(200);
  expect(slot).toContain("follow_section-view");
  expect(slot).toContain("unfollow"); expect(slot).not.toContain("<html");
  const rule = (await driver.query<{ id: number; db_content: string }>("SELECT r.id,r.db_content FROM cards r JOIN cards u ON u.id=r.left_id JOIN cards s ON s.id=u.left_id WHERE r.right_id=(SELECT id FROM cards WHERE codename='follow') AND u.right_id=611 AND s.left_id=681 AND s.right_id=(SELECT id FROM cards WHERE codename='self') AND r.trash=0", [])).rows[0];
  // Captured Ruby33 stores the pointer's canonical content as *always.
  expect(rule.db_content).toBe("*always");
  expect((await driver.query<{ actor_id: number }>("SELECT a.actor_id FROM card_acts a JOIN card_actions x ON x.card_act_id=a.id WHERE x.card_id=? ORDER BY x.id DESC LIMIT 1", [rule.id])).rows[0].actor_id).toBe(611);
  expect(outbox.drain().some(m => m.to === "mira.member@example.test" && m.subject.includes('Ada Admin created "Topic 008+*self+Ada Admin+*follow"'))).toBe(true);
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
