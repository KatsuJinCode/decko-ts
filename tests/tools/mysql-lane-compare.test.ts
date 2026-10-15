import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import { cleanupScratch, scratchDir } from "../support/scratch-dir.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const expected = join(root, "reference-harness/fixtures/synthetic-v1/expected");
const renders = gunzipSync(readFileSync(join(expected, "render.jsonl.gz"))).toString("utf8");
const semantics = readFileSync(join(expected, "semantics.jsonl"), "utf8");

afterEach(cleanupScratch);

function run(change: (records: any[]) => void = () => undefined) {
  const work = scratchDir("mysql-lane-compare-");
  const ruby = join(work, "ruby");
  const port = join(work, "port");
  for (const dir of [ruby, port]) {
    mkdirSync(dir);
    writeFileSync(join(dir, "render.jsonl"), renders);
    writeFileSync(join(dir, "semantics.jsonl"), semantics);
  }
  const records = renders.trim().split("\n").map((line) => JSON.parse(line));
  change(records);
  writeFileSync(join(port, "render.jsonl"), records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  return spawnSync(process.execPath, [join(root, "tools/same-database/mysql-lane-compare.mjs"), ruby, port], {
    cwd: root, encoding: "utf8", windowsHide: true,
  });
}

it("passes complete oracle records and retains the approved N1 slot-value mask", () => {
  const result = run((records) => {
    for (const record of records) {
      if (typeof record.result?.html === "string") {
        record.result.html = record.result.html.replace(/data-slot-id=(["'])[0-9a-f]{20}\1/g,
          (_: string, quote: string) => `data-slot-id=${quote}aaaaaaaaaaaaaaaaaaaa${quote}`);
      }
    }
  });
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.render.ruby_eq_port).toBe(report.render.ops);
});

it("fails when a port operation is missing", () => {
  const result = run((records) => { records.pop(); });
  expect(result.status).not.toBe(0);
  expect(JSON.parse(result.stdout).render.missing_port).toHaveLength(1);
});

it("fails when a real render answer differs", () => {
  const result = run((records) => { records[0].result = { html: "incorrect content" }; });
  expect(result.status).not.toBe(0);
  expect(JSON.parse(result.stdout).render.mismatches).toHaveLength(1);
});

it("rejects duplicate operation identities", () => {
  const result = run((records) => { records.push(records[0]); });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("duplicate operation");
});

it("rejects extra operations even when every expected answer agrees", () => {
  const result = run((records) => { records.push({ id: "unexpected-operation", result: { html: "extra" } }); });
  expect(result.status).not.toBe(0);
  expect(JSON.parse(result.stdout).render.extra_port).toEqual(["unexpected-operation"]);
});

it("rejects records without an answer", () => {
  const result = run((records) => { delete records[0].result; });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("every record must have an id and result");
});
