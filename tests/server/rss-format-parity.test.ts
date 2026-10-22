// The rss FORMAT, measured against the PINNED MOD's own rss format class,
// the PINNED MOD's own rss set block, and the PINNED DECK's own answer for
// the rss suffix.
//
// The completeness register's D3 row ([Family]) is the rss format, and the
// register's own port evidence says the port answered rss on the edge host
// only. This file measures the PINNED side (what the rss format IS, and
// what the pinned deck answers for an rss request) and the port's own
// engine-level rss answer.
//
// fixtures/captured/rss-format-ruby-oracle.json is what
// tests/server/oracle-capture-rss-format-ruby.rb recorded by loading the
// PINNED MOD's own format files (the rss class body), the PINNED mod's own
// config file, the PINNED rss set block (class_eval'd onto a probe that
// SUBCLASSES the pinned rss format class), and the PINNED DECK's own
// format_name_from_params.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE RSS FORMAT DECLARES NO MIME TYPE OF ITS OWN. Its class is
//      three lines: `class RssFormat < HtmlFormat` and `register :rss`.
//      The mime type it answers is therefore HtmlFormat's, and the capture
//      records the OWNER of the method as well as its answer, because the
//      owner is what settles the claim.
//   2. THE STOCK ANSWER TO A FEED REQUEST IS A SENTENCE. The :feed view's
//      own body opens with `return "RSS feeds disabled" unless
//      Cardio.config.rss_enabled`, and the config default is FALSE
//      (card-mod-format-0.20.0/lib/card/mod/format.rb:3), so the body is
//      EXECUTED here and answers that sentence.
//   3. THE SHOW ARM'S DEFAULT VIEW IS :feed, and the rss suffix is a
//      REGISTERED format, so the pinned deck answers :rss for it (the
//      counter-example to the file sender an unregistered suffix gets).
//
// THE PORT'S ANSWER, and the ONE DIVERGENCE this row names:
//
//   The port answers a feed request with the feed's OWN content type,
//   application/rss+xml, on both hosts. The pinned format's own mime type
//   is text/html, inherited from HtmlFormat, and the pinned deck's respond
//   (decko-0.20.0/lib/card_controller/response.rb:17) serves the format's
//   mime type as the content type. So the port's content type and the
//   pinned format's mime type are NOT the same string. The divergence is
//   NAMED and left as it is: the port serves a feed under the feed's own
//   media type, and the pinned format declares none of its own.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import {
  RSS_DISABLED_BYTES,
  renderFormatShow,
} from "../../src/card/render/format-families.js";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/rss-format-ruby-oracle.json"), "utf8"),
) as {
  registry: { registered: string[]; mimeTypes: Record<string, string> };
  rssFormat: {
    registered: boolean;
    superclass: string;
    superclassIsHtmlFormat: boolean;
    mimeType: string;
    mimeTypeOwner: string;
    declaresItsOwnMimeType: boolean;
    htmlMimeType: string;
    baseMimeType: string;
    registryMimeType: string;
  };
  config: { rssEnabled: boolean; defaultHtmlView: string };
  show: Array<{
    label: string;
    returned: string;
    calls: Array<{ ask: string; view?: string }>;
  }>;
  feed: Array<{
    label: string;
    answer?: string;
    answerKind?: string;
    containsErrorMarker?: boolean;
    rescuedErrorClass?: string;
  }>;
  viewDeclarations: Array<{ name: string; aliases: string[]; opts: Record<string, string> }>;
  negotiation: Array<{
    label: string;
    requestedFormat: string;
    formatNameFromParams: string;
  }>;
};

const negotiationByLabel = (label: string) => {
  const row = ORACLE.negotiation.find((entry) => entry.label === label);
  if (!row) throw new Error(`the oracle has no negotiation row named ${label}`);
  return row;
};

const feedByLabel = (label: string) => {
  const row = ORACLE.feed.find((entry) => entry.label === label);
  if (!row) throw new Error(`the oracle has no feed row named ${label}`);
  return row;
};

