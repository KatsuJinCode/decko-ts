// A stand-in engine for the runner and grader tests: speaks the harness
// protocol over a tiny deck, answers deterministically except for a random
// slot id in every render (as Ruby Decko does), and misbehaves on request:
//
//   FAKE_VERSION=<n>            the version its ready line reports (default 1)
//   FAKE_MODE=read-writes       every render also inserts a card row
//   FAKE_MODE=step-read-writes  the first render after a write inserts a card row
//   FAKE_MODE=write-other-table every write also inserts a row in the deck's
//                               `sessions` table (outside the card tables), as
//                               an engine with its own bookkeeping table would
//   FAKE_MODE=crash-after:<n>   exits without answering request n+1
//   FAKE_MODE=wrong-html:<card> renders that card with different content

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createInterface } from "node:readline";

const spec = JSON.parse(readFileSync(process.env.HARNESS_DECK_JSON, "utf8"));
const db = new DatabaseSync(process.env.HARNESS_DECK);
const mode = process.env.FAKE_MODE ?? "";
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let served = 0;
let sawWrite = false;
let wroteInScenario = false;

const insertCard = (name) => {
  const r = db.prepare("INSERT INTO cards (name, updated_at) VALUES (?, ?)").run(name, "2026-09-19 12:00:00");
  return Number(r.lastInsertRowid);
};

function answer(req) {
  switch (req.op) {
    case "render": {
      if (mode === "read-writes") insertCard(`read write ${served}`);
      if (mode === "step-read-writes" && sawWrite && !wroteInScenario) {
        insertCard("written by a read");
        wroteInScenario = true;
      }
      const body = mode === `wrong-html:${req.card}` ? "changed" : req.card;
      const slot = randomBytes(10).toString("hex");
      return { html: `<div class="card" data-slot-id="${slot}">${body}${req.view ? ` (${req.view})` : ""}</div>` };
    }
    case "ask":
      return { answer: `${req.q}:${req.card ?? req.name ?? ""}` };
    case "write": {
      sawWrite = true;
      const id = insertCard(req.card);
      if (mode === "write-other-table") db.prepare("INSERT INTO sessions (token) VALUES (?)").run(`session for ${req.card}`);
      return { saved: true, errors: [], card: { name: req.card, id }, mail: [] };
    }
    case "signin":
      return { signed_in: true, actor: spec.actors?.member?.card ?? "Member" };
    default:
      throw new Error(`unknown op ${req.op}`);
  }
}

emit({ ready: true, protocol: 1, engine: "fake", version: { fake: Number(process.env.FAKE_VERSION ?? 1) } });
const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (!line.trim()) continue;
  const req = JSON.parse(line);
  if (req.op === "quit") break;
  const crashAt = mode.startsWith("crash-after:") ? Number(mode.split(":")[1]) : Infinity;
  if (served >= crashAt) process.exit(3);
  served++;
  try {
    emit({ id: req.id, ok: true, result: answer(req) });
  } catch (error) {
    emit({ id: req.id, ok: false, error: { class: "FakeError", message: error.message } });
  }
}
db.close();
