#!/usr/bin/env node
// Two engines, one database: the port writes a card into a copy of the
// Ruby-built synthetic deck, then stock Ruby Decko opens the same file and
// renders that card; Ruby writes a card and the port renders it. Each side
// renders both cards, and the HTML is compared byte for byte after the
// grader's normalization (reference-harness/runner/normalize.mjs).
//
//   GEM_HOME=<ruby gem home> node tools/same-database/cross-engine-check.mjs
//
// Both engines are driven through their reference-harness adapters (the
// same protocol the grader uses), on one private copy of the deck that is
// removed on exit. Ruby needs its gems installed (see reference-harness/
// oracle); the port needs only Node.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { AdapterSession, loadAdapterManifest } from "../../reference-harness/runner/adapter-process.mjs";
import { normalizeHtml } from "../../reference-harness/runner/normalize.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = path.join(root, "reference-harness/fixtures/synthetic-v1");
const slash = (p) => p.replaceAll("\\", "/");

const PORT_CARD = { name: "Same Database Port Note", content: "<p>Written by the port.</p>" };
const RUBY_CARD = { name: "Same Database Ruby Note", content: "<p>Written by Ruby.</p>" };

async function session(adapter, env) {
  const s = new AdapterSession(loadAdapterManifest(path.join(root, "reference-harness/adapters", adapter, "adapter.json")), env, {
    timeoutMs: 600_000,
  });
  await s.start();
  return s;
}

async function write(s, card) {
  const r = await s.request({ op: "write", actor: "admin", action: "create", card: card.name, fields: { type: "Note", content: card.content } });
  if (r.error || r.result?.saved !== true) throw new Error(`write ${card.name} failed: ${JSON.stringify(r)}`);
  return r.result;
}

async function renders(s, names) {
  const out = {};
  for (const name of names) {
    for (const view of ["core", undefined]) {
      const r = await s.request({ op: "render", actor: "anonymous", card: name, ...(view ? { view } : {}) });
      // The grader's normalization (N1-N3: per-request slot ids and the like),
      // so the comparison is the one the parity grade makes.
      out[`${view ?? "page"}:${name}`] = r.error ? { error: r.error } : normalizeHtml(r.result.html);
    }
  }
  return out;
}

const work = mkdtempSync(path.join(os.tmpdir(), "decko-same-db-"));
try {
  const deck = path.join(work, "deck.sqlite3");
  cpSync(path.join(fixture, "deck/deck.sqlite3"), deck);
  cpSync(path.join(fixture, "deck/files"), path.join(work, "files"), { recursive: true });
  const env = (name) => ({
    HARNESS_DECK: slash(deck),
    HARNESS_FILES: slash(path.join(work, "files")),
    HARNESS_DECK_JSON: slash(path.join(fixture, "deck.json")),
    HARNESS_WORK: slash(path.join(work, name)),
  });

  // 1. The port opens the Ruby-built file as it is and writes a card.
  let port = await session("ts", env("port"));
  const portWrite = await write(port, PORT_CARD);
  await port.close();

  // 2. Ruby opens the same file (now carrying the port's added objects),
  //    renders the port's card and writes one of its own.
  const ruby = await session("ruby", env("ruby"));
  const rubyWrite = await write(ruby, RUBY_CARD);
  const rubyHtml = await renders(ruby, [PORT_CARD.name, RUBY_CARD.name]);
  await ruby.close();

  // 3. The port reopens the file Ruby just wrote and renders both cards.
  port = await session("ts", env("port2"));
  const portHtml = await renders(port, [PORT_CARD.name, RUBY_CARD.name]);
  await port.close();

  const db = new DatabaseSync(deck, { readOnly: true });
  const stamp = db.prepare(`SELECT version FROM deck_data_version WHERE id = 1`).get().version;
  db.close();

  let failures = 0;
  for (const key of Object.keys(rubyHtml)) {
    const same = rubyHtml[key] === portHtml[key];
    const missing = typeof rubyHtml[key] !== "string" || /not found|could not find/i.test(rubyHtml[key]);
    if (!same || missing) failures++;
    console.log(`${same && !missing ? "same" : "DIFFERS"}  ${key}  (${String(rubyHtml[key]).length} bytes)`);
    if (!same) console.log(`  ruby: ${JSON.stringify(rubyHtml[key]).slice(0, 400)}\n  port: ${JSON.stringify(portHtml[key]).slice(0, 400)}`);
  }
  console.log(`port wrote card id ${portWrite.card?.id}; Ruby wrote card id ${rubyWrite.card?.id}; freshness stamp ${stamp}`);
  console.log(failures === 0 ? "PASS: each engine renders the other's write, byte for byte the same" : `FAIL: ${failures} render(s) differ`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
