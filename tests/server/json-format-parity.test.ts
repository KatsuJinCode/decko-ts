// The json FORMAT, measured against the PINNED MOD's own json format
// class, the PINNED MOD's own json set block, and the PINNED DECK's own
// suffix/Accept negotiation.
//
// The completeness register's D2 row ([Family]) is the json format, and the
// row's own name says the two doors it is reached through: "json (suffix
// / Accept)". The register's port evidence names the port's arms (the
// edge's .json arms, the engine's json format view dispatch, the staging
// record JSON, the writes that honour Accept json) but it does not say
// what the PINNED side answers for either door, and the door order is
// exactly the part a port can get wrong.
//
// fixtures/captured/json-format-ruby-oracle.json is what
// tests/server/oracle-capture-json-format-ruby.rb recorded by loading the
// PINNED MOD's own format files (the json class body), the PINNED card
// gem's own nesting and render modules, the PINNED json set block
// (class_eval'd onto a probe that SUBCLASSES the pinned json format
// class), and the PINNED DECK's own requested_format,
// format_name_from_params, implicit_html? and load_format.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE CLASS. The json format is registered and its own mime type is
//      application/json. The BASE's own mime type is text/plain.
//   2. THE SUFFIX WINS. requested_format is `params[:format].present? ?
//      params[:format].to_s : request.format`, so a request that carries
//      BOTH a suffix and an Accept header is answered by the suffix, and
//      the Accept header answers only when there is no suffix at all.
//   3. THE MEMBERSHIP TEST IS A STRING COMPARISON, AND THAT IS THE TRAP.
//      The pinned registration stores the format NAME AS A STRING
//      (card-1.110.0/lib/card/format/registration.rb:6-9), and the pinned
//      explicit_file_format? compares the registry against the RAW
//      requested format BEFORE format_name_from_params symbolizes it. So
//      the string "json" is a member and the SYMBOL :json is NOT: the
//      symbol answers the FILE sender, not the json format. The suffix
//      door hands the membership test a string (params[:format].to_s) and
//      the Accept door hands it whatever request.format is.
//   4. THE SHOW DEFAULTS TO :molecule, and the page details add url and
//      requested_at to a Hash answer and leave a String answer alone.
//   5. THE COMPRESS ARM IS A TRUTHINESS TEST: params[:compress] present
//      at all (even a blank value) selects JSON.generate over
//      JSON.pretty_generate.
//
// THE PORT'S ANSWER:
//
//   The port's own jsonShowResult (src/card/render/json-show.ts) is the
//   port of string_with_page_details/page_details/stringify, and this
//   file measures it on the same three answer shapes the pinned rows
//   used, plus the engine's own json render end to end.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { jsonShowResult } from "../../src/card/render/json-show.js";
import { renderFormatShow } from "../../src/card/render/format-families.js";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/json-format-ruby-oracle.json"), "utf8"),
) as {
  registry: { registered: string[]; mimeTypes: Record<string, string> };
  jsonFormat: {
    registered: boolean;
    mimeType: string;
    baseMimeType: string;
    expandStubs: unknown;
    expandStubsString: string;
  };
  defaultViews: Array<{ label: string; answer: string }>;
  maxDepth: Array<{ label: string; params: Record<string, string>; answer: number }>;
  show: Array<{
    label: string;
    params: Record<string, string>;
    returned: string;
    calls: Array<{ ask: string; view?: string }>;
  }>;
  pageDetails: Array<{
    label: string;
    valueClass: string;
    answerClass: string;
    answerKeys: string[] | null;
  }>;
  negotiation: Array<{
    label: string;
    accept: string;
    params: Record<string, string>;
    ajax: boolean;
    requestedFormat: string;
    formatNameFromParams: string;
    implicitHtml: boolean;
  }>;
  registryTypes: {
    elementTypes: string[];
    memberOfString: boolean;
    memberOfSymbol: boolean;
    memberOfMimeTypeString: boolean;
  };
  loadFormat: Array<{
    label: string;
    accept: string;
    params: Record<string, string>;
    ajax: boolean;
    requestFormatAfter: string;
    requestFormatWrites: string[];
    cardCalls: Array<{ ask: string; name: string }>;
    formatErrorStatusWrites: Array<{ ask: string; value: number }>;
  }>;
};

const negotiationByLabel = (label: string) => {
  const row = ORACLE.negotiation.find((entry) => entry.label === label);
  if (!row) throw new Error(`the oracle has no negotiation row named ${label}`);
  return row;
};

const showByLabel = (label: string) => {
  const row = ORACLE.show.find((entry) => entry.label === label);
  if (!row) throw new Error(`the oracle has no show row named ${label}`);
  return row;
};

