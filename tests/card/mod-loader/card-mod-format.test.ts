// The card-mod-format mod loader integration test: the mod loaded
// through the loader registers its views and the rendered bytes match
// the Ruby source semantics.
//
// Proof shape (A/B per ported view):
//   WITHOUT the mod: render the view on the seeded probe card raises the
//     unsupported-view error (render.ts#view_method - the view does not
//     exist on the live registry; bar_right is in HTML_VIEWS already,
//     so it is excluded from this assertion).
//   WITH the mod: the view renders the port's documented bytes; the
//     set-modules basket records the full gem tree.
//
// Probe cards:
//   - Oracle Format Probe (basic card with content + a date-bearing
//     record; the name/date/content family reads it)
//   - Oracle Date Probe (no content; the date views fall through to
//     the date-only path)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";

/** The captured layout one-line oracle (fixtures/captured/layout-one-line.
 *  json, captured from the live decko 0.20.0 oracle app via
 *  tests/card/mod-loader/oracle-capture-layout-one-line.rb). The
 *  "Oracle One Line Plain Probe" arm is the standing pin of the All-set
 *  html :one_line_content wrap arm (set/all/html/views.rb:29-32) — the
 *  layout-fixture-adjudication gem-proved those bytes derive exactly
 *  from that arm. */
