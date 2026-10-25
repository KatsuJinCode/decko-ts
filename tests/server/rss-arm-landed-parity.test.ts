// The rss arm's LANDING on this tree (register-routes D3), bound to a check
// that runs.
//
// The register's D3 row graded the port PARTIAL because "the staging host
// had no rss arm at all, so a .rss suffix was stripped and the html page
// rendered", and its own remaining step was machine-checked at fold time:
// "the canonical tree carries no rss arm at all (a grep of the canonical
// tree for isRssRequest finds no hit)".
//
// THE CHECK THIS FILE MAKES RUNS: the arm's presence on BOTH serving
// hosts is asserted against the port's own sources, so an arm that is
// removed (or a host that stops answering the feed) fails a test instead
// of waiting for the next fold to notice. The arm's own bytes are pinned
// by the row's other tests (tests/server/rss-format-parity.test.ts against
// the capture, and the two host tests over real HTTP), and the ONE
// divergence is pinned here as a divergence.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const read = (relative: string): string => readFileSync(path.join(REPO, relative), "utf8");

describe("the rss arm is LANDED on this tree (D3)", () => {
  it("the staging host carries the arm: the gate, the answer and the dispatch branch", () => {
    const staging = read("vm-staging-server.mjs");
    // The gate (the suffix and the query door, with the segment rule).
    expect(staging).toContain("function isRssRequest(");
    // The answer (the engine's own renderFormatShow(..., "rss")).
    expect(staging).toContain("async function rssFormatResponse(");
    // The dispatch branch, ahead of the html arms.
    expect(staging).toContain("isRssRequest(pathname, url.searchParams)");
  });

  it("the edge host carries the arm: the grammar split and the request core's answer", () => {
    const surface = read("deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts");
    expect(surface).toContain('rawView.endsWith(".rss")');
    const core = read("deploy/bunny-worker-src/bunny-edge-engine-request.ts");
    expect(core).toContain('parsed.format === "rss"');
    expect(core).toContain('"Content-Type": "application/rss+xml; charset=utf-8"');
  });

  it("the port's own grammar answers the feed for the suffix and the query door", () => {
    const suffix = parsePath("/Alpha.rss") as { name: string; view: string; format?: string };
    expect(suffix.name).toBe("Alpha");
    // The feed is the only default shape (rss.rb:10-13's `view ||= :feed`).
    expect(suffix.view).toBe("feed");
    expect(suffix.format).toBe("rss");
    const query = parsePath("/Alpha", new URLSearchParams("format=rss")) as {
      name: string;
      view: string;
      format?: string;
    };
    expect(query.name).toBe("Alpha");
    expect(query.view).toBe("feed");
    expect(query.format).toBe("rss");
  });

  it("the ONE named divergence stays named: the port's content type is the feed's own", () => {
    // The pinned rss format DECLARES NO MIME TYPE OF ITS OWN (its class is
    // three lines: `class RssFormat < HtmlFormat`, `register :rss`), so the
    // mime type it answers is HtmlFormat's, text/html
    // (card-mod-format-0.20.0/lib/card/format/rss_format.rb). The port
    // serves the feed under the feed's own content type
    // (application/rss+xml) on both hosts. Named, with both sides'
    // evidence, and left as it is.
    const staging = read("vm-staging-server.mjs");
    expect(staging).toContain("application/rss+xml");
    const core = read("deploy/bunny-worker-src/bunny-edge-engine-request.ts");
    expect(core).toContain("application/rss+xml");
    // And the pinned side's own answer, from the committed capture.
    const capture = JSON.parse(read("fixtures/captured/rss-format-ruby-oracle.json")) as {
      rssFormat: { declaresItsOwnMimeType: boolean; mimeTypeOwner: string; mimeType: string };
    };
    expect(capture.rssFormat.declaresItsOwnMimeType).toBe(false);
    expect(capture.rssFormat.mimeTypeOwner).toBe("Card::Format::HtmlFormat");
    expect(capture.rssFormat.mimeType).toBe("text/html");
  });
});
