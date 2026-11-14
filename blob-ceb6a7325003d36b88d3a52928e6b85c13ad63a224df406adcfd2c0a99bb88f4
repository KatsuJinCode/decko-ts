// follow-view-seat-comparison.mjs - why the deploy's bundle and the port's
// own TypeScript host answer the two follow-family views differently on the
// same deck rows.
//
//   node tools/edge-signed-in-exercise/follow-view-seat-comparison.mjs \
//        [--deck <source.sqlite3>] [--host <base-url>] [--host-label <name>]
//
// It boots the harness's own local stack (the deploy's bundle over the local
// driver, the same way tools/edge-signed-in-exercise.mjs boots it) against a
// copy of the deck, asks the two follow-view addresses, and prints what the
// bundle answered. With --host it asks the same addresses of a running engine
// - the port's own TypeScript host, vm-staging-server.mjs - so the two
// engines answer the same addresses over the same rows.
//
// THE SEAT UNDER TEST is RenderEngine#renderAbsentCards (src/card/render.ts:
// the flag and its default). A ROWLESS card ("<card>+*followers",
// "<User>+*follow") is seated as a card only when that flag is on
// (src/card/render/page.ts:347-360); with it off the page's unknown-card arm
// fires (card-mod-format set/all/html/error.rb:81-86 page_view_for_unknown)
// and the page answers the create view - a signed-in reader who may not
// create gets the create denial - or the not-found page for an anonymous
// reader.
//
// The hosts differ on exactly that flag:
//   - the deploy's bundle seats it for the new-card form render
//     (deploy/bunny-worker-src/bunny-edge-engine-request.ts:1378) and for the
//     wildcard address, and NOT on the page path;
//   - the port's own TypeScript host seats it for a stock deck
//     (vm-staging-server.mjs:1413), and leaves it off otherwise.
//
// The script writes nothing to the deck and reaches nothing outside loopback.

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { startStack, REPO } from "./lib/stack.mjs";
import { buildLocalDeck } from "./lib/build-local-deck.mjs";

const argOf = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

/** The addresses to ask. The default is the followers list of a card every
 * deck has; --address adds any other one (the all-followed-cards dashboard
 * of a user card, for instance). */
const ADDRESSES = [
  ...process.argv.flatMap((value, index) =>
    value === "--address" ? [process.argv[index + 1]] : [],
  ),
  ...(process.argv.includes("--address") ? [] : ["/Home+*followers", "/Home+*followers/content"]),
];

const source = argOf("deck") ?? "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3";
const host = argOf("host");
const hostLabel = argOf("host-label") ?? "host";

const deckCopy = join(REPO, ".runtime", "follow-view-seat-deck.sqlite3");
mkdirSync(join(REPO, ".runtime"), { recursive: true });
if (!existsSync(deckCopy)) {
  console.log(`copying the deck rows into ${deckCopy}`);
  await buildLocalDeck({ source, out: deckCopy });
}

const stack = await startStack({
  deckPath: deckCopy,
  live: { DECKO_LIVE_RENDER: "0", DECKO_EDGE_CACHE: "0", DECKO_FONT_AWESOME: "local" },
  runtimeDir: join(REPO, "tmp", "follow-view-seat-runtime"),
  bundlePath: join(REPO, "deploy", "dist", "bunny-edge-engine.bundle.js"),
  onRequest: () => {},
});

/** What one engine answered for one address. */
async function ask(base, address) {
  const response = await fetch(`${base}${address}`, { headers: { accept: "text/html" } });
  const body = await response.text();
  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return {
    address,
    status: response.status,
    pointerList: body.includes("pointer-list"),
    createForm: body.includes('id="new_card"'),
    notFound: /Not Found|Could not find/.test(plain),
    createDenial: /need permission to create/i.test(plain),
    head: plain.slice(0, 120),
  };
}

try {
  for (const address of ADDRESSES) {
    const answers = [{ engine: "edge-bundle", ...(await ask(stack.origin, address)) }];
    if (host !== undefined) {
      answers.push({ engine: hostLabel, ...(await ask(host, address)) });
    }
    for (const answer of answers) console.log(JSON.stringify(answer));
  }
} finally {
  await stack.close();
  stack.cleanup();
  rmSync(deckCopy, { force: true });
}
