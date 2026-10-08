// The non-html format families (csv / rss / json) pinned against the FRESH
// Ruby oracle capture taken 2026-09-29:
// fixtures/oracle-surfaces/{csv,rss,rss-enabled,json}.jsonl.
//
// Capture provenance (see benchmarks/capture-surfaces-formats.rb): the
// oracle app booted against a DISPOSABLE copy of the corpus deck
// (db/write-conformance-surfaces1.sqlite3); the corpus DB's sha256 is
// unchanged across the run (819b8884… before and after — the no-write
// proof lives in WORK_DIR/surfaces-batch1-lane.md).
// The seeded cards here carry the captured rows' ids/names/codenames/
// timestamps so the byte pins are the same state Ruby rendered.
//
// Substrate notes the pins depend on:
// - the read rules: *all+*read "Anyone" IS the corpus's read rule card
//   (the read-permission stream reads its content + the card_references
//   row via seedReference); without it the fail-closed engine denies the
//   html open_content the rss feed_item_description renders;
// - the ":getting_started" / ":shark" marks in the content parse through
//   the global name environment (installNameEnvironment + the codehash
//   memo — the same install the other render tests perform);
// - the Home feed description's INTERIOR is the html :open_content render
//   (the corpus subtree {{+:shark|core}} pulls the anonymized corpus's
//   junction graph — R1 reading-surface territory), so the Home feed pin
//   covers the channel frame, the escaped container prefix, and the exact
//   error tail, while *all+*read (empty descriptions) is the FULL feed
//   byte pin.
//
// The RSS-enabled feed's <error> tail carries Ruby's backtrace — the one
// accepted-and-labeled byte class (environment-specific Ruby file paths);
// those assertions compare everything AROUND the backtrace and the error
// message line, which is exact.
//
// The json molecule's requested_at is the render clock — the tests inject
// a fixed clock and byte-compare with the capture's requested_at value
// substituted.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import {
  renderFormatShow,
  csvGenerateLine,
  RSS_DISABLED_BYTES,
  type FormatShowOptions,
} from "../../../src/card/render/format-families.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface CaptureLine {
  card: string;
  format: string;
  view: string;
  bytes?: string;
  error?: string;
}

