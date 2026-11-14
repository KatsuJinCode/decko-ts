#!/usr/bin/env node
// verify-demo-scratch.mjs — prove the demo scratch copy is alive.
//
//   node scripts/demo-scratch-copy/verify-demo-scratch.mjs
//     [--base-url http://127.0.0.1:3117] [--credentials <file>] [--out <receipt.json>]
//
// The checks, in order, each one recorded in the receipt with its own raw
// evidence (status code, byte count, the line that carries the proof):
//
//   1. status     GET /_status answers the engine's health JSON
//   2. home       GET / renders the deck's home page through the layout
//   3. sign-in    POST /_signin with the demo owner answers a session cookie
//   4. create     POST / creates a throwaway card (the write path)
//   5. read       GET /<card>.json returns the card record with its content
//   6. update     PUT /<card> changes the card's content (the write path)
//   7. re-read    GET /<card>.json returns the CHANGED content
//   8. board      GET /<owner>/board renders the board view
//   9. delete     DELETE /<card> removes the throwaway card again
//
// The throwaway card is created, checked and deleted inside this run, so a
// verification leaves the demo deck as it found it.
//
// Exit code 0 when every check passed, 1 when any check failed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3117";
const DEFAULT_CREDENTIALS = join(repoRoot, ".runtime", "demo-scratch", "credentials.json");

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, credentials: DEFAULT_CREDENTIALS, out: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--out": args.out = resolve(value); i += 1; break;
      case "--help":
        console.log(
          "verify-demo-scratch — check the demo scratch copy end to end\n" +
          "  --base-url <url>       the running demo (default http://127.0.0.1:3117)\n" +
          "  --credentials <file>   credentials file (default .runtime/demo-scratch/credentials.json)\n" +
          "  --out <file>           receipt path (default .runtime/demo-scratch/verification-<time>.json)",
        );
        process.exit(0);
        break;
      default:
        console.error(`verify-demo-scratch: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!existsSync(args.credentials)) {
  console.error(
    `verify-demo-scratch: no credentials file at ${args.credentials}\n` +
    "  Build the deck with: node scripts/demo-scratch-copy/build-demo-deck.mjs",
  );
  process.exit(2);
}
const credentials = JSON.parse(readFileSync(args.credentials, "utf8"));

const checks = [];
const record = (name, ok, detail, evidence) => {
  checks.push({ name, ok, detail, evidence });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
};

const throwawayName = `Demo Scratch Check ${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const throwawayContent = `demo scratch throwaway card ${throwawayName}`;
const updatedContent = `${throwawayContent} (updated)`;

let cookie = "";

async function request(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("Origin", args.baseUrl);
  if (cookie !== "") headers.set("Cookie", cookie);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${args.baseUrl}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie !== null) cookie = setCookie.split(";")[0];
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text, bytes: Buffer.byteLength(text) };
}

// 1. status
try {
  const res = await request("/_status");
  let parsed = null;
  try { parsed = JSON.parse(res.body); } catch { parsed = null; }
  const ok = res.status === 200 && parsed !== null;
  record("status", ok, `GET /_status -> ${res.status}, ${res.bytes} bytes`, { status: res.status, body: res.body.slice(0, 400) });
} catch (error) {
  record("status", false, `GET /_status failed: ${error instanceof Error ? error.message : String(error)}`, null);
}

// 2. home page
try {
  const res = await request("/");
  const hasLayout = res.body.includes("</html>");
  const hasHeader = res.body.includes("<header");
  const ok = res.status === 200 && hasLayout && hasHeader;
  const title = /<title>([^<]*)<\/title>/.exec(res.body)?.[1] ?? null;
  record("home", ok, `GET / -> ${res.status}, ${res.bytes} bytes, title ${JSON.stringify(title)}`, {
    status: res.status,
    bytes: res.bytes,
    title,
    hasLayout,
    hasHeader,
  });
} catch (error) {
  record("home", false, `GET / failed: ${error instanceof Error ? error.message : String(error)}`, null);
}

// 3. sign-in
try {
  const res = await request("/_signin", {
    method: "POST",
    body: JSON.stringify({ identifier: credentials.admin.email, password: credentials.admin.password }),
  });
  const ok = res.status === 200 && cookie !== "";
  record("sign-in", ok, `POST /_signin -> ${res.status}, session cookie ${cookie !== "" ? "issued" : "missing"}`, {
    status: res.status,
    body: res.body.slice(0, 300),
  });
} catch (error) {
  record("sign-in", false, `POST /_signin failed: ${error instanceof Error ? error.message : String(error)}`, null);
}