describe("the json format, against the pinned mod and the pinned deck", () => {
  it("the mod's own files register json, and the json class's own mime type is application/json", () => {
    expect(ORACLE.registry.registered).toContain("json");
    expect(ORACLE.jsonFormat.registered).toBe(true);
    expect(ORACLE.jsonFormat.mimeType).toBe("application/json");
    expect(ORACLE.jsonFormat.baseMimeType).toBe("text/plain");
    expect(ORACLE.registry.mimeTypes["json"]).toBe("application/json");
  });

  it("the json class's own expand_stubs walks a Hash and an Array", () => {
    expect(ORACLE.jsonFormat.expandStubs).toEqual({ a: { b: [1, { c: 2 }] } });
    // A leaf that is not a Hash or an Array falls through to the base's own
    // expand_stubs, which needs the card gem's content machinery. That
    // call is recorded as raising, and the pinned line is quoted in the
    // fixture's sources.
    expect(ORACLE.jsonFormat.expandStubsString).toContain("RAISED");
  });

  it("the json set block's own default views are :atom and :name", () => {
    const nest = ORACLE.defaultViews.find((row) => row.label === "the default nest view");
    const item = ORACLE.defaultViews.find((row) => row.label === "the default item view");
    expect(nest?.answer).toBe("atom");
    expect(item?.answer).toBe("name");
  });

  it("the json set block's own max_depth is 1 unless the params ask for more", () => {
    const byLabel = (label: string) => ORACLE.maxDepth.find((row) => row.label === label);
    expect(byLabel("no max_depth param")?.answer).toBe(1);
    expect(byLabel("a max_depth param")?.answer).toBe(3);
    // A blank param is not present, so the default holds.
    expect(byLabel("a blank max_depth param")?.answer).toBe(1);
    // A param that is not a number is to_i'd, and Ruby's to_i of a
    // non-number is zero.
    expect(byLabel("a max_depth param that is not a number")?.answer).toBe(0);
  });

  it("the show arm's default view is :molecule", () => {
    const row = showByLabel("no view named: the default is :molecule");
    const renderAsk = row.calls.find((ask) => ask.ask === "render!");
    expect(renderAsk?.view).toBe(":molecule");
    // A named view is used as given.
    const named = showByLabel("a view named");
    expect(named.calls.find((ask) => ask.ask === "render!")?.view).toBe(":open");
  });

  it("the page details add url and requested_at to a Hash answer and leave a String answer alone", () => {
    const hash = ORACLE.pageDetails.find((row) => row.label === "a Hash");
    const array = ORACLE.pageDetails.find((row) => row.label === "an Array");
    const string = ORACLE.pageDetails.find((row) => row.label === "a String");
    expect(hash?.answerClass).toBe("Hash");
    expect(hash?.answerKeys).toEqual(["id", "url", "requested_at"]);
    expect(array?.answerClass).toBe("Array");
    expect(string?.answerClass).toBe("String");
    // And the show arm shows it: a String answer comes back untouched.
    const stringShow = showByLabel("the answer is a String: the page details do not touch it");
    expect(stringShow.returned).toBe("RENDERED(:molecule)");
  });

  it("the SUFFIX WINS over the Accept header", () => {
    expect(negotiationByLabel("BOTH doors: the suffix wins").requestedFormat).toBe("json");
    expect(negotiationByLabel("BOTH doors: the suffix wins").formatNameFromParams).toBe("json");
    expect(
      negotiationByLabel("BOTH doors, the Accept door asks for json").requestedFormat,
    ).toBe("html");
    expect(
      negotiationByLabel("BOTH doors, the Accept door asks for json").formatNameFromParams,
    ).toBe("html");
  });

  it("the membership test is a STRING comparison, so a Symbol is NOT a member", () => {
    expect(ORACLE.registryTypes.elementTypes).toEqual(["String"]);
    expect(ORACLE.registryTypes.memberOfString).toBe(true);
    expect(ORACLE.registryTypes.memberOfSymbol).toBe(false);
    expect(ORACLE.registryTypes.memberOfMimeTypeString).toBe(false);
    // So the Accept door answers the json format only when request.format
    // IS the string "json".
    expect(negotiationByLabel("the Accept door alone, as the format NAME").formatNameFromParams).toBe(
      "json",
    );
    // A MIME type is not the registered name.
    expect(
      negotiationByLabel("the Accept door alone, as a MIME TYPE").formatNameFromParams,
    ).toBe("file");
    // And a Symbol of the same name is not a member either.
    expect(negotiationByLabel("the Accept door alone, as a SYMBOL").formatNameFromParams).toBe(
      "file",
    );
  });

  it("the implicit html rule is the ajax one and the wildcard Accept one", () => {
    expect(negotiationByLabel("the wildcard Accept door").implicitHtml).toBe(true);
    expect(negotiationByLabel("an ajax request with no suffix").implicitHtml).toBe(true);
    // An ajax request WITH a suffix is not an implicit html one.
    expect(negotiationByLabel("an ajax request with a suffix").implicitHtml).toBe(false);
  });

  it("the load_format arm writes :html onto the request for an implicit html request", () => {
    const wildcard = ORACLE.loadFormat.find((row) => row.label === "the wildcard Accept door");
    expect(wildcard?.requestFormatWrites).toEqual(["html"]);
    // The format the deck then asks the card for is the one the
    // negotiation chose.
    const suffix = ORACLE.loadFormat.find((row) => row.label === "a suffix json request");
    expect(suffix?.requestFormatWrites).toEqual([]);
    expect(suffix?.cardCalls.map((call) => call.name)).toEqual(["json"]);
    // And the status is written onto the format the card handed back.
    expect(suffix?.formatErrorStatusWrites).toEqual([{ ask: "error_status=", value: 200 }]);
  });
});

