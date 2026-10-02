// The compact nest-mode mechanism, ported gem-derivative with fixture-less
// pins (nest-mechanism-remainders lane 2026-10-01).
//
// Two mechanisms live under nesting/mode.rb's :compact state, and NEITHER
// has a single captured byte on the recorded surface (nest-mode-port census
// 2026-10-01, re-verified on the sha-verified 6a44dfdc dump copy + the 97
// expected-v2 shards: every captured one-line render is a raw or nest-free
// arm; closed_content: zero entries). So the pins here are derived from the
// gems, not from the corpus — the same convention as the URI/one_line
// precedent for corpus-absent machinery:
//
// 1. THE SUBSTITUTION. card-1.110.0 lib/card/format/nesting/mode.rb:71-74
//    view_in_compact_mode: a nest rendered under a compact parent gets its
//    view replaced — `configured_view_in_compact_mode(view) ||
//    (card.known? ? :one_line_content : :compact_missing)` — where the
//    configured lookup (mode.rb:79-84) keeps the view when its definition
//    declares `compact: true` and substitutes when it declares another
//    view. Ruby writes that state with the base-format one_line_content
//    composition (card-mod-format set/all/content.rb:9-13
//    `with_nest_mode :compact { one_line_content }`), which this port's
//    closedContentView mirrors (card-mod-format.ts withNestMode("compact")
//    around the truncate(render_core) body).
//
// 2. THE ELISION. card-1.110.0 lib/card/format/nesting.rb:52-63 +
//    lib/cardio/railtie.rb:16: a compact-mode format accumulates every
//    rendered nest's length in @char_count (per format instance — subformats
//    start at nil) and, once the total exceeds max_char_count (200), every
//    SUBSEQUENT nest renders "". The count is nil until the first render
//    returns, so the FIRST nest always renders at full length; the elision
//    suppresses later siblings, it never truncates the one being rendered.
//
// Ruby facts each assertion pins are named inline. All cards are seeded
// test-storage cards; nothing here reads the corpus.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RenderFormat } from "../../../src/card/render/format.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

// The elision threshold (nesting.rb:69-71 max_char_count -> railtie.rb:16
// default 200). The big card's content must clear it after ONE render so
// the second sibling nest hits the gate.
const BIG_BODY = "B".repeat(250);

beforeAll(() => {
  defaultDeckLoader();
});

afterAll(() => {
  setDefaultModLoader(undefined);
});

async function seedCompactDeck(): Promise<{
  storage: RenderTestStorage;
  fmt: RenderFormat;
}> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  // The nest targets. Plain text bodies keep the core-view bytes
  // predictable (no markup, no escaping surprises).
  await seedCard(storage, { id: 60, name: "Compact Target", typeId: 2, dbContent: "TARGETBODY" });
  await seedCard(storage, { id: 61, name: "Big Card", typeId: 2, dbContent: BIG_BODY });
  await seedCard(storage, { id: 62, name: "Small Card", typeId: 2, dbContent: "SMALLMARKER" });
  // The per-format accumulation probe: the big card's own body carries a
  // nest, which its SUBFORMAT processes (and accumulates on the
  // subformat's own count, not the parent's).
  await seedCard(storage, {
    id: 63,
    name: "Nesting Big Card",
    typeId: 2,
    dbContent: `HEAD{{Small Card|core}}TAIL${BIG_BODY}`,
  });
  await storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon([2, 60, 61, 62, 63]);
  // Every nest target must be PREPARED before a nest renders it: an
  // un-prepared card's nested views render empty (the read-rule walk is
  // warmed by prepareItemForRender — the harness convention, same shape
  // as layout-template-nest-mode.test.ts:108 prepares its layout card).
  for (const name of ["Compact Target", "Big Card", "Small Card", "Nesting Big Card"]) {
    const prepared = await storage.engine.prepareItemForRender(name);
    if (prepared === undefined) throw new Error(`${name} not preparable after seed`);
  }
  const fmtCard = await storage.engine.prepareItemForRender("Compact Target");
  if (fmtCard === undefined) throw new Error("Compact Target not preparable after seed");
  return { storage, fmt: new RenderFormat(fmtCard, storage.engine) };
}