function loadCapture(file: string): Map<string, CaptureLine> {
  const lines = readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/${file}`,
    "utf8",
  )
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as CaptureLine);
  return new Map(lines.map((l) => [`${l.card}|${l.view}`, l]));
}

/** The Home content — the captured db_content (the two <div> lines whose
 *  content-line item parse is the csv raise's cause). */
const HOME_CONTENT =
  '<div>{{:getting_started|core}}</div>\n<div>{{## Feel free to get rid of this and start fresh! }}</div>\n';

/** The *getting started content — the captured Home molecule's item atom
 *  content (the json item_cards nested_cards arm's single target). */
const GETTING_STARTED_CONTENT = (() => {
  const home = readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/json.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as CaptureLine)
    .find((l) => l.card === "Home" && l.view === "show_default_molecule");
  const items = (JSON.parse(home?.bytes ?? "{}") as Record<string, unknown>)[
    "items"
  ] as Array<Record<string, unknown>>;
  return items[0]?.["content"] as string;
})();

/** The corpus's :shark card (the {{+:shark|core}} nest's right side; its
 *  own {{…}} nests are plain-name nests — fetch misses render the unknown
 *  slot, they do not throw). */
const SHARK_CONTENT =
  "<p>{{xxxxxxxxxxxx}}</p>\n<p>xkucci</p>\n<h1>ahcamqgrenebljldrs{{xxxxxxxxxx}}qiznn<br></h1>\n<blockquote>\n<p>{{xxxxxxxxx}}</p>\n</blockquote>";

let storage: RenderTestStorage | undefined;
let captures: {
  csv: Map<string, CaptureLine>;
  rss: Map<string, CaptureLine>;
  rssEnabled: Map<string, CaptureLine>;
  json: Map<string, CaptureLine>;
};

const FIXED_NOW = new Date("2026-09-29T12:00:00.000Z");
const opts = (extra?: Partial<FormatShowOptions>): FormatShowOptions => ({
  now: () => FIXED_NOW,
  resolveCodenameMark: async (mark: string) => {
    const name = await storage!.fetcher.codenames.name(mark);
    return name?.s;
  },
  ...extra,
});

beforeAll(async () => {
  captures = {
    csv: loadCapture("csv.jsonl"),
    rss: loadCapture("rss.jsonl"),
    rssEnabled: loadCapture("rss-enabled.jsonl"),
    json: loadCapture("json.jsonl"),
  };
  storage = await createRenderTestStorage();
  const s = storage;
  // The captured rows' substrate (ids/codenames/types/timestamps from the
  // corpus deck). Type-card rows carry the Cardtype type so the type-name
  // resolution answers "Cardtype" the way the captures show.
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeName: "Cardtype", typeId: 5 });
  await seedCard(s, { id: 13, name: "Set", codename: "set", typeName: "Cardtype", typeId: 5 });
  await seedCard(s, { id: 14, name: "Setting", codename: "setting", typeName: "Cardtype", typeId: 5 });
  await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeName: "Cardtype", typeId: 5 });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeName: "Cardtype", typeId: 5 });
  await seedCard(s, { id: 39, name: "HTML", typeName: "Cardtype", typeId: 5 });
  await seedCard(s, { id: 177, name: "Role", codename: "role", typeName: "Cardtype", typeId: 5 });
  await seedCard(s, { id: 7, name: "*all", codename: "all", typeName: "Set", typeId: 13 });
  await seedCard(s, { id: 9, name: "*read", codename: "read", typeName: "Setting", typeId: 14 });
  await seedCard(s, { id: 12, name: "*title", codename: "title", typeName: "Setting", typeId: 14 });
  await seedCard(s, {
    id: 1013,
    name: "*all+*title",
    leftId: 7,
    rightId: 12,
    typeName: "Setting",
    typeId: 14,
    dbContent: "My Deck",
  });
  await seedCard(s, {
    id: 180,
    name: "Anyone",
    codename: "anyone",
    typeId: 177,
    typeName: "Role",
    dbContent: "",
    readRuleId: 10,
    readRuleClass: "*all",
  });
  // *all+*read IS the corpus's read rule card (List type, content "Anyone")
  // AND the csv/rss/json capture subject.
  await seedCard(s, {
    id: 10,
    name: "*all+*read",
    leftId: 7,
    rightId: 9,
    typeId: 4,
    typeName: "List",
    dbContent: "Anyone",
    createdAt: "2025-07-01 17:29:22",
    updatedAt: "2025-07-01 17:29:34",
  });
  await seedReference(s, 10, 180, "anyone");
  await seedCard(s, {
    id: 521,
    name: "Home",
    codename: "default_home",
    typeId: 2,
    typeName: "RichText",
    dbContent: HOME_CONTENT,
    createdAt: "2025-07-01 17:31:51",
    updatedAt: "2025-07-01 17:31:51",
    readRuleId: 10,
    readRuleClass: "*all",
  });
  await seedCard(s, {
    id: 534,
    name: "*getting started",
    codename: "getting_started",
    typeId: 39,
    typeName: "HTML",
    dbContent: GETTING_STARTED_CONTENT,
    readRuleId: 10,
    readRuleClass: "*all",
  });
  await seedCard(s, {
    id: 34790,
    name: "bbshf",
    codename: "shark",
    typeId: 7,
    typeName: "quiz",
    dbContent: SHARK_CONTENT,
    readRuleId: 10,
    readRuleClass: "*all",
  });
  // the ":getting_started" mark in Home's content parses through the global
  // name environment — installed from this storage's fetcher (the pattern
  // the other render tests use), with the codehash memo loaded first.
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}, 60_000);

afterAll(() => {
  storage?.close();
});

/** The engine surface the format families take, with the async codename
 *  read wired to the fetch layer's codename registry. */
function formatEngine(s: RenderTestStorage) {
  return {
    fetchRenderCard: (name: string) => s.engine.fetchRenderCard(name),
    prepareItemForRender: (name: string) => s.engine.prepareItemForRender(name),
    render: (name: string, view: string) => s.engine.render(name, view),
    codenameById: async (id: number) => await s.fetcher.codenames.nameForId(id),
  };
}

/** Substitute the capture's requested_at with the fixed-clock value so the
 *  json pins byte-compare. */
function withFixedRequestedAt(captured: string): string {
  const line = captured.split("\n").find((l) => l.includes('"requested_at"'));
  expect(line, "capture carries requested_at").toBeDefined();
  return captured.replace(
    line as string,
    `  "requested_at": "2026-09-29 12:00:00 UTC"`,
  );
}

describe("P11 csv format family — fresh oracle pins (csv.jsonl)", () => {
  it("*all+*read :titled is byte-identical to the capture", async () => {
    const s = storage!;
    const out = await renderFormatShow(formatEngine(s), "*all+*read", "csv", opts());
    expect(out).toBe(captures.csv.get("*all+*read|show_default_titled")?.bytes);
  });

  it("Home :titled raises the NoMethodError the capture recorded", async () => {
    const s = storage!;
    const capture = captures.csv.get("Home|show_default_titled");
    expect(capture?.error).toContain(
      "undefined method `each' for an instance of String",
    );
    await expect(
      renderFormatShow(formatEngine(s), "Home", "csv", opts()),
    ).rejects.toThrow("undefined method `each' for an instance of String");
  });

  it("csvGenerateLine quotes only fields the csv gem's minimal default quotes", () => {
    expect(csvGenerateLine(["Name", "Type"])).toBe("Name,Type\n");
    expect(csvGenerateLine(["a,b", 'say "hi"'])).toBe('"a,b","say ""hi"""\n');
    expect(csvGenerateLine(["line\nbreak"])).toBe('"line\nbreak"\n');
  });
});

