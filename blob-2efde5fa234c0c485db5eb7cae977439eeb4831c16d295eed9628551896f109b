import { describe, expect, it } from "vitest";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { ensureFreshnessStamp, FRESHNESS_STAMPED_TABLES } from "../../src/server/freshness-stamp.js";
import { bootEdgeServingEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { clearKeptLivePages, livePageBundleKey, liveRenderPage } from "../../src/card/live/live-render.js";
import { CARDS_COLUMNS } from "../../src/card/live/store-row-evaluator.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("top navigation bar HTML, 1-trip bundle parity, and compiled stylesheet integrity", () => {
  it("shipped compiled stylesheets contain .d0-nav-container flex layout and Bootstrap navbar rules and are byte-identical", () => {
    const cssPaths = [
      "scripts/deploy/one-click-deck/demo-static-assets/assets/all-style.css",
      "vm-skin-compiled.css",
    ] as const;
    const loadedCss: string[] = [];
    for (const relPath of cssPaths) {
      const css = readFileSync(join(repoRoot, relPath), "utf8");
      loadedCss.push(css);
      expect(
        css.length,
        `${relPath} must be the full >350 KB compiled stylesheet, never the 215-256 KB truncated scratch CSS`,
      ).toBeGreaterThan(350_000);
      expect(css, `${relPath} must define .d0-nav-container flex layout`).toMatch(
        /\.d0-nav-container\s*\{[^}]*display:\s*flex/,
      );
      expect(css, `${relPath} must define .navbar-expand-lg`).toContain(".navbar-expand-lg");
      expect(css, `${relPath} must define .navbar-nav`).toContain(".navbar-nav{");
      expect(css, `${relPath} must define .dropdown-menu`).toContain(".dropdown-menu{");
    }
    expect(loadedCss[0]).toBe(loadedCss[1]);
  });

  it("renders identical top navigation header structure on cold render and 1-trip live_page_bundles hit with negative control and no deferred/async bundle scripts", async () => {
    const root = mkdtempSync(join(tmpdir(), "decko-top-nav-integrity-"));
    copyFileSync(
      join(repoRoot, "reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3"),
      join(root, "deck.sqlite3"),
    );
    const driver = new LocalSqliteDriver({ path: join(root, "deck.sqlite3") });
    try {
      await ensureFreshnessStamp(driver);
      const boot = async (d: Parameters<typeof bootEdgeServingEngines>[0]) => {
        const engines = await bootEdgeServingEngines(d);
        engines.render.viewer = { signedIn: false };
        return engines;
      };

      // 1. Cold render that persists the 1-trip bundle into live_page_bundles
      const cold = await liveRenderPage(driver, "Home", boot, {
        keep: true,
        persistBundles: true,
      });
      expect(cold.status).toBe(200);
      expect(cold.stats.round_trips).toBeGreaterThan(1);

      const expectedKey = livePageBundleKey("Home", { keep: true, persistBundles: true });
      const bundleRows = await driver.query<{ keep_key: string; stamp: number; payload_json: string }>(
        "SELECT keep_key, stamp, payload_json FROM live_page_bundles WHERE keep_key = ?",
        [expectedKey],
      );
      expect(bundleRows.rows.length).toBe(1);
      expect(bundleRows.rows[0]!.stamp).toBeGreaterThanOrEqual(0);

      // 2. Evict in-memory isolate cache and render from the persisted 1-trip D1/SQLite bundle
      clearKeptLivePages(driver);
      const warmBundle = await liveRenderPage(driver, "Home", boot, {
        keep: true,
        persistBundles: true,
      });
      expect(warmBundle.status).toBe(200);
      expect(warmBundle.stats.round_trips).toBe(1);

      for (const [label, html] of [
        ["cold", cold.html],
        ["warm-1-trip-bundle", warmBundle.html],
      ] as const) {
        const headerMatch = /<header>([\s\S]*?)<\/header>/.exec(html);
        expect(headerMatch, `${label}: <header> must be present`).not.toBeNull();
        const headerHtml = headerMatch![1]!;
        expect(headerHtml, `${label}: navbar container must use .d0-nav-container`).toContain(
          '<div class="d0-nav-container">',
        );
        expect(headerHtml, `${label}: navbar must have collapsible #d0-navbar`).toContain('id="d0-navbar"');
        expect(headerHtml, `${label}: navbar must include main-nav list`).toContain(
          'class="navbar-nav mr-auto main-nav ms-2"',
        );
        expect(headerHtml, `${label}: navbar must include dropdown toggle and dropdown-menu`).toContain(
          'class="nav-link dropdown-toggle" data-bs-toggle="dropdown"',
        );
        expect(headerHtml, `${label}: navbar must include dropdown-menu items`).toContain(
          '<div class="dropdown-menu">',
        );
        expect(headerHtml, `${label}: navbar must include search-box-nav`).toContain(
          'class="navbar-nav search-box-nav mx-2"',
        );
        expect(headerHtml, `${label}: navbar must include account links`).toContain('href="/*signin"');

        // External synchronous script tags must never have `defer` or `async` injected ahead of inline decko script calls
        const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc=[^>]*>/gi)].map((m) => m[0]);
        expect(scriptTags.length).toBeGreaterThan(0);
        for (const tag of scriptTags) {
          expect(tag, `${label}: external script tag must not have defer or async`).not.toMatch(
            /\b(?:defer|async)\b/i,
          );
        }
      }

      const maskSlotIds = (s: string) => s.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, 'data-slot-id="MASK"');
      expect(maskSlotIds(warmBundle.html)).toBe(maskSlotIds(cold.html));

      // 3. Negative control: deleting live_page_bundles and clearing in-memory cache forces multi-trip discovery again
      await driver.query("DELETE FROM live_page_bundles", []);
      clearKeptLivePages(driver);
      const afterDelete = await liveRenderPage(driver, "Home", boot, {
        keep: true,
        persistBundles: false,
      });
      expect(afterDelete.status).toBe(200);
      expect(afterDelete.stats.round_trips).toBeGreaterThan(1);
    } finally {
      driver.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("verifies schema, 17-column projection, trigger parity, and executes Ruby DDL + triggers against live SQLite", async () => {
    const bundleRb = readFileSync(
      join(repoRoot, "ruby/card-mod-batched-nests/lib/card/cache/live_page_bundle.rb"),
      "utf8",
    );
    const watermarkRb = readFileSync(
      join(repoRoot, "ruby/card-mod-batched-nests/lib/card/rule/lazy_watermark.rb"),
      "utf8",
    );
    const installerRb = readFileSync(
      join(repoRoot, "ruby/card-mod-batched-nests/lib/cardio/batched_nests.rb"),
      "utf8",
    );

    // 1. Exact 17-column parity with TypeScript CARDS_COLUMNS
    const colsBlock = /CARDS_COLUMNS\s*=\s*%w\[([\s\S]*?)\]\.freeze/.exec(bundleRb);
    expect(colsBlock).not.toBeNull();
    const rubyCols = colsBlock![1]!.trim().split(/\s+/);
    expect(rubyCols).toEqual([...CARDS_COLUMNS]);

    // 2. Exact 6-table parity with FRESHNESS_STAMPED_TABLES and 0010-deck-data-version-all-card-tables.sql
    const tablesBlock = /FRESHNESS_STAMPED_TABLES\s*=\s*%w\[([\s\S]*?)\]\.freeze/.exec(bundleRb);
    expect(tablesBlock).not.toBeNull();
    const rubyStampedTables = tablesBlock![1]!.trim().split(/\s+/);
    expect(rubyStampedTables).toEqual([...FRESHNESS_STAMPED_TABLES]);

    const migration0010 = readFileSync(
      join(repoRoot, "deploy/migrations/0010-deck-data-version-all-card-tables.sql"),
      "utf8",
    );
    const sql0010Tables = [
      ...new Set(
        [...migration0010.matchAll(/AFTER\s+(?:INSERT|UPDATE|DELETE)\s+ON\s+"([^"]+)"/g)].map((m) => m[1]!),
      ),
    ];
    expect(sql0010Tables.sort()).toEqual([...FRESHNESS_STAMPED_TABLES].sort());

    const sql0010Triggers = [
      ...migration0010.matchAll(/CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"/g),
    ].map((m) => m[1]!);
    const expected18Triggers = FRESHNESS_STAMPED_TABLES.flatMap((t) =>
      (["ins", "upd", "del"] as const).map((op) => `${t}_bump_deck_data_version_${op}`),
    );
    expect(sql0010Triggers.sort()).toEqual([...expected18Triggers].sort());

    // 3. Uses Card.cache&.temp / .store and Card::Rule.clear_read_rule_cache (never non-existent methods)
    expect(bundleRb).toContain("Card.cache&.temp");
    expect(bundleRb).not.toContain("Card.cache.local");
    expect(bundleRb).not.toContain(":@hash");
    expect(watermarkRb).toContain("Card::Rule.clear_read_rule_cache");
    expect(watermarkRb).not.toContain("expire_read_rule_cache");

    // 4. Installs all 6 live_page_bundles invalidation triggers and CQL QueryWhere hook
    for (const trig of [
      "trg_live_page_bundles_card_ins",
      "trg_live_page_bundles_card_upd",
      "trg_live_page_bundles_card_del",
      "trg_live_page_bundles_ref_ins",
      "trg_live_page_bundles_ref_upd",
      "trg_live_page_bundles_ref_del",
    ]) {
      expect(bundleRb).toContain(trig);
    }
    expect(watermarkRb).toContain("def raise_read_rule_flag!");
    expect(watermarkRb).toContain("def reconcile_read_rule_if_stale!");
    expect(watermarkRb).toContain("def compact_pending_rule_flags!");
    expect(installerRb).toContain('"Card::Set::Right::Read" => Card::Rule::LazyWatermark::ReadRuleSaveHook');
    expect(installerRb).toContain('"Card::Set::All::Permissions" => Card::Rule::LazyWatermark::ReadRuleReaderHook');
    expect(installerRb).toContain("Card::Query::SqlStatement::Where.prepend Card::Rule::LazyWatermark::QueryWhere");

    // 5. Execute the actual SQL DDL, LOAD_SQL, and triggers extracted from Ruby against a real SQLite deck
    const root = mkdtempSync(join(tmpdir(), "decko-ruby-sql-exec-"));
    copyFileSync(
      join(repoRoot, "reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3"),
      join(root, "deck.sqlite3"),
    );
    const driver = new LocalSqliteDriver({ path: join(root, "deck.sqlite3") });
    try {
      const loadSqlMatch = /LOAD_SQL\s*=\s*<<~SQL\.squish\.freeze\s*([\s\S]*?)\s*SQL/.exec(bundleRb);
      expect(loadSqlMatch).not.toBeNull();
      const loadSql = loadSqlMatch![1]!.replace(/\s+/g, " ").trim();

      // Execute Ruby's ensure_live_page_bundle_schema! and ensure_rule_flags_schema! blocks
      for (const match of bundleRb.matchAll(/conn\.execute\s+<<~SQL\s*([\s\S]*?)\s*SQL/g)) {
        const rawSql = match[1]!;
        if (rawSql.includes("#{table}")) {
          for (const table of rubyStampedTables) {
            for (const [op, event] of [
              ["ins", "INSERT"],
              ["upd", "UPDATE"],
              ["del", "DELETE"],
            ] as const) {
              const expanded = rawSql
                .replaceAll("#{table}", table)
                .replaceAll("#{op}", op)
                .replaceAll("#{event}", event);
              await driver.query(expanded, []);
            }
          }
        } else {
          await driver.query(rawSql, []);
        }
      }
      await driver.query('INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0)', []);
      await driver.query('UPDATE "deck_data_version" SET "version" = 0 WHERE "id" = 1', []);

      for (const match of watermarkRb.matchAll(/conn\.execute\s+<<~SQL\s*([\s\S]*?)\s*SQL/g)) {
        const rawSql = match[1]!.replaceAll("#{DEFAULT_COMPACTION_INTERVAL_MS}", "2592000000");
        await driver.query(rawSql, []);
      }

      // Seed a bundle at current version (0)
      await driver.query(
        "INSERT OR REPLACE INTO live_page_bundles (keep_key, page_key, stamp, payload_json) VALUES (?, ?, ?, ?)",
        ["|home||{}|false|{}", "home", 0, '{"v":2,"store":{"fullRows":[]}}'],
      );

      // Verify Ruby's LOAD_SQL returns the bundle and latest_rule_epoch = 0 in 1 query
      const loadRes1 = await driver.query<{
        version: number;
        home_mark: string;
        sub_json: string | null;
        payload_json: string | null;
        latest_rule_epoch: number;
      }>(loadSql, ["__SUBSTRATE__:", "|home||{}|false|{}"]);
      expect(loadRes1.rows[0]?.version).toBe(0);
      expect(loadRes1.rows[0]?.payload_json).toContain('"v":2');
      expect(loadRes1.rows[0]?.latest_rule_epoch).toBe(0);

      // A pure no-op UPDATE on cards (where all 9 content/identity columns and read_rule_id/read_rule_class
      // are unchanged) must preserve both live_page_bundles and deck_data_version even when deck_rule_flags is empty
      await driver.query("UPDATE cards SET name = name WHERE id = 1", []);
      const loadResNoop = await driver.query<{
        version: number;
        payload_json: string | null;
        latest_rule_epoch: number;
      }>(loadSql, ["__SUBSTRATE__:", "|home||{}|false|{}"]);
      expect(loadResNoop.rows[0]?.version).toBe(0);
      expect(loadResNoop.rows[0]?.payload_json).toContain('"v":2');
      expect(loadResNoop.rows[0]?.latest_rule_epoch).toBe(0);

      // When deck_rule_flags is EMPTY, changing read_rule_id on a card MUST invalidate live_page_bundles and bump deck_data_version
      await driver.query("DELETE FROM deck_rule_flags", []);
      await driver.query(
        "UPDATE cards SET read_rule_id = COALESCE(read_rule_id, 0) + 1 WHERE id = 1",
        [],
      );
      const loadResEmptyFlags = await driver.query<{
        version: number;
        payload_json: string | null;
      }>(loadSql, ["__SUBSTRATE__:", "|home||{}|false|{}"]);
      expect(loadResEmptyFlags.rows[0]?.version).toBe(1);
      expect(loadResEmptyFlags.rows[0]?.payload_json).toBeNull();

      // Re-seed bundle at version = 1 before testing lazy rule flag preservation
      await driver.query(
        "INSERT OR REPLACE INTO live_page_bundles (keep_key, page_key, stamp, payload_json) VALUES (?, ?, ?, ?)",
        ["|home||{}|false|{}", "home", 1, '{"v":2,"store":{"fullRows":[]}}'],
      );

      // Raise a lazy rule flag in deck_rule_flags, then update ONLY read_rule_id/read_rule_class on a card
      await driver.query(
        `INSERT INTO deck_rule_flags (rule_id, set_id, pattern_code, anchor_id, anchor_left_id, anchor_right_id, anchor_key, is_delete, created_at)
         VALUES (10, 5, 'all', NULL, NULL, NULL, NULL, 0, '2026-11-08T00:00:00Z')`,
        [],
      );
      await driver.query(
        "UPDATE cards SET read_rule_id = COALESCE(read_rule_id, 0) + 1, read_rule_class = 'Type' WHERE id = 1",
        [],
      );

      // Because deck_rule_flags is non-empty and only read_rule_id/read_rule_class changed,
      // trg_live_page_bundles_card_upd must preserve live_page_bundles AND deck_data_version!
      const loadRes2 = await driver.query<{
        version: number;
        payload_json: string | null;
        latest_rule_epoch: number;
      }>(loadSql, ["__SUBSTRATE__:", "|home||{}|false|{}"]);
      expect(loadRes2.rows[0]?.version).toBe(1);
      expect(loadRes2.rows[0]?.payload_json).toContain('"v":2');
      expect(loadRes2.rows[0]?.latest_rule_epoch).toBe(1);

      // Updating db_content MUST bump deck_data_version and delete live_page_bundles
      await driver.query("UPDATE cards SET db_content = db_content || ' ' WHERE id = 1", []);
      const loadRes3 = await driver.query<{
        version: number;
        payload_json: string | null;
      }>(loadSql, ["__SUBSTRATE__:", "|home||{}|false|{}"]);
      expect(loadRes3.rows[0]?.version).toBe(2);
      expect(loadRes3.rows[0]?.payload_json).toBeNull();

      // Re-seed bundle at version = 2 and verify payload-only column updates
      // (references_expired and current_revision_id, S1) ALSO invalidate live_page_bundles
      // and bump deck_data_version even while deck_rule_flags is non-empty!
      await driver.query(
        "INSERT OR REPLACE INTO live_page_bundles (keep_key, page_key, stamp, payload_json) VALUES (?, ?, ?, ?)",
        ["|home||{}|false|{}", "home", 2, '{"v":2,"store":{"fullRows":[]}}'],
      );
      await driver.query("UPDATE cards SET references_expired = 1 WHERE id = 1", []);
      const loadResRefExp = await driver.query<{
        version: number;
        payload_json: string | null;
      }>(loadSql, ["__SUBSTRATE__:", "|home||{}|false|{}"]);
      expect(loadResRefExp.rows[0]?.version).toBe(3);
      expect(loadResRefExp.rows[0]?.payload_json).toBeNull();

      await driver.query(
        "INSERT OR REPLACE INTO live_page_bundles (keep_key, page_key, stamp, payload_json) VALUES (?, ?, ?, ?)",
        ["|home||{}|false|{}", "home", 3, '{"v":2,"store":{"fullRows":[]}}'],
      );
      await driver.query(
        "UPDATE cards SET current_revision_id = COALESCE(current_revision_id, 0) + 1 WHERE id = 1",
        [],
      );
      const loadResRev = await driver.query<{
        version: number;
        payload_json: string | null;
      }>(loadSql, ["__SUBSTRATE__:", "|home||{}|false|{}"]);
      expect(loadResRev.rows[0]?.version).toBe(4);
      expect(loadResRev.rows[0]?.payload_json).toBeNull();

      // Verify all 15 non-rule payload columns are guarded in all 3 DDL sources (0015, Ruby, live-render.ts)
      const sql0015 = readFileSync(join(repoRoot, "deploy/migrations/0015-live-page-bundles.sql"), "utf-8");
      const liveRenderTs = readFileSync(join(repoRoot, "src/card/live/live-render.ts"), "utf-8");
      const nonRuleCols = CARDS_COLUMNS.filter((c) => c !== "read_rule_id" && c !== "read_rule_class");
      expect(nonRuleCols).toHaveLength(15);
      for (const col of nonRuleCols) {
        const quotedOrPlain = col === "key" ? 'OLD."key" IS NEW."key"' : `OLD.${col} IS NEW.${col}`;
        expect(sql0015).toContain(quotedOrPlain);
        expect(bundleRb).toContain(quotedOrPlain);
        expect(liveRenderTs).toContain(quotedOrPlain);
      }

      // Verify Ruby orphan delta safeguard (S5), bounded compaction batching (C1/S3), and post-compaction healing (S2)
      expect(bundleRb).toContain("valid_substrate_bundle?");
      expect(watermarkRb).toContain("SEARCH_COMPACTION_BATCH_SIZE");
      expect(watermarkRb).toContain("refresh_card_read_rule_from_db!");

      // Verify C1 & M3: runtime *read rule flag insertion purges L3 edge_render_cache / decko_edge_render_cache
      // via trg_edge_render_cache_rule_flag_ins (present across all 3 DDL sources: 0015, Ruby, live-render.ts)
      // and advances readEdgeCacheStamp even when deck_data_version is flat
      expect(sql0015).toContain('CREATE TRIGGER IF NOT EXISTS "trg_edge_render_cache_rule_flag_ins"');
      expect(bundleRb).toContain("trg_edge_render_cache_rule_flag_ins");
      expect(liveRenderTs).toContain("trg_edge_render_cache_rule_flag_ins");
      const { readEdgeCacheStamp } = await import("../../deploy/src/worker-edge-cache.js");
      await driver.query(
        "INSERT INTO edge_render_cache (cache_key, stamp, status, content_type, body, updated_at) VALUES ('k1', 4, 200, 'text/html', '<p>anon</p>', 1000)",
        [],
      );
      await driver.query(
        "INSERT INTO decko_edge_render_cache (url, epoch, content_type, body, stored_at) VALUES ('https://deck.test/Home', 0, 'text/html', '<p>anon</p>', 1000)",
        [],
      );
      const stampBeforeRule = await readEdgeCacheStamp(driver);
      expect(stampBeforeRule).toBe(5); // version (4) + rule_epoch (1)
      await driver.query(
        "INSERT INTO deck_rule_flags (rule_id, set_id, pattern_code, is_delete, created_at) VALUES (200, 100, 'all', 0, '2026-11-09T04:00:00Z')",
        [],
      );
      const stampAfterRule = await readEdgeCacheStamp(driver);
      expect(stampAfterRule).toBe(6); // version (4) + rule_epoch (2)
      const cfL3Count = await driver.query<{ c: number }>("SELECT COUNT(*) AS c FROM edge_render_cache", []);
      const bunnyL3Count = await driver.query<{ c: number }>("SELECT COUNT(*) AS c FROM decko_edge_render_cache", []);
      expect(cfL3Count.rows[0]?.c).toBe(0);
      expect(bunnyL3Count.rows[0]?.c).toBe(0);

      // Verify M9: README.md CF bundle size figures are self-consistent across the whole file
      const readmeMd = readFileSync(join(repoRoot, "README.md"), "utf-8");
      expect(readmeMd).not.toContain("1,326,530");
    } finally {
      driver.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
