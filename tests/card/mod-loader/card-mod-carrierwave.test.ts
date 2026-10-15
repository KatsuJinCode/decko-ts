// The carrierwave mod integration test: card-mod-carrierwave loaded through
// the mod loader adds file/image rendering views whose bytes match the
// Ruby source semantics.
//
// Carrierwave is fundamentally a SIDE-EFFECT mod (file uploads, carrierwave
// mount, fog buckets, mini_magick image processing). The headless port
// covers ONLY the pure HTML renderers - the views that emit URLs and <img>
// tags from the card's dbContent without touching the filesystem. The
// attachment runtime (24 event hooks, lib/carrier_wave/* uploader classes,
// set/abstract/attachment/* event modules) is explicitly NOT ported.
//
// Proof shape:
//   1. Helper functions (storageTypeFromContent, contextualizePath) map
//      carrierwave identifier prefixes to URL/path forms, matching the
//      storage_type_from_content + carrierwave URL doc semantics.
//   2. The polymorphic view functions (fileSource, imageSource,
//      fileCoreView, imageHtmlCoreView, imageHtmlFullWidthView,
//      imageHtmlPreviewView, imageHtmlContentChangesView,
//      faviconLinkTagView, searchJsonImageCompleteView,
//      polymorphicSourceView, polymorphicCoreView) emit the bytes Ruby
//      produces for the same card + view pair.
//   3. The ModLoader registration lands every set module in the basket
//      (Ruby bookkeeping parity) and every view config in the config
//      table (the _view_<name>__<setting> methods).
//   4. The engine pipeline honors the mod's registration: rendering a
//      file card's :source goes through polymorphicSourceView (file
//      branch) and emits the contextualized URL.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  modEngineHost,
  getDefaultModLoader,
  setDefaultModLoader,
} from "../../../src/card/mod-loader.js";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import {
  contextualizePath,
  storageTypeFromContent,
  fileCoreView,
  imageHtmlCoreView,
  imageHtmlFullWidthView,
  imageHtmlPreviewView,
  imageHtmlContentChangesView,
  imageOneLineContentView,
  faviconLinkTagView,
  searchJsonImageCompleteView,
  FAVICON_RAW_HELP_TEXT,
} from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import { DeckoName } from "../../../src/card/name.js";
import { Voo, type RenderFormat, type ViewContext } from "../../../src/card/render/format.js";

/** Build a minimal ViewContext for direct viewFn invocation. The card's
 *  typeName drives the polymorphic dispatch (image vs file behavior). */
