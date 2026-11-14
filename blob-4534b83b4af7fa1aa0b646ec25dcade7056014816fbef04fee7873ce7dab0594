// Instrument controls in a real headless browser, not Decko acceptance.
import test from "node:test";
import assert from "node:assert/strict";
import { launchBrowser } from "../lib/launch.mjs";
import { editorReady, richEditorsReady } from "../lib/editor-ready.mjs";
import { loadEngine, startEngine } from "../lib/engines.mjs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("plain inputs are immediate and an uninitialized rich editor fails closed", async () => {
  const browser = await launchBrowser();
  try {
    const page = browser.context.pages()[0];
    await page.setContent('<input name="card[content]" value="12">');
    await page.waitForFunction(editorReady, ["card[content]"], { timeout: 500 });
    await page.waitForFunction(richEditorsReady, null, { timeout: 500 });
    await page.setContent('<textarea id="rich" class="tinymce-textarea" name="card[content]">prior content</textarea>');
    await page.evaluate(() => { window.tinyMCE = { get: () => ({ initialized: false, getBody: () => document.body }) }; });
    await assert.rejects(page.waitForFunction(editorReady, ["card[content]"], { timeout: 250 }));
    await assert.rejects(page.waitForFunction(richEditorsReady, null, { timeout: 250 }));
    assert.equal(await page.locator("textarea").inputValue(), "prior content");
    await page.evaluate(() => { window.tinyMCE = { get: () => ({ initialized: true, getBody: () => document.body }) }; });
    await page.waitForFunction(editorReady, ["card[content]"], { timeout: 500 });
    // Empty content / disabled statusbar still has a usable initialized editor.
    assert.equal(await page.locator(".tox-statusbar__path-item").count(), 0);
    await page.waitForFunction(richEditorsReady, null, { timeout: 500 });
  } finally { await browser.close(); }
});

test("an unavailable mod provider fails host admission before a browser can save", async () => {
  const repo = fileURLToPath(new URL("../../..", import.meta.url));
  const root = mkdtempSync(path.join(os.tmpdir(), "decko-editor-admission-"));
  const logFile = path.join(root, "host.log");
  const engine = loadEngine(path.join(repo, "reference-harness/browser/engines/ts.json"));
  try {
    await assert.rejects(startEngine({ ...engine, env: { DECKO_MOD_PUBLIC_DIR: path.join(root, "missing-provider") } }, path.join(repo, "reference-harness/fixtures/synthetic-v1"), { logFile }), /exited with 1 before it was ready/);
    assert.match(readFileSync(logFile, "utf8"), /DECKO_MOD_PUBLIC_DIR has no mod\/ directory/);
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.equal(path.basename(root).startsWith("decko-editor-admission-"), true);
    rmSync(root, { recursive: true, force: true });
  }
});
