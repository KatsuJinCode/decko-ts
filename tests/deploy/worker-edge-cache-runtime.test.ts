import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { splitSqlStatements } from "../card/render/render-test-storage.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

for (const entry of ["worker.ts", "deploy/worker.ts"]) {
  describe(`${entry}: anonymous cache on real workerd and D1`, () => {
    let mf: Miniflare;
    let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
    const fetch = async (path: string, headers: Record<string, string> = {}) =>
      await mf.dispatchFetch(`https://cache-runtime.test${path}`, { headers, redirect: "manual" });

    beforeAll(async () => {
      const stub = `${ROOT}deploy/shims/coffeescript-node-builtin-stub.mjs`;
      // Match the existing root write-surface runtime harness: make CJS
      // interop lazy as Wrangler does, without calling Node-only helpers.
      const lazyRequire = {
        name: "lazy-cjs-require", enforce: "post" as const,
        generateBundle(_options: unknown, chunks: Record<string, { type: string; code?: string }>) {
          for (const chunk of Object.values(chunks)) {
            if (chunk.type !== "chunk" || chunk.code === undefined) continue;
            chunk.code = chunk.code.replace(/^\s*import \{ createRequire \} from "node:module";\r?\n/m, "")
              .replace(/var __require = \/\* #__PURE__ \*\/ \(\(\) => createRequire\(import\.meta\.url\)\)\(\);/,
                'var __require = id => { throw new Error("Dynamic require " + id); };');
          }
        },
      };
      const built = await build({
        configFile: false, logLevel: "warn", ssr: { noExternal: true }, plugins: [lazyRequire],
        resolve: { alias: { fs: stub, vm: stub, path: stub, child_process: stub, module: stub } },
        build: { write: false, minify: false, target: "es2022", ssr: true,
          rollupOptions: { input: `${ROOT}${entry}`, output: { format: "esm", inlineDynamicImports: true } } },
      });
      const outputs = (Array.isArray(built) ? built : [built]) as Array<{ output: Array<{ type: string; code?: string }> }>;
      const script = outputs[0].output.find(chunk => chunk.type === "chunk")!.code!;
      mf = new Miniflare(convertV4MiniflareOptions({
        modules: true, script, compatibilityDate: "2026-08-01", compatibilityFlags: ["nodejs_compat"],
        d1Databases: { DB: "cache-runtime" }, bindings: { DECKO_EDGE_CACHE: "1" },
      }));
      await mf.ready;
      db = await mf.getD1Database("DB");
      for (const rel of ["deploy/migrations/0001-schema.sql", "deploy/seed/seed.sql", "deploy/migrations/0005-auth-sessions.sql", "deploy/migrations/0013-nest-index-meta.sql", "deploy/migrations/0014-undo-journal-lock-state.sql"]) {
        const statements = splitSqlStatements(readFileSync(`${ROOT}${rel}`, "utf8"));
        for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40).map(sql => db.prepare(sql)));
      }
    }, 60_000);
    afterAll(async () => { await mf?.dispose(); });

    it("hits byte-identically, bypasses credentials, and invalidates committed edits and read revocations", async () => {
      await db.prepare("UPDATE cards SET db_content = ? WHERE name = 'Home'").bind("cache-visible-before").run();
      const first = await fetch("/Home");
      expect(first.status, await first.clone().text()).toBe(200);
      const original = await first.text();
      expect(original).toContain("cache-visible-before");
      expect(first.headers.get("x-decko-edge-cache")).toContain("miss+stored");
      const second = await fetch("/Home");
      expect(second.headers.get("x-decko-edge-cache")).toContain("cache=hit");
      expect(await second.text()).toBe(original);

      for (const credentials of [{ Cookie: "decko_ts_session=opaque" }, { Authorization: "Bearer opaque" }] as Array<Record<string, string>>) {
        const privateResponse = await fetch("/Home", credentials);
        expect(privateResponse.headers.get("x-decko-edge-cache")).toContain("per-viewer-bypass");
        expect(privateResponse.headers.get("cache-control")).toBe("private, no-store");
        await privateResponse.text();
      }
      for (const path of ["/Home?view=core", "/Home/core", "/Home.json"]) {
        const dynamic = await fetch(path);
        expect((dynamic.headers.get("x-decko-edge-cache") ?? "")).not.toContain("cache=hit");
        expect((dynamic.headers.get("cache-control") ?? "")).not.toContain("public");
        await dynamic.text();
      }
      const anonymousAgain = await fetch("/Home");
      expect(anonymousAgain.headers.get("x-decko-edge-cache")).toContain("cache=hit");
      expect(await anonymousAgain.text()).toBe(original);

      await db.prepare("UPDATE cards SET db_content = ? WHERE name = 'Home'").bind("cache-visible-after").run();
      const edited = await fetch("/Home");
      const editedBody = await edited.text();
      expect(edited.headers.get("x-decko-edge-cache")).toContain("miss+stored");
      expect(editedBody).toContain("cache-visible-after");
      expect(editedBody).not.toContain("cache-visible-before");

      const old = await db.prepare("SELECT read_rule_id FROM cards WHERE name = 'Home'").first<{ read_rule_id: number }>();
      await db.prepare("UPDATE cards SET read_rule_id = 999999 WHERE name = 'Home'").run();
      try {
        const denied = await fetch("/Home");
        expect(denied.headers.get("x-decko-edge-cache")).not.toContain("cache=hit");
        expect(await denied.text()).not.toContain("cache-visible-after");
      } finally {
        await db.prepare("UPDATE cards SET read_rule_id = ? WHERE name = 'Home'").bind(old!.read_rule_id).run();
      }
    });

    it("does not cache operational routes or alter write-method gating", async () => {
      const operational = await fetch(entry === "worker.ts" ? "/api/status" : "/_status");
      expect(operational.headers.get("x-decko-edge-cache")).toBeNull();
      await operational.text();
      const write = await mf.dispatchFetch("https://cache-runtime.test/Home", {
        method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "card[content]=must-not-save",
      });
      expect([403, 405]).toContain(write.status);
      expect(write.headers.get("x-decko-edge-cache")).toBeNull();
      await write.text();
      const card = await db.prepare("SELECT db_content FROM cards WHERE name = 'Home'").first<{ db_content: string }>();
      expect(card!.db_content).not.toBe("must-not-save");
    });
  });
}
