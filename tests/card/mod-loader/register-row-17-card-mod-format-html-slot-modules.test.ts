// The html format's slot modules, and the view names that go with them
// (register row 17, card-mod-format).
//
// RUBY (card-mod-format-0.20.0 set/all/html/):
//
//   head.rb     the head views: :page_title :head :meta_tags
//               :page_title_tag :favicon_tag :universal_edit_button
//               :rss_links :stylesheet_tags
//   header.rb   :header :header_title
//   menu.rb     :menu_block :menu :edit_link :edit_button
//               :full_page_link :board_link :help_link
//   show.rb     the show page's rails (no view declarations)
//   views.rb    :content :content_with_title :content_panel :titled
//   wrap.rb     the page wrapper (no view declarations)
//
// THE PORT. This file PINNED THE GAP until 2026-10-25 (the five set
// paths absent, 24 view names open, each one named in the row fixture's
// namedSkips). Register row 17 closed the gap: the five slot modules
// are manifest entries seated with the views Ruby declares on them -
// the engine's shared-table fns for the names it carries (render/views.ts
// was transcribed from these same gem files), the head byte builders the
// page path shares for the head family, and the recorded stock-config
// answer for rss :feed. The former mis-seat ("all/head", a path no gem
// file declares) is gone: the head views live on the gem-faithful
// "all/html/head".
//
// This file now pins the closure: the five set paths are present, the
// html format's own set path is present, and no gem view name is left
// unregistered on the mod file.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPortSetPathRegistrations } from "../../../tools/audit-mod-port-registration-reader.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PORT_FILE = "src/card/mod-loader/mods/card-mod-format.ts";
const FIXTURE = join(
  REPO,
  "tests",
  "card",
  "mod-loader",
  "fixtures",
  "roster-batch-20261025",
  "register-row-17-card-mod-format-oracle-surface.json",
);

type RowFixture = {
  gem: { setFiles: string[]; viewNames: string[]; eventNames: string[] };
  namedSkips: { kind: "view" | "event" | "set-file"; name: string; reason: string }[];
};

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as RowFixture;

const portRegistrations = () => {
  const text = readFileSync(join(REPO, PORT_FILE), "utf8");
  const { bySetPath } = readPortSetPathRegistrations(text);
  const views = new Set<string>();
  for (const entry of bySetPath.values()) for (const view of entry.views) views.add(view);
  return { setPaths: new Set(bySetPath.keys()), views };
};

describe("the html format's slot modules at this tree", () => {
  it("registers the html format's own set path", () => {
    expect(portRegistrations().setPaths.has("all/html")).toBe(true);
  });

  it("registers all five slot modules the gem declares", () => {
    const { setPaths } = portRegistrations();
    for (const setPath of [
      "all/html/head",
      "all/html/header",
      "all/html/menu",
      "all/html/show",
      "all/html/wrap",
    ]) {
      expect(setPaths.has(setPath), `${setPath} is not registered port-side`).toBe(true);
    }
  });

  it("registers every one of the gem's view names", () => {
    const { views } = portRegistrations();
    const open = fixture.gem.viewNames.filter((name) => !views.has(name));
    expect(open).toEqual([]);
  });

  it("carries no named skips and no open set file", () => {
    const { setPaths } = portRegistrations();
    for (const setFile of fixture.gem.setFiles) {
      expect(setPaths.has(setFile.replace(/\.rb$/, "")), setFile).toBe(true);
    }
    expect(fixture.namedSkips).toEqual([]);
  });

  it("seats the slot views on the set paths Ruby declares them on", () => {
    // The seating, read off the gem's files: menu.rb's seven views on
    // All::Html::Menu, header.rb's two, head.rb's html block and base
    // :page_title, html.rb's :type_info, views.rb's pair, html/error.rb's
    // :conflict; and the seats that close the remaining open names ride
    // the set paths the gem declares them on (error.rb's jsonld
    // :format_unsupported, csv.rb's :body, rss.rb's feed trio, text.rb's
    // :text_without_nests, title.rb's :title/:title_no_link,
    // self/home.rb's pair).
    const seating: Readonly<Record<string, readonly string[]>> = {
      "all/html/menu": [
        "menu_block",
        "menu",
        "edit_link",
        "edit_button",
        "full_page_link",
        "board_link",
        "help_link",
      ],
      "all/html/header": ["header", "header_title"],
      "all/html/head": [
        "head",
        "meta_tags",
        "page_title",
        "page_title_tag",
        "favicon_tag",
        "universal_edit_button",
        "rss_links",
        "stylesheet_tags",
      ],
      "all/html": ["type", "type_info"],
      "all/html/views": ["content_with_title", "content_panel"],
      "all/html/error": ["conflict"],
      "all/error": ["format_unsupported"],
      "all/csv": ["body"],
      "all/rss": ["feed", "feed_body", "feed_item"],
      "all/text": ["text_without_nests"],
      "all/title": ["title", "title_no_link"],
      "self/home": ["home_url", "home_path"],
    };
    const text = readFileSync(join(REPO, PORT_FILE), "utf8");
    const { bySetPath } = readPortSetPathRegistrations(text);
    for (const [setPath, names] of Object.entries(seating)) {
      const seated = bySetPath.get(setPath)?.views ?? [];
      for (const name of names) {
        expect(seated, `view :${name} is not seated on ${setPath}`).toContain(name);
      }
    }
  });
});
