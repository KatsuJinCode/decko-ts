// ServerError's debugger arm (register-routes C14) — card-1.110.0
// lib/card/error.rb:46-59:
//
//     class ServerError < Error
//       def self.view
//         debugger_on? ? :debug_server_error : :server_error
//       end
//       def self.status_code
//         # Errors with status code 900 are displayed as modal instead of
//         # inside the "card-notice" div"
//         debugger_on? ? 900 : 500
//       end
//       def self.debugger_on?
//         Card::Codename[:debugger] && Card[:debugger]&.content =~ /on/
//       end
//
// Before this row the port answered 500/:server_error unconditionally
// (write-routes.ts:1076, the staging server_error arms, the edge's
// renderDeckoServerErrorPage): the :debug_server_error VIEW existed
// (src/card/render/debug-server-error.ts) and nothing could select it, so
// the 900 arm was unreachable on every host.
//
// The predicate's two reads are exercised directly (they are Ruby's two
// expressions and the arms hang off them), and the STATUS is exercised
// through the real edge error builder, because the status is the field an
// operator or a probe outside the isolate can observe.
//
// NOT AN ENV VAR. The gate is a DECK CARD — no DECKO_DEBUGGER, no Rails
// group — because Ruby reads none. A leg below pins that a deck with no
// `debugger` codename is a 500 deck however its content would read, which
// is the codename.rb:37-44 registration test and the `&&` short-circuit in
// front of the fetch.

import { describe, expect, it } from "vitest";
import { createServer, get } from "node:http";

import { renderDeckoServerErrorPage, type ErrorPageDeck } from "../../deploy/bunny-worker-src/bunny-edge-error-page.js";
import {
  DEBUGGER_OFF_ARM,
  DEBUGGER_ON_ARM,
  serverErrorArm,
  type DebuggerCardReader,
} from "../../src/server/server-error-debugger-arm.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

/** The predicate over a fixed pair of answers — Ruby's two reads and
 *  nothing else. `content` may be a throwing thunk, which is how the
 *  "the content read itself fails" leg is expressed. */
function reader(
  hasCodename: boolean,
  content: string | undefined | (() => never),
): DebuggerCardReader {
  return {
    hasDebuggerCodename: () => hasCodename,
    debuggerCardContent: async (): Promise<string | undefined> => {
      if (typeof content === "function") {
        content();
        return undefined;
      }
      return content;
    },
  };
}

describe("ServerError's debugger arm (C14) — the predicate", () => {
  it("no `debugger` codename is the 500 arm, whatever the content says", async () => {
    // `Card::Codename[:debugger]` is the registration test, and `&&` means
    // the card is never fetched when it fails.
    await expect(serverErrorArm(reader(false, "on"))).resolves.toEqual(DEBUGGER_OFF_ARM);
    await expect(serverErrorArm(reader(false, undefined))).resolves.toEqual(DEBUGGER_OFF_ARM);
  });

  it("a registered codename with no stored card is the 500 arm (skip_virtual)", async () => {
    // card_class.rb:42-44 `fetch(*mark, skip_virtual: true)` — a codename
    // alone cannot switch the arm on.
    await expect(serverErrorArm(reader(true, undefined))).resolves.toEqual(DEBUGGER_OFF_ARM);
  });

  it("content matching /on/ is the 900 arm — an UNANCHORED search", async () => {
    // `=~ /on/` is a Ruby regexp search, not a truthiness or equality test.
    // "only" matches because the substring is there; "nothing" does NOT —
    // it has no "on" at any position — and that distinction is the whole
    // reason this is a regexp and not a startsWith.
    await expect(serverErrorArm(reader(true, "on"))).resolves.toEqual(DEBUGGER_ON_ARM);
    await expect(serverErrorArm(reader(true, "only"))).resolves.toEqual(DEBUGGER_ON_ARM);
    await expect(serverErrorArm(reader(true, "on, for Julian"))).resolves.toEqual(DEBUGGER_ON_ARM);
    await expect(serverErrorArm(reader(true, "nothing"))).resolves.toEqual(DEBUGGER_OFF_ARM);
  });

  it("content not matching /on/ is the 500 arm", async () => {
    await expect(serverErrorArm(reader(true, "off"))).resolves.toEqual(DEBUGGER_OFF_ARM);
    await expect(serverErrorArm(reader(true, ""))).resolves.toEqual(DEBUGGER_OFF_ARM);
  });

  it("a content read that throws is the 500 arm — the error path must survive it", async () => {
    await expect(
      serverErrorArm(reader(true, () => { throw new Error("driver is gone"); })),
    ).resolves.toEqual(DEBUGGER_OFF_ARM);
  });
});

/** A deck with a stored `*debugger` card carrying the given content, plus
 *  the shell the error page needs to build its chrome. */
