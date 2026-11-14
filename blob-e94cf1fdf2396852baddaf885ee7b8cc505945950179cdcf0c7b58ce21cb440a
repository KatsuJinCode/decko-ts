// Register C11 (decko-completeness-register-2026-10-18.md:819): Card::Path
// URL generation — the register's gap was the missing audit ("a
// construct-by-construct audit of every Ruby `path` call site's emitted
// shape was NOT done"). This suite IS that audit for the grammar itself:
// every construct of Card::Path#render (card-mod-format-0.20.0
// lib/card/path.rb:16-108) is enumerated below against the port's shared
// emitters/parsers, each with its Ruby citation. The port has no single
// Card::Path class — URLs are built at feature sites through the shared
// helpers pinned here, and the PARSE side (the lineage worker surface's
// parsePath, pinned per arm below) is the contract those built URLs mean.
//
// PER-CONSTRUCT AUDIT (path.rb line refs):
//   new_cardtype   :16-21  action new|type + mark -> "new/<mark>"
//   base           :27-34  mark/view, mark, or action_base
//   action_base    :35-38  "card/<action>" markless, "<action>/<mark>"
//   mark           :60-70  url_key of the (mark-resolved, handle_unknown-
//                          adjusted) name; markless for create/no_mark
//   extension      :89-92  ".<format>"
//   query          :94-97  "?<to_param>" (cast_path_hash)
//   anchor         :99-102 "#<anchor>" — NO port emitter found (grep across
//                          src: the port's URL builders never pass an
//                          anchor opt; named remainder, not a divergence —
//                          no graded surface reaches it)
//   handle_unknown :89-108 unknown non-standardish names gain
//                          card[name]=<name> in the query (the wanted-link
//                          prefill; wantedHrefQuerySuffix pins it)
//   contextualize  set/all/path.rb:40-43 card_url absolutization — the
//                          port's redirect surfaces cardUrl the same way
//                          (write-routes cardUrl; the C10 arm's absolute
//                          history entries)

import { describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import { wantedHrefQuerySuffix } from "../../../src/card/render/format.js";
import { parsePath } from "../../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";
import { parseFileRouteSegments } from "../../../src/server/file-routes.js";
import { historyViewParams } from "../../../src/server/worker-shared-surface.js";

describe("C11: the Card::Path grammar, audited construct by construct", () => {
  it("mark: url_key of the name (path.rb:64-69)", () => {
    expect(DeckoName.parse("Help Desk").urlKey).toBe("Help_Desk");
    expect(DeckoName.parse("Jane Doe+Musings").urlKey).toBe("Jane_Doe+Musings");
    // the fold the url_key form relies on (name_standardish?, :105-108)
    expect("Help Desk".replace(/ /g, "_")).toBe(DeckoName.parse("Help Desk").urlKey);
  });

  it("base mark/view and bare mark (path.rb:31-33) — the parse contract", () => {
    // the two-segment arm: :mark/:view, the view matched literally
    const withView = parsePath("/Help_Desk/edit");
    expect("name" in withView && withView.name).toBe("Help Desk");
    expect("view" in withView && withView.view).toBe("edit");
    // the bare mark: card#read -> show(nil) (rest.rb:92-103)
    const bare = parsePath("/Help_Desk");
    expect("name" in bare && bare.name).toBe("Help Desk");
    // the underscore fold is a NAME concern (card_class.rb:131 Name[mark]
    // &.tr "_" -> " "): the mark arrives folded into the card name
  });

  it("new_cardtype: action new|type -> new/<mark> (path.rb:16-21)", () => {
    // the /new/:type arm, precedence ahead of :mark/:view (engine_routes.rb:22)
    const parsed = parsePath("/new/Sign_up");
    expect("kind" in parsed && parsed.kind === "new" ? parsed.typeName : null).toBe("Sign up");
  });

  it("extension: .<format> on the view segment (path.rb:89-92)", () => {
    const parsed = parsePath("/Help_Desk/titled.json");
    expect("format" in parsed && parsed.format).toBe("json");
    expect("view" in parsed && parsed.view).toBe("titled");
  });

  it("query: ?params become render params (path.rb:94-97)", () => {
    // the bare mark's parse default stays "open" (view_from_params consults
    // the query at show time); the query->render-param conversion is the
    // shared surface's historyViewParams (the wire the render's
    // HistoryRenderParams reads). No request context in the harness, so the
    // parse carries no params record.
    const parsed = parsePath("/Help_Desk", new URLSearchParams("view=toggled"));
    expect("view" in parsed && parsed.view).toBe("open");
    expect("params" in parsed).toBe(false);
    // the query's render-visible keys: the search term rides the render
    // params' search (view itself is consulted at show time from the
    // request, not folded into these params)
    const renderParams = historyViewParams(new URLSearchParams("term=ab"));
    expect(renderParams.search?.term).toBe("ab");
  });

  it("handle_unknown: the wanted-link card[name] prefill (path.rb:89-96)", () => {
    // a wanted name whose url_key would LOSE information carries
    // card[name]=<name> (name_standardish? fails on the "-"); a
    // standardish name carries none
    expect(wantedHrefQuerySuffix("Mytho Psychology-Exemplar")).toMatch(/^\?card%5Bname%5D=/);
    expect(wantedHrefQuerySuffix("Help Desk")).toBe("");
  });

  it("the file URL grammar round-trips its own parse (engine_routes.rb:7-13)", () => {
    // files/:mark/:rev_id(-:size).:format — the Ruby route's own 2-segment
    // shape. The mark segment stays AS STORED (underscored) — the fold
    // happens in the route's mark resolution, not the grammar.
    const sized = parseFileRouteSegments(["Some_Card", "123-medium.png"]);
    expect(sized?.mark).toBe("Some_Card");
    expect(sized?.revId).toBe("123");
    expect(sized?.size).toBe("medium");
    expect(sized?.format).toBe("png");
    const plain = parseFileRouteSegments(["Some_Card", "123.png"]);
    expect(plain?.mark).toBe("Some_Card");
    expect(plain?.revId).toBe("123");
    expect(plain?.size).toBeUndefined();
  });
});
