// The Workers write surface's HTML error-page emitter — the src/server
// sibling of the root worker's error-page escape pin
// (tests/deploy/root-worker-error-page-escape.test.ts): plainText
// interpolates title and message into <title>, <h1>
// and <p>, and the message slot is one careless call away from embedding a
// requested name or an engine error's raw text — the same reflected-XSS
// shape that hole had. Every current call site passes fixed literals, so
// the pin drives the emitter directly: a hostile payload must land as
// inert text in every slot it reaches.

import { describe, expect, it } from "vitest";

import { plainText } from "../../src/server/cloudflare-write-routes.js";

const PAYLOAD = `<img src=x onerror=alert(1)>`;

describe("the write surface's HTML error pages entity-escape what they interpolate", () => {
  it("a hostile title and message land as inert text, not executable markup", () => {
    const page = plainText(500, PAYLOAD, `<script>alert("x&y")</script>`);
    expect(page.headers["Content-Type"]).toContain("text/html");
    // each slot carries the entities, ampersands escaped first ...
    expect(page.body).toContain(`<title>&lt;img src=x onerror=alert(1)&gt;</title>`);
    expect(page.body).toContain(`<h1>&lt;img src=x onerror=alert(1)&gt;</h1>`);
    expect(page.body).toContain(`<p>&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;</p>`);
    // ... and no raw markup from either slot survives into the page
    expect(page.body).not.toContain("<img");
    expect(page.body).not.toContain("<script");
  });
});
