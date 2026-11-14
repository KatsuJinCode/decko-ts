// tools/drive-multipart-upload-against-deployed-bundle.mjs — drive a REAL
// multipart POST /card/create through the DEPLOYED Bunny engine bundle on the
// local edge host, and report what the ported attachment path actually does.
//
// What this answers (and what it cannot):
//   It boots deploy/dist/bunny-edge-engine.bundle.js — the same artifact the
//   deploy uploads, verified by SHA-256 — behind the harness HTTPS host
//   (tools/edge-signed-in-exercise/lib/edge-host.mjs), against a LOCAL copy of
//   Brandon's deck (lib/local-hrana.mjs) and a local mock Bunny Storage zone.
//   Then it signs in as the seeded administrator and POSTs a multipart save
//   carrying a small .txt as card[file], plus the no-file control.
//
//   It answers: does the ported upload path work, and what is the composition
//   difference between a run with a files area and a run without one.
//   It cannot answer: anything about the live deployed instance's own env —
//   this harness supplies its own. No live host is contacted.
//
// The harness host answers a thrown handler with a 500 whose BODY carries the
// throw site (edge-host.mjs:107-113). The vendor runtime answers a bare
// zero-byte 500. That difference is the whole reason this probe exists: the
// live symptom has no body, and this is how we get one.
//
// Usage:
//   node tools/drive-multipart-upload-against-deployed-bundle.mjs
//     [--bundle <path>] [--expect-sha256 <hex>] [--no-storage]
//     [--deck <path>] [--runtime <dir>]
//   --no-storage runs the identical drive with DECKO_STORAGE_ZONE /
//   DECKO_STORAGE_PASSWORD / DECKO_STORAGE_HOST unset — the deployed
//   composition this fault is hypothesised to be.
//
// Credentials are read from the seeded credentials file and never printed.