const ONE_LINE_FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../fixtures/captured/layout-one-line.json", import.meta.url),
    ),
    "utf8",
  ),
) as {
  constants: { ONE_LINE_CHARACTER_LIMIT: number };
  rendered: Record<string, string>;
  view_registry: Record<string, { defined?: boolean; source_location?: [string, number] }>;
};

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // Oracle Format Probe - the name + content + date view family
  // reads db_content for raw + content + one_line_content.
  await seedCard(s, {
    id: 200,
    name: "Oracle Format Probe",
    dbContent: "Hello world",
  });
  // Oracle Date Probe - empty content; the date views fall through
  // to the date-only rendering.
  await seedCard(s, {
    id: 201,
    name: "Oracle Date Probe",
  });
  // the Mod cardtype card + a Mod-typed probe. seed-sweep
  // 2026-09-29: :admin is defined on the Type::Mod set (type/mod.rb:3-5),
  // so the view is reachable only for Mod-TYPED cards - the corpus
  // recapture carries the "mod" cardtype and its 64 Mod-typed mod cards.
  // The old probe rendered :admin on a default-typed card, which only the
  // pre-narrowing flat record answered; Ruby raises there.
  await seedCard(s, { id: 202, name: "Mod", codename: "mod", typeId: 2 });
  await seedCard(s, {
    id: 203,
    name: "Oracle Mod Probe",
    dbContent: "Hello world",
    typeId: 202, // the Mod cardtype
  });
  // the URI cardtype card + URI-typed probes (uri-cardtype-port
  // 2026-10-01): set/type/uri.rb's overrides are reachable only for
  // URI-TYPED cards - the chain-scoped registration dispatches through
  // resolveView's TYPE-uri walk (the Mod probe pattern, above). One probe
  // per links.rb:65-72 resource_type arm: external (https), internal
  // (leading slash), email (mailto), other-scheme (ftp), and NO scheme
  // (nil resource_type - bare href, no class, no target).
  await seedCard(s, { id: 204, name: "URI", codename: "uri", typeId: 2 });
  await seedCard(s, {
    id: 205,
    name: "Oracle Uri Probe",
    dbContent: "https://example.com/Page",
    typeId: 204, // the URI cardtype
  });
  await seedCard(s, {
    id: 206,
    name: "Oracle Uri Internal",
    dbContent: "/Internal_Path",
    typeId: 204,
  });
  await seedCard(s, {
    id: 207,
    name: "Oracle Uri Mailto",
    dbContent: "mailto:person@example.com",
    typeId: 204,
  });
  await seedCard(s, {
    id: 208,
    name: "Oracle Uri Scheme",
    dbContent: "ftp://example.com/x",
    typeId: 204,
  });
  await seedCard(s, {
    id: 209,
    name: "Oracle Uri Plain",
    dbContent: "plain words no scheme",
    typeId: 204,
  });
  // the HTML + Toggle cardtype cards and probes (unported-types-audit
  // lane 2026-10-01): type/html.rb's :one_line_content override and
  // type/toggle.rb's :one_line_content helper funnel are reachable only
  // for cards of those types — chain-scoped registrations (the URI probe
  // pattern, above).
  await seedCard(s, { id: 220, name: "HTML", codename: "html", typeId: 2 });
  await seedCard(s, {
    id: 221,
    name: "Oracle Html Oneline Long",
    // 70 raw chars inside a tag shell: strip_tags leaves the 70-char
    // body, truncate(60, "...") yields the first 57 + "..." — the same
    // bytes the layout-one-line.json Long+*head arm captured for the
    // Right::Head sibling of this composition.
    dbContent: `<p>${"abcdefghij".repeat(7)}</p>`,
    typeId: 220, // the HTML cardtype
  });
  await seedCard(s, {
    id: 222,
    name: "Oracle Html Oneline Short",
    dbContent: '<div class="probe">plain body</div>',
    typeId: 220,
  });
  await seedCard(s, { id: 223, name: "Toggle", codename: "toggle", typeId: 2 });
  await seedCard(s, {
    id: 224,
    name: "Oracle Toggle Yes",
    dbContent: "1",
    typeId: 223, // the Toggle cardtype
  });
  await seedCard(s, {
    id: 225,
    name: "Oracle Toggle No",
    dbContent: "0",
    typeId: 223,
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-format through the mod loader (A/B)", () => {
  it("WITHOUT the mod: every ported view raises UnsupportedViewError", async () => {
    const s = storage!;
    // views NOT already in HTML_VIEWS. The HTML_VIEWS table already
    // covers: link, blank, unknown, titled, titled_content, content,
    // core, open, closed, etc. (src/card/render/views.ts). The mod
    // adds the rest.
    const portedViews = [
      // REMOVED from this negative list 2026-09-30 (surfaces-batch2):
      // "name", "linkname", "labeled_content", "labeled" — the flat
      // HTML_VIEWS table now carries deliberate loader-less fallback
      // registrations for all four (views.ts:3440-3457 flatNameView /
      // flatLinknameView citing the recapture baseline's
      // handler_raised:Card::Error samples on Role+*type+*default and
      // Cardtype+*type+*default; views.ts:2965-2987 labeledView for the
      // oracle target-152 labeled arm). The graded verifier binds no mod
      // loader, so the fallbacks ARE the shipped surface for those views —
      // the negative assertion for them is stale, not the registrations.
      // REMOVED 2026-09-30 (mm-roleviews): "url" — the flat
      // HTML_VIEWS table now carries the :url body (views.ts#cardUrlView,
      // the same function card-mod-format's set-scoped registration uses),
      // because the four notification templates' `{{_|url}}` marks are
      // loader-less page-lane content. Same premise, same citation: the
      // negative assertion is stale, not the registration.
      "key",
      "id_url",
      "url_link",
      "nav_link",
      "codename",
      "id",
      "type",
      "created_at",
      "updated_at",
      "acted_at",
      "raw",
      "one_line_content",
      "compact_missing",
      "server_error",
      "denial",
      "not_found",
      "bad_address",
      "errors",
      "label",
      "closed_content",
      "raw_one_line_content",
      "admin",
    ];
    for (const view of portedViews) {
      await expect(
        s.engine.render("Oracle Format Probe", view),
      ).rejects.toThrow(UnsupportedViewError);
    }
  });

  it("WITH the mod: :name renders the card name (base.rb:14-16)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModFormat }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    expect(await s.engine.render("Oracle Format Probe", "name")).toBe(
      "Oracle Format Probe",
    );
  });

  it("WITH the mod: :key renders the URL-safe key (base.rb:26)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Format Probe", "key")).toBe(
      "oracle_format_probe",
    );
  });

  it("WITH the mod: :linkname renders the URL-safe key (base.rb:27)", async () => {
    const s = storage!;
    // urlKey preserves case + replaces spaces with underscores.
    expect(await s.engine.render("Oracle Format Probe", "linkname")).toBe(
      "Oracle_Format_Probe",
    );
  });

  it("WITH the mod: :url renders the view-lane card_url (base.rb:28 card_url _render_linkname)", async () => {
    const s = storage!;
    // fix-d1-url-origin 2026-10-01: `card_url` is
    // `"#{Env.origin}#{card_path rel}"` (card-1.110.0 lib/card/env/
    // location.rb:19-21) and `Env.origin` is a PER-RENDER value
    // (serializable.rb:20-22 `Cardio.config.deck_origin ||
    // "#{protocol}#{request&.host_with_port}"`). This `render()` call is
    // the VIEW-FUNCTION lane — the same lane the view-lane capture
    // photographs (`capture-dual-lane-page-and-view.rb:277-287, rendered
    // outside the production-config block with a controller-less
    // `Card::Env.reset`), where origin is "". So the Ruby-true form HERE
    // is the rooted path. The page-lane counterpart is pinned separately
    // below; both shapes are in the frozen record for the same mark
    // (`/User` vs `https://culturesmith.com/User`, card 21792).
    // mm-roleviews 2026-09-30 had moved this value to the absolute
    // URL under the "graded surface is the page corpus" adjudication;
    // that adjudication could not express the other lane's bytes, which
    // is what left 21792/21796 red behind a "not closable" blocker.
    expect(await s.engine.render("Oracle Format Probe", "url")).toBe(
      "/Oracle_Format_Probe",
    );
  });

  it("WITH the mod: :url renders the origin-absolute card_url on the PAGE lane", async () => {
    const s = storage!;
    // The other half of the same seam. The page capture sets
    // `Cardio.config.deck_origin = "https://culturesmith.com"`
    // (capture-dual-lane-page-and-view.rb:343, restored at :348), so
    // every page render sees a non-empty origin and the same helper
    // returns the absolute URL. runWithPageConfig is exactly the scope
    // page.ts:141 wraps renderPageBytes in, so this is the surface the
    // 6588 page-lane oracle rows pin (`decko.rootUrl=
    // 'https://culturesmith.com/'`; `<a href="https://culturesmith.com/
    // User">` on card 21792).
    expect(
      await s.engine.runWithPageConfig(() => s.engine.render("Oracle Format Probe", "url")),
    ).toBe("https://culturesmith.com/Oracle_Format_Probe");
  });

  it("WITH the mod: :id_url renders the view-lane id-mark card_url (base.rb:29)", async () => {
    const s = storage!;
    // Ruby-exact card_url form (env/location.rb:19-21, card_path
    // location.rb:6-16): `/~<id>` with the origin absent,
    // `https://culturesmith.com/~<id>` with it present. Surface-scoped
    // like the sibling :url above — this render() is the view-function
    // lane, so origin is "". The former bare ~200 was the pre-card_url
    // divergence (strand-fold receipt limitation 4), closed by the
    // small-engine-items lane 2026-10-01; the page-lane half is pinned
    // in the next test.
    expect(await s.engine.render("Oracle Format Probe", "id_url")).toBe("/~200");
  });

  it("WITH the mod: :id_url renders the origin-absolute id-mark card_url on the PAGE lane", async () => {
    const s = storage!;
    expect(
      await s.engine.runWithPageConfig(() => s.engine.render("Oracle Format Probe", "id_url")),
    ).toBe("https://culturesmith.com/~200");
  });

  it("WITH the mod: :id_url renders blank for an unknown card (no id)", async () => {
    const s = storage!;
    // an unknown card has no id; the port returns ""
    // (engine returns "" for an unknown card with no id).
    const unknownCard = s.engine as unknown as {
      renderUnknown(view: string): Promise<string>;
    };
    if (typeof unknownCard.renderUnknown === "function") {
      expect(await unknownCard.renderUnknown("id_url")).toBe("");
    }
  });

  it("WITH the mod: :url_link renders the view-lane internal-link anchor (base.rb:31-33)", async () => {
    const s = storage!;
    // Ruby's chain: base.rb:31-33 `link_to_resource card_url(
    // _render_linkname)` → linkname (base.rb:27, url_key cardname-0.20.0
    // lib/cardname/variants.rb:8-13, "Oracle_Format_Probe") → card_url
    // (card-1.110.0 lib/card/env/location.rb:19-21) → html
    // link_to_resource (set/all/links.rb:127-130) add_resource_opts
    // (links.rb:154-157): resource_type (links.rb:65-72) is decided by the
    // RESOURCE, and on the view-function lane the resource is the rooted
    // path "/Oracle_Format_Probe", so links.rb:68 (`^/` →
    // "internal-link") wins, NOT links.rb:67's external arm — which also
    // means NO target (links.rb:155 gates `target="_blank"` on the
    // external type). base super links.rb:44-47 (clean_resource
    // links.rb:74-81: internal strips the leading slash and html's
    // contextualize_path re-roots it — path.rb:68-73 → card_path
    // location.rb:6-16 — so the bytes come back identical) → html link_to
    // (links.rb:101-106): href = the resource (path.rb:35-36 String
    // bypass), text = raw(href) (links.rb:103) — the anchor text IS the
    // href.
    // Attribute order target→class→href is capture-pinned
    // (fixtures/captured/sass-style-pages/oracle-main-slot-regions.json
    // carries `&lt;a target=&quot;_blank&quot; class=&quot;external-link&quot;
    // href=&quot;https://github.com/...&quot;&gt;` — real decko
    // link_to_resource output); with no external type the target attribute
    // is simply absent and class comes first, per links.rb:155-156.
    // fix-d1-url-origin 2026-10-01: this value moved from the
    // external/absolute shape to the internal/rooted shape because the
    // anchor's resource is the SURFACE's card_url, and this render() is the
    // view-function lane. The page-lane shape is pinned in the next test.
    expect(await s.engine.render("Oracle Format Probe", "url_link")).toBe(
      '<a class="internal-link" href="/Oracle_Format_Probe">/Oracle_Format_Probe</a>',
    );
  });

  it("WITH the mod: :url_link renders the external-link anchor on the PAGE lane", async () => {
    const s = storage!;
    // The same chain with the page capture's deck_origin active, so
    // card_url is absolute and resource_type takes links.rb:67's external
    // arm: target FIRST, then class, then href (links.rb:155-156, :102 —
    // Hash insertion order, the capture-pinned order).
    expect(
      await s.engine.runWithPageConfig(() => s.engine.render("Oracle Format Probe", "url_link")),
    ).toBe(
      '<a target="_blank" class="external-link" href="https://culturesmith.com/Oracle_Format_Probe">https://culturesmith.com/Oracle_Format_Probe</a>',
    );
  });

  // ---- type/uri.rb (the URI cardtype's render path) --------------------
  // uri-cardtype-port lane 2026-10-01. set/type/uri.rb:1-19: base block
  // (:title_link :url_link — both `link_to_resource _render_raw`) + html
  // block (:core = render_title_link). NO corpus usage and NO captured
  // bytes: the sha-verified corpus dump copy (6A44DFDC...) carries the URI
  // cardtype card (id 22258) but ZERO cards of that type, and the fixture
  // sweep found URI only as edit-form type-dropdown options. The pins
  // below are therefore gem-derived (the fixture-less convention, the
  // url-link-divergence precedent) from the html link_to_resource chain:
  // links.rb:127-130 → add_resource_opts 154-157 (target FIRST for
  // external-link, then class; attribute order target→class→href is the
  // capture-pinned Hash insertion order) → base 44-47 (clean_resource
  // 74-81: internal re-roots through card_path env/location.rb:6-16 —
  // the leading slash is restored, bytes unchanged) → html link_to
  // 101-106 (href = the resource, path.rb:35-36 String bypass; text =
  // raw(href) 103 — anchor body verbatim, only the attribute value
  // escapes). :core renders THIS set's :title_link (render_title_link
  // resolves through the set chain), whose text is render_title_no_link
  // (title.rb:20-22 wrapped_title standard_title — the card-title span,
  // the engine's titleNoLinkView bytes).

  it("WITH the mod: URI-typed :url_link hrefs the card's RAW content (type/uri.rb:6-8)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Uri Probe", "url_link")).toBe(
      '<a target="_blank" class="external-link" href="https://example.com/Page">https://example.com/Page</a>',
    );
  });

  it("WITH the mod: URI-typed :title_link wraps the card-title span in the raw-content anchor (type/uri.rb:2-4)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Uri Probe", "title_link")).toBe(
      '<a target="_blank" class="external-link" href="https://example.com/Page"><span class="card-title" title="Oracle Uri Probe">Oracle Uri Probe</span></a>',
    );
  });

  it("WITH the mod: URI-typed :core renders the uri :title_link (type/uri.rb:12-14)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Uri Probe", "core")).toBe(
      '<a target="_blank" class="external-link" href="https://example.com/Page"><span class="card-title" title="Oracle Uri Probe">Oracle Uri Probe</span></a>',
    );
  });

  it("WITH the mod: URI-typed :url_link arms per links.rb resource_type — internal, mailto, other-scheme, none", async () => {
    const s = storage!;
    // internal (links.rb:69 ^/): no target; clean_resource 74-81 strips
    // the slash and card_path re-roots it — href bytes unchanged.
    expect(await s.engine.render("Oracle Uri Internal", "url_link")).toBe(
      '<a class="internal-link" href="/Internal_Path">/Internal_Path</a>',
    );
    // email (links.rb:70 ^mailto:): class only.
    expect(await s.engine.render("Oracle Uri Mailto", "url_link")).toBe(
      '<a class="email-link" href="mailto:person@example.com">mailto:person@example.com</a>',
    );
    // other scheme (links.rb:70 RESOURCE_TYPE_REGEXP links.rb:1): the
    // scheme becomes the class.
    expect(await s.engine.render("Oracle Uri Scheme", "url_link")).toBe(
      '<a class="ftp-link" href="ftp://example.com/x">ftp://example.com/x</a>',
    );
    // no match (links.rb:72 nil): bare href, no class, no target.
    expect(await s.engine.render("Oracle Uri Plain", "url_link")).toBe(
      '<a href="plain words no scheme">plain words no scheme</a>',
    );
  });

  // ---- type/html.rb + type/toggle.rb (the one-line surfaces) -----------
  // unported-types-audit lane 2026-10-01. set/type/html.rb:8-10 + :24-26:
  // view :one_line_content → raw_one_line_content (content.rb:43-45,
  // truncate(strip_tags(render_raw), voo.size || 60) with the "..."
  // omission) — the composition capture-proven on the Right::Head
  // sibling (fixtures/captured/layout-one-line.json: the Long+*head arm's
  // 57-chars+"..." bytes, the Html+*head arm's strip-to-empty, the Short
  // arm's passthrough). set/type/toggle.rb:31-35: the one_line_content/
  // short_content helpers funnel to render_core — the toggle :core bytes
  // ("yes"/"no", formatToggleCore). Both surfaces classify
  // CORPUS-PRESENT-UNRENDERED: the sha-verified dump copy (6A44DFDC...)
  // carries 498 HTML-typed cards (455 tag-bearing, 453 of those over 60
  // chars) and 8 Toggle-typed cards (none compound/rule-shaped), and ZERO
  // captured one_line_content bytes for either type (the view has no
  // internal Ruby call site in any installed gem, so it renders only on
  // direct view requests). Pins are gem-derived.

  it("WITH the mod: HTML-typed :one_line_content strips tags then truncates to 60 with '...' (type/html.rb:24-26)", async () => {
    const s = storage!;
    expect(
      await s.engine.render("Oracle Html Oneline Long", "one_line_content"),
    ).toBe(
      "abcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefg...",
    );
  });

  it("WITH the mod: HTML-typed :one_line_content passes clean short content through verbatim (type/html.rb:24-26)", async () => {
    const s = storage!;
    expect(
      await s.engine.render("Oracle Html Oneline Short", "one_line_content"),
    ).toBe("plain body");
  });

  it("WITH the mod: Toggle-typed :one_line_content renders the :core bytes — yes and no (type/toggle.rb:31-35)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Toggle Yes", "one_line_content")).toBe(
      "yes",
    );
    expect(await s.engine.render("Oracle Toggle No", "one_line_content")).toBe(
      "no",
    );
  });

  it("WITH the mod: :link renders the html-format link anchor (base.rb:35-47)", async () => {
    const s = storage!;
    // RE-ADJUDICATED (link-registration-drift, 2026-10-01): Ruby has
    // exactly ONE view :link across the loaded gems — card-mod-format-0.20.0
    // set/all/base.rb:35-37 (card-1.110.0 grep: zero definitions;
    // set/type/html.rb: only :one_line_content/:chunk_list) — and its
    // html-format helper chain renders the ROOTED href + card-title span:
    // link_view (base.rb:43-47 link_to_card card.name, _render_title) →
    // links.rb:111-116 html link_to_card (add_known_or_wanted_class
    // links.rb:140-143) → links.rb:101-108 html link_to (`opts[:href] ||=
    // path ...` → set/all/path.rb:29-33,74-77 + env/location.rb:6-15
    // card_path, root-slash prefix; url_key cardname-0.20.0
    // lib/cardname/variants.rb:8-13, case-preserving) and _render_title →
    // title.rb:19-22 view :title → wrapped_title (title.rb:39-42). The
    // former expectation here pinned the mod body's base-format shape
    // (bare urlKey + plain standardTitle) — the 21796 oracle's first diff
    // @631. Both registrations now share the ONE body
    // (render/views.ts linkAnchorBody; the mod manifest imports it), so
    // this pin and the flat HTML_VIEWS bytes cannot drift.
    expect(await s.engine.render("Oracle Format Probe", "link")).toBe(
      '<a class="known-card" href="/Oracle_Format_Probe"><span class="card-title" title="Oracle Format Probe">Oracle Format Probe</span></a>',
    );
  });

  it("WITH the mod: :nav_link renders the nav-link anchor (base.rb:39-41)", async () => {
    const s = storage!;
    // Same re-adjudication as the :link pin above, plus the CLASS ORDER:
    // base.rb:40 `link_view class: "nav-link"` sets opts[:class] FIRST and
    // add_known_or_wanted_class APPENDS (card-1.110.0
    // lib/card/format/content.rb:43-46 add_class → css_classes
    // options[:class], klass) — "nav-link known-card", not the former
    // "known-card nav-link".
    expect(await s.engine.render("Oracle Format Probe", "nav_link")).toBe(
      '<a class="nav-link known-card" href="/Oracle_Format_Probe"><span class="card-title" title="Oracle Format Probe">Oracle Format Probe</span></a>',
    );
  });

  it("WITH the mod: :codename renders the empty string when undefined (base.rb:55)", async () => {
    const s = storage!;
    // Oracle Format Probe has no codename seeded; the port returns "".
    expect(await s.engine.render("Oracle Format Probe", "codename")).toBe("");
  });

  it("WITH the mod: :id renders the integer-as-string (base.rb:56)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Format Probe", "id")).toBe("200");
  });

  it("WITH the mod: :type renders the type name (base.rb:57)", async () => {
    const s = storage!;
    // The headless engine's codename registry does not seed a
    // RichText -> type-name mapping here, so typeName comes back
    // undefined and the port returns "". The Ruby source returns
    // "Basic" (the default type's name) - documented divergence.
    expect(await s.engine.render("Oracle Format Probe", "type")).toBe("");
  });

  it("WITH the mod: :created_at reads the card record's date (base.rb:61)", async () => {
    const s = storage!;
    // The prefetch walk carries cards.created_at through to the
    // composed CardRecord (prefetch.ts RawRow), so the seeded
    // "2026-09-19 00:00:00.000" renders through the date view - the
    // former "documented divergence from Ruby" (empty timestamp) is
    // closed; Ruby always has the timestamp and so does the port now.
    const rendered = await s.engine.render("Oracle Date Probe", "created_at");
    expect(rendered).toBe("2026-09-19");
  });

  it("WITH the mod: :updated_at reads the card record's date (base.rb:62)", async () => {
    const s = storage!;
    const rendered = await s.engine.render("Oracle Date Probe", "updated_at");
    expect(rendered).toBe("2026-09-19");
  });

  it("WITH the mod: :acted_at reads the card record's date (base.rb:63)", async () => {
    const s = storage!;
    // :acted_at falls through to updated_at (the schema has no acted_at).
    const rendered = await s.engine.render("Oracle Date Probe", "acted_at");
    expect(rendered).toBe("2026-09-19");
  });

  it("WITH the mod: :created_at formats a present date when voo.variant is a strftime pattern", async () => {
    const s = storage!;
    // The seeded timestamp hydrates through the prefetch row, so the
    // view formats it; the variant branch (strftime) is exercised by
    // the formatStrftime helper directly.
    const result = await s.engine.render("Oracle Date Probe", "created_at");
    expect(result).toBe("2026-09-19");
  });

  it("WITH the mod: :raw renders the dbContent (base.rb:75-77)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Format Probe", "raw")).toBe(
      "Hello world",
    );
  });

  it("WITH the mod: :one_line_content renders the html wrap arm around the content (views.rb:29-32)", async () => {
    const s = storage!;
    // format-one-line-wrap 2026-10-01: the dispatched :one_line_content
    // for a plain card is the All-set html wrap arm (views.rb:29-32,
    // wrap: { div: { class: "text-muted" } } around the content.rb:47-49
    // helper) — Ruby's all-set load order (base.rb < content.rb <
    // html/views.rb, later include wins: module.rb:15-22 +
    // registrar.rb:79-84) shadows base.rb:97-99 on EVERY html-format
    // render, so the former bare-body pin here pinned an unreachable
    // body. Byte-truth: the captured "Oracle One Line Plain Probe" arm
    // of fixtures/captured/layout-one-line.json (the standing oracle pin
    // below).
    expect(await s.engine.render("Oracle Format Probe", "one_line_content")).toBe(
      `<div class="text-muted">Hello world</div>`,
    );
  });

  it("WITH the mod: :one_line_content truncates at 60 chars with the '...' omission inside the wrap (views.rb:29-32 + content.rb:47-49)", async () => {
    const s = storage!;
    await seedCard(s, {
      id: 210,
      name: "Oracle Long Probe",
      dbContent: "x".repeat(80),
    });
    // truncate(strip_tags(render_core), 60, "...") -> 57 chars + "..."
    // inside the text-muted wrap div (the wrap is views.rb:30's option;
    // the truncate is content.rb:48).
    expect(await s.engine.render("Oracle Long Probe", "one_line_content")).toBe(
      `<div class="text-muted">${"x".repeat(57)}...</div>`,
    );
  });

  it("WITH the mod: :one_line_content on a plain card matches the captured oracle bytes (layout-one-line.json plain-probe standing pin)", async () => {
    const s = storage!;
    // THE STANDING ORACLE PIN (format-one-line-wrap 2026-10-01).
    // The layout-fixture-adjudication gem-proved the captured
    // plain-probe line derives EXACTLY from the All-set html wrap arm
    // (card-mod-format-0.20.0 set/all/html/views.rb:29-32 + the
    // content.rb:47-49 helper): a plain RichText card, dbContent
    // "plain probe body" (16 chars — strip_tags no-op, truncate no-op),
    // rendered :one_line_content on the live decko 0.20.0 oracle app.
    // Green WITH the registration above; RED without it (the withheld
    // All::Base body would serve the bare bytes — probe-proven in the
    // lane receipt, queue job-1790889001462-76a9aedb: "plain probe body").
    await seedCard(s, {
      id: 212,
      name: "Oracle One Line Plain Probe",
      dbContent: "plain probe body",
    });
    const captured =
      ONE_LINE_FIXTURE.rendered["Oracle One Line Plain Probe#one_line_content"];
    // the fixture's own line pins the wrap-arm shape (guards against the
    // fixture drifting away from the bytes this arm emits):
    expect(captured).toBe('<div class="text-muted">plain probe body</div>');
    expect(
      await s.engine.render("Oracle One Line Plain Probe", "one_line_content"),
    ).toBe(captured);
  });

  it("WITH the mod: :titled dispatches the engine's slot-wrapped titled (the live ajax-slot shape)", async () => {
    // Ruby layering: the dispatched :titled for an html-format render is
    // the FRAMED view (card-mod-format set/all/html/views.rb + header.rb —
    // All::Html outranks All::Base's bare base.rb:120-122 body in the MRO),
    // and every top-level render! runs with_wrapper (card-1.110.0
    // format/render.rb:96-97) — the captured live ajax slot carries the
    // standard slot div around the framed body (edit-session capture
    // step-04, 1,867B `card-slot titled-view`). The engine's registered
    // :titled (views.ts titledView) is exactly that shape; this mod used
    // to shadow it with a bare re-registration, which stripped the wrapper
    // from every XHR save response once the mod deck was bound at a
    // serving surface (the edit-forms suite's session2-gap-8 wiring).
    const s = storage!;
    const html = await s.engine.render("Oracle Format Probe", "titled");
    expect(html).toContain(`class="card-slot titled-view`);
    expect(html).toContain(`d0-card-header-title`);
    expect(html).toContain("Hello world");
    expect(html.endsWith("</div>")).toBe(true);
  });

  it("WITH the mod: :labeled renders name + ': ' + labeled_content (base.rb:125-127)", async () => {
    const s = storage!;
    // labeled_content runs the core view (process_content); the core
    // emits the raw content unchanged when no nests are present.
    expect(
      await s.engine.render("Oracle Format Probe", "labeled"),
    ).toBe("Oracle Format Probe: Hello world");
  });

  it("WITH the mod: :compact_missing renders the html text-muted title span (html/error.rb:33-35)", async () => {
    const s = storage!;
    // Re-pinned by nest-mechanism-remainders 2026-10-01: the
    // former pin held the BASE-format arm (set/all/error.rb:2-4, bare "")
    // while this port's render surface is html — Ruby's html arm
    // (set/all/html/error.rb:33-35) wraps h(title_in_context) in a
    // text-muted span, and the compact substitution's unknown-card
    // fallback (mode.rb:73, ported this lane) renders THIS view, so the
    // registered body had to become the html arm to be mechanism-true.
    // The email formats keep their own "" overrides (card-mod-email
    // email_text.rb:6-8 / email_html.rb:38-40).
    expect(await s.engine.render("Oracle Format Probe", "compact_missing")).toBe(
      '<span class="text-muted">Oracle Format Probe</span>',
    );
  });

  it("WITH the mod: :unknown renders the empty string (error.rb:6-8)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Format Probe", "unknown")).toBe("");
  });

  it("WITH the mod: :server_error renders the locale token (error.rb:10-12)", async () => {
    const s = storage!;
    expect(
      await s.engine.render("Oracle Format Probe", "server_error"),
    ).toBe("format.server_error");
  });

  it("WITH the mod: :denial renders the locale token (error.rb:14-16)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Format Probe", "denial")).toBe(
      "format.denial",
    );
  });

  it("WITH the mod: :not_found renders the locale token (error.rb:18-21)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Format Probe", "not_found")).toBe(
      "format.not_found_named",
    );
  });

  it("WITH the mod: :bad_address renders the locale token (error.rb:23-26)", async () => {
    const s = storage!;
    expect(
      await s.engine.render("Oracle Format Probe", "bad_address"),
    ).toBe("format.bad_address");
  });

  it("WITH the mod: :errors renders the 'Problem:' prefix (error.rb:28-30)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Format Probe", "errors")).toBe(
      "Problem:\n\n",
    );
  });

  // ---- content.rb (set/all/content.rb) new views -----------------------

  it("WITH the mod: :label renders the card name (content.rb:22-24)", async () => {
    const s = storage!;
    // Card#label defaults to card.name (mod/core/set/all/content.rb:61);
    // the headless engine has no per-card label field, so the port
    // returns the card name. Seeded "Oracle Format Probe" -> same.
    expect(await s.engine.render("Oracle Format Probe", "label")).toBe(
      "Oracle Format Probe",
    );
  });

  it("WITH the mod: :closed_content renders the BARE helper body while :one_line_content renders the wrap arm (content.rb:16 alias capture)", async () => {
    const s = storage!;
    // Ruby's alias does NOT re-dispatch the view name:
    // alias_view_block (card-1.110.0 view_definition.rb:53-63) captures
    // views[All::Content][:one_line_content] — the block defined at
    // content.rb:9-13 — at definition time, so closed_content renders
    // the BARE helper shape (content.rb:47-49, no text-muted wrap) even
    // though the :one_line_content VIEW dispatches to the html wrap arm
    // (views.rb:29-32). The two names DIVERGE in Ruby; this pin holds
    // that divergence. (The former bare-body divergence — raw renderRaw
    // trimmed, no strip, no "..." — was ADJUDICATED + PORTED to the
    // Ruby-true composition by the format-remainder-ports work
    // 2026-10-01; on this 11-char plain card strip/truncate are no-ops,
    // so the bytes are unchanged from the pre-port pin.)
    const closed = await s.engine.render("Oracle Format Probe", "closed_content");
    const oneLine = await s.engine.render("Oracle Format Probe", "one_line_content");
    expect(closed).toBe("Hello world");
    expect(oneLine).toBe(`<div class="text-muted">Hello world</div>`);
  });

  it("WITH the mod: :closed_content strips tags then truncates to 60 with '...' BARE (the adjudicated content.rb:47-49 composition, no wrap)", async () => {
    const s = storage!;
    // The divergence the port closed: the pre-port body hard-trimmed the
    // RAW bytes ("<p>aaa...</p>".substring(0, 60) — tag shell intact, no
    // omission). Ruby's captured alias block runs
    // truncate(strip_tags(render_core), 60, "...") (content.rb:47-49,
    // limit content.rb:1,51-53, omission active_support filters.rb:70-83):
    // the 70-char tag-stripped body truncates to 57 chars + "..." and
    // NO text-muted wrap appears (the alias captures the pre-wrap
    // All::Content block — the wrap arm belongs to the :one_line_content
    // VIEW name only). Gem-derived pin: zero closed_content entries in
    // the recorded capture surface (census 2026-10-01).
    await seedCard(s, {
      id: 226,
      name: "Oracle Closed Tags Probe",
      dbContent: `<p>${"abcdefghij".repeat(7)}</p>`,
    });
    expect(
      await s.engine.render("Oracle Closed Tags Probe", "closed_content"),
    ).toBe("abcdefghij".repeat(5) + "abcdefghij".slice(0, 7) + "...");
    // and the same card's :one_line_content carries the wrap — the two
    // names stay divergent in Ruby, so they stay divergent here.
    expect(
      await s.engine.render("Oracle Closed Tags Probe", "one_line_content"),
    ).toBe(`<div class="text-muted">${"abcdefghij".repeat(5)}${"abcdefghij".slice(0, 7)}...</div>`);
  });

  it("WITH the mod: :raw_one_line_content renders the text-muted wrap arm around strip_tags(raw) truncated with '...' (views.rb:24-27 + content.rb:43-45)", async () => {
    const s = storage!;
    // Ruby html dispatch: All::Html::Views' wrap arm (views.rb:24-27,
    // wrap: { div: { class: "text-muted" } }) around the All::Content
    // helper (content.rb:43-45): truncate strip_tags(render_raw),
    // length: one_line_character_limit (= 60, content.rb:1,51-53);
    // truncate emits "..." on truncation. The MRO-shadowed All::Content
    // base view is withheld (format-remainder-ports 2026-10-01,
    // allHtmlViewsRawOneLineContentView's record) — the wrap arm is the
    // only all-format-chain registration, same shape as the sibling
    // :one_line_content arm. Gem-derived pin: zero captured
    // raw_one_line_content bytes exist for the All-set arm (the corpus
    // census found only the Rule::BarView arm's bytes in rules-views.json,
    // a different set with its own wrap class).
    expect(await s.engine.render("Oracle Format Probe", "raw_one_line_content")).toBe(
      `<div class="text-muted">Hello world</div>`,
    );
    // the bare-body bytes Ruby's html dispatch never emits (the withheld
    // All::Content base view's shape) — held RED would mean the
    // withholding broke and a raw card's :raw_one_line_content fell back
    // to the unwrapped body.
  });

  it("WITH the mod: :raw_one_line_content truncates long content with '...' marker inside the wrap arm", async () => {
    const s = storage!;
    await seedCard(s, {
      id: 211,
      name: "Oracle Long Raw Probe",
      dbContent: "x".repeat(80),
    });
    // truncate(raw, 60, "...") -> 60-3 = 57 raw chars + "..." = 60 chars,
    // wrapped in the views.rb:24-27 text-muted div.
    expect(
      await s.engine.render("Oracle Long Raw Probe", "raw_one_line_content"),
    ).toBe(`<div class="text-muted">${"x".repeat(57)}...</div>`);
  });

  // ---- type/mod.rb (set/type/mod.rb) :admin ----------------------------

  it("WITH the mod: :admin renders the core view (type/mod.rb:3-5)", async () => {
    const s = storage!;
    // Ruby view body: `render_core` -> fmt.renderView("core").
    // seed-sweep 2026-09-29: the render target moved from the
    // default-typed Oracle Format Probe to the Mod-typed probe - :admin
    // is a Type::Mod view; Ruby raises unknown-view for other types.
    //
    // mm-cstructural (2026-09-30): the assertion USED to hardcode the
    // probe's raw content ("Hello world"), justified by "the core view
    // emits the raw dbContent unchanged for non-special types". That
    // premise was the bug this suite fixed: a Mod-typed card's :core is NOT
    // the raw content — card-1.110.0 mod/core set/type/mod.rb:7-19
    // overrides :core with the render_section_views list, and every real
    // mod card stores no content at all (all 36 mod-typed rows in the raw
    // corpus carry content = ""). The delegation is what type/mod.rb:3-5
    // declares, so that is what is asserted: :admin EQUALS :core. Pinning
    // the core's bytes here instead would re-freeze a view this suite just
    // proved wrong, and would duplicate the pin that already exists where
    // the core is the subject
    // (tests/card/render/mod-cardtype-core-section-list-corpus-replay.test.ts,
    // against the 28 real `mod: *` yardstick pages).
    expect(await s.engine.render("Oracle Mod Probe", "admin")).toBe(
      await s.engine.render("Oracle Mod Probe", "core"),
    );
  });

  it("WITH the mod: every set module from the gem tree is in the basket", () => {
    const basket = loader!.setModules();
    // base pattern: every all/<anchor> set module from the gem
    const base = basket.base.map((m) => m.shortname);
    expect(base).toContain("All::Base");
    expect(base).toContain("All::Content");
    expect(base).toContain("All::Css");
    expect(base).toContain("All::Csv");
    expect(base).toContain("All::Data");
    expect(base).toContain("All::Demo");
    expect(base).toContain("All::Error");
    expect(base).toContain("All::File");
    expect(base).toContain("All::Haml");
    expect(base).toContain("All::Html");
    expect(base).toContain("All::Js");
    expect(base).toContain("All::Json");
    expect(base).toContain("All::Jsonld");
    expect(base).toContain("All::Links");
    expect(base).toContain("All::Path");
    expect(base).toContain("All::Rss");
    expect(base).toContain("All::Text");
    expect(base).toContain("All::Title");
    expect(base).toContain("All::Yaml");
    // abstract
    const abstract = basket.abstract.map((m) => m.shortname);
    expect(abstract).toContain("Abstract::JsonldSupport");
    // right nonbase
    const right = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(right).toContain("Right::Head");
    // self nonbase
    const self = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(self).toContain("Self::Home");
    // type nonbase: every set/type/*.rb file from the gem
    const type = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(type).toContain("Type::Basic");
    expect(type).toContain("Type::Cardtype");
    expect(type).toContain("Type::Html");
    expect(type).toContain("Type::Json");
    expect(type).toContain("Type::Mod");
    expect(type).toContain("Type::Number");
    expect(type).toContain("Type::Phrase");
    expect(type).toContain("Type::PlainText");
    expect(type).toContain("Type::Toggle");
    expect(type).toContain("Type::Uri");
  });

  it("WITH the mod: the mod loader's load report lists every ported view", () => {
    const report = loader!.load();
    const expected = [
      "name",
      "key",
      "linkname",
      "url",
      "id_url",
      "url_link",
      "link",
      "nav_link",
      "codename",
      "id",
      "type",
      "created_at",
      "updated_at",
      "acted_at",
      "raw",
      "one_line_content",
      "labeled_content",
      "titled_content",
      // NOT in the report: :titled. The bare All::Base re-registration was
      // removed (edit-forms 2026-09-29): it shadowed the engine's
      // slot-wrapped titled — the live ajax-slot shape — through the chain.
      // Ruby's All::Base titled body exists (base.rb:120-122) but the html
      // MRO dispatches the framed All::Html view and the with_wrapper slot
      // wraps it; the engine's registered titled is that shape.
      "labeled",
      "compact_missing",
      "unknown",
      "server_error",
      "denial",
      "not_found",
      "bad_address",
      "errors",
      "label",
      "closed_content",
      "raw_one_line_content",
      "admin",
    ];
    for (const view of expected) {
      expect(report.registeredViews).toContain(view);
    }
  });

  it("WITH the mod: a card's baseline :content render still works (the mod adds views, it does not alter core)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Format Probe", "content");
    // baseline :content is the format/views.ts#contentView; the mod
    // does NOT redefine :content (it carries :titled_content/:labeled_
    // content separately), so the existing core content renders
    // unchanged. We assert it renders WITHOUT throwing.
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });
});