describe("P10 rss format family — fresh oracle pins (rss.jsonl / rss-enabled.jsonl)", () => {
  it("the default (rss_enabled false) feed is the disabled string for every card", async () => {
    const s = storage!;
    for (const name of ["*all+*read", "Home"]) {
      const out = await renderFormatShow(formatEngine(s), name, "rss", opts());
      expect(out).toBe(RSS_DISABLED_BYTES);
      expect(out).toBe(captures.rss.get(`${name}|show_default_feed`)?.bytes);
    }
  });

  it("*all+*read feed bytes match the enabled capture up to the labeled backtrace", async () => {
    const s = storage!;
    const out = await renderFormatShow(formatEngine(s), "*all+*read", "rss", {
      ...opts(),
      rssEnabled: true,
    });
    const captured = captures.rssEnabled.get("*all+*read|show_default_feed")?.bytes ?? "";
    // Everything up to the error element is exact (channel + item prefix).
    const head = captured.slice(0, captured.indexOf("<error>"));
    expect(out.startsWith(head)).toBe(true);
    // The error message line is exact (the ArgumentError inspect, escaped).
    expect(out).toContain(
      "ERROR rendering RSS: #&lt;ArgumentError: wrong number of arguments (given 1, expected 0)&gt;",
    );
    // …and the element closes after the (labeled, TS-side) backtrace.
    expect(out.endsWith("</error>")).toBe(true);
    expect(out).not.toContain("C:/Ruby33");
  });

  it("Home feed carries the escaped :open_content description before the raise", async () => {
    const s = storage!;
    const out = await renderFormatShow(formatEngine(s), "Home", "rss", {
      ...opts(),
      rssEnabled: true,
    });
    const captured = captures.rssEnabled.get("Home|show_default_feed")?.bytes ?? "";
    // The channel frame and the item description OPEN are exact; the
    // description's INTERIOR is the html :open_content render (the corpus
    // subtree {{+:shark|core}} pulls the anonymized corpus's junction
    // graph — R1 territory, see the substrate note above).
    const descOpen = "<item><title>Home</title><description>";
    const headToDesc = captured.slice(0, captured.indexOf(descOpen) + descOpen.length);
    expect(out.startsWith(headToDesc)).toBe(true);
    // Builder escapes only & < > in text nodes — quotes stay raw (the
    // capture's description bytes show raw " inside the escaped tags).
    const escapedPrefix =
      "&lt;div&gt;&lt;div class=\"container text-center\"&gt;\n" +
      "  &lt;div class=\"d-flex justify-content-center align-items-center p-3 my-3 rounded box-shadow\"&gt;\n";
    expect(out.slice(headToDesc.length).startsWith(escapedPrefix)).toBe(true);
    // the feed title: the *all+*title rule content + the *-stripped name
    expect(out).toContain("<title>My Deck : Home</title>");
    expect(out).toContain("<link>/Home</link>");
    // the exact error tail after the description interior
    expect(out.endsWith("</error>")).toBe(true);
    expect(out).toContain(
      "ERROR rendering RSS: #&lt;ArgumentError: wrong number of arguments (given 1, expected 0)&gt;",
    );
  });
});

describe("R3 json format family — fresh oracle pins (json.jsonl)", () => {
  it("*all+*read :molecule is byte-identical to the capture (fixed clock)", async () => {
    const s = storage!;
    const out = await renderFormatShow(formatEngine(s), "*all+*read", "json", opts());
    const captured = captures.json.get("*all+*read|show_default_molecule")?.bytes ?? "";
    expect(out).toBe(withFixedRequestedAt(captured));
  });

  it("Home :molecule is byte-identical to the capture (fixed clock)", async () => {
    const s = storage!;
    const out = await renderFormatShow(formatEngine(s), "Home", "json", opts());
    const captured = captures.json.get("Home|show_default_molecule")?.bytes ?? "";
    expect(out).toBe(withFixedRequestedAt(captured));
  });

  it("the list-family :content arm is the item_names array, not raw content", async () => {
    const s = storage!;
    const out = await renderFormatShow(formatEngine(s), "*all+*read", "json", opts());
    const parsed = JSON.parse(out) as { content: unknown };
    expect(parsed.content).toEqual(["Anyone"]);
  });

  it("a missing card reports not-found (Ruby's fetch raises before the format)", async () => {
    const s = storage!;
    await expect(
      renderFormatShow(formatEngine(s), "No Such Card Here", "json", opts()),
    ).rejects.toThrow("invalid card name");
  });
});
