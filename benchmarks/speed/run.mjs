#!/usr/bin/env node
// benchmarks/speed/run.mjs — the speed benchmark: the same synthetic-v1 pages
// served by Ruby Decko (Puma, production), the port's Node host and the
// port's Worker in workerd over D1, measured by one fixed client.
//
//   node benchmarks/speed/build.mjs
//   node benchmarks/speed/run.mjs [--targets ruby,node,workerd] [--hops 0,10]
//        [--warm 30] [--duration 10] [--concurrency 8] [--out <file.json>]
//   node benchmarks/speed/render-docs.mjs <file.json>      (writes docs/speed.md)
//
// A hosted deploy is measured with --url <name>=<base url> instead of
// starting a server (repeatable); no hop is applied, the network is real.
//
// Per target and hop, in order:
//   first_request  the first request after the server is listening (the
//                  deck boot; for the port this is when it reads the deck)
//   cold           each page once, the first time that page is asked for
//   warm           each page --warm times in sequence: p50 / p95
//   throughput     --concurrency clients cycling through the pages for
//                  --duration seconds: requests per second, p50 / p95
// Every response records status, bytes, X-Decko-Db-Trips (database round
// trips, as each server counts them) and the sha256 of the body with the
// per-render slot ids masked, so the bytes served can be compared.
//
// Ruby needs GEM_HOME / GEM_PATH that hold the oracle's gems and Puma
// (benchmarks/speed/ruby/Gemfile.lock); see docs/speed.md.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { ROOT, START } from "./servers.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};
const urls = [];
argv.forEach((a, i) => {
  if (a === "--url") {
    const [name, ...rest] = argv[i + 1].split("=");
    urls.push({ name, url: rest.join("=").replace(/\/+$/, "") });
  }
});
const targets = urls.length > 0 ? [] : arg("targets", "ruby,node,workerd").split(",");
const hops = arg("hops", "0,10").split(",").map(Number);
const WARM = Number(arg("warm", "30"));
const DURATION_S = Number(arg("duration", "10"));
const CONCURRENCY = Number(arg("concurrency", "8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = arg("out", join(ROOT, `benchmarks/speed/runs/${stamp}.json`));

/** The pages: the home page, a rich-text card, two more cards, a cardtype
 *  listing, a search card and the Search cardtype (its listing is the
 *  largest page on the deck). All readable anonymously. */
const PAGES = ["/", "/Note_001", "/Note_037", "/Decko_Bot", "/RichText", "/Cards_with_accounts", "/Search"];

const SLOT = /data-slot-id=(["'])[0-9a-f]+\1/g;
const masked = (s) => createHash("sha256").update(s.replace(SLOT, "")).digest("hex").slice(0, 16);

async function get(base, page) {
  const t0 = performance.now();
  const r = await fetch(base + page, { headers: { "cache-control": "no-cache" } });
  const body = await r.text();
  const ms = performance.now() - t0;
  const trips = r.headers.get("x-decko-db-trips");
  return { status: r.status, ms, bytes: Buffer.byteLength(body), trips: trips === null ? null : Number(trips), sha: masked(body) };
}

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? null : +s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)].toFixed(2);
};

async function measure(base) {
  const cold = [];
  for (const page of PAGES) {
    const r = await get(base, page);
    cold.push({ page, ...r, ms: +r.ms.toFixed(2) });
  }
  const warm = [];
  for (const page of PAGES) {
    const xs = [];
    let last;
    for (let i = 0; i < WARM; i++) {
      last = await get(base, page);
      xs.push(last.ms);
    }
    warm.push({ page, n: WARM, p50_ms: pct(xs, 50), p95_ms: pct(xs, 95), status: last.status, trips: last.trips, bytes: last.bytes, sha: last.sha });
  }
  const lat = [];
  let errors = 0;
  const end = performance.now() + DURATION_S * 1000;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async (_, c) => {
      let i = c;
      while (performance.now() < end) {
        try {
          const r = await get(base, PAGES[i++ % PAGES.length]);
          if (r.status >= 500) errors++;
          lat.push(r.ms);
        } catch {
          errors++;
        }
      }
    }),
  );
  const throughput = { concurrency: CONCURRENCY, duration_s: DURATION_S, requests: lat.length, errors, rps: +(lat.length / DURATION_S).toFixed(1), p50_ms: pct(lat, 50), p95_ms: pct(lat, 95) };
  return { cold, warm, throughput };
}

function git(...a) {
  try {
    return execFileSync("git", a, { cwd: ROOT, windowsHide: true, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const record = {
  format: "decko-speed-run/1",
  started: new Date().toISOString(),
  commit: git("rev-parse", "HEAD"),
  dirty: (git("status", "--porcelain", "--untracked-files=no") ?? "") !== "",
  fixture: "synthetic-v1",
  pages: PAGES,
  client: { kind: "node fetch (undici), keep-alive, sequential for cold/warm", node: process.version, warm: WARM, duration_s: DURATION_S, concurrency: CONCURRENCY },
  machine: { platform: process.platform, arch: process.arch, cpus: os.cpus().length, cpu: os.cpus()[0]?.model, mem_gb: Math.round(os.totalmem() / 2 ** 30) },
  command: `node benchmarks/speed/run.mjs ${argv.join(" ")}`.trim(),
  runs: [],
};

let port = 3401;
for (const hopMs of hops) {
  for (const target of targets) {
    process.stderr.write(`[speed] ${target} hop=${hopMs}ms: starting\n`);
    const server = await START[target]({ port: port++, hopMs });
    try {
      process.stderr.write(`[speed] ${target} hop=${hopMs}ms: ready in ${server.boot_ms} ms; measuring\n`);
      const m = await measure(server.url);
      record.runs.push({ target, hop_ms: hopMs, server: server.server, boot_ms: server.boot_ms, first_request_ms: server.first_request_ms, ...m });
    } finally {
      await server.stop();
    }
  }
}
for (const { name, url } of urls) {
  process.stderr.write(`[speed] ${name} (${url}): measuring\n`);
  const t0 = performance.now();
  await get(url, "/_speed_ping_404").catch(() => undefined);
  const first_request_ms = Math.round(performance.now() - t0);
  record.runs.push({ target: name, url, hop_ms: null, server: "hosted", first_request_ms, ...(await measure(url)) });
}
record.finished = new Date().toISOString();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(record, null, 1) + "\n");
console.log(out);
