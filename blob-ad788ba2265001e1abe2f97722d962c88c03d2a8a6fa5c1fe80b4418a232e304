// The UNFOLLOW CONTROL ON THE BOARD pin (registry row cap-W2, "Unfollow from
// the board").
//
// ORACLE-PINNED: fixtures/captured/unfollow-board.json, captured from the
// pinned gemset (card-mod-follow-0.20.0) by
// tests/card/mod-loader/oracle-capture-unfollow-board.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-follow-0.20.0 set/all/follow/start_follow_link.rb - the START
//      STATE: `@rule_content = "*always"`, `@link_text = "follow"`, `@action =
//      "send"`, `@css_class = ""`.
//   2. card-mod-follow-0.20.0 set/all/follow/stop_follow_link.rb - the STOP
//      STATE: `@rule_content = "*never"`, `@link_text = "following"`,
//      `@hover_text = "unfollow"`, `@action = "stop sending"`, `@css_class =
//      "btn-item-delete"`.
//   3. card-mod-follow-0.20.0 set/all/follow/follow_link.rb - the SHAPE: the
//      button is `link_to render_link_text, opts` over the css_classes chain
//      ("follow-link", the state's own css_class, "slotter btn btn-sm
//      btn-primary"), the data-update-foreign-slot hook and the hover_text
//      arm; link_opts is `{ title: title, path: path(success_view), class:
//      css_class }`; render_link_text is the `<span class="follow-verb">`; the
//      title is `"#{action} emails about changes to #{@card.follow_label}"`;
//      and path is the WRITE: `card: { content: "[[#{rule_content}]]" }`.
//   4. card-mod-follow-0.20.0 set/all/follow/follow_link_views.rb - the STATE
//      PICKER: `card.followed? ? StopFollowLink : StartFollowLink`.
//   5. card-mod-follow-0.20.0 set/right/following.rb - the STORAGE READ:
//      `current_follow_rule_card` is `card.left.preference :follow`.
//
// And the follower COUNT, the only leg that sees the cache:
// card-mod-follow-0.20.0 set/all/follow/follower_ids.rb owns
// FOLLOWER_IDS_CACHE_KEY, the cache read and `followers_count`.
//
// The port side is the edit mod (src/card/mod-loader/mods/card-mod-edit.ts)
// for the follow button, and the harness's own predicate
// (tools/edge-signed-in-exercise/lib/unfollow-from-board.mjs) for the four
// legs.
//
// The third leg is that predicate itself: the four bytes Ruby derives per
// state (verb, rule content in the href, title, delete class, hover text),
// the STORED preference read back out of the deck, the rule's identity across
// the transition, and the follower count returning to its baseline. A link
// that says "following" while its href still writes *always must fail.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/unfollow-board.json", import.meta.url),
    "utf8",
  ),
);
const portEdit = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-edit.ts",
    import.meta.url,
  ),
  "utf8",
);
const predicate = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/lib/unfollow-from-board.mjs",
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

describe("the pinned Ruby's own bytes for the follow control", () => {
  it("the two states differ on their own four values", () => {
    expect(capture.facts.start_rule_content).toBe('@rule_content = "*always"');
    expect(capture.facts.start_link_text).toBe('@link_text = "follow"');
    expect(capture.facts.start_action).toBe('@action = "send"');
    expect(capture.facts.start_css_class).toBe('@css_class = ""');
    expect(capture.facts.stop_rule_content).toBe('@rule_content = "*never"');
    expect(capture.facts.stop_link_text).toBe('@link_text = "following"');
    expect(capture.facts.stop_hover_text).toBe('@hover_text = "unfollow"');
    expect(capture.facts.stop_action).toBe('@action = "stop sending"');
    expect(capture.facts.stop_css_class).toBe(
      '@css_class = "btn-item-delete"',
    );
  });

  it("the base class owns the anchor's shape", () => {
    expect(capture.facts.button_class_chain).toBe(
      'class: @format.css_classes("follow-link", link_opts[:class],',
    );
    expect(capture.facts.button_class_chain_tail).toBe(
      '"slotter btn btn-sm btn-primary")',
    );
    expect(capture.facts.button_foreign_slot).toBe(
      'opts["data-update-foreign-slot"] =',
    );
    expect(capture.facts.button_hover_arm).toBe(
      'opts["data-hover-text"] = hover_text if hover_text',
    );
    expect(capture.facts.button_link_to).toBe(
      "link_to render_link_text, opts",
    );
    expect(capture.facts.link_opts).toBe(
      '{ title: title,\n      path: path(success_view),\n      class: css_class }',
    );
    expect(capture.facts.render_link_text).toBe(
      'verb = %(<span class="follow-verb">#{link_text}</span>)',
    );
    expect(capture.facts.title).toBe(
      '"#{action} emails about changes to #{@card.follow_label}"',
    );
  });

  it("the path is the write the storage leg grades", () => {
    expect(capture.facts.path_action).toBe("action: :update,");
    expect(capture.facts.path_success).toBe(
      "success: { mark: @card.name, view: view },",
    );
    expect(capture.facts.path_content_write).toBe(
      'card: { content: "[[#{rule_content}]]" }',
    );
  });

  it("the state picker, the storage read and the count cache", () => {
    expect(capture.facts.follow_link_class).toBe(
      "card.followed? ? StopFollowLink : StartFollowLink",
    );
    expect(capture.facts.current_follow_rule_card).toBe(
      "card.left.preference :follow",
    );
    expect(capture.facts.follower_ids_cache_key).toBe(
      'FOLLOWER_IDS_CACHE_KEY = "FOLLOWER_IDS".freeze',
    );
    expect(capture.facts.follower_ids_cache_read).toBe(
      "Card.follower_ids_cache[id]",
    );
    expect(capture.facts.followers_count).toBe("follower_ids.size");
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.start_follow_link.gem).toBe(
      "card-mod-follow-0.20.0",
    );
    expect(capture.oracle.stop_follow_link.gem).toBe(
      "card-mod-follow-0.20.0",
    );
    expect(capture.oracle.follow_path.gem).toBe("card-mod-follow-0.20.0");
    expect(capture.oracle.current_follow_rule_card.gem).toBe(
      "card-mod-follow-0.20.0",
    );
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's follow button emits both states byte for byte", () => {
    expect(portEdit).toContain("export function followButton(");
    expect(portEdit).toContain(
      "? `send emails about changes to ${bundle.followLabel}`",
    );
    expect(portEdit).toContain(
      ": `stop sending emails about changes to ${bundle.followLabel}`;",
    );
    expect(portEdit).toContain(
      '"follow-link  slotter btn btn-sm btn-primary"',
    );
    expect(portEdit).toContain(
      '"follow-link btn-item-delete slotter btn btn-sm btn-primary";',
    );
    expect(portEdit).toContain('const verb = start ? "follow" : "following";');
    expect(portEdit).toContain(
      'const option = start ? "always" : "never";',
    );
    expect(portEdit).toContain(
      'const hover = start ? "" : ` data-hover-text="unfollow"`;',
    );
    expect(portEdit).toContain(
      "?card%5Bcontent%5D=%5B%5B%2A${option}%5D%5D",
    );
    expect(portEdit).toContain(
      '`<span class="follow-verb">${verb}</span></a>`',
    );
  });
});