describe("the port's json format, against the pinned answers", () => {
  let storage: RenderTestStorage;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
    await seedCard(storage, { id: 700, name: "Alpha", typeId: 2, dbContent: "alpha body" });
    storage.fetcher.installNameEnvironment();
  });

  afterAll(() => {
    storage?.close();
  });

  it("the port's own show merges url and requested_at into a Hash answer", () => {
    const body = jsonShowResult({ id: 1, name: "Alpha" }, "https://example.test/Alpha");
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["id", "name", "url", "requested_at"]);
    expect(parsed["url"]).toBe("https://example.test/Alpha");
    expect(typeof parsed["requested_at"]).toBe("string");
    // The default arm is the pretty one: two-space indent.
    expect(body).toContain("\n  \"id\": 1");
  });

  it("the port's own show leaves a String answer alone and does not merge an Array", () => {
    expect(jsonShowResult("RENDERED(:molecule)", "https://example.test/Alpha")).toBe(
      "RENDERED(:molecule)",
    );
    // An Array is not a Hash, so the page details do not touch it, and it
    // is still stringified (pretty, by default).
    const array = jsonShowResult([1, 2], "https://example.test/Alpha");
    expect(JSON.parse(array)).toEqual([1, 2]);
    expect(array).not.toContain("url");
    expect(array).not.toContain("requested_at");
  });

  it("the port's own compress arm is the pinned truthiness test", () => {
    // The compress param PRESENT at all selects the compact arm, even when
    // its value is the string "false": Ruby's params[:compress] is a
    // String, and a String is truthy.
    const compressed = jsonShowResult({ id: 1 }, "https://example.test/Alpha", "false");
    expect(compressed).toBe('{"id":1,"url":"https://example.test/Alpha","requested_at":' + compressed.split('"requested_at":')[1]);
    expect(compressed).not.toContain("\n");
    // And the pinned row says the same: the compress param turns the
    // pretty_generate into a single-line generate.
    const pinned = showByLabel("the params ask for compression");
    expect(pinned.returned.startsWith("{")).toBe(true);
    expect(pinned.returned).not.toContain("\n  ");
  });

  it("the port's own json molecule carries the page details the pinned merge adds", async () => {
    // The port's own json show (src/card/render/format-families.ts), the
    // port of the pinned json.rb's show with its :molecule default.
    const body = await renderFormatShow(
      {
        fetchRenderCard: (name: string) => storage.engine.fetchRenderCard(name),
        prepareItemForRender: (name: string) => storage.engine.prepareItemForRender(name),
        render: (name: string, view: string) => storage.engine.render(name, view),
        codenameById: (id: number) => storage.fetcher.codenames.nameForId(id),
      },
      "Alpha",
      "json",
      { urlBase: "https://example.test" },
    );
    const parsed = JSON.parse(body) as Record<string, unknown>;
    // The page details (json.rb:52-55) add url and requested_at, and the
    // stringify arm (json.rb:56-59) pretty-prints with a two-space indent.
    expect(parsed["url"]).toBe("https://example.test/Alpha");
    expect("requested_at" in parsed).toBe(true);
    expect(body).toContain("\n  ");
  });

  it("the port's own read grammar puts the json format behind the .json suffix", () => {
    // The two-segment arm (engine_routes.rb:51, ":mark/:view(.:format)"):
    // the .json suffix rides the VIEW segment, so the view is in the json
    // format and never a view named "<view>.json".
    const twoSegments = parsePath("/Alpha/open.json") as {
      name: string;
      view: string;
      format?: string;
    };
    expect(twoSegments.name).toBe("Alpha");
    expect(twoSegments.view).toBe("open");
    expect(twoSegments.format).toBe("json");
    // The three-segment arm (engine_routes.rb:24, "/:mark/view/:view")
    // splits the suffix the same way.
    const threeSegments = parsePath("/Alpha/view/open.json") as {
      name: string;
      view: string;
      format?: string;
    };
    expect(threeSegments.view).toBe("open");
    expect(threeSegments.format).toBe("json");
    // The one-segment arm needs a view to ask for, so a bare .json there
    // stays part of the card's NAME.
    const oneSegment = parsePath("/Alpha.json") as { name: string; view: string; format?: string };
    expect(oneSegment.name).toBe("Alpha.json");
    expect(oneSegment.format).toBeUndefined();
    // With a view asked for, the one-segment arm splits the suffix and
    // answers the json format.
    const oneSegmentWithView = parsePath("/Alpha.json", new URLSearchParams("view=status")) as {
      name: string;
      view: string;
      format?: string;
    };
    expect(oneSegmentWithView.name).toBe("Alpha");
    expect(oneSegmentWithView.view).toBe("status");
    expect(oneSegmentWithView.format).toBe("json");
  });
});
