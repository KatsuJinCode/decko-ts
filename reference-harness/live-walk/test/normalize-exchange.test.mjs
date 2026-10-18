// Tests for the walk instrument's normalization (lib/normalize-exchange.mjs):
// every W rule fires on its exact shape and never on a look-alike, the
// borrowed N* rules still work through the same path, applications are
// counted, and disabled rules leave raw values in the verdict.
import test from "node:test";
import assert from "node:assert/strict";
import {
  WALK_RULES, walkRulesEnabled, newApplied, normalizeExchange, normalizeUrl,
  redactForStorage, normalizeHtmlBodyWalk, bodyKindFor,
} from "../lib/normalize-exchange.mjs";

const rules = () => walkRulesEnabled([]);
const run = (exchange, opts = {}) => {
  const ledger = newApplied();
  const out = normalizeExchange(exchange, { rules: rules(), ledger, sessionCookieNames: opts.sessionCookieNames ?? [] });
  return { out, ledger };
};

const EX = (over = {}) => ({
  method: "GET", status: 200, url: "http://127.0.0.1:3000/",
  requestHeaders: {}, headersArray: [], setCookieRaw: [],
  bodyKind: "html", bodyText: "", contentSha256: null, ...over,
});

test("W1 masks session-named Set-Cookie values, keeps name and attributes", () => {
  const { out, ledger } = run(EX({
    setCookieRaw: ["decko_ts_session=abc123secret; Path=/; HttpOnly; SameSite=Lax", "_rails_session=xyz; Path=/", "prefs=dark; Path=/"],
  }));
  const sc = out.headers["set-cookie"];
  assert.equal(sc[0], "decko_ts_session=W1#session; Path=/; HttpOnly; SameSite=Lax");
  assert.equal(sc[1], "_rails_session=W1#session; Path=/");
  assert.equal(sc[2], "prefs=dark; Path=/"); // not session-named: compared raw
  assert.equal(ledger.counts.get("W1"), 2);
});

test("W1 --session-cookie-name extends the masked set; cookie NAMES always compare", () => {
  const ledger = newApplied();
  const out = normalizeExchange(EX({ setCookieRaw: ["walktoken=zzz"] }), {
    rules: rules(), ledger, sessionCookieNames: ["walktoken"],
  });
  assert.equal(out.headers["set-cookie"][0], "walktoken=W1#session");
  assert.equal(out.headers["set-cookie"][0].startsWith("walktoken="), true);
});

