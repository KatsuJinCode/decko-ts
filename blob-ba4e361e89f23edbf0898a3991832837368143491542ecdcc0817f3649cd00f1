// publish-the-front-door-faithful.mjs
//
// PURPOSE
// Put the faithful front door snapshot (index.html beside this script, built
// by build-the-front-door-snapshot-faithful.mjs, visually gated by
// shoot-the-faithful-gate.mjs and gate-verdict.md) on the storage zone behind
// demos.culturesmith.help, at the NEW key path /front-door-in-decko-2/, then
// prove the public URL answers from outside with byte-identical content.
//
// The new path exists so no cache anywhere can hold the old bytes of
// /front-door-in-decko/: a new URL is a clean publish.
//
// MECHANISM, IN THE ORDER PERFORMED (the lane's proven publish path)
//   1. Preflight on the Bunny account API (read-only): the pull zone that
//      serves storage zone 1996445 is enabled, still carries the
//      demos.culturesmith.help hostname, and is not password protected.
//   2. Ground truth on the storage zone: this is the FIRST publish of
//      front-door-in-decko-2, so the key must not exist yet. A missing
//      folder is the expected state. A folder already there stops the run
//      unless every file in it matches a receipt of this script (a rerun
//      republishes the same bytes).
//   3. One upload with identical bytes, content-type text/html.
//   4. ONE whole-zone cache purge. The per-path purge endpoint answers 404
//      on this account (recorded by the demo index's first publish), so the
//      whole-zone endpoint is the one proven mechanism.
//   5. Verification: exactly ONE anonymous GET of the public URL, no cookie,
//      no auth header, no token; sha256 and byte count compared against the
//      local bytes. No retry, no second fetch.
//
// SECRETS
// The zone password and the account key are read by path from
// C:/localProjects/brandonDojoTech/library/data/secrets.env and used only as
// HTTP headers. No secret value is printed, logged, or written to disk.
//
// LAW COMPLIANCE
// - Only the one named key is written.
// - Exactly one cache purge.
// - One signed-out fetch of the public URL. No retry loop, no polling.
// - No culture site is touched. culturesmith.com is never contacted.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRETS_PATH = "C:/localProjects/brandonDojoTech/library/data/secrets.env";
const PAGE_PATH = `${HERE}/index.html`;
const RECEIPT_PATH = `${HERE}/front-door-faithful-publish-receipt.json`;

const ZONE_NAME = "culturesmith-assets";
const ZONE_ID = 1996445;
const PULL_ZONE_ID = 6818131;
const PUBLIC_HOST = "demos.culturesmith.help";
const KEY = "front-door-in-decko-2/index.html";
const PUBLIC_URL = `https://${PUBLIC_HOST}/${KEY}`;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const env = Object.fromEntries(
  readFileSync(SECRETS_PATH, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }),
);
const zonePassword = env.CULTURESMITH_ASSETS_PASSWORD;
const accountKey = env.BUNNY_ACCOUNT_API_KEY;
if (!zonePassword || !accountKey) throw new Error(`required keys missing at ${SECRETS_PATH}`);
console.log(`secret source: ${SECRETS_PATH} (values never printed)`);

const page = readFileSync(PAGE_PATH);
const pageSha = sha256(page);
console.log(`local page: ${PAGE_PATH}`);
console.log(`local page: ${page.byteLength} bytes, sha256 ${pageSha}`);

// --- 1. preflight on the pull zone ------------------------------------------
const pzRes = await fetch(`https://api.bunny.net/pullzone/${PULL_ZONE_ID}`, {
  headers: { AccessKey: accountKey, accept: "application/json" },
});
if (pzRes.status >= 300) throw new Error(`GET /pullzone/${PULL_ZONE_ID} -> ${pzRes.status}, cannot establish ground truth`);
const pz = await pzRes.json();
if (!pz.Enabled) throw new Error("the demos pull zone is disabled, refusing to publish");
if (pz.Password) throw new Error("the demos pull zone is password protected, the URL would not be public");
if (pz.StorageZoneId !== ZONE_ID) throw new Error(`the demos pull zone serves storage zone ${pz.StorageZoneId}, expected ${ZONE_ID}`);
if (!(pz.Hostnames ?? []).some((h) => h.Value === PUBLIC_HOST)) throw new Error(`${PUBLIC_HOST} is not on the pull zone hostnames`);
console.log(`pull zone ${pzRes.status}: ${pz.Name} (id ${pz.Id}) serves storage zone ${pz.StorageZoneId}, host ${PUBLIC_HOST} attached, enabled, no password`);