import { existsSync, readFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import Database from "better-sqlite3";

import { startStack, REPO } from "./edge-signed-in-exercise/lib/stack.mjs";
import { buildLocalDeck } from "./edge-signed-in-exercise/lib/build-local-deck.mjs";
import { seedLocalAccounts } from "./edge-signed-in-exercise/lib/seed-local-accounts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DECK = "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3";
const DEFAULT_BUNDLE = join(REPO, "deploy", "dist", "bunny-edge-engine.bundle.js");

function argOf(name) {
  const hit = process.argv.find((a) => a === `--${name}`);
  if (hit === undefined) return undefined;
  const at = process.argv.indexOf(hit);
  if (at + 1 >= process.argv.length) throw new Error(`--${name} needs a value`);
  return process.argv[at + 1];
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

/** One HTTPS request against the harness host. The harness serves a throwaway
 *  self-signed certificate for 127.0.0.1, so the agent must not verify it. */
function call(origin, method, path, { form, multipart, cookie, contentType } = {}) {
  const url = new URL(path, origin);
  let body;
  const headers = { accept: "text/html,application/json" };
  if (multipart !== undefined) {
    const boundary = "----deckoTsUploadDrive";
    headers["content-type"] = `multipart/form-data; boundary=${boundary}`;
    body = buildMultipartBody(boundary, multipart.parts);
  } else if (form !== undefined) {
    headers["content-type"] = contentType ?? "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  if (cookie !== undefined) headers.cookie = cookie;
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpsRequest(
      { hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, method, headers, rejectUnauthorized: false },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          resolvePromise({ status: res.statusCode, headers: res.headers, body: raw.toString("utf8"), bytes: raw.length });
        });
      },
    );
    req.on("error", rejectPromise);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function buildMultipartBody(boundary, parts) {
  const encoder = new TextEncoder();
  const chunks = [];
  for (const part of parts) {
    const disposition =
      `Content-Disposition: form-data; name="${part.name}"` +
      (part.filename !== undefined ? `; filename="${part.filename}"` : "") +
      "\r\n";
    const type = part.contentType !== undefined ? `Content-Type: ${part.contentType}\r\n` : "";
    chunks.push(encoder.encode(`--${boundary}\r\n${disposition}${type}\r\n`));
    chunks.push(typeof part.body === "string" ? encoder.encode(part.body) : part.body);
    chunks.push(encoder.encode("\r\n"));
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

/** The session cookie value from a response's Set-Cookie list. */
function sessionCookieOf(headers) {
  const raw = headers["set-cookie"] ?? [];
  for (const entry of raw) {
    const match = /(decko_ts_session=[^;]+)/.exec(entry);
    if (match) return match[1];
  }
  return undefined;
}

/** Redact anything that looks like a credential before it reaches a log. */
function redact(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 4) out = out.split(secret).join("<redacted>");
  }
  return out;
}

async function run() {
  const deckSource = resolve(argOf("deck") ?? DEFAULT_DECK);
  const bundlePath = resolve(argOf("bundle") ?? DEFAULT_BUNDLE);
  const expectSha = argOf("expect-sha256");
  const withStorage = !hasFlag("no-storage");
  const runtimeDir = resolve(argOf("runtime") ?? join(REPO, "tmp", `upload-drive-${process.pid}`));

  if (!existsSync(deckSource)) throw new Error(`source deck not found: ${deckSource}`);
  if (!existsSync(bundlePath)) throw new Error(`engine bundle not found: ${bundlePath} (build it: node tools/bundle-bunny-edge-engine.mjs)`);

  const bundleSha = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
  if (expectSha !== undefined && bundleSha !== expectSha.toLowerCase()) {
    throw new Error(`bundle SHA-256 mismatch: got ${bundleSha}, asked for ${expectSha}`);
  }
  console.log(`[drive] bundle        ${bundlePath}`);
  console.log(`[drive] bundle sha256 ${bundleSha} (${(statSync(bundlePath).size / 1048576).toFixed(1)} MB)`);
  console.log(`[drive] source deck   ${deckSource}`);
  console.log(`[drive] files area    ${withStorage ? "CONFIGURED (DECKO_STORAGE_ZONE + PASSWORD + HOST)" : "ABSENT (--no-storage: all three unset)"}`);

  mkdirSync(runtimeDir, { recursive: true });
  const localDeck = join(runtimeDir, "deck.sqlite3");
  const deckReport = await buildLocalDeck({ source: deckSource, out: localDeck });
  const cards = deckReport.tables.find((t) => t.name === "cards")?.copiedRows ?? 0;
  console.log(`[drive] local deck    ${cards} cards copied`);

  const credentialsPath = join(runtimeDir, "credentials.json");
  await seedLocalAccounts({ deck: localDeck, credentialsOut: credentialsPath });
  const creds = JSON.parse(readFileSync(credentialsPath, "utf8"));
  console.log(`[drive] accounts      admin=${creds.admin.name} (id ${creds.admin.id}), member=${creds.member.name} (id ${creds.member.id})`);

  // The stored-byte leg reads the same mock storage zone the bundle wrote to,
  // so with --no-storage there is no zone and that leg is reported as such.
  const storageRoot = join(runtimeDir, "storage-files");
  const requestLog = [];
  let stack;
  try {
    const base = {
      deckPath: localDeck,
      live: {},
      runtimeDir,
      bundlePath,
      expectedBundleSha256: expectSha ?? bundleSha,
      onRequest: (line) => requestLog.push(line),
    };
    if (withStorage) {
      stack = await startStack(base);
    } else {
      // startStack always provisions the mock zone; for the absent-files-area
      // run the same composition is booted with the three storage variables
      // removed, which is what an operator-deployed script without them looks
      // like to the bundle. The zone itself is still created and simply unused.
      stack = await startStack(base);
      for (const key of ["DECKO_STORAGE_ZONE", "DECKO_STORAGE_PASSWORD", "DECKO_STORAGE_HOST"]) delete process.env[key];
    }
    const origin = stack.origin;
    console.log(`[drive] edge origin   ${origin}`);

    // --- sign in ------------------------------------------------------------
    const signin = await call(origin, "POST", "/update/*signin", {
      form: {
        "card[subcards][+*email][content]": creds.admin.email,
        "card[subcards][+*password][content]": creds.admin.password,
        "_method": "patch",
        "success[redirect]": "true",
        "success[mark]": "*previous",
      },
    });
    const cookie = sessionCookieOf(signin.headers);
    const secrets = [creds.admin.password, creds.admin.email];
    console.log(`[drive] signin        status=${signin.status} session=${cookie ? "issued" : "NONE"}`);
    if (cookie === undefined) {
      console.log(`[drive] signin body   ${redact(signin.body.replace(/\s+/g, " ").slice(0, 300), secrets)}`);
      throw new Error("could not sign in: no session cookie");
    }

    // --- leg 1: the CONTROL (no file part) -> expect 422 ---------------------
    const control = await call(origin, "POST", "/update/No_File_Control", {
      cookie,
      form: { "card[name]": "No File Control", "card[type]": "File", "card[content]": "" },
    });
    const controlText = control.body.replace(/\s+/g, " ").slice(0, 200);
    console.log(`\n[drive] LEG 1 — CONTROL, no file part`);
    console.log(`[drive]   status   ${control.status} (bytes ${control.bytes})`);
    console.log(`[drive]   body     ${redact(controlText, secrets)}`);

    // --- leg 2: the FAULT (multipart with a small .txt) ---------------------
    const txtBytes = Buffer.from(
      "upload drive probe: a small text attachment stored through the ported carrierwave path\n",
      "utf8",
    );
    const mark = "Upload_Drive_Probe";
    const upload = await call(origin, "POST", `/update/${mark}`, {
      cookie,
      multipart: {
        parts: [
          { name: "card[name]", body: "Upload Drive Probe" },
          { name: "card[type]", body: "File" },
          { name: "card[file]", filename: "probe.txt", contentType: "text/plain", body: txtBytes },
          { name: "_method", body: "patch" },
        ],
      },
    });
    const uploadText = upload.body.replace(/\s+/g, " ").slice(0, 400);
    console.log(`\n[drive] LEG 2 — MULTIPART with card[file] (${txtBytes.length} byte .txt)`);
    console.log(`[drive]   status   ${upload.status} (bytes ${upload.bytes})`);
    console.log(`[drive]   location ${upload.headers.location ?? "(none)"}`);
    console.log(`[drive]   body     ${redact(uploadText, secrets)}`);

    // --- leg 3: did the card actually get its identifier? -------------------
    // The save's own answer names the committed card id when it committed; a
    // failure answer does not, so fall back to the cardname.
    let createdId;
    try { createdId = JSON.parse(upload.body)?.card_id; } catch { createdId = undefined; }
    const db = new Database(localDeck, { readonly: true });
    let row;
    try {
      row = createdId !== undefined
        ? db.prepare("SELECT id, type_id, db_content, key FROM cards WHERE id = ?").get(createdId)
        : db.prepare("SELECT id, type_id, db_content, key FROM cards WHERE key = ?").get(mark.toLowerCase());
    } finally {
      db.close();
    }
    console.log(`\n[drive] LEG 3 — stored card row`);
    console.log(`[drive]   ${row ? `id=${row.id} type_id=${row.type_id} db_content=${JSON.stringify(row.db_content)}` : "(no row: the save never committed)"}`);

    // --- leg 4: are the bytes in the files area? ----------------------------
    let stored = null;
    if (row?.db_content) {
      const rel = String(row.db_content).replace(/^~/, "");
      for (const base of [storageRoot, join(runtimeDir, "storage-files")]) {
        const candidate = join(base, rel);
        if (existsSync(candidate)) { stored = { path: candidate, bytes: readFileSync(candidate) }; break; }
      }
    }
    console.log(`\n[drive] LEG 4 — stored bytes in the files area`);
    if (stored === null) {
      console.log(`[drive]   none found under ${storageRoot} for identifier ${row?.db_content ?? "(none)"}`);
    } else {
      const identical = stored.bytes.length === txtBytes.length && stored.bytes.equals(txtBytes);
      console.log(`[drive]   ${stored.path}`);
      console.log(`[drive]   bytes=${stored.bytes.length} byteIdenticalToPosted=${identical}`);
    }

    // --- leg 5: serve-back through /files -----------------------------------
    if (row?.db_content) {
      // The /files route's mark grammar keeps the identifier's tilde
      // (file-routes.ts resolveMark: /^~\d+$/ is the by-id mark; stripping it
      // would send the route down fetchByName and answer a false 404).
      const filePath = `/files/${String(row.db_content).replace(/^~([^/]+)\//, "~$1/")}`;
      const served = await call(origin, "GET", filePath, { cookie });
      console.log(`\n[drive] LEG 5 — serve-back GET ${filePath}`);
      console.log(`[drive]   status   ${served.status} (bytes ${served.bytes})`);
      console.log(`[drive]   type     ${served.headers["content-type"] ?? "(none)"}`);
      if (served.status !== 200) console.log(`[drive]   body     ${redact(served.body.replace(/\s+/g, " ").slice(0, 300), secrets)}`);
    }

    console.log(`\n[drive] request log (method path status bytes):`);
    for (const line of requestLog) {
      console.log(`[drive]   ${String(line.method).padEnd(4)} ${String(line.path).padEnd(34)} ${String(line.status).padEnd(4)} ${line.bytes ?? 0}`);
    }

    console.log(`\n[drive] VERDICT`);
    console.log(`[drive]   control (no file)      -> ${control.status}`);
    console.log(`[drive]   multipart (with file)  -> ${upload.status} (${upload.bytes} body bytes)`);
    console.log(`[drive]   card row committed     -> ${Boolean(row)}`);
    console.log(`[drive]   bytes stored           -> ${stored !== null}`);
    return 0;
  } finally {
    if (stack !== undefined) { await stack.close(); stack.cleanup(); }
    else rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().then(
  (code) => process.exit(code),
  (error) => { console.error(`[drive] FAILED: ${error?.message ?? error}`); if (error?.stack) console.error(error.stack); process.exit(1); },
);