function makeCtx(
  dbContent: string,
  opts: { typeName?: string; typeCode?: string; name?: string; historyReader?: unknown } = {},
): ViewContext {
  const name = opts.name ?? "TestCard";
  const card = {
    dbContent,
    name: { s: name, safeKey: name, isCompound: false } as unknown as DeckoName,
    typeName: opts.typeName,
    typeCode: opts.typeCode,
    typeId: 2,
    id: 1,
    record: {} as never,
    key: name.toLowerCase(),
    setKeys: "ALL",
    unknown: false,
  };
  const fmt = {
    card,
    engine: {
      imageCdnHost: undefined,
      historyRenderReader: opts.historyReader === undefined ? undefined : () => opts.historyReader,
    },
    renderView: ((view: string, viewOpts: Record<string, unknown> = {}) => {
      if (view === "core") {
        if (card.typeCode === "image") return imageHtmlCoreView({ fmt: fmt as unknown as RenderFormat, voo: new Voo(undefined, "core", viewOpts) });
        return fileCoreView({ fmt: fmt as unknown as RenderFormat, voo: new Voo(undefined, "core", viewOpts) });
      }
      return "";
    }),
  } as unknown as RenderFormat;
  return { fmt, voo: new Voo(undefined, "source", {}) };
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  // The File CARDTYPE card (codename "file") — the typeCode source the
  // polymorphic dispatch reads. Ruby's file :source/:core live on
  // Type::File (set/type/file.rb), so the file-branch probe cards must BE
  // File-typed for that branch to be the Ruby-faithful surface (a
  // plain-typed card dispatches the base core; the edit-forms port
  // corrected the polymorphic fall-through accordingly). Seeded ONCE: the
  // codename column is UNIQUE across cards.
  await seedCard(storage, { id: 499, name: "File", codename: "file", typeId: 9 });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("storageTypeFromContent (set/abstract/attachment/01_storage_type.rb:102-116)", () => {
  it("classifies ~ as local (file_card_uploader.rb doc lines 88-92)", () => {
    expect(storageTypeFromContent("~42/action_99.txt")).toBe("local");
  });
  it("classifies http(s) as web", () => {
    expect(storageTypeFromContent("http://example.com/file.pdf")).toBe("web");
    expect(storageTypeFromContent("https://example.com/file.pdf")).toBe("web");
  });
  it("classifies (bucket) as cloud", () => {
    expect(storageTypeFromContent("(my_bucket)/card_id/action.ext")).toBe("cloud");
  });
  it("classifies :codename as coded", () => {
    expect(storageTypeFromContent(":logo/decko_logo.svg")).toBe("coded");
  });
  it("returns unknown for empty / unrecognised content", () => {
    expect(storageTypeFromContent("")).toBe("unknown");
    expect(storageTypeFromContent("   ")).toBe("unknown");
  });
});

describe("contextualizePath (file_card_uploader.rb doc lines 88-117)", () => {
  it("converts local ~card_id/action.ext -> /files/~card_id/action.ext (local_url keeps the tilde mark)", () => {
    expect(contextualizePath("~42/action_99.txt")).toBe("/files/~42/action_99.txt");
  });
  it("returns web URLs raw", () => {
    expect(contextualizePath("https://example.com/path/to/file.pdf")).toBe(
      "https://example.com/path/to/file.pdf",
    );
  });
  it("derives the cloud URL from db data (the stored identifier is never the rendered filename)", () => {
    // Ruby's uploader ignores the stored identifier on retrieval
    // (file_card_uploader/path.rb:28-32) and rebuilds
    // filename = action_id + extension from db_content
    // (file_card_uploader.rb:147-153 + set/type/file.rb:11-15): the
    // [-2] [/.] segment of "(my_bucket)/1/2.png" is "2", so the URL is
    // the fog public_url of files/1/2.png — NOT the stored key verbatim.
    expect(contextualizePath("(my_bucket)/1/2.png")).toBe(
      "http://s3.amazonaws.com//files/1/2.png",
    );
  });
  it("converts coded :codename/mod.ext -> /files/:codename/mod.ext (local_url over the coded file_dir)", () => {
    expect(contextualizePath(":logo/decko_logo.svg")).toBe("/files/:logo/decko_logo.svg");
  });
  it("returns empty for unknown content", () => {
    expect(contextualizePath("")).toBe("");
    expect(contextualizePath("not_an_identifier")).toBe("");
  });
});

describe("file :core (set/type/file.rb:24-28 + core.haml:1)", () => {
  it("emits the download anchor for a local file", () => {
    // core.haml: %a{ href: source } = t :carrierwave_download, title:
    // title_in_context(voo.title) — HAML attr_wrapper apostrophe, label
    // "Download " + the context-relativized name (out of context: the
    // full card name). local_url names the CARD's own id (paths.rb
    // file_id) — this context's card is id 1.
    const html = fileCoreView(makeCtx("~7/act_42.png"));
    expect(html).toBe("<a href='/files/~1/act_42.png'>Download TestCard</a>\n");
  });
  it("emits the download anchor for a web file", () => {
    const html = fileCoreView(makeCtx("https://example.com/file.pdf"));
    expect(html).toBe("<a href='https://example.com/file.pdf'>Download TestCard</a>\n");
  });
  it("returns empty string for unknown / missing source", () => {
    expect(fileCoreView(makeCtx(""))).toBe("");
  });
});

describe("image :core (set/type/image/html_views.rb:5-11)", () => {
  it("emits <img alt=NAME src=URL /> for a web image (Rails image_tag order)", () => {
    const html = imageHtmlCoreView(makeCtx("https://example.com/img.png", { name: "MyImage" }));
    expect(html).toBe('<img alt="MyImage" src="https://example.com/img.png" />');
  });
  it("emits <img alt=NAME src=/files/...-medium /> for a local image (default_size :medium)", () => {
    // image_tag source, alt: card.name (alt first, self-closing); the
    // default :medium version; local_url over the card's own id (1).
    const html = imageHtmlCoreView(makeCtx("~12/act_99.jpg", { name: "LocalImg" }));
    expect(html).toBe('<img alt="LocalImg" src="/files/~1/act_99-medium.jpg" />');
  });
  it("returns empty string for blank src (set/type/file.rb:34-45 handle_source short-circuit)", () => {
    // set/type/file.rb:34-45 handle_source short-circuits blank src to ""
    // (the content-view wrapper renders an empty body for an image-typed
    // card whose dbContent does not match any storage prefix).
    expect(imageHtmlCoreView(makeCtx("", { name: "BlankImg" }))).toBe("");
    // Non-blank content that fails storage-type recognition still yields
    // blank src (storageTypeFromContent returns "unknown" ->
    // contextualizePath returns ""). The card name MUST NOT leak into the
    // rendered body — the wrapper's body stays empty.
    expect(imageHtmlCoreView(makeCtx("janmbtckiogaqbhlewfngdc", { name: "*logo" }))).toBe("");
  });
  it("the missing-sentinel branch is unreachable headless: dbContent missing takes the blank-src arm (with_valid_source, html_views.rb:13-34)", () => {
    // The "missing" sentinel is set by Ruby's carrierwave runtime when an
    // attachment reference resolves but the underlying file is gone
    // (lib/card/mod/carrierwave.rb + FileCardUploader#url). The headless
    // port has no carrierwave runtime, so imageSource never produces the
    // "missing" string from dbContent. We exercise the branch directly by
    // constructing a context whose imageSource-equivalent returns
    // "missing": the html view's invariant is checked by stubbing
    // contextualizePath-shaped inputs through the same viewFn.
    // The closest reachable shape: a card whose dbContent is "missing".
    // storageTypeFromContent("missing") returns "unknown" ->
    // contextualizePath returns "" -> src === "" (blank branch). So this
    // assertion confirms the blank-src branch, NOT the missing branch.
    // The missing-branch code path is exercised by the live carrierwave
    // runtime which the headless port does not include (see file header
    // NOT PORTED list).
    expect(imageHtmlCoreView(makeCtx("missing", { name: "MissingImg" }))).toBe("");
  });
});

describe("image :full_width (set/type/image/html_views.rb:25-29)", () => {
  it("emits <img ... class=w-100> in Rails attr order, self-closing (the corpus's *favicon:full_width bytes)", () => {
    const html = imageHtmlFullWidthView(makeCtx("https://example.com/banner.png", { name: "Banner" }));
    expect(html).toBe(
      '<img alt="Banner" class="w-100" src="https://example.com/banner.png" />',
    );
  });
  it("returns empty string for blank src (set/type/file.rb:34-45 handle_source short-circuit)", () => {
    expect(imageHtmlFullWidthView(makeCtx("", { name: "NoBanner" }))).toBe("");
    expect(imageHtmlFullWidthView(makeCtx("janmbtckiogaqbhlewfngdc", { name: "*logo" }))).toBe("");
  });
});

describe("image :preview (set/type/image/html_views.rb:36-43)", () => {
  it("wraps the :core medium variant in <div class=attachment-preview>", () => {
    const html = imageHtmlPreviewView(
      makeCtx("https://example.com/img.png", { name: "MyImg", typeCode: "image" }),
    );
    expect(html).toBe(
      '<div class="attachment-preview" id="MyImg-preview"><img alt="MyImg" src="https://example.com/img.png" /></div>',
    );
  });
  it("returns empty when the underlying :core is empty (blank-src short-circuit)", () => {
    // :preview wraps whatever :core returns. For a blank src the underlying
    // :core returns "" (file.rb:34-45 handle_source short-circuit), so
    // :preview also returns "" rather than wrapping a stale comment.
    const html = imageHtmlPreviewView(
      makeCtx("", { name: "Missing", typeCode: "image" }),
    );
    expect(html).toBe("");
  });
});

describe("image :content_changes (set/type/image/html_views.rb:49-51)", () => {
  // A last action with no earlier db_content change (the create that
  // uploaded the file): previous_value(:db_content) is nil.
  const createActionReader = {
    cardLastAction: { id: 7, action_type: 0 },
    previousValue: () => undefined,
  };

  it("wraps the current :core in the added chunk when no earlier content change exists", () => {
    const html = imageHtmlContentChangesView(
      makeCtx("https://example.com/img.png", {
        name: "DiffImg",
        typeCode: "image",
        historyReader: createActionReader,
      }),
    );
    // `[old_image(action, hide_diff), new_image(action)].compact.join`
    // (html_views.rb:53-56): old_image is nil without an earlier db_content
    // change (:58-72), and new_image is
    // `Card::Content::Diff.render_added_chunk _render_core` (:74-78), whose
    // literal is "<ins class='diffins diff-added'>#{text}</ins>"
    // (card/lib/card/content/diff.rb:16-18). The synthetic-v2 oracle's
    // `view:admin:*favicon:content_changes` bytes have this shape.
    expect(html).toBe(
      `<ins class='diffins diff-added'><img alt="DiffImg" src="https://example.com/img.png" /></ins>`,
    );
  });

  it("wraps a blank :core too (new_image has no blank guard)", () => {
    const html = imageHtmlContentChangesView(
      makeCtx("", { name: "DiffImg", typeCode: "image", historyReader: createActionReader }),
    );
    expect(html).toBe(`<ins class='diffins diff-added'></ins>`);
  });

  it("raises when the card has no last action (new_image's action.id on nil)", () => {
    expect(() =>
      imageHtmlContentChangesView(
        makeCtx("https://example.com/img.png", {
          name: "DiffImg",
          typeCode: "image",
          historyReader: { cardLastAction: undefined, previousValue: () => undefined },
        }),
      ),
    ).toThrow(/no last action/);
  });
});

describe("imageOneLineContentView type guard (set/type/image.rb:18-20 scoping)", () => {
  let formatLoader: ModLoader;
  let previousLoader: ReturnType<typeof getDefaultModLoader>;
  beforeAll(() => {
    // The inherited wrap belongs to card-mod-format, not carrierwave.
    // Load that actual provider rather than relying on an unconditional div.
    previousLoader = getDefaultModLoader();
    formatLoader = new ModLoader([{ manifest: cardModFormat }]);
    formatLoader.load();
    setDefaultModLoader(formatLoader);
  });
  afterAll(() => {
    formatLoader.reset();
    setDefaultModLoader(previousLoader);
  });
  // The view's gem home is set/type/image.rb — a Type::Image set — so ONLY
  // an image-typed card dispatches the icon-sized core render. The
  // polymorphic device ("all/zz_carrierwave_polymorphic") is ALL-scoped by
  // construction, so the type guard lives in the fn body (format-
  // remainder-ports 2026-10-01; the format-one-line-wrap
  // collision census flagged the missing guard). Non-image cards answer
  // the All-set html wrap arm (card-mod-format set/all/html/views.rb:
  // 29-32), the chain walk Ruby produces for them — one imported
  // definition, no drift.
  it("an IMAGE-typed card renders the icon-sized :core — no wrap, no strip, no truncate (set/type/image.rb:18-20)", () => {
    const out = imageOneLineContentView(
      makeCtx("~12/act_99.jpg", { name: "LocalImg", typeCode: "image", typeName: "Image" }),
    );
    expect(out).toBe('<img alt="LocalImg" src="/files/~1/act_99-icon.jpg" />');
  });
  it("a FILE-typed card falls through to the All-set html wrap arm (views.rb:29-32): strip_tags(core) truncated, text-muted wrap", () => {
    const out = imageOneLineContentView(
      makeCtx("~7/doc_1.pdf", { name: "Doc", typeCode: "file", typeName: "File" }),
    );
    // fileCoreView's anchor strips to its text ("Download Doc\n"); short
    // content passes truncate untouched; the wrap div is the outer element.
    expect(out).toBe(`<div class="text-muted">Download Doc\n</div>`);
  });
  it("a non-attachment card falls through to the All-set html wrap arm too (the carrierwave gem defines no :one_line_content for any other set)", () => {
    const out = imageOneLineContentView(
      makeCtx("https://example.com/f.png", { name: "PlainCard", typeCode: "richtext", typeName: "RichText" }),
    );
    expect(out).toBe(`<div class="text-muted">Download PlainCard\n</div>`);
  });
});

describe("favicon :link_tag (set/self/favicon.rb:7-11, perms: :none)", () => {
  it("emits <link rel=shortcut icon href=URL> for an image-typed favicon (the source renders at the SMALL variant; the tag self-closes per the corpus bytes)", () => {
    const html = faviconLinkTagView(
      makeCtx("https://example.com/favicon.ico", { typeName: "Image", name: "favicon" }),
    );
    expect(html).toBe('<link rel="shortcut icon" href="https://example.com/favicon.ico" />');
  });
  it("returns empty for a non-image favicon (no logo nest in headless)", () => {
    const html = faviconLinkTagView(makeCtx("", { typeName: "File", name: "favicon" }));
    expect(html).toBe("");
  });
});

describe("FAVICON_RAW_HELP_TEXT (set/self/favicon.rb:13-16)", () => {
  it("matches the Ruby prose verbatim", () => {
    expect(FAVICON_RAW_HELP_TEXT).toBe(
      "A favicon (or shortcut icon) is a small image used by browsers to help identify " +
        "your website. [[http://www.decko.org/favicon|How to customize your favicon]]",
    );
  });
});

describe("search :image_complete (set/self/search.rb:2-7, cache: :never)", () => {
  it("returns the empty-result JSON in the headless port", () => {
    expect(searchJsonImageCompleteView(makeCtx(""))).toBe("[]");
  });
});

describe("card-mod-carrierwave through the mod loader", () => {
  it("registers every set module in the basket (Ruby bookkeeping parity)", () => {
    loader = new ModLoader([{ manifest: cardModCarrierwave }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    const basket = loader.setModules();
    const allModules: { shortname: string; kind: string }[] = [
      ...basket.base,
      ...basket.abstract,
      ...Array.from(basket.nonbase.values()).flat(),
    ];
    const shortnames = allModules.map((m) => m.shortname);
    // set/type/file.rb -> Type::File (registered for bookkeeping, no views)
    expect(shortnames).toContain("Type::File");
    // set/type/image.rb -> Type::Image
    expect(shortnames).toContain("Type::Image");
    // set/type/image/html_views.rb -> Type::Image::HtmlViews
    expect(shortnames).toContain("Type::Image::HtmlViews");
    // set/self/favicon.rb -> Self::Favicon
    expect(shortnames).toContain("Self::Favicon");
    // set/self/search.rb -> Self::Search
    expect(shortnames).toContain("Self::Search");
    // set/self/new_file.rb -> Self::NewFile
    expect(shortnames).toContain("Self::NewFile");
    // set/self/new_image.rb -> Self::NewImage
    expect(shortnames).toContain("Self::NewImage");
  });

  it("records the perms: :none view-config for link_tag (set/self/favicon.rb:7)", () => {
    loader = new ModLoader([{ manifest: cardModCarrierwave }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    const config = loader.viewConfigFor("link_tag");
    expect(config?.perms).toBe("none");
  });

  it("records the unknown: :blank view-config for source (set/type/image.rb:26-28)", () => {
    loader = new ModLoader([{ manifest: cardModCarrierwave }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    const config = loader.viewConfigFor("source");
    expect(config?.unknown).toBe("blank");
  });

  it("records the cache: :never view-config for image_complete (set/self/search.rb:2)", () => {
    loader = new ModLoader([{ manifest: cardModCarrierwave }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    const config = loader.viewConfigFor("image_complete");
    expect(config?.cache).toBe("never");
  });

  it("renders a file card's :source through polymorphicSourceView (file branch)", async () => {
    const s = storage!;
    await seedCard(s, {
      id: 500,
      name: "LocalFileRender",
      typeId: 499,
      dbContent: "~42/action_99.txt",
    });
    loader = new ModLoader([{ manifest: cardModCarrierwave }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const html = await s.engine.render("LocalFileRender", "source");
    expect(html).toBe("/files/~500/action_99.txt");
  });

  it("renders a file card's :core through polymorphicCoreView (download anchor)", async () => {
    const s = storage!;
    await seedCard(s, {
      id: 501,
      name: "LocalFileCoreRender",
      typeId: 499,
      dbContent: "~7/act_42.png",
    });
    loader = new ModLoader([{ manifest: cardModCarrierwave }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const html = await s.engine.render("LocalFileCoreRender", "core");
    expect(html).toBe("<a href='/files/~501/act_42.png'>Download LocalFileCoreRender</a>\n");
  });

  // -----------------------------------------------------------------------
  // The blank-src bucket: card_name_leaked_as_text_inside_content_view_after_data_attr
  //
  // An image-typed card whose dbContent matches NO storage-type prefix (not
  // http(s), not ~, not :, not (bucket)) leaves Ruby's set/type/file.rb:34-45
  // handle_source short-circuiting to ""; the html view returns an empty
  // body inside the content-view wrapper. The pre-fix TS port emitted the
  // invalid-image HTML comment (with the card name interpolated) which
  // leaked the name into the wrapper body. Pinning the bytes here collapses
  // the bucket for any future regression of the same shape.
  // -----------------------------------------------------------------------

  // This pin was previously inverted (it.fails) against the nested
  // set-file registration divergence
  // (known-divergences-from-ruby.md). The divergence's render half was
  // closed — "blank-src short-circuits to empty string like Ruby
  // handle_source" — and both :core and :full_width now resolve, so the
  // inversion went stale: it contradicted the Ruby original (html_views.rb:
  // 13-34 blank-src arm renders empty). The assertions are kept as a
  // positive pin.
  it("renders a blank-src image card's :core as empty body", async () => {
    const s = storage!;
    // The image type card needs a codename so the render engine resolves
    // typeCode === "image" via peekNameForId (render.ts:610 + 834).
    await seedCard(s, {
      id: 19,
      name: "*image",
      codename: "image",
      typeId: 2,
    });
    // The *logo probe: image-typed, dbContent that fails every storage
    // prefix -> imageSource returns "" -> the html view must return ""
    // (NOT the comment, NOT the leaked name).
    await seedCard(s, {
      id: 79,
      name: "*logo",
      dbContent: "janmbtckiogaqbhlewfngdc",
      typeId: 19,
    });
    loader = new ModLoader([{ manifest: cardModCarrierwave }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    // :core bytes: empty body. Card name MUST NOT appear as body text.
    const coreHtml = await s.engine.render("*logo", "core");
    expect(coreHtml).toBe("");
    expect(coreHtml).not.toContain("*logo");
    expect(coreHtml).not.toContain("invalid image");
    expect(coreHtml).not.toContain("<!--");

    // :full_width: same blank-src short-circuit (the mod-path half of the
    // bucket fix; the :full_width view is registered for image-typed
    // cards only via set/type/image/html).
    const fullWidthHtml = await s.engine.render("*logo", "full_width");
    expect(fullWidthHtml).toBe("");
    expect(fullWidthHtml).not.toContain("invalid image");
  });
});
