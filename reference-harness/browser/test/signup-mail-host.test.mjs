// Actual Node HTTP host: the generic write route must use the same account
// mail transport/token configuration as its dedicated reset endpoints.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEngine, startEngine } from "../lib/engines.mjs";

test("real host sends signup and approval verification mail and its token activates login", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const fixture = path.join(root, "reference-harness/fixtures/synthetic-v1");
  const actor = JSON.parse(readFileSync(path.join(fixture, "deck.json"))).actors.admin;
  const db = new DatabaseSync(path.join(fixture, "deck/deck.sqlite3"), { readOnly: true });
  const signupId = db.prepare("SELECT id FROM cards WHERE codename = 'signup'").get().id;
  db.close();
  const server = await startEngine(loadEngine(path.join(root, "reference-harness/browser/engines/ts.json")), fixture);
  try {
    const post = (url, body, cookie) => fetch(server.base + url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: server.base, ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(body) });
    const sign = await post("/update/*signin", { "card[subcards][+*email][content]": actor.email, "card[subcards][+*password][content]": actor.password });
    const cookie = sign.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
    assert.ok(cookie, "real admin signin must mint a cookie");
    const email = "http.signup@example.test", password = "HTTP signup pass 7#";
    await server.mail();
    const create = await post("/card/create", { "card[name]": "HTTP Mail Signup", "card[type_id]": String(signupId), "card[subcards][+*account][subcards][+*email][content]": email, "card[subcards][+*account][subcards][+*password][content]": password }, cookie);
    assert.ok([200, 303].includes(create.status), `signup HTTP ${create.status}`);
    const sent = (await server.mail()).filter(m => m.to.includes(email) && /verification link/.test(m.subject));
    assert.equal(sent.length, 1, "signup creation must deliver its verification mail");
    const approve = await fetch(server.base + "/update/HTTP_Mail_Signup?card%5Btrigger%5D=approve_with_verification", { headers: { cookie, referer: server.base + "/HTTP_Mail_Signup" }, redirect: "manual" });
    assert.ok([200, 303].includes(approve.status));
    const resent = (await server.mail()).filter(m => m.to.includes(email) && /verification link/.test(m.subject));
    assert.equal(resent.length, 1, "approval must deliver its verification mail");
    const link = resent[0].text.match(/https?:\/\/[^\s<>]+/)[0];
    const activated = await fetch(link, { redirect: "manual" });
    assert.equal(activated.status, 303);
    assert.ok(activated.headers.get("set-cookie"));
    const login = await post("/update/*signin", { "card[subcards][+*email][content]": email, "card[subcards][+*password][content]": password });
    assert.ok(login.headers.get("set-cookie"), "verified account must authenticate with its password");
  } finally { await server.stop(); }
});