describe("the rss format, against the pinned mod and the pinned deck", () => {
  it("the rss format is registered and inherits HtmlFormat", () => {
    expect(ORACLE.registry.registered).toContain("rss");
    expect(ORACLE.rssFormat.registered).toBe(true);
    expect(ORACLE.rssFormat.superclassIsHtmlFormat).toBe(true);
    expect(ORACLE.rssFormat.superclass).toBe("Card::Format::HtmlFormat");
  });

  it("the rss format DECLARES NO MIME TYPE OF ITS OWN, and the one it answers is text/html", () => {
    expect(ORACLE.rssFormat.declaresItsOwnMimeType).toBe(false);
    // The OWNER is the measurement: the method the rss format answers is
    // the html format's, and the base's own is text/plain.
    expect(ORACLE.rssFormat.mimeTypeOwner).toBe("Card::Format::HtmlFormat");
    expect(ORACLE.rssFormat.mimeType).toBe("text/html");
    expect(ORACLE.rssFormat.htmlMimeType).toBe("text/html");
    expect(ORACLE.rssFormat.baseMimeType).toBe("text/plain");
    expect(ORACLE.registry.mimeTypes["rss"]).toBe("text/html");
  });

  it("the config default is the pinned mod's own file, and the feeds are OFF", () => {
    expect(ORACLE.config.rssEnabled).toBe(false);
    expect(ORACLE.config.defaultHtmlView).toBe("titled");
  });

  it("the show arm's default view is :feed", () => {
    const row = ORACLE.show.find((entry) => entry.label === "no view named: the default is :feed");
    expect(row?.calls.find((ask) => ask.ask === "render!")?.view).toBe(":feed");
    const named = ORACLE.show.find((entry) => entry.label === "a view named");
    expect(named?.calls.find((ask) => ask.ask === "render!")?.view).toBe(":open");
  });

  it("the :feed body answers the stock sentence with the feeds off", () => {
    const stock = feedByLabel("the stock config value (rss_enabled false)");
    expect(stock.answer).toBe("RSS feeds disabled");
    // With the gate open the body builds the feed document, and the
    // pinned rescue catches the missing inner render.
    const open = feedByLabel("the gate open (rss_enabled true)");
    expect(open.answerKind).toBe("xml-document");
    expect(open.containsErrorMarker).toBe(true);
    expect(open.rescuedErrorClass).toBe("NameError");
  });

  it("the rss suffix is a REGISTERED format, so the pinned deck answers :rss", () => {
    expect(negotiationByLabel("the rss suffix").formatNameFromParams).toBe("rss");
    expect(negotiationByLabel("the rss query door").formatNameFromParams).toBe("rss");
    // An unregistered suffix is the file sender, which is what makes the
    // rss row the counter-example to that arm.
    expect(negotiationByLabel("an unregistered suffix").formatNameFromParams).toBe("file");
  });
});

describe("the port's rss answer, against the pinned answers", () => {
  let storage: RenderTestStorage;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
    await seedCard(storage, { id: 800, name: "Alpha", typeId: 2, dbContent: "alpha body" });
    storage.fetcher.installNameEnvironment();
  });

  afterAll(() => {
    storage?.close();
  });

  it("the port's own disabled-feed sentence is the PINNED stock answer, byte for byte", () => {
    expect(RSS_DISABLED_BYTES).toBe("RSS feeds disabled");
    expect(RSS_DISABLED_BYTES).toBe(feedByLabel("the stock config value (rss_enabled false)").answer);
  });

  it("the port's own rss show answers that sentence with the stock config value", async () => {
    // The same call both hosts make: the engine's own renderFormatShow
    // with rssEnabled false, which is the stock default.
    const body = await renderFormatShow(
      {
        fetchRenderCard: (name: string) => storage.engine.fetchRenderCard(name),
        prepareItemForRender: (name: string) => storage.engine.prepareItemForRender(name),
        render: (name: string, view: string) => storage.engine.render(name, view),
        codenameById: (id: number) => storage.fetcher.codenames.nameForId(id),
      },
      "Alpha",
      "rss",
      { rssEnabled: false },
    );
    expect(body).toBe("RSS feeds disabled");
  });

  it("the port's own read grammar puts the rss format behind the .rss suffix and the query door", () => {
    const suffix = parsePath("/Alpha.rss") as { name: string; view: string; format?: string };
    expect(suffix.name).toBe("Alpha");
    // The feed is the only default shape (rss.rb:10-13's `view ||= :feed`).
    expect(suffix.view).toBe("feed");
    expect(suffix.format).toBe("rss");
    // The query door is the same request.
    const query = parsePath("/Alpha", new URLSearchParams("format=rss")) as {
      name: string;
      view: string;
      format?: string;
    };
    expect(query.name).toBe("Alpha");
    expect(query.view).toBe("feed");
    expect(query.format).toBe("rss");
  });

  it("the port's own read grammar keeps a DEEP path off the rss arm", () => {
    // rss rides a MARK or a MARK+VIEW; a deeper path is
    // engine_routes.rb:54's wildcard, whatever its last segment or query
    // says.
    const deep = parsePath("/one/two/three.rss") as { kind?: string };
    expect(deep.kind).toBe("wildcard");
    const deepQuery = parsePath("/one/two/three", new URLSearchParams("format=rss")) as {
      kind?: string;
    };
    expect(deepQuery.kind).toBe("wildcard");
  });
});
