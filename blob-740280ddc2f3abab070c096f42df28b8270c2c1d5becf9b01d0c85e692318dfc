// Deploys the built save-timing bundle as a Bunny Edge Script, seeds the
// scratch database from the edge, runs the seven saves from the edge, prints
// the timings, and deletes the script and its pull zone in a finally.
//
//   node tools/bunny-edge-save-timing/deploy-and-time.mjs [bundle] [label]
//
// Environment:
//   BUNNY_API_KEY            account API key (AccessKey header); never printed
//   DECKO_HOSTED_BUNNY_URL  scratch database endpoint (https://host)
//   DECKO_HOSTED_BUNNY_TOKEN scratch database full-access token
// The caller creates and deletes the scratch database; this script only
// touches the edge script it makes itself.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, "$1"));
const API = "https://api.bunny.net";
const KEY = process.env.BUNNY_API_KEY ?? process.env.BUNNY_TRIAL_API_KEY;
const DB_URL = (process.env.DECKO_HOSTED_BUNNY_URL ?? "").replace(/\/+$/, "");
const DB_TOKEN = process.env.DECKO_HOSTED_BUNNY_TOKEN ?? "";
const bundle = resolve(process.argv[2] ?? resolve(here, "../../deploy/dist/bunny-edge-save-timing.bundle.js"));
const label = process.argv[3] ?? "edge";
if (!KEY || !DB_URL || !DB_TOKEN) throw new Error("needs BUNNY_API_KEY and the scratch database URL and token");
const code = readFileSync(bundle, "utf8");
const name = `dksavetime${Date.now().toString(36).slice(-6)}`;

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { AccessKey: KEY, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text === "" ? undefined : JSON.parse(text); } catch { json = text.slice(0, 200); }
  return { status: res.status, json };
}

let scriptId;
let zoneId;
const report = { label, bundleBytes: code.length };
try {
  const created = await api("POST", "/compute/script", {
    Name: name, Code: code, ScriptType: 1, CreateLinkedPullZone: true, LinkedPullZoneName: `${name}z`,
  });
  if (created.status >= 300) throw new Error(`create script HTTP ${created.status}: ${JSON.stringify(created.json).slice(0, 200)}`);
  scriptId = created.json.Id ?? created.json.id;
  zoneId = created.json.LinkedPullZones?.[0]?.Id ?? created.json.LinkedPullZones?.[0]?.id;
  for (const [Name, Secret] of [["BUNNY_DATABASE_URL", DB_URL], ["BUNNY_DATABASE_AUTH_TOKEN", DB_TOKEN]]) {
    const r = await api("POST", `/compute/script/${scriptId}/secrets`, { Name, Secret });
    if (r.status >= 300) throw new Error(`secret ${Name} HTTP ${r.status}`);
  }
  const pub = await api("POST", `/compute/script/${scriptId}/publish`, { Note: "save timing" });
  if (pub.status >= 300) throw new Error(`publish HTTP ${pub.status}`);
  const details = await api("GET", `/compute/script/${scriptId}`);
  // Bunny returns DefaultHostname with its scheme already ("https://<id>.bunny.run").
  const host = details.json.DefaultHostname ?? details.json.defaultHostname;
  if (!host) throw new Error("no DefaultHostname after publish");
  const base = /^https?:\/\//.test(host) ? host.replace(/\/+$/, "") : `https://${host}`;
  // The edge may need a moment after publish; retry the seed route.
  let seedStatus = 0;
  let seedBody = "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const r = await fetch(`${base}/schema`);
      seedStatus = r.status;
      seedBody = await r.text();
      if (seedStatus === 200) break;
    } catch (error) {
      seedBody = String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 5000));
  }
  report.seed = { http: seedStatus, body: seedBody.slice(0, 200) };
  if (seedStatus !== 200) throw new Error(`seed route HTTP ${seedStatus}`);
  const started = Date.now();
  const timing = await fetch(`${base}/timing`);
  report.timingHttp = timing.status;
  report.timingWallMs = Date.now() - started;
  report.timing = JSON.parse(await timing.text());
} catch (error) {
  report.error = String(error).slice(0, 400);
} finally {
  if (scriptId !== undefined) report.deleteScript = (await api("DELETE", `/compute/script/${scriptId}`)).status;
  if (zoneId !== undefined) report.deletePullZone = (await api("DELETE", `/pullzone/${zoneId}`)).status;
}
console.log(JSON.stringify(report, null, 1));