describe("the harness's W2 predicate cannot pass vacuously", () => {
  it("the row declares exactly the predicate's four check names", () => {
    const row = capabilities.capabilities.find(
      (c: { id: string }) => c.id === "W2",
    );
    expect(row).toBeDefined();
    expect(row.checks).toEqual([
      "the Engage tab offers the start-follow link with Ruby's follow bytes: verb, title, class and an *always href",
      "after following, the same control offers Ruby's stop link: verb 'following', the btn-item-delete class, the stop-sending title and an *never href",
      "clicking the stop link leaves the stored follow preference at *never, on the same rule it followed",
      "after unfollowing, the control is byte-identical to the start state and the follower count is back to its baseline",
    ]);
    for (const name of row.checks) {
      expect(predicate).toContain(`"${name}"`);
    }
  });

  it("the predicate grades all four bytes of each state", () => {
    expect(predicate).toContain('if (shape.verb !== want.verb) failures.push("verb");');
    expect(predicate).toContain(
      'if (shape.ruleContent !== want.ruleContent) failures.push("ruleContent");',
    );
    expect(predicate).toContain('if (shape.title !== want.title) failures.push("title");');
    expect(predicate).toContain(
      'if (!want.classes.every((cls) => shape.classes.includes(cls))) failures.push("baseClasses");',
    );
    expect(predicate).toContain(
      "if (hasDelete !== (want.deleteClass !== null)) failures.push(\"deleteClass\");",
    );
    expect(predicate).toContain(
      'if ((shape.hover ?? null) !== want.hover) failures.push("hoverText");',
    );
  });

  it("the predicate grades the STORED preference and the rule's identity", () => {
    expect(predicate).toContain(
      'if (after?.storedOption !== "*always") failures.push("afterNotFollowed");',
    );
    expect(predicate).toContain(
      'if (stopped?.storedOption !== "*never") failures.push("afterNotUnfollowed");',
    );
    expect(predicate).toContain(
      'if (afterRule !== null && stoppedRule !== null && afterRule !== stoppedRule) failures.push("ruleChanged");',
    );
  });

  it("the predicate grades the follower count against its baseline", () => {
    expect(predicate).toContain(
      "if (Number.isFinite(baseline) && Number.isFinite(after?.followerCount) && after.followerCount !== baseline + 1) {",
    );
    expect(predicate).toContain(
      "if (Number.isFinite(baseline) && Number.isFinite(stopped?.followerCount) && stopped.followerCount !== baseline) {",
    );
  });

  it("the predicate reads the rule content out of the ENCODED href", () => {
    expect(predicate).toContain(
      'const content = /card\\[content\\]=(\\[\\[[^\\]]*\\]\\])/.exec(decoded);',
    );
    expect(predicate).toContain(
      'if (content !== null) ruleContent = content[1];',
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("*never");
    expect(
      readFileSync(repoRoot + "fixtures/captured/unfollow-board.json", "utf8"),
    ).toContain('"stop_follow_link"');
  });
});
