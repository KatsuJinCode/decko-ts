import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serveFontAwesomeAsset } from "../../src/server/font-awesome-assets.js";
import { configureFontAwesomeMode, FONT_AWESOME_ASSET_PREFIX, fontAwesomeHeadTag } from "../../src/card/render/font-awesome.js";
import { handleBunnyEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-handler.js";
import { serveBootstrapFontAsset } from "../../src/server/bootstrap-font-assets.js";

const provenance = JSON.parse(readFileSync(new URL("../../vendor/fontawesome-free-6.7.2/provenance.json", import.meta.url), "utf8"));
describe("pinned self-hosted Font Awesome assets", () => {
  it("preserves the stock kit unless local deployment mode is explicit", () => {
    expect(fontAwesomeHeadTag()).toContain("kit.fontawesome.com/1366963381.js");
    expect(fontAwesomeHeadTag("local")).toContain(`${FONT_AWESOME_ASSET_PREFIX}css/all.min.css`);
    expect(fontAwesomeHeadTag("local")).not.toContain("kit.fontawesome");
    expect(configureFontAwesomeMode(undefined)).toBeUndefined();
    expect(() => configureFontAwesomeMode("typo")).toThrow();
  });
  it("serves exact official CSS and every referenced font through the real Bunny handler without DB access", async () => {
    for (const file of provenance.files.filter((file: { path: string }) => file.path !== "LICENSE.txt")) {
      const response = await handleBunnyEngineRequest(new Request(`https://local.test${FONT_AWESOME_ASSET_PREFIX}${file.path}`), {});
      expect(response.status).toBe(200);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.byteLength).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
      expect(response.headers.get("content-type")).toMatch(file.path.endsWith(".css") ? /^text\/css/ : /^font\//);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
    const css = await serveFontAwesomeAsset(new Request(`https://local.test${FONT_AWESOME_ASSET_PREFIX}css/all.min.css`))!.text();
    for (const [, resource] of css.matchAll(/url\(\.\.\/([^)]+)\)/g)) {
      expect(provenance.files.some((file: { path: string }) => file.path === resource)).toBe(true);
    }
  });
  it("supports HEAD and rejects missing, encoded aliases and writes", () => {
    const request = (path: string, method = "GET") => new Request(`https://local.test${FONT_AWESOME_ASSET_PREFIX}${path}`, { method });
    const head = serveFontAwesomeAsset(request("css/all.min.css", "HEAD"))!;
    expect(head.status).toBe(200);
    expect(Number(head.headers.get("content-length"))).toBeGreaterThan(0);
    expect(head.body).toBeNull();
    expect(serveFontAwesomeAsset(request("webfonts/missing.woff2"))!.status).toBe(404);
    expect(serveFontAwesomeAsset(request("css/%61ll.min.css"))!.status).toBe(404);
    expect(serveFontAwesomeAsset(request("css/all.min.css", "POST"))!.status).toBe(405);
    expect(serveFontAwesomeAsset(new Request("https://local.test/mod/unrelated.js"))).toBeUndefined();
  });
  it("serves the exact stock Bootstrap WOFF/WOFF2 referenced by compiled CSS", async () => {
    const stock = JSON.parse(readFileSync(new URL("../../vendor/decko-bootstrap-fonts/provenance.json", import.meta.url), "utf8"));
    for (const file of stock.files) {
      const url = `https://local.test/mod/bootstrap/fonts/${file.path.split("/").at(-1)}?24e3eb84d0bcaf83d77f904c78ac1f47`;
      const response = await handleBunnyEngineRequest(new Request(url), {});
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/^font\/woff2?$/);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.length).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
      expect(serveBootstrapFontAsset(new Request(url, { method: "HEAD" }))!.body).toBeNull();
      expect(serveBootstrapFontAsset(new Request(url, { method: "POST" }))!.status).toBe(405);
    }
    expect(serveBootstrapFontAsset(new Request("https://local.test/mod/bootstrap/fonts/other.woff2"))).toBeUndefined();
  });
});
