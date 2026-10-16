import { describe, expect, it } from "vitest";
import { applyFontAwesomeAssetConfiguration as apply, fontAwesomeHeadTag, STOCK_FONT_AWESOME_TAG } from "../../src/card/render/font-awesome.js";
import { resolveServedEnvironmentDeltas, servedBootOptionsFromEnv } from "../../deploy/bunny-worker-src/bunny-edge-served-deltas.js";
import { applyServedEnvironmentDeltas } from "../../deploy/bunny-worker-src/bunny-edge-page-shell.js";

describe("configured stock kit in custom and fresh-render heads", () => {
  it("preserves stock bytes and routes explicit mode into request-local boot options", () => {
    expect(apply(STOCK_FONT_AWESOME_TAG)).toBe(STOCK_FONT_AWESOME_TAG);
    expect(servedBootOptionsFromEnv({ DECKO_FONT_AWESOME: "local" })).toMatchObject({ fontAwesomeAssetMode: "local" });
    expect(servedBootOptionsFromEnv({ DECKO_FONT_AWESOME: "stock" })).not.toHaveProperty("fontAwesomeAssetMode");
    expect(() => servedBootOptionsFromEnv({ DECKO_FONT_AWESOME: "typo" })).toThrow();
  });
  it("configures all actual stock script elements, regardless of attribute layout", () => {
    const tag = "<SCRIPT async src='https://kit.fontawesome.com/1366963381.js' crossorigin=anonymous></SCRIPT>";
    expect(apply(tag + STOCK_FONT_AWESOME_TAG, "local")).toBe(fontAwesomeHeadTag("local").repeat(2));
    expect(applyServedEnvironmentDeltas(`<html>${tag}</html>`, resolveServedEnvironmentDeltas({ DECKO_FONT_AWESOME: "local" }))).not.toContain("kit.fontawesome.com");
  });
  it("does not rewrite comments, inline script strings, data-src, other kits or textual URLs", () => {
    for (const html of [
      `<!-- ${STOCK_FONT_AWESOME_TAG} -->`,
      `<script>const x = '${STOCK_FONT_AWESOME_TAG}';</script>`,
      '<script data-src="https://kit.fontawesome.com/1366963381.js"></script>',
      '<script src="https://kit.fontawesome.com/another.js"></script>',
      'https://kit.fontawesome.com/1366963381.js',
    ]) expect(apply(html, "local")).toBe(html);
  });
});
import { bootEdgeServingEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureFreshnessStamp } from "../../src/server/freshness-stamp.js";
import { renderPageWithStatus } from "../../src/card/render/page.js";

it("boots a new real engine with configured local assets and renders its page head", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "decko-font-boot-"));
  const db = join(scratch, "deck.sqlite3");
  copyFileSync("reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3", db);
  const driver = new LocalSqliteDriver({ path: db });
  try {
    await ensureFreshnessStamp(driver);
    const engine = await bootEdgeServingEngines(driver, servedBootOptionsFromEnv({ DECKO_FONT_AWESOME: "local" }));
    expect(engine.render.fontAwesomeAssetMode).toBe("local");
    const page = await renderPageWithStatus(engine.render, "Home");
    expect(page.status).toBe(200);
    expect(page.html).toContain("/mod/bootstrap/fontawesome-6.7.2/css/all.min.css");
    expect(page.html).not.toContain("kit.fontawesome.com");
  } finally { driver.close(); rmSync(scratch, { recursive: true, force: true }); }
});
