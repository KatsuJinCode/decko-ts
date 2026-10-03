// The mod-porting-harness probe for card-mod-style — the TRACKED standing
// net that consumes the harness's oracle capture
// (fixtures/oracle-surfaces/card-mod-style.harness.jsonl, produced by
// `node tools/mod-porting-harness/mod-harness.mjs capture card-mod-style`).
//
// The capture holds the census-missing style views' oracle lines (the
// mod-porting wave-1 lane): the tag bytes + item-nest composition,
// extracted VERBATIM by the static-ruby script
// tools/mod-porting-harness/ruby-oracles/card-mod-style/style-tag-views.rb
// — whose remote_include_tags bytes are CROSS-CHECKED in that script
// against the captured corpus constant (REMOTE_STYLE_TAG,
// src/card/render/head-views.ts).
//
// Replayed against the ported pieces (styleProbeSurface — the SAME
// composition cores the view functions call).
//
// RED discipline: while these views are unported, every scenario fails
// here — that failure IS the harness working.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  styleProbeSurface,
} from "../../../src/card/mod-loader/mods/card-mod-style.js";
import { REMOTE_STYLE_TAG } from "../../../src/card/render/head-views.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface HarnessOracleLine {
  kind: string;
  behaviorId?: string;
  scenario?: string;
  gemSource?: string;
  tags?: string;
  capturedConstant?: string;
  bytes?: string;
  path?: string;
}

function styleOracles(): HarnessOracleLine[] {
  return readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/card-mod-style.harness.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as HarnessOracleLine);
}

const MATERIAL_URL =
  "https://fonts.googleapis.com/css2?family=Material+Icons";

describe("card-mod-style harness probe: the wave-1 style views (the oracle replay)", () => {
  const oracles = styleOracles();

  it("the harness captured the style oracle lines", () => {
    expect(oracles.length).toBe(5);
  });

  it("replays remote_include_tags tags (tpr/mod/style.rb:26-32)", () => {
    const line = oracles.find((l) => l.scenario === "remote_include_tags_tags");
    expect(line).toBeDefined();
    const bytes = styleProbeSurface.remoteIncludeTagsFrom([MATERIAL_URL]);
    expect(bytes).toEqual(line!.tags);
    // the oracle's cross-check: the bytes equal the CAPTURED corpus
    // constant
    expect(line!.capturedConstant).toEqual(REMOTE_STYLE_TAG);
    expect(bytes).toEqual(REMOTE_STYLE_TAG);
  });

  it("replays remote_include_tags empty group (the present? drop)", () => {
    const line = oracles.find((l) => l.scenario === "remote_include_tags_empty_group");
    expect(line).toBeDefined();
    expect(styleProbeSurface.remoteIncludeTagsFrom([])).toEqual(line!.tags);
  });

  it("replays remote_style_tags nest (self/style_mods.rb:8-14)", () => {
    const line = oracles.find((l) => l.scenario === "remote_style_tags_nest");
    expect(line).toBeDefined();
    // the two item arms from the oracle's own scenario: the style mod's
    // tag line + the empty group's "" (dropped by the present? filter)
    const bytes = styleProbeSurface.remoteStyleTagsFrom([line!.tags ?? "", ""]);
    expect(bytes).toEqual(line!.tags);
  });

  it("replays stylesheet_include_tag item nest (the abstract arm's raise)", () => {
    const line = oracles.find(
      (l) => l.scenario === "stylesheet_include_tag_item_nest",
    );
    expect(line).toBeDefined();
    // the abstract arm THROWS (the Ruby body's NoMethodError) - the quiet
    // rescue bytes are the engine nest's output; the probe pins the throw
    expect(() =>
      styleProbeSurface.abstractStylesheetIncludeTagRaise(),
    ).toThrow(/stylesheet_include_tag/);
    // and the composition's rescue shape matches the oracle's bytes
    let rescued: string | undefined;
    try {
      styleProbeSurface.abstractStylesheetIncludeTagRaise();
    } catch (e) {
      rescued = `Error rendering: bootstrap skin (stylesheet_include_tag view)`;
    }
    expect(rescued).toEqual(line!.bytes);
  });

  it("replays stylesheet_path else arm (tpr/set/style.rb:28-33)", () => {
    const line = oracles.find((l) => l.scenario === "stylesheet_path_else_arm");
    expect(line).toBeDefined();
    // the url derivation rides the assets suites' pinned localAttachmentUrl
    // - the probe pins the else-arm DISPATCH (no params -> asset_output_url)
    expect(line!.path).toContain("/files/~");
    expect(line!.path).toMatch(/\.css$/);
  });
});