describe("compact nest mode - the view substitution (mode.rb:43-51, 71-84)", () => {
  it("modalNestView substitutes a non-compact-declared view to one_line_content for a known card", async () => {
    const { storage, fmt } = await seedCompactDeck();
    try {
      // mode.rb:73 `card.known? ? :one_line_content : :compact_missing`:
      // "Compact Target" is a seeded (real) card, so known?. :titled
      // declares no compact opt (card-mod-format set/all/title.rb declares
      // compact only on :title/:title_link/:title_no_link), so the
      // configured lookup (mode.rb:79-84) misses and the fallback fires.
      expect(fmt.modalNestView("titled")).toBe("titled"); // :normal control
      fmt.withNestMode("compact", () => {
        expect(fmt.modalNestView("titled")).toBe("one_line_content");
        expect(fmt.modalNestView("content")).toBe("one_line_content");
      });
      expect(fmt.modalNestView("titled")).toBe("titled"); // mode restored
    } finally {
      storage.close();
    }
  });

  it("views whose definition declares compact: true pass through unchanged", async () => {
    const { storage, fmt } = await seedCompactDeck();
    try {
      fmt.withNestMode("compact", () => {
        // COMPACT_TRUE_VIEWS (mode.rb:81 `return view if compact_config ==
        // true`): the 17 set/all/base.rb declarations (name :14 ... blank
        // :109), the title family (title.rb:2,16,20), and compact_missing
        // itself (error.rb:2 — a substituted :compact_missing nest does
        // not re-substitute).
        for (const v of [
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
          "core",
          "one_line_content",
          "blank",
          "title",
          "title_link",
          "title_no_link",
          "compact_missing",
        ]) {
          expect(fmt.modalNestView(v)).toBe(v);
        }
      });
    } finally {
      storage.close();
    }
  });

  it("an end-to-end bare nest under a compact parent renders one_line_content bytes", async () => {
    const { storage, fmt } = await seedCompactDeck();
    try {
      // The bare nest defaults to the html nest view (:titled,
      // card-mod-format set/all/html.rb:17-19), which substitutes to
      // :one_line_content under compact. The bytes must equal the explicit
      // |one_line_content render — the substitution returns the view NAME
      // and the shared pipeline renders it (nest.rb:21 -> render).
      const substituted = fmt.withNestMode("compact", () =>
        fmt.processContent("{{Compact Target}}"),
      );
      const explicit = fmt.processContent("{{Compact Target|one_line_content}}");
      expect(substituted).toBe(explicit);
      // Sanity against a vacuous equality: the one-line bytes carry the
      // target's body and differ from the :titled render the same nest
      // would produce under :normal.
      expect(substituted).toContain("TARGETBODY");
      const titled = fmt.processContent("{{Compact Target|titled}}");
      expect(substituted).not.toBe(titled);
    } finally {
      storage.close();
    }
  });

  it("an unknown card's nest under a compact parent renders the html compact_missing span", async () => {
    const { storage, fmt } = await seedCompactDeck();
    try {
      // mode.rb:73's :compact_missing arm for card.known? == false (the
      // fabricated new-card record of a fetch miss), rendered through the
      // html arm card-mod-format set/all/html/error.rb:33-35
      // `wrap_with :span, h(title_in_context), class: "text-muted"` — the
      // card NAME relativized against the (empty, at root) context names
      // and escaped. A simple name round-trips verbatim.
      const bytes = fmt.withNestMode("compact", () =>
        fmt.processContent("{{No Such Card At All|titled}}"),
      );
      expect(bytes).toBe('<span class="text-muted">No Such Card At All</span>');
    } finally {
      storage.close();
    }
  });
});

describe("compact nest mode - the 200-char elision (nesting.rb:52-63, railtie.rb:16)", () => {
  it("the first nest renders at full length past the limit; later siblings elide to empty", async () => {
    const { storage, fmt } = await seedCompactDeck();
    try {
      // nesting.rb:53 `@char_count && (@char_count > max_char_count)`:
      // the count is nil until the first render RETURNS (nesting.rb:60
      // accumulates after the fact), so Big Card's 250-char render passes
      // whole even though it already exceeds 200; Small Card, evaluated
      // with char_count == 250, is the empty string.
      const compact = fmt.withNestMode("compact", () =>
        fmt.processContent("{{Big Card|core}}{{Small Card|core}}"),
      );
      expect(compact).toContain(BIG_BODY);
      expect(compact).not.toContain("SMALLMARKER");

      // The :normal control — no elision machinery runs at all.
      const normal = fmt.processContent("{{Big Card|core}}{{Small Card|core}}");
      expect(normal).toContain(BIG_BODY);
      expect(normal).toContain("SMALLMARKER");
    } finally {
      storage.close();
    }
  });

  it("elision needs EXCESS: nests totaling at or under 200 chars all render", async () => {
    const { storage, fmt } = await seedCompactDeck();
    try {
      // Two SMALLMARKER renders (11 chars each) sum to 22 — far under the
      // limit, so nothing elides; the gate is strictly `> 200`.
      const compact = fmt.withNestMode("compact", () =>
        fmt.processContent("{{Small Card|core}}{{Small Card|core}}"),
      );
      expect(compact).toBe("SMALLMARKERSMALLMARKER");
    } finally {
      storage.close();
    }
  });

  it("the count lives on the format instance: a subformat's own nests still render", async () => {
    const { storage, fmt } = await seedCompactDeck();
    try {
      // The parent renders {{Nesting Big Card|core}} (its render length
      // exceeds 200, arming the parent's gate) and then {{Small Card|core}}
      // (elided). But the big card's BODY nest {{Small Card|core}} is
      // processed by the big card's SUBFORMAT — a fresh format whose
      // @char_count is nil (Ruby ivars do not cross the subformat
      // boundary) — so the body's own first nest renders HEAD..TAIL whole.
      const compact = fmt.withNestMode("compact", () =>
        fmt.processContent("{{Nesting Big Card|core}}{{Small Card|core}}"),
      );
      expect(compact).toContain("HEAD");
      expect(compact).toContain("TAIL");
      expect(compact).toContain("SMALLMARKER"); // the BODY's nest rendered
      expect(compact.endsWith(BIG_BODY)).toBe(true); // the sibling elided
      expect(compact.endsWith(`TAIL${BIG_BODY}SMALLMARKER`)).toBe(false);
    } finally {
      storage.close();
    }
  });
});
