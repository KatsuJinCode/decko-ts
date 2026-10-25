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
//   show.rb     the show page's rails
//   views.rb    :content :content_with_title :content_panel :titled
//   wrap.rb     the page wrapper
//
// THE PORT. The format mod registers the html format's own set path
// ("all/html") and the self-contained views it can carry, and it does NOT
// register the five slot modules above: the port's page assembly is its
// own (src/card/render/page.ts, src/card/render/navbar-views.ts,
// src/card/render/head-views.ts) rather than the gem's slot-level html
// views. The port's own file says so
// (src/card/mod-loader/mods/card-mod-format.ts:124-135, "STILL UNPORTED
// from this group").
//
// So a card asked for one of the 24 view names the gem declares and the
// port does not register has no view to dispatch where Ruby renders it.
// This file pins the census reading that says so: the five set paths are
// absent, the html format's own set path is present, and the number of
// view names left open is the one the row's fixture names.

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

  it("registers none of the five slot modules the gem declares", () => {
    const { setPaths } = portRegistrations();
    for (const setPath of [
      "all/html/head",
      "all/html/header",
      "all/html/menu",
      "all/html/show",
      "all/html/wrap",
    ]) {
      expect(setPaths.has(setPath), `${setPath} is registered port-side`).toBe(false);
    }
  });

  it("leaves 24 of the gem's view names unregistered, and names each one", () => {
    const { views } = portRegistrations();
    const open = fixture.gem.viewNames.filter((name) => !views.has(name));
    expect(open.length).toBe(24);
    const named = new Set(
      fixture.namedSkips.filter((skip) => skip.kind === "view").map((skip) => skip.name),
    );
    for (const name of open) {
      expect(named.has(name), `view :${name} is not named open`).toBe(true);
    }
  });

  it("names the five set files the port does not register", () => {
    const named = new Set(
      fixture.namedSkips.filter((skip) => skip.kind === "set-file").map((skip) => skip.name),
    );
    expect([...named].sort()).toEqual([
      "all/html/head",
      "all/html/header",
      "all/html/menu",
      "all/html/show",
      "all/html/wrap",
    ]);
  });
});