test("W5 canonicalizes Date/Last-Modified headers and Expires= inside Set-Cookie", () => {
  const { out, ledger } = run(EX({
    headersArray: [
      { name: "Date", value: "Tue, 15 Nov 1994 08:12:31 GMT" },
      { name: "Last-Modified", value: "Tue, 15 Nov 1994 08:12:31 GMT" },
      { name: "X-Weird", value: "Tue, 15 Nov 1994 08:12:31 GMT" }, // not a date field: stays
    ],
    setCookieRaw: ["a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Max-Age=3600"],
  }));
  assert.equal(out.headers["date"][0], "W5#http-date");
  assert.equal(out.headers["last-modified"][0], "W5#http-date");
  assert.equal(out.headers["x-weird"][0], "Tue, 15 Nov 1994 08:12:31 GMT");
  assert.match(out.headers["set-cookie"][0], /Expires=W5#http-date/);
  assert.match(out.headers["set-cookie"][0], /Max-Age=3600/); // a fixed max-age is content
  assert.equal(ledger.counts.get("W5"), 3);
});

test("W6 masks ETag values, keeps weak/strong shape and presence", () => {
  const { out } = run(EX({
    headersArray: [{ name: "ETag", value: "\"abc123\"" }, { name: "ETag", value: "W/\"def456\"" }],
  }));
  assert.deepEqual(out.headers["etag"], ['"W6#etag"', 'W/"W6#etag"']);
});

test("W2 masks csrf tokens in input values, meta content and X-CSRF-Token, in attribute position only", () => {
  const html = `<form><input name="authenticity_token" value="AbCdEf123456789012345" type="hidden"></form>`
    + `<meta name="csrf-token" content="ZyXwVu987654321012345">`
    + `<p>text mentions name="authenticity_token" value="short"</p>`
    + `<input name="other" value="AbCdEf123456789012345">`;
  const { out, ledger } = run(EX({ bodyText: html }));
  assert.match(out.bodyText, /value="W2#csrf"/);
  assert.match(out.bodyText, /content="W2#csrf"/);
  assert.match(out.bodyText, /name="other" value="AbCdEf123456789012345"/); // a value without the tag context stays
  assert.doesNotMatch(out.bodyText, /AbCdEf123456789012345" type="hidden"/);
  assert.equal(ledger.counts.get("W2"), 2); // the input's value + the meta's content (the X-CSRF case is its own test)
});

test("W2 masks X-CSRF-Token header values (>= 12 chars)", () => {
  const { out } = run(EX({ headersArray: [{ name: "X-CSRF-Token", value: "tok1234567890" }] }));
  assert.equal(out.headers["x-csrf-token"][0], "W2#csrf");
});

test("W3 masks nonce attributes (16+ chars) in attribute position", () => {
  const html = `<script nonce="a1b2c3d4e5f6g7h8">var x = 1;</script><p>nonce="too-short-ok"</p>`;
  const { out, ledger } = run(EX({ bodyText: html }));
  assert.match(out.bodyText, /<script nonce="W3#nonce">/);
  assert.match(out.bodyText, /var x = 1;/); // script bodies untouched
  assert.equal(ledger.counts.get("W3"), 1);
});

test("W4 masks ISO/Ruby datetimes in JSON bodies, never bare dates", () => {
  const json = `{"created_at":"2026-10-18T12:34:56.789Z","updated_at":"2026-10-18 12:34:56 +0000","shown":"2011-12-14","ruby":"Tue, 15 Nov 1994 08:12:31 UTC +00:00"}`;
  const { out, ledger } = run(EX({ bodyKind: "json", bodyText: json }));
  assert.match(out.bodyText, /"created_at":"W4#time"/);
  assert.match(out.bodyText, /"updated_at":"W4#time"/);
  assert.match(out.bodyText, /"shown":"2011-12-14"/); // a bare date is content
  assert.match(out.bodyText, /"ruby":"W4#time"/);
  assert.equal(ledger.counts.get("W4"), 3);
});

test("W4 in html touches only time-named attributes, never page text", () => {
  const html = `<time data-created-at="2026-10-18T12:00:00Z" datetime="2026-10-18T12:00:00Z">Saturday, October 17</time>`;
  const { out, ledger } = run(EX({ bodyText: html }));
  assert.match(out.bodyText, /data-created-at="W4#time"/);
  assert.match(out.bodyText, /datetime="W4#time"/);
  assert.match(out.bodyText, />Saturday, October 17</); // visible text untouched
  assert.equal(ledger.counts.get("W4"), 2);
});

test("W7 masks volatile query-token params in URLs; other params compare exactly", () => {
  const ledger = newApplied();
  const a = normalizeUrl("http://127.0.0.1:3000/update/x?token=AbCdEf12345678901234&card[name]=Y", { on: () => true, note: (id) => ledger.note(id) });
  const b = normalizeUrl("http://127.0.0.1:4000/update/x?card[name]=Y&token=Different0987654321", { on: () => true, note: (id) => ledger.note(id) });
  assert.equal(a, "/update/x?card%5Bname%5D=Y&token=W7%23url-token");
  assert.equal(a, b); // host and port canonicalized away; token values masked
  const short = normalizeUrl("http://h/t?token=short", { on: () => true, note: () => {} });
  assert.match(short, /token=short/); // a short token param value is compared raw
});

test("borrowed N* rules fire through the same path: slot ids and relative times", () => {
  const html = `<div data-slot-id="0123456789abcdef0123">x</div><span>less than a minute ago</span>`;
  const { out, ledger } = run(EX({ bodyText: html }));
  assert.match(out.bodyText, /data-slot-id="SLOT"/);
  assert.match(out.bodyText, /N5#elapsed/);
  assert.ok(ledger.counts.has("N*"));
});

test("disabled rules leave raw values: --disable W1,W6", () => {
  const disabledRules = walkRulesEnabled(["W1", "W6"]);
  const ledger = newApplied();
  const out = normalizeExchange(EX({
    setCookieRaw: ["decko_ts_session=abc123; Path=/"],
    headersArray: [{ name: "ETag", value: "\"zzz\"" }],
  }), { rules: disabledRules, ledger, sessionCookieNames: [] });
  assert.match(out.headers["set-cookie"][0], /decko_ts_session=abc123/);
  assert.equal(out.headers["etag"][0], '"zzz"');
  assert.equal(ledger.counts.get("W1"), undefined);
});

test("R1 redacts passwords and session cookies before storage, always", () => {
  const ex = redactForStorage(EX({
    requestHeaders: { cookie: "decko_ts_session=tok123; prefs=dark" },
    setCookieRaw: ["decko_ts_session=newtok456; Path=/"],
    postData: "card[name]=X&card[subcards][+*password][content]=hunter2&x=1",
  }));
  assert.equal(ex.requestHeaders.cookie, "decko_ts_session=R1#redacted; prefs=dark");
  assert.equal(ex.setCookieRaw[0], "decko_ts_session=R1#redacted; Path=/");
  assert.match(ex.postData, /password\]\[content\]=R1%23redacted/);
  assert.match(ex.postData, /card\[name\]=X/);
  assert.throws(() => walkRulesEnabled(["R1"]), /always on/);
});

test("W8 canonicalizes each side's own host address in headers and bodies", () => {
  const ledger = newApplied();
  const out = normalizeExchange(EX({
    requestHeaders: { host: "127.0.0.1:63783", origin: "http://127.0.0.1:63783", referer: "http://127.0.0.1:63783/sign-in" },
    headersArray: [{ name: "Location", value: "http://127.0.0.1:63783/landed" }],
    bodyText: "<a href=\"http://127.0.0.1:63783/x\">self link</a>",
  }), { rules: rules(), ledger, sessionCookieNames: [], ownOrigin: "http://127.0.0.1:63783" });
  assert.equal(out.requestHeaders.host, "W8#host-address");
  assert.equal(out.requestHeaders.origin, "W8#host-address"); // the full origin matches as one string
  assert.equal(out.requestHeaders.referer, "W8#host-address/sign-in");
  assert.equal(out.headers["location"][0], "W8#host-address/landed");
  assert.match(out.bodyText, /href="W8#host-address\/x"/);
  assert.equal(ledger.counts.get("W8") >= 5, true);
  // A DIFFERENT host's address in the body is content, never canonicalized.
  const other = normalizeExchange(EX({ bodyText: "<p>connect to http://10.1.2.3:9999</p>" }), { rules: rules(), ledger: newApplied(), sessionCookieNames: [], ownOrigin: "http://127.0.0.1:63783" });
  assert.match(other.bodyText, /http:\/\/10\.1\.2\.3:9999/);
});

test("binary bodies are hashed, never decoded; bodyKind mapping", () => {
  assert.equal(bodyKindFor("text/html; charset=utf-8"), "html");
  assert.equal(bodyKindFor("application/json"), "json");
  assert.equal(bodyKindFor("text/css"), "text");
  assert.equal(bodyKindFor("image/png"), "binary");
  const { out } = run(EX({ bodyKind: "binary", bodyText: null, contentSha256: "aa".repeat(32) }));
  assert.equal(out.contentSha256, "aa".repeat(32));
  assert.equal(out.bodyText, null);
});

test("the full rule table is stated with id, name, kind, scope, about — nothing unnamed", () => {
  for (const rule of WALK_RULES) {
    assert.ok(rule.id && rule.name && rule.kind && rule.scope && rule.about, `rule incomplete: ${rule.id}`);
  }
  assert.deepEqual(WALK_RULES.map((r) => r.id), ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "N*", "R1"]);
});
