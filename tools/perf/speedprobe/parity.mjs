// parity.mjs — byte-identity check between two engine bundles: boots each
// bundle on its own copy of the same local deck and fetches the same pages
// (anonymous, then signed in as the local admin), normalizing only the
// per-stack origin. Reports the sha256 of every body and any difference.
//
// Usage: node tools/perf/speedprobe/parity.mjs <baseBundle> <afterBundle> <deck.sqlite3>
import { readFileSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { Agent } from "node:https";
import { startStack } from "../../edge-signed-in-exercise/lib/stack.mjs";

const REPO = resolve(import.meta.dirname, "../../..");
const [baseBundle, afterBundle, deckSrc] = process.argv.slice(2).map((p) => resolve(p));
const creds = JSON.parse(readFileSync(join(REPO, "tmp/speedprobe/creds.json"), "utf8"));
const admin = creds.admin ?? Object.values(creds)[0];
const PAGES = ["/", "/Home", "/Latest_News/board", "/Brandon_WilliamsCraig", "/Brandon_WilliamsCraig/edit", "/*signin", "/Latest_News", "/*all+*style"];
const agent = new Agent({ rejectUnauthorized: false, keepAlive: false });

function fetchPage(origin, pathname, cookie) {
  const url = new URL(origin + pathname);
  return new Promise((res, rej) => {
    const req = httpsRequest(url, { method: "GET", agent, headers: cookie ? { cookie } : {} }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => res({ status: r.statusCode, body: Buffer.concat(chunks).toString("utf8"), headers: r.headers }));
    });
    req.on("error", rej);
    req.end();
  });
}
function signIn(origin) {
  const body = new URLSearchParams({
    "card[subcards][+*email][content]": admin.email,
    "card[subcards][+*password][content]": admin.password,
  }).toString();
  const url = new URL(origin + "/update/*signin");
  return new Promise((res, rej) => {
    const req = httpsRequest(url, { method: "POST", agent, headers: { "content-type": "application/x-www-form-urlencoded", origin, "content-length": Buffer.byteLength(body) } }, (r) => {
      const cookies = (r.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
      r.resume(); r.on("end", () => res(cookies));
    });
    req.on("error", rej);
    req.end(body);
  });
}
const norm = (text, origin) => text.split(origin).join("ORIGIN")
  .replace(/data-slot-id="[0-9a-f]+"/g, 'data-slot-id="SLOT"')
  .replace(/data-slot-id='[0-9a-f]+'/g, "data-slot-id='SLOT'")
  .replace(/\b[0-9a-f]{20}\b/g, "HEX20")
  .replace(/\b[0-9a-f]{32,}\b/g, "HEX").replace(/\b\d{10,}\b/g, "TS");

async function run(label, bundle, deckCopy) {
  const runtime = join(REPO, "tmp", `parity-${label}-${process.pid}`);
  rmSync(runtime, { recursive: true, force: true });
  mkdirSync(runtime, { recursive: true });
  copyFileSync(deckSrc, deckCopy);
  const stack = await startStack({ deckPath: deckCopy, live: {}, runtimeDir: runtime, bundlePath: bundle });
  const out = {};
  try {
    for (const p of PAGES) {
      const r = await fetchPage(stack.origin, p, "");
      out[`anon ${p}`] = { status: r.status, body: norm(r.body, stack.origin) };
    }
    const cookie = await signIn(stack.origin);
    for (const p of PAGES) {
      const r = await fetchPage(stack.origin, p, cookie);
      out[`signed ${p}`] = { status: r.status, body: norm(r.body, stack.origin) };
    }
  } finally {
    await stack.close();
    stack.cleanup();
  }
  return out;
}

const base = await run("base", baseBundle, join(REPO, "tmp/speedprobe/parity-deck-base.sqlite3"));
const after = await run("after", afterBundle, join(REPO, "tmp/speedprobe/parity-deck-after.sqlite3"));
let same = 0, diff = 0;
for (const key of Object.keys(base)) {
  const b = base[key], a = after[key];
  const hb = createHash("sha256").update(b.body).digest("hex").slice(0, 16);
  const ha = createHash("sha256").update(a.body).digest("hex").slice(0, 16);
  const ok = b.status === a.status && b.body === a.body;
  if (ok) same += 1; else diff += 1;
  console.log(`${ok ? "SAME" : "DIFF"} ${String(b.status).padStart(3)}/${String(a.status).padStart(3)} ${b.body.length.toString().padStart(8)} ${hb} ${ha}  ${key}`);
  if (!ok) {
    let i = 0; while (i < b.body.length && b.body[i] === a.body[i]) i += 1;
    console.log(`     first difference at ${i}: base="${b.body.slice(Math.max(0, i - 60), i + 80).replace(/\s+/g, " ")}" after="${a.body.slice(Math.max(0, i - 60), i + 80).replace(/\s+/g, " ")}"`);
  }
}
console.log(`\nidentical: ${same}  different: ${diff}`);
process.exitCode = diff === 0 ? 0 : 1;