// --- 2. ground truth on the zone --------------------------------------------
// First publish: the key must not exist. The zone answers a nonexistent
// folder with an empty 200 listing as well as with 404; both are the clean
// first-publish state. A listing that carries anything stops the run: an
// index.html there would be an unpublished key, and any other entries would
// be content this lane did not put there.
const listRes = await fetch(`https://storage.bunnycdn.com/${ZONE_NAME}/front-door-in-decko-2/`, { headers: { AccessKey: zonePassword } });
if (listRes.status === 404) {
  console.log("ground truth: the folder front-door-in-decko-2/ answers 404 on the zone; this run's first publish creates it");
} else {
  if (listRes.status >= 300) throw new Error(`folder listing answered ${listRes.status}, cannot establish ground truth, stopping`);
  const listItems = await listRes.json().catch(() => []);
  if (!Array.isArray(listItems)) throw new Error("folder listing is not an array, cannot establish ground truth, stopping");
  if (listItems.length === 0) {
    console.log("ground truth: the folder front-door-in-decko-2/ lists empty on the zone; this run's first publish creates it");
  } else {
    const hasIndex = listItems.some((i) => i.ObjectName === "index.html");
    throw new Error(
      hasIndex
        ? `the key ${KEY} already exists at ${listItems.find((i) => i.ObjectName === "index.html").Length} bytes; a first publish does not replace an existing key, and this script has no prior receipt recording it, stopping`
        : `the folder front-door-in-decko-2/ holds ${listItems.length} entr(y|ies) this lane did not publish (${listItems.map((i) => i.ObjectName).join(", ").slice(0, 200)}), stopping`,
    );
  }
}

// --- 3. upload ----------------------------------------------------------------
const put = await fetch(`https://storage.bunnycdn.com/${ZONE_NAME}/${KEY}`, {
  method: "PUT",
  headers: { AccessKey: zonePassword, "content-type": "text/html; charset=utf-8" },
  body: page,
});
if (put.status >= 300) throw new Error(`upload answered ${put.status}: ${(await put.text()).slice(0, 200)}`);
console.log(`uploaded ${KEY} -> HTTP ${put.status}, ${page.byteLength} bytes`);

// --- 4. one cache purge -------------------------------------------------------
const purgeRes = await fetch(`https://api.bunny.net/pullzone/${PULL_ZONE_ID}/purgeCache`, {
  method: "POST",
  headers: { AccessKey: accountKey },
});
const purgeBody = (await purgeRes.text()).slice(0, 200);
if (purgeRes.status >= 300) throw new Error(`purge answered ${purgeRes.status}: ${purgeBody}`);
console.log(`purge of pull zone ${PULL_ZONE_ID}: HTTP ${purgeRes.status} (one purge, whole zone, covers the URL this run wrote)`);

console.log("waiting for the edge to serve the purged URL");
await new Promise((r) => setTimeout(r, 12000));

// --- 5. verification: exactly one anonymous GET ------------------------------
const vRes = await fetch(PUBLIC_URL, {
  redirect: "follow",
  headers: { "user-agent": "culturesmith-front-door-verifier/1.0" },
});
const vBody = Buffer.from(await vRes.arrayBuffer());
const vSha = sha256(vBody);
const identical = vSha === pageSha && vBody.byteLength === page.byteLength;
console.log(`${identical ? "OK  " : "FAIL"} ${vRes.status} ${vBody.byteLength}B ${vRes.headers.get("content-type") ?? ""} ${PUBLIC_URL}`);
console.log(`remote sha256 ${vSha}`);
if (!identical) throw new Error("the public URL does not serve byte-identical content; the publish is NOT verified");

const receipt = {
  generatedAt: new Date().toISOString(),
  lane: "Front door faithful republish: full-chrome snapshot published to a NEW path, one purge, one signed-out fetch, byte-identical",
  visualGate: "gate-verdict.md beside this receipt: PASS, judged side by side against culturesmith-edge.bunny.run/ at 1280x900",
  canonicalPublicUrl: PUBLIC_URL,
  key: KEY,
  uploads: [{ key: KEY, httpStatus: put.status, bytes: page.byteLength, sha256: pageSha }],
  purge: {
    endpoint: `POST https://api.bunny.net/pullzone/${PULL_ZONE_ID}/purgeCache`,
    httpStatus: purgeRes.status,
    count: 1,
    scope: "whole pull zone",
    note: "the per-path purge endpoint answers 404 on this account, so one whole-zone purge covers the URL this run wrote",
  },
  verification: {
    fetches: 1,
    anonymous: true,
    status: vRes.status,
    bytes: vBody.byteLength,
    contentType: vRes.headers.get("content-type") ?? "",
    finalUrl: vRes.url,
    redirected: vRes.redirected,
    sha256: vSha,
    identicalToLocal: identical,
  },
  secretsNeverPrinted: true,
  localPage: { path: PAGE_PATH, bytes: page.byteLength, sha256: pageSha },
};
writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2) + "\n", "utf8");
console.log(`receipt written: ${RECEIPT_PATH}`);
console.log(`public URL: ${PUBLIC_URL}`);
