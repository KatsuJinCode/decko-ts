// Test helpers: a tiny fixture, runs of the fake adapter through the real
// runner, and copies of result directories to tamper with.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { writeExpectedManifest, writeFixtureManifest } from "../manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const RUNNER = path.join(here, "..");
export const FAKE_ADAPTER = path.join(here, "fake-adapter", "adapter.json");
export const HARNESS = path.join(RUNNER, "..");

/** A scratch directory removed by the returned cleanup function. */
export function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "harness-test-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) };
}

/** Writes a tiny fixture named tiny-v1 under `root`, with its manifest. */
export function makeFixture(root) {
  const dir = path.join(root, "tiny-v1");
  mkdirSync(path.join(dir, "deck", "files"), { recursive: true });
  mkdirSync(path.join(dir, "ops"), { recursive: true });
  writeFileSync(
    path.join(dir, "deck.json"),
    JSON.stringify({
      format: "decko-reference-deck/1",
      name: "tiny-v1",
      clock: "2026-09-19T12:00:00Z",
      environment: { origin: "http://deck.example" },
      actors: { anonymous: { card: "Anonymous" }, member: { card: "Mira Member" } },
      cards: [],
    }) + "\n",
  );
  const db = new DatabaseSync(path.join(dir, "deck", "deck.sqlite3"));
  db.exec("CREATE TABLE cards (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, updated_at TEXT)");
  db.exec("INSERT INTO cards (name, updated_at) VALUES ('Alpha', '2026-09-19 12:00:00'), ('Beta', '2026-09-19 12:00:00')");
  // A table outside Decko's card tables, so a write that touches it records an
  // `other_tables` delta for the grader to check.
  db.exec("CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT)");
  db.close();
  const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(
    path.join(dir, "ops", "render.jsonl"),
    jsonl([
      { id: "page:anonymous:Alpha", op: "render", actor: "anonymous", card: "Alpha" },
      { id: "core:anonymous:Alpha", op: "render", actor: "anonymous", card: "Alpha", view: "core" },
      { id: "page:member:Beta", op: "render", actor: "member", card: "Beta" },
    ]),
  );
  writeFileSync(
    path.join(dir, "ops", "semantics.jsonl"),
    jsonl([
      { id: "card:anonymous:Alpha", op: "ask", actor: "anonymous", q: "card", card: "Alpha" },
      { id: "name:anonymous:Beta", op: "ask", actor: "anonymous", q: "name", name: "Beta" },
    ]),
  );
  writeFileSync(
    path.join(dir, "ops", "scenarios.json"),
    JSON.stringify({
      scenarios: [
        { id: "create-then-render", steps: [
          { op: "write", actor: "member", action: "create", card: "Gamma", fields: { content: "hi" } },
          { op: "render", actor: "member", card: "Gamma" },
        ] },
        { id: "sign-in", steps: [{ op: "signin", email: "m@example.test", password: "x" }] },
      ],
    }) + "\n",
  );
  writeFixtureManifest(dir);
  return dir;
}

/** Runs the real runner with the fake adapter. Returns the spawn result. */
export function runFake(fixture, out, { mode = "", version = 1, extraArgs = [] } = {}) {
  return spawnSync(
    process.execPath,
    [path.join(RUNNER, "run.mjs"), "--adapter", FAKE_ADAPTER, "--fixture", fixture, "--out", out, ...extraArgs],
    { encoding: "utf8", windowsHide: true, env: { ...process.env, FAKE_MODE: mode, FAKE_VERSION: String(version) } },
  );
}

/** A tiny fixture with expected outputs captured from the fake adapter (as
 *  the stock oracle), plus a clean actual run. `captureOpts` and `runOpts`
 *  go to the adapter as FAKE_MODE/FAKE_VERSION, so the expected outputs and
 *  the clean run can share a mode. */
export function makeCapturedFixture(root, { captureOpts = {}, runOpts = {} } = {}) {
  const fixture = makeFixture(root);
  const expected = path.join(fixture, "expected");
  const cap = runFake(fixture, expected, captureOpts);
  if (cap.status !== 0) throw new Error(`capture failed: ${cap.stderr}`);
  writeExpectedManifest(fixture, expected);
  const actual = path.join(root, "good");
  const run = runFake(fixture, actual, runOpts);
  if (run.status !== 0) throw new Error(`run failed: ${run.stderr}`);
  return { fixture, expected, actual };
}

/** Copies a results directory so a test can tamper with the copy. */
export function copyDir(from, to) {
  cpSync(from, to, { recursive: true });
  return to;
}

export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
export const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

/** Runs grade.mjs as a command; returns {status, stdout}. */
export function gradeCli(args) {
  const r = spawnSync(process.execPath, [path.join(RUNNER, "grade.mjs"), ...args], { encoding: "utf8", windowsHide: true });
  return { status: r.status, stdout: r.stdout + r.stderr };
}
