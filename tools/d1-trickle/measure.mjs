#!/usr/bin/env node
// tools/d1-trickle/measure.mjs — measure pages on a D1-backed Worker: either
// the built bundle running locally in workerd (Miniflare) over a local D1, or
// a deployed URL (Cloudflare or Bunny), one request at a time.
//
//   Local:   node tools/d1-trickle/measure.mjs --local --persist <d1 dir> --database-name <id> \
//              --out <dir> [--ref <dir>] --pages "/,/About" | --manifest <state>/manifest.json
//   Remote:  node tools/d1-trickle/measure.mjs --base-url https://x.workers.dev --out <dir> [--ref <dir>] --pages ...
//
// Each page yields one JSON line: status, the Server-Timing breakdown (db,
// stmt, render, total), wall time on this machine, byte count, and — with
// --ref — whether the body is byte-identical to <ref>/<file>.html once
// data-slot-id attributes are masked. Remote requests carry a unique query
// string so no cache can answer. The local run takes its Worker variable
// bindings from the repo's committed deploy wrangler.toml (the default of
// the --wrangler option below).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { maskSlots } from "./trickle-lib.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};
const outDir = resolve(arg("out", "tmp/d1-trickle/measure"));
const refDir = arg("ref") ? resolve(arg("ref")) : undefined;
mkdirSync(outDir, { recursive: true });

export const fileFor = (page) => `${page.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Home"}.html`;

/** [vars] of a wrangler.toml: key = "value" lines. */
export function tomlVars(text) {
  const vars = {};
  let inVars = false;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("[")) inVars = t === "[vars]";
    else if (inVars) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"(.*)"\s*$/.exec(t);
      if (m) vars[m[1]] = m[2];
    }
  }
  return vars;
}

export function parseServerTiming(h) {
  const out = {};
  for (const part of String(h ?? "").split(",")) {
    const [name, ...attrs] = part.trim().split(";");
    if (!name) continue;
    for (const a of attrs) {
      const [k, v] = a.split("=");
      out[k.trim() === "dur" ? name : `${name}_${k.trim()}`] = Number(v);
    }
  }
  return out;
}

let pages = arg("pages") ? arg("pages").split(",") : [];
if (arg("manifest")) pages.push(...JSON.parse(readFileSync(arg("manifest"), "utf8")).complete_pages);
pages = [...new Set(pages)];

let dispatch;
let close = async () => {};
if (argv.includes("--local")) {
  const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
  const bundle = readFileSync(resolve(arg("bundle", "deploy/dist/cf-edge-engine.bundle.js")), "utf8");
  const vars = tomlVars(readFileSync(resolve(arg("wrangler", "deploy/cf-trial/wrangler.toml")), "utf8"));
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: [{ type: "ESModule", path: "worker.mjs", contents: bundle }],
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: need("database-name") },
      resourcePersistencePath: resolve(need("persist")),
      bindings: vars,
    }),
  );
  dispatch = (page) => mf.dispatchFetch(`https://edge.test${page}`);
  close = () => mf.dispose();
} else {
  const base = need("base-url").replace(/\/+$/, "");
  dispatch = (page) => fetch(`${base}${page}${page.includes("?") ? "&" : "?"}m=${Date.now()}${Math.random().toString(36).slice(2, 8)}`, { headers: { "Cache-Control": "no-cache" } });
}
function need(k) {
  const v = arg(k);
  if (v === undefined) throw new Error(`--${k} is required`);
  return v;
}

const rows = [];
try {
  for (const page of pages) {
    const t0 = performance.now();
    let status = 0;
    let text = "";
    let timing = "";
    let tripsHeader = null;
    let err;
    try {
      const res = await dispatch(page);
      status = res.status;
      timing = res.headers.get("server-timing") ?? "";
      tripsHeader = res.headers.get("x-decko-db-trips");
      text = await res.text();
    } catch (e) {
      err = String(e?.message ?? e).slice(0, 200);
    }
    const wall = Math.round(performance.now() - t0);
    const file = fileFor(page);
    writeFileSync(join(outDir, file), text);
    const st = parseServerTiming(timing);
    const r = { page, status, wall_ms: wall, bytes: Buffer.byteLength(text), db_ms: st.db, stmt: st.db_stmt, trips: tripsHeader === null ? undefined : Number(tripsHeader), render_ms: st.render, total_ms: st.total, sha256_masked: createHash("sha256").update(maskSlots(text)).digest("hex").slice(0, 16) };
    if (refDir) {
      const ref = join(refDir, file);
      r.same_bytes = existsSync(ref) ? maskSlots(readFileSync(ref, "utf8")) === maskSlots(text) : null;
    }
    if (err) r.error = err;
    rows.push(r);
    console.log(JSON.stringify(r));
  }
} finally {
  await close();
}
writeFileSync(join(outDir, "results.json"), JSON.stringify(rows, null, 1));
