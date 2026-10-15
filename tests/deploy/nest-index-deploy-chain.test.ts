import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error deployment tool is executable ESM without declarations
import { d1DatabaseIdFromWranglerToml } from "../../tools/deploy/build-nest-index.mjs";

describe("explicit deploy-time nest-index preparation", () => {
  it("orders migration, compilation, remote preparation and publication", () => {
    const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts;
    expect(scripts.deploy.split(" && ")).toEqual([
      "npm run db:migrations:apply", "npm run build:engine", "npm run build:nest-index:remote", "npx wrangler deploy", "npm run setup-token",
    ]);
    expect(scripts["build:engine"]).toBe("tsc -p tsconfig.dist.json");
    expect(scripts["build:nest-index:remote"]).toBe("node tools/deploy/build-nest-index.mjs --remote");
  });

  it("selects the DB binding without falling through to another database or table", () => {
    const dir = mkdtempSync(join(tmpdir(), "decko-deploy-target-"));
    const path = join(dir, "wrangler.toml");
    try {
      writeFileSync(path, `[[d1_databases]]\nbinding = "OTHER"\ndatabase_id = "other-db"\n  [[d1_databases]] # serving deck\n  binding = 'DB'\n  database_id = 'serving-db'\n[vars]\ndatabase_id = "wrong-db"\n`);
      expect(d1DatabaseIdFromWranglerToml(path, "DB")).toBe("serving-db");
      for (const text of ["[vars]\nbinding='DB'\ndatabase_id='wrong'", "[[d1_databases]]\nbinding='DB'\n[vars]\ndatabase_id='wrong'", "[[d1_databases]]\nbinding='DB'\ndatabase_id='REPLACE_WITH_ID'"]) {
        writeFileSync(path, text);
        expect(() => d1DatabaseIdFromWranglerToml(path, "DB")).toThrow(/database_id|binding/);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
