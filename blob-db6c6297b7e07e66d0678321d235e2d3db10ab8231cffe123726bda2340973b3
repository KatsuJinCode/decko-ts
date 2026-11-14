import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { build } from "vite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import {
  autoWarmDeck,
  buildSteps as buildCfSteps,
  maskAccountId,
  maskToken,
  parseArgs as parseCfArgs,
} from "../../scripts/deploy/one-click-deck/one-click-deck.mjs";
import { planSeed } from "../../scripts/deploy/one-click-deck/seed-fitting-scale.mjs";
import {
  autoWarmBunnyDeck,
  buildSteps as buildBunnySteps,
  maskSecret,
  parseArgs as parseBunnyArgs,
} from "../../scripts/deploy/one-click-bunny/one-click-bunny.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WORKER_ENTRY = `${REPO_ROOT}deploy/worker.ts`;
const CRYPTO_SHIM = `${REPO_ROOT}deploy/shims/node-crypto-shim.ts`;

describe("One-click Cloudflare and Bunny post-deploy auto-warming & credential redaction", () => {
  it("redacts secrets in dry-run outputs across both deployers", () => {
    expect(maskToken("cf_secret_token_1234567890")).toBe("[REDACTED]");
    expect(maskToken(null)).toBe("(none)");
    expect(maskAccountId("0a1b2c3d4e5f60718293a4b5c6d7e8f9")).toBe("[REDACTED]");
    expect(maskAccountId(null)).toBe("(none needed for dry-run)");
    expect(maskSecret("bunny_secret_key_1234567890")).toBe("[REDACTED]");
    expect(maskSecret(null)).toBe("(none)");
  });

  it("autoWarmDeck warms / and /Home in 2 passes (cold populate + warm HIT verification)", async () => {
    const calls: string[] = [];
    const seenByUrl = new Map<string, number>();
    const fakeFetch = async (url: string) => {
      calls.push(url);
      const count = (seenByUrl.get(url) ?? 0) + 1;
      seenByUrl.set(url, count);
      const hit = count > 1 ? "HIT" : "MISS";
      return {
        status: 200,
        headers: new Map([["X-Decko-Edge-Cache", hit]]),
        text: async () => "<html>Fitting-scale one-click demo deck</html>",
      };
    };

    const result = await autoWarmDeck("https://decko-demo.example.workers.dev/", {
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(result.baseUrl).toBe("https://decko-demo.example.workers.dev");
    expect(calls).toEqual([
      "https://decko-demo.example.workers.dev/",
      "https://decko-demo.example.workers.dev/",
      "https://decko-demo.example.workers.dev/Home",
      "https://decko-demo.example.workers.dev/Home",
    ]);
    expect(result.routes).toHaveLength(2);
    expect(result.routes[0]?.coldCacheHeader).toBe("MISS");
    expect(result.routes[0]?.warmCacheHeader).toBe("HIT");
    expect(result.routes[1]?.coldCacheHeader).toBe("MISS");
    expect(result.routes[1]?.warmCacheHeader).toBe("HIT");
  });

  it("autoWarmBunnyDeck warms / and /Home in 2 passes (cold populate + warm HIT verification)", async () => {
    const seenByUrl = new Map<string, number>();
    const fakeFetch = async (url: string) => {
      const count = (seenByUrl.get(url) ?? 0) + 1;
      seenByUrl.set(url, count);
      return {
        status: 200,
        headers: new Map([["X-Decko-Edge-Cache", count > 1 ? "HIT" : "MISS"]]),
        text: async () => "<html>Bunny Edge Decko</html>",
      };
    };

    const result = await autoWarmBunnyDeck("https://decko-edge.b-cdn.net/", {
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(result.baseUrl).toBe("https://decko-edge.b-cdn.net");
    expect(result.routes.map((r: { warmCacheHeader: string }) => r.warmCacheHeader)).toEqual(["HIT", "HIT"]);
  });

  it("includes Phase 2 auto-warm step in both Cloudflare and Bunny buildSteps plans", () => {
    const cfSteps = buildCfSteps({
      plan: { cardRows: 42, refRows: 500, seedRows: 542, refsPerCard: 11.873639 },
      remoteChunkCount: 1,
      workerName: "decko-one-click-demo",
      dbName: "decko-one-click-db",
    });
    expect(cfSteps.at(-1)?.name).toContain("auto-warm Phase 2 caches");

    const bunnyArgs = parseBunnyArgs(["--warmup-url", "https://decko-edge.b-cdn.net"]);
    const bunnySteps = buildBunnySteps(bunnyArgs);
    expect(bunnySteps.at(-1)?.name).toContain("auto-warm Phase 2 caches");
    expect(parseCfArgs(["--cards", "1"]).cards).toBe(1);
  });

  it("boots the one-click worker in Miniflare over a minimal D1 seed and auto-warms / and /Home to HIT", async () => {
    const plan = planSeed({ scalePages: 1 });
    expect(plan.cardRows).toBe(42);
    expect(plan.refRows).toBe(12);
    expect(plan.seedRows).toBe(54);

    const viteResult = await build({
      configFile: false,
      logLevel: "warn",
      resolve: {
        alias: [{ find: "node:crypto", replacement: CRYPTO_SHIM }],
      },
      ssr: { noExternal: true },
      build: {
        write: false,
        minify: false,
        target: "es2022",
        ssr: true,
        rollupOptions: {
          input: WORKER_ENTRY,
          output: { format: "esm", entryFileNames: "deploy-worker.mjs" },
        },
      },
    });
    const outputs = (Array.isArray(viteResult) ? viteResult : [viteResult]) as unknown as Array<{
      output: Array<{ type: string; code?: string }>;
    }>;
    const bundleCode = outputs[0]?.output.find((chunk) => chunk.type === "chunk")?.code ?? "";
    expect(bundleCode.length).toBeGreaterThan(0);

    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundleCode,
        compatibilityDate: "2025-09-15",
        d1Databases: { DB: "one-click-minimal-db" },
        bindings: {
          DECKO_EDGE_CACHE: "1",
          DECKO_EDGE_GLOBAL_CACHE: "1",
          DECKO_LIVE_BUNDLES: "1",
          DECKO_LAZY_RULE_WATERMARKS: "1",
        },
      }),
    );

    try {
      const d1 = await mf.getD1Database("DB");
      const schemaSql = readFileSync(`${REPO_ROOT}deploy/migrations/0001-schema.sql`, "utf8");
      const bundlesSql = readFileSync(`${REPO_ROOT}deploy/migrations/0015-live-page-bundles.sql`, "utf8");
      const seedSql = readFileSync(`${REPO_ROOT}deploy/seed/seed.sql`, "utf8");

      for (const sqlText of [schemaSql, bundlesSql, seedSql]) {
        const stmts = splitSqlStatements(sqlText).map((s) => d1.prepare(s));
        if (stmts.length > 0) await d1.batch(stmts);
      }

      const url = await mf.ready;
      const baseUrl = url.origin.replace(/\/$/, "");
      const warmResult = await autoWarmDeck(baseUrl, {
        fetchImpl: ((u: string, init?: RequestInit) => mf.dispatchFetch(u, init as never)) as unknown as typeof fetch,
      });

      expect(warmResult.routes).toHaveLength(2);
      expect(warmResult.routes[0]?.route).toBe("/");
      expect(warmResult.routes[0]?.coldCacheHeader).toBe("armed; cache=miss+stored; ttl=300");
      expect(warmResult.routes[0]?.warmCacheHeader).toBe("armed; cache=hit");
      expect(warmResult.routes[1]?.route).toBe("/Home");
      expect(warmResult.routes[1]?.coldCacheHeader).toBe("armed; cache=miss+stored; ttl=300");
      expect(warmResult.routes[1]?.warmCacheHeader).toBe("armed; cache=hit");

      const bundlesCount = await d1.prepare("SELECT COUNT(*) AS cnt FROM live_page_bundles").first<{ cnt: number }>();
      expect(Number(bundlesCount?.cnt ?? 0)).toBeGreaterThan(0);
      const l3Count = await d1.prepare("SELECT COUNT(*) AS cnt FROM edge_render_cache").first<{ cnt: number }>();
      expect(Number(l3Count?.cnt ?? 0)).toBeGreaterThan(0);

      const statusRes = await mf.dispatchFetch(`${baseUrl}/_status`);
      expect(statusRes.status).toBe(200);
      const statusBody = (await statusRes.json()) as { database: { card_count: number } };
      expect(statusBody.database.card_count).toBe(23);
    } finally {
      await mf.dispose();
    }
  });
});
