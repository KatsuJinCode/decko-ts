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

it("refuses missing mail without writes; delivers real verification tokens through the handler and authenticates a fresh session", async () => {
  const admin = await signin("ada.admin@example.test", "Fixture admin pass 2#");
  expect(admin.status).toBe(303);
  const cookie = admin.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
  expect(cookie).toMatch(/decko_ts_session=[^;]+/);
  const signupId = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename='signup'", [])).rows[0].id;
  const form = { "card[name]": "Edge Mail Signup", "card[type_id]": String(signupId), "card[subcards][+*account][subcards][+*email][content]": "edge.signup@example.test", "card[subcards][+*account][subcards][+*password][content]": "Edge signup pass 7#" };
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
