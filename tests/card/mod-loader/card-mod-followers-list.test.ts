// The FOLLOWERS LIST AND THE ALL FOLLOWED CARDS VIEW pin (registry row
// cap-W4, "Followers list and 'all followed cards' view").
//
// ORACLE-PINNED: fixtures/captured/followers-list.json, captured from the
// pinned gemset (card-mod-follow-0.20.0, card-mod-edit-0.20.0, card-1.110.0)
// by tests/card/mod-loader/oracle-capture-followers-list.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-follow-0.20.0 set/right/followers.rb - the FOLLOWERS LIST:
//      view :core, cache: :never is the `super()` passthrough, and the VIEW'S
//      BODY IS NOT IN THE VIEW: `def content` is `left ?
//      item_names.to_pointer_content : ""` and `def item_names _args={}` is
//      `left ? left.follow_set_card.prototype.follower_names : []` - the
//      follower NAMES as the card's pointer content.
//   2. card-mod-follow-0.20.0 set/right/following.rb - the ALL FOLLOWED CARDS
//      VIEW: view :core is a branch - `render_rule_editor` when `card.left &&
//      Auth.signed_in?`, else `nest Card.fetch(card.name.left, :followers),
//      view: :titled, items: { view: :link }`.
//   3. card-mod-follow-0.20.0 set/all/follow/follower_ids.rb - the NAMES the
//      list shows: `def follower_names` is `followers.map(&:name)`.
//   4. card-mod-edit-0.20.0 set/all/board/follow_section.rb - the TWO LINKS
//      on the board: followers_board_link is `card.name.field(:followers)`
//      with the label `"#{cnt} follower#{'s' unless cnt == 1}"`, and
//      follow_overview_button is `[Auth.current, :follow]` with the literal
//      "all followed cards".
//
// THE MEASURED GAP. This row is a MEASURED SKIP at this branch's tip, and the
// measurement is pinned here so it cannot drift silently: the capture scans
// the port's follow mod and records that the follower_names call appears only
// in COMMENTS (never in executable code) and that the right/following
// registration carries :status and :rule_editor but NOT :core. Those are the
// two reasons the port cannot render either view today.
//
// A pin that asserts a gap is a TRIPWIRE, not a red test: it passes while the
// gap is open and fails the moment the port grows the views, which is the
// signal to close the row.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/followers-list.json", import.meta.url),
    "utf8",
  ),
);
const portFollow = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-follow.ts",
    import.meta.url,
  ),
  "utf8",
);
const capabilities = JSON.parse(
  readFileSync(
    new URL(
      "./../../../tools/edge-signed-in-exercise/capabilities.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("the pinned Ruby's own bytes for the two views", () => {
  it("the followers list's body is the follower names as pointer content", () => {
    expect(capture.facts.followers_core_view).toBe(
      "view :core, cache: :never do",
    );
    expect(capture.facts.followers_core_super).toBe("super()");
    expect(capture.facts.followers_content).toBe(
      'left ? item_names.to_pointer_content : ""',
    );
    expect(capture.facts.followers_item_names).toBe(
      "left ? left.follow_set_card.prototype.follower_names : []",
    );
    expect(capture.facts.follower_names_method).toBe("followers.map(&:name)");
    expect(capture.facts.to_pointer_content_strip).toBe(
      "item = item.to_s.strip",
    );
    expect(capture.facts.to_pointer_content_join).toBe('end.join "\\n"');
  });

  it("the all-followed-cards view branches on the signed-in state", () => {
    expect(capture.facts.following_core_view).toBe("view :core do");
    expect(capture.facts.following_core_branch).toBe(
      "if card.left && Auth.signed_in?",
    );
    expect(capture.facts.following_core_rule_editor).toBe(
      "render_rule_editor",
    );
    expect(capture.facts.following_core_nest).toBe(
      "nest Card.fetch(card.name.left, :followers), view: :titled, items: { view: :link }",
    );
  });

  it("the board's two links are the ones the row names", () => {
    expect(capture.facts.follow_overview_button_target).toBe(
      'link_to_card [Auth.current, :follow], "all followed cards",',
    );
    expect(capture.facts.follow_overview_button_text).toBe(
      '"all followed cards",',
    );
    expect(capture.facts.followers_board_link_target).toBe(
      "link_to_card card.name.field(:followers),",
    );
    expect(capture.facts.followers_board_link_label).toBe(
      "\"#{cnt} follower#{'s' unless cnt == 1}\"",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.followers_core_view.gem).toBe(
      "card-mod-follow-0.20.0",
    );
    expect(capture.oracle.following_core_view.gem).toBe(
      "card-mod-follow-0.20.0",
    );
    expect(capture.oracle.follow_section_links.gem).toBe(
      "card-mod-edit-0.20.0",
    );
    expect(capture.oracle.to_pointer_content.gem).toBe("card-1.110.0");
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the measured gap at this tip", () => {
  const gap = capture.port_gap as {
    port_mod_path: string;
    port_mod_sha256: string;
    follower_names_occurrences_in_code: number;
    follower_names_occurrences_in_comments: number;
    follower_names_called_in_code: boolean;
    right_following_registration_found: boolean;
    right_following_registers_core_view: boolean;
    right_following_registers_status_view: boolean;
    right_following_registers_rule_editor_view: boolean;
  };

  it("the port's follow mod is the file the measurement scanned", () => {
    expect(gap.port_mod_path).toBe(
      "src/card/mod-loader/mods/card-mod-follow.ts",
    );
    expect(gap.port_mod_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the port names follower_names only in COMMENTS, never in code", () => {
    expect(gap.follower_names_occurrences_in_code).toBe(0);
    expect(gap.follower_names_called_in_code).toBe(false);
    expect(gap.follower_names_occurrences_in_comments).toBe(2);
    // The live check strips BOTH comment kinds before it looks. A block
    // comment is a comment too: the follow mod names the Ruby method in a
    // doc block as well as in line comments, so a filter that removed only
    // the line comments read the block's text as code and fired on a
    // comment. The pin's claim is unchanged: no follower_names call in
    // executable code.
    const code = portFollow
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("follower_names");
  });

  it("the port registers no :core view on the right/following set", () => {
    expect(gap.right_following_registration_found).toBe(true);
    expect(gap.right_following_registers_core_view).toBe(false);
    expect(gap.right_following_registers_status_view).toBe(true);
    expect(gap.right_following_registers_rule_editor_view).toBe(true);
  });
});

describe("the row stays a measured skip", () => {
  it("the row declares no checks and stays not_covered", () => {
    const row = capabilities.capabilities.find(
      (c: { id: string }) => c.id === "W4",
    );
    expect(row).toBeDefined();
    expect(row.status).toBe("not_covered");
    // Declaring a leg is not passing it: the row declares none, because
    // nothing here could pass.
    expect(row.checks ?? []).toEqual([]);
  });

  it("no check module declares W4, so no run can credit the row", () => {
    const harness = readFileSync(
      new URL(
        "./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs",
        import.meta.url,
      ),
      "utf8",
    );
    expect(harness).not.toContain('"W4"');
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("follower names");
    expect(
      readFileSync(repoRoot + "fixtures/captured/followers-list.json", "utf8"),
    ).toContain('"followers_item_names"');
  });
});
