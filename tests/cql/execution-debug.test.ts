// TEMPORARY debug spec — deleted after diagnosis.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, it } from "vitest";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { parseCql } from "../../src/cql/parser.js";
import { generateSql } from "../../src/cql/sql.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

let driver: LocalSqliteDriver;

beforeAll(async () => {
  driver = new LocalSqliteDriver();
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  const statements = ddl
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  for (const s of statements) await driver.query(s, []);
  await driver.query(
    "INSERT INTO cards (id, name, key, type_id, trash, creator_id, updater_id, created_at, updated_at) VALUES (20, 'Home', 'home', 1, 0, 10, 10, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000')",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, type_id, trash, creator_id, updater_id, created_at, updated_at) VALUES (31, 'editor_notes', 'editor_notes', 1, 0, 10, 10, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000')",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, left_id, right_id, type_id, trash, creator_id, updater_id, created_at, updated_at) VALUES (30, NULL, NULL, 20, 31, 1, 0, 10, 10, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000')",
    [],
  );
});

describe("debug right_plus", () => {
  it("dumps", async () => {
    const all = await driver.query("SELECT id, name, key, left_id, right_id FROM cards", []);
    console.log("rows:", JSON.stringify(all.rows));
    const { sql, params } = generateSql(parseCql({ right_plus: { name: "editor_notes" } }));
    console.log("sql:", sql, "params:", JSON.stringify(params));
    const res = await driver.query(sql, params);
    console.log("result:", JSON.stringify(res.rows));
    const manual = await driver.query(
      "SELECT c0.id FROM cards c0 JOIN cards c1 ON c0.id = c1.left_id AND c1.trash is false JOIN cards c2 ON c1.right_id = c2.id AND c2.trash is false WHERE c2.key = 'editor_notes' AND c0.trash is false",
      [],
    );
    console.log("manual:", JSON.stringify(manual.rows));
  });
});
