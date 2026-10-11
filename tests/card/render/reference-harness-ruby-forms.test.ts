// Two byte forms checked against stock Ruby's own output on the reference
// harness's synthetic deck (reference-harness/fixtures/synthetic-v1, whose
// expected/ outputs are raw stock-oracle captures; only the harness's N1 mask
// applies, and it keeps quote style).
//
// 1. Bar slot ids. bar.haml passes wrap_data, slot id included, as one Haml
//    `data:` hash, so Ruby writes `data-card-type-name='Topic'
//    data-slot-id='<20 hex>'`: single quotes, like every other attribute of
//    the bar div. Slot wraps built with content_tag keep double quotes.
// 2. Timestamp text. ActiveRecord stores `2026-09-19 12:00:00` for a whole
//    second (quoting.rb quoted_date); the rows a write adds must carry the
//    same text.
//
// The test runs the harness's own runner with the TypeScript adapter over a
// filtered selection, then compares results with the expected outputs.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removeScratchDir, scratchDir } from "../../support/scratch-dir.mjs";
import { pointerListItemBodyForUnknown } from "../../../src/card/render/pointer-list.js";
import { PRODUCTION_PHANTOM_ITEM_TYPE } from "../../deploy/fixtures/production-deck-served-deltas.js";
// @ts-expect-error: plain JavaScript module of the harness, no type declarations
import { normalizeHtml, sameJson } from "../../../reference-harness/runner/normalize.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const HARNESS = path.join(REPO, "reference-harness");
const FIXTURE = path.join(HARNESS, "fixtures", "synthetic-v1");

// Renders whose only difference from Ruby was the bar slot id's quote style:
// a known card's bar (search results, member lists) and a virtual card's bar
// (no data-card-id).
const RENDER_IDS = [
  "core:anonymous:Member",
  "core:admin:Administrator+*members",
  "core:anonymous:Topic 006",
];
// Write steps (scenario, step index) whose only difference from Ruby was the
// stored timestamp text.
const SCENARIO_STEPS: [string, number][] = [
  ["create-note-as-member", 0],
  ["update-topic-as-member", 1],
  ["delete-note", 0],
];
const SCENARIO_IDS = SCENARIO_STEPS.map(([id]) => id);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Line = { id: string; result?: { html?: string }; error?: unknown; steps?: { result: unknown; rows: unknown }[] };
const byId = (text: string): Map<string, Line> =>
  new Map(
    text
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Line)
      .map((o) => [o.id, o]),
  );

let out: string;
let actualRender: Map<string, Line>;
let actualScenarios: Map<string, Line>;
let expectedRender: Map<string, Line>;
let expectedScenarios: Map<string, Line>;

beforeAll(() => {
  out = scratchDir("decko-ts-ruby-forms-");
  const filter = `^(${[...RENDER_IDS, ...SCENARIO_IDS].map(escape).join("|")})$`;
  const run = spawnSync(
    process.execPath,
    [
      path.join(HARNESS, "runner", "run.mjs"),
      "--adapter", path.join(HARNESS, "adapters", "ts", "adapter.json"),
      "--fixture", FIXTURE,
      "--out", out,
      "--kinds", "render,scenarios",
      "--filter", filter,
    ],
    { encoding: "utf8", windowsHide: true, timeout: 170_000 },
  );
  if (run.status !== 0) throw new Error(`harness runner failed (${run.status}):\n${run.stderr}\n${run.stdout}`);
  actualRender = byId(readFileSync(path.join(out, "render.jsonl"), "utf8"));
  actualScenarios = byId(readFileSync(path.join(out, "scenarios.jsonl"), "utf8"));
  expectedRender = byId(gunzipSync(readFileSync(path.join(FIXTURE, "expected", "render.jsonl.gz"))).toString("utf8"));
  expectedScenarios = byId(readFileSync(path.join(FIXTURE, "expected", "scenarios.jsonl"), "utf8"));
}, 180_000);

afterAll(() => {
  if (out) removeScratchDir(out);
});

describe("bar slot ids are written in Ruby's Haml quote style", () => {
  it.each(RENDER_IDS)("%s matches stock Ruby under the N1 mask only", (id) => {
    const expected = expectedRender.get(id)?.result?.html;
    const actual = actualRender.get(id)?.result?.html;
    expect(typeof expected).toBe("string");
    expect(typeof actual).toBe("string");
    // The selection must exercise the single-quoted form, or it proves nothing.
    expect(expected).toMatch(/ data-card-type-name='[^']*' data-slot-id='[0-9a-f]{20}'>/);
    expect(normalizeHtml(actual)).toBe(normalizeHtml(expected));
  });
});

describe("stored timestamps are written in ActiveRecord's text form", () => {
  it.each(SCENARIO_STEPS)("%s step %i writes the rows stock Ruby writes", (id, step) => {
    const expected = expectedScenarios.get(id)?.steps?.[step];
    const actual = actualScenarios.get(id)?.steps?.[step];
    expect(expected).toBeDefined();
    expect(actual).toBeDefined();
    // The step must store a whole-second timestamp, or it proves nothing.
    expect(JSON.stringify(expected!.rows)).toContain('"2026-09-19 12:00:00"');
    expect(sameJson(actual!.rows, expected!.rows)).toBe(true);
  });
});

describe("the denied item bar uses the same Haml form", () => {
  // The read-denied or unknown list item keeps bar.haml's div with its body
  // replaced by two denials; its data attributes, slot id included, are the
  // same sorted, single-quoted Haml list as a live bar's.
  //
  // The item is given the deck's CONFIGURED phantom type (its
  // `*all+*default` template type — deployment configuration), because this
  // pin asserts the ATTRIBUTE ORDER of a
  // typed bar: the slot id comes after the type name. A deck with no
  // configured type emits no type attributes at all and there is no order
  // to assert — the "no type chip" shape is pinned in
  // entity-cluster-pointer-item.test.ts.
  it("writes the slot id single-quoted after the type name", () => {
    const html = pointerListItemBodyForUnknown(
      "Unknown Item",
      undefined,
      PRODUCTION_PHANTOM_ITEM_TYPE,
    );
    expect(html).toMatch(/ data-card-type-name='[^']*' data-slot-id='[0-9a-f]{20}'>\n/);
    expect(html).not.toContain('data-slot-id="');
  });
});
