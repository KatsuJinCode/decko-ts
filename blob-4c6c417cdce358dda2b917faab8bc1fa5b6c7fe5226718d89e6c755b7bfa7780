import { cpSync, mkdirSync, mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { AdapterSession, loadAdapterManifest } from "../../reference-harness/runner/adapter-process.mjs";

const harness = fileURLToPath(new URL("../../reference-harness", import.meta.url));
const fixture = join(harness, "fixtures/synthetic-v3-mod-probes-ruby33");

function snapshot(database: string, files: string) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    const rows = tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${String(name).replaceAll('"', '""')}" ORDER BY rowid`).all()]);
    const paths = readdirSync(files, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
      .map(entry => join(entry.parentPath, entry.name)).sort();
    return { rows, files: paths.map(path => [path.slice(files.length), readFileSync(path).toString("base64")]) };
  } finally { db.close(); }
}

it.each(["ts", "ts-composed"])("%s adapter saves CSS through its real compiler", async (adapter) => {
  const root = mkdtempSync(join(tmpdir(), "decko-style-adapter-"));
  let session: any;
  try {
    const database = join(root, "deck.sqlite3");
    cpSync(join(fixture, "deck/deck.sqlite3"), database);
    const initial = new DatabaseSync(database);
    try { initial.exec("PRAGMA journal_mode=DELETE"); } finally { initial.close(); }
    cpSync(join(fixture, "deck/files"), join(root, "files"), { recursive: true });
    mkdirSync(join(root, "adapter"));
    const slash = (value: string) => value.replaceAll("\\", "/");
    session = new AdapterSession(loadAdapterManifest(join(harness, "adapters", adapter, "adapter.json")), {
      HARNESS_DECK: slash(database),
      HARNESS_FILES: slash(join(root, "files")),
      HARNESS_WORK: slash(join(root, "adapter")),
      HARNESS_DECK_JSON: slash(join(fixture, "deck.json")),
    });
    await session.start();
    // These valid CSS writes save in the canonical Ruby 3.3.12 control.
    // Without the compiler option the adapter refuses the create.
    for (const [action, content] of [["create", ".probe { color: red; }"], ["update", ".probe { color: blue; }"]]) {
      const answer = await session.request({ op: "write", actor: "admin", action, card: "Compiler Wiring CSS", fields: { ...(action === "create" ? { type: "CSS" } : {}), content } });
      expect(answer.ok).toBe(true);
      expect(answer.result).toMatchObject({ saved: true, errors: [] });
    }
    const before = snapshot(database, join(root, "files"));
    for (const request of [
      { action: "update", card: "Compiler Wiring CSS", fields: { content: ".probe { color:" } },
      { action: "create", card: "Rejected CSS", fields: { type: "CSS", content: ".probe { color:" } },
      { action: "create", card: "Rejected CSS Parent", fields: { content: "parent", fields: { "Compiler Wiring CSS": { content: ".probe { color:" } } } },
    ]) {
      const rejected = await session.request({ op: "write", actor: "admin", ...request });
      expect(rejected.result, JSON.stringify(request)).toMatchObject({ saved: false, errors: [{ field: "content", message: expect.stringContaining("Invalid CSS") }] });
      expect(snapshot(database, join(root, "files"))).toEqual(before);
    }
    const persisted = new DatabaseSync(database, { readOnly: true });
    try {
      expect(persisted.prepare("SELECT db_content FROM cards WHERE name = ?").get("Compiler Wiring CSS")?.db_content).toBe(".probe { color: blue; }");
    } finally { persisted.close(); }
  } finally {
    await session?.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
