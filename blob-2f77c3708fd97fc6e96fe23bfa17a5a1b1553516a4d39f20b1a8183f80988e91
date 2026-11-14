// record_as_main (register-routes B13) - rest.rb:63-66:
//
//     # TODO: refactor this away this when new layout handling is ready
//     def record_as_main
//       Card::Env.main_name = params[:main] || card&.name || ""
//     end
//
// called from load_card (rest.rb:49-54) as its last statement, so it runs
// for every action that loads a card and NOT for the shapes that never
// reach load_card.
//
// `Card::Env.main_name` is what a `_main` NAME PART resolves through:
// cardname-0.20.0 lib/cardname/contextual.rb:108
// `when /^_main$/i then self.class.params[:main_name]`, reached from
// #absolutize_contextual_parts - and Card::Name.params is Card::Env.params
// (card-1.110.0 lib/card/name.rb). This port's name layer already resolved
// `_main` through its `mainName` environment field
// (tests/card/name/contextual-main-params-oracle.test.ts replays the
// captured rows against it); what did not exist is anything that INSTALLED
// that field on a serving path, so every real request left it unset - the
// register's B13 gap.
//
// NOT THE AUTHORED `{{_main}}` NEST. content.rb:20-27 `content_nest`
// intercepts it first - `return main_nest(opts) if main_nest?(nest_name)`,
// and nesting/main.rb:26-28 `main_nest?` is an EXACT name match on the
// AUTHORED reference (chunk/nest.rb:23 keeps it verbatim), so only a
// literal `{{_main}}` / `{{_main|view}}` takes that arm and renders
// wrap_main { main.rendered }. It never becomes a card mark and never
// consults params[:main_name]. The consumer is a `_main` PART - a name
// that is not exactly `_main` - which is what the legs below drive.
//
// The pinned side of this row is measured in
// tests/server/record-as-main-parity.test.ts, against
// fixtures/captured/record-as-main-ruby-oracle.json.

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { recordAsMain } from "../../src/card/name/environment.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { CONFIGURED_DECK_SERVED_DELTAS } from "./fixtures/configured-deck-served-deltas.js";

const ORIGIN = "https://script-placeholder.bunny.run";

function realDeck(storage: RenderTestStorage) {
  return {
    fetcher: storage.fetcher,
    render: storage.engine,
    servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
  };
}

/** A shell deck in which the card under read nests `{{Branch+_main}}`.
 *
 *  `_main` is a PART of that compound name, not the whole reference, so
 *  `main_nest?` does not intercept it and the name layer absolutizes it
 *  through Card::Env.main_name. Whichever card that yields is a real
 *  junction whose body says which branch was taken, so the resolved focal
 *  name is an OBSERVED BYTE rather than an inspected object.
 *
 *  The junction is keyed on Branch + <focal>, so every leg discriminates:
 *  with the focal unset, `_main` cannot land on Branch+Host by accident.
 *
 *  The nest needs its own blank-line-separated chunk - Ruby's content
 *  chunking treats a chunk that STARTS with a nest as a nest chunk, and
 *  `body {{nest}}` as one text chunk. */
