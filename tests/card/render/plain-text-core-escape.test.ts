// PlainText-type core escapes html entities - the census
// "html-entity-escape" singleton (page 19562 angieup, census receipt
// brandonDojoTech/tmp/wrong-goal-hunt/page-mechanism-census.md: the
// +source_title content-view renders "Son, It&#39;s Okay If You
// Don&#39;t Get Laid Tonight" in the oracle, raw apostrophes in ours).
//
// Mechanism: card-mod-format set/type/plain_text.rb:6-8
//   `view :core do process_content CGI.escapeHTML(_render_raw) end`
// - the raw content is html-escaped (CGI.escapeHTML: & < > " ') BEFORE
// process_content, so plain-text apostrophes carry as &#39;. The port's
// core dispatch had no plain_text branch (card-mod-format.ts:1111
// documented the gap: "Not ported: rails (CGI.escapeHTML)"), so the
// default core path emitted the raw bytes.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

async function seedPlainTextDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 20, name: "PlainText", codename: "plain_text", typeId: 2 });
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(storage, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(storage, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(storage, { id: 910, leftId: 900, rightId: 901, typeId: 2, dbContent: "Probe Layout" });
  await seedCard(storage, { id: 911, name: "Probe Layout", typeId: 2, dbContent: "{{_main|titled}}" });
  // The angieup+source_title shape: a PlainText-typed card whose content
  // carries apostrophes (and an ampersand for the escape-order pin).
  await seedCard(storage, {
    id: 9000,
    name: "Escape Probe Source Title",
    typeId: 20,
    dbContent: "Son, It's Okay If You Don't Get Laid Tonight & more",
  });
  await seedCard(storage, {
    id: 9001,
    name: "Escape Probe Page",
    typeId: 2,
    dbContent: "{{Escape Probe Source Title|content}}",
  });
  await storage.fetcher.codenames.ensureLoaded();
  return storage;
}

describe("PlainText core escapes CGI.escapeHTML entities before process_content", () => {
  it("renders &#39; for apostrophes and &amp; for ampersands", async () => {
    const storage = await seedPlainTextDeck();
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Escape Probe Page");
    expect(page).toContain("Son, It&#39;s Okay If You Don&#39;t Get Laid Tonight &amp; more");
    expect(page).not.toContain("Son, It's Okay If You Don't Get Laid Tonight & more");
  });
});