async function deckWithDebugger(content: string): Promise<ErrorPageDeck> {
  const storage: RenderTestStorage = await createRenderTestStorage();
  await seedCard(storage, { id: 50, name: "Html", codename: "html", typeId: 5 });
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 5 });
  await seedCard(storage, { id: 600, name: "*all", codename: "all", typeId: 52 });
  await seedCard(storage, { id: 601, name: "*layout", codename: "layout", typeId: 52 });
  await seedCard(storage, {
    id: 22746, name: "*all+*layout", leftId: 600, rightId: 601, typeId: 52, dbContent: "Default Layout",
  });
  await seedCard(storage, {
    id: 22747, name: "Default Layout", typeId: 50, dbContent: `<body><article>{{_main|titled}}</article></body>`,
  });
  await seedCard(storage, { id: 22748, name: "*header", codename: "header", typeId: 50, dbContent: `<nav>Site</nav>` });
  await seedCard(storage, { id: 22749, name: "*footer", codename: "footer", typeId: 50, dbContent: `<footer>v</footer>` });
  await seedCard(storage, {
    id: 40001, name: "Broken", typeId: 2, dbContent: "the card whose render raises",
  });
  await seedCard(storage, { id: 40002, name: "*debugger", codename: "debugger", typeId: 52, dbContent: content });
  await storage.fetcher.codenames.ensureLoaded();
  return { fetcher: storage.fetcher };
}

describe("ServerError's debugger arm (C14) — the real edge error builder", () => {
  it("a deck whose *debugger card says off answers 500 (the pre-row answer, still correct)", async () => {
    const deck = await deckWithDebugger("off");
    const res = await renderDeckoServerErrorPage(deck, "Broken");
    expect(res.status).toBe(500);
  });

  it("a deck whose *debugger card says on takes the 900 ARM on this host", async () => {
    const deck = await deckWithDebugger("on");
    const res = await renderDeckoServerErrorPage(deck, "Broken");
    // THE NAMED EDGE DIVERGENCE, and the leg that pins it rather than
    // letting it read as "the deck's card says 500".
    //
    // The deck's arm IS the 900 one — the debug view ran and raised (the
    // builder log names BetterErrors). What this host cannot carry is the
    // STATUS, because its answers are built with the Fetch `Response`
    // constructor, whose spec range is 200..599. Measured this session:
    //   new Response("x", {status: 900})
    //     RangeError: init["status"] must be in the range of 200 to 599, inclusive.
    //   new Response("x", {status: 599})   // accepted
    // and 900 IS constructible on the other host, measured the same way:
    //   res.writeHead(900, …)  // accepted; client reads statusCode 900
    //
    // So the staging host serves the deck's 900 (see the staging legs) and
    // this one serves 500. Ruby's 900 is meant to reach the client
    // (error.rb:52-53 "displayed as modal instead of inside the
    // card-notice div"), so this is a real gap on the edge runtime — a
    // platform range, not a modelling choice.
    expect(res.status).toBe(500);
    // the VIEW was still the deck's: the debug view raised, so the body is
    // the builder's minimal stub rather than the Wild Card page
    expect(await res.text()).toContain("Render error");
  });

  it("the constructor really does refuse 900 — the divergence is the runtime's, not ours", () => {
    // pinned so a future runtime that widens the range is caught here
    expect(() => new Response("x", { status: 900 })).toThrow(RangeError);
    expect(() => new Response("x", { status: 599 })).not.toThrow();
  });

  it("a deck with NO debugger card answers 500 — the card, not an env var, is the gate", async () => {
    const storage = await createRenderTestStorage();
    await seedCard(storage, { id: 50, name: "Html", codename: "html", typeId: 5 });
    await seedCard(storage, { id: 600, name: "*all", codename: "all", typeId: 52 });
    await seedCard(storage, { id: 601, name: "*layout", codename: "layout", typeId: 52 });
    await seedCard(storage, {
      id: 22746, name: "*all+*layout", leftId: 600, rightId: 601, typeId: 52, dbContent: "Default Layout",
    });
    await seedCard(storage, {
      id: 22747, name: "Default Layout", typeId: 50, dbContent: `<body><article>{{_main|titled}}</article></body>`,
    });
    await storage.fetcher.codenames.ensureLoaded();
    const res = await renderDeckoServerErrorPage({ fetcher: storage.fetcher }, "Broken");
    expect(res.status).toBe(500);
  });
});

describe("ServerError's debugger arm (C14) — 900 reaches a client on the STAGING host", () => {
  it("Node's ServerResponse carries 900 and the client reads it", async () => {
    // The other half of the measured split above, over a real socket: this
    // host writes through Node's ServerResponse, whose range is 100..999.
    // That is why the staging host CAN answer the deck's 900 and the edge
    // cannot — the difference is the host's HTTP stack, not the port's
    // modelling of the predicate.
    const seen = await new Promise<number>((resolve, reject) => {
      const server = createServer((_req, res) => {
        res.writeHead(900, { "Content-Type": "text/html; charset=utf-8" });
        res.end("900 body");
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address !== null ? address.port : 0;
        get({ host: "127.0.0.1", port, path: "/" }, (res) => {
          res.resume();
          res.on("end", () => { server.close(); resolve(res.statusCode ?? 0); });
        }).on("error", (err) => { server.close(); reject(err); });
      });
    });
    expect(seen).toBe(900);
  });
});