// 4. create
try {
  const res = await request("/", {
    method: "POST",
    body: JSON.stringify({ card: { name: throwawayName, content: throwawayContent } }),
  });
  const ok = res.status === 303 || res.status === 302 || res.status === 200;
  record("create", ok, `POST / (card create) -> ${res.status}, location ${JSON.stringify(res.headers.get("location"))}`, {
    status: res.status,
    location: res.headers.get("location"),
    body: res.body.slice(0, 300),
  });
} catch (error) {
  record("create", false, `card create failed: ${error instanceof Error ? error.message : String(error)}`, null);
}

// 5. read
let readBody = null;
try {
  const res = await request(`/${encodeURIComponent(throwawayName)}.json`);
  readBody = res.body;
  const ok = res.status === 200 && res.body.includes(throwawayContent);
  record("read", ok, `GET /<card>.json -> ${res.status}, ${res.bytes} bytes, content present ${res.body.includes(throwawayContent)}`, {
    status: res.status,
    bytes: res.bytes,
    body: res.body.slice(0, 400),
  });
} catch (error) {
  record("read", false, `card read failed: ${error instanceof Error ? error.message : String(error)}`, null);
}

// 6. update
try {
  const res = await request(`/${encodeURIComponent(throwawayName)}`, {
    method: "PUT",
    body: JSON.stringify({ card: { name: throwawayName, content: updatedContent } }),
  });
  const ok = res.status === 303 || res.status === 302 || res.status === 200;
  record("update", ok, `PUT /<card> -> ${res.status}, location ${JSON.stringify(res.headers.get("location"))}`, {
    status: res.status,
    location: res.headers.get("location"),
    body: res.body.slice(0, 300),
  });
} catch (error) {
  record("update", false, `card update failed: ${error instanceof Error ? error.message : String(error)}`, null);
}

// 7. re-read
try {
  const res = await request(`/${encodeURIComponent(throwawayName)}.json`);
  const ok = res.status === 200 && res.body.includes(updatedContent);
  record("re-read", ok, `GET /<card>.json -> ${res.status}, updated content present ${res.body.includes(updatedContent)}`, {
    status: res.status,
    bytes: res.bytes,
    body: res.body.slice(0, 400),
  });
} catch (error) {
  record("re-read", false, `card re-read failed: ${error instanceof Error ? error.message : String(error)}`, null);
}

// 8. the board surface
try {
  const res = await request(`/${encodeURIComponent(credentials.admin.name)}/board`);
  const hasBoard = res.body.includes("cardboard") || res.body.includes("/board");
  const ok = res.status === 200 && hasBoard;
  const title = /<title>([^<]*)<\/title>/.exec(res.body)?.[1] ?? null;
  record("board", ok, `GET /<owner>/board -> ${res.status}, ${res.bytes} bytes, title ${JSON.stringify(title)}`, {
    status: res.status,
    bytes: res.bytes,
    title,
    hasBoard,
  });
} catch (error) {
  record("board", false, `board render failed: ${error instanceof Error ? error.message : String(error)}`, null);
}

// 9. delete the throwaway card again
try {
  const res = await request(`/${encodeURIComponent(throwawayName)}`, { method: "DELETE" });
  const after = await request(`/${encodeURIComponent(throwawayName)}.json`);
  const ok = (res.status === 303 || res.status === 302 || res.status === 200 || res.status === 204) && after.status === 404;
  record("delete", ok, `DELETE /<card> -> ${res.status}, then GET /<card>.json -> ${after.status}`, {
    deleteStatus: res.status,
    readAfterStatus: after.status,
  });
} catch (error) {
  record("delete", false, `card delete failed: ${error instanceof Error ? error.message : String(error)}`, null);
}

const failed = checks.filter((c) => !c.ok);
const receipt = {
  baseUrl: args.baseUrl,
  checkedAt: new Date().toISOString(),
  throwawayCard: throwawayName,
  passed: checks.length - failed.length,
  total: checks.length,
  checks,
};
const outPath = args.out ?? join(repoRoot, ".runtime", "demo-scratch", `verification-${Date.now()}.json`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(receipt, null, 2) + "\n");

console.log("");
console.log(`${receipt.passed}/${receipt.total} checks passed`);
console.log(`receipt: ${outPath}`);
process.exit(failed.length === 0 ? 0 : 1);