async function seedFocalDeck(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 8, name: "kmrtqd", codename: "anyone", typeId: 2 });
  await seedCard(storage, { id: 15, name: "vqhrbnl", codename: "anonymous", typeId: 2 });
  await seedCard(storage, { id: 55, name: "*title", codename: "title", typeId: 52, dbContent: "Test Site" });
  await seedCard(storage, { id: 400, name: "*ace", codename: "ace", typeId: 52, dbContent: "{}" });
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
  // the card under read - its body nests the probe
  await seedCard(storage, { id: 31000, name: "Host", typeId: 2, dbContent: `host body\n\n{{Probe}}` });
  // the probe: NESTED, so its name-context is Probe while Card::Env.main_name
  // is still the request's own card. That difference is what makes the
  // default leg discriminating - with main_name unset, `_main` is blank and
  // #absolutize_extremes (contextual.rb:blank extremes become the context)
  // substitutes Probe for it, landing on the OTHER branch.
  await seedCard(storage, { id: 31008, name: "Probe", typeId: 2, dbContent: `probe body\n\n{{Branch+_main}}` });
  await seedCard(storage, { id: 31006, name: "Branch", typeId: 2, dbContent: "branch body" });
  await seedCard(storage, { id: 31007, name: "Elsewhere", typeId: 2, dbContent: "elsewhere body" });
  await seedCard(storage, { id: 31005, name: "Missing", typeId: 2, dbContent: "missing body" });
  // the branch `?main=` absent takes: _main is the card being READ, Host
  await seedCard(storage, {
    id: 31001, name: "Branch+Host", leftId: 31006, rightId: 31000, typeId: 5, dbContent: `BRANCH_HOST`,
  });
  // the branch an UNSET main_name takes (blank extreme -> the nest context)
  await seedCard(storage, {
    id: 31009, name: "Branch+Probe", leftId: 31006, rightId: 31008, typeId: 5, dbContent: `BRANCH_PROBE`,
  });
  // the branch an explicit ?main= takes
  await seedCard(storage, {
    id: 31002, name: "Branch+Elsewhere", leftId: 31006, rightId: 31007, typeId: 5, dbContent: `BRANCH_ELSEWHERE`,
  });
  // the branch any other ?main= names
  await seedCard(storage, {
    id: 31003, name: "Branch+Missing", leftId: 31006, rightId: 31005, typeId: 5, dbContent: `BRANCH_MISSING`,
  });
  await storage.fetcher.codenames.ensureLoaded();
}

async function readHost(url: string): Promise<string> {
  const storage = await createRenderTestStorage();
  await seedFocalDeck(storage);
  const res = await handleEngineRequest(new Request(`${ORIGIN}${url}`), realDeck(storage));
  expect(res.status).toBe(200);
  return await res.text();
}

describe("record_as_main: Card::Env.main_name = params[:main] || card&.name || \"\" (B13)", () => {
  it("with no ?main=, _main is the card being read", async () => {
    const html = await readHost("/Host");
    expect(html).toContain("host body");
    expect(html).toContain("BRANCH_HOST");
    // the branch an unset main_name would take instead
    expect(html).not.toContain("BRANCH_PROBE");
    expect(html).not.toContain("BRANCH_ELSEWHERE");
  });

  it("?main=<other> overrides the focal card - the focal override itself", async () => {
    const html = await readHost("/Host?main=Elsewhere");
    expect(html).toContain("host body");
    expect(html).toContain("BRANCH_ELSEWHERE");
    expect(html).not.toContain("BRANCH_HOST");
  });

  it("?main= (the EMPTY string) is truthy in Ruby: _main is \"\", NOT the card", async () => {
    // `params[:main] || card&.name` - "" is truthy in Ruby, so the card
    // name is never the fallback. This is the leg a naive JS `||`
    // transliteration gets wrong, and the reason recordAsMain uses `??`.
    expect(recordAsMain("", "Host")).toBe("");
    expect(recordAsMain(undefined, "Host")).toBe("Host");
    expect(recordAsMain(undefined, undefined)).toBe(""); // the `|| ""` tail
    // and the page still answers 200 rather than raising
    const storage = await createRenderTestStorage();
    await seedFocalDeck(storage);
    const res = await handleEngineRequest(
      new Request(`${ORIGIN}/Host?main=`),
      realDeck(storage),
    );
    expect(res.status).toBe(200);
  });

  it("a third ?main= names a third branch - the param is answered verbatim", async () => {
    // params[:main] is a raw string: no fetch, no existence check, no
    // fallback to the card name.
    const html = await readHost("/Host?main=Missing");
    expect(html).toContain("host body");
    expect(html).toContain("BRANCH_MISSING");
    expect(html).not.toContain("BRANCH_HOST");
    expect(html).not.toContain("BRANCH_ELSEWHERE");
  });
});
