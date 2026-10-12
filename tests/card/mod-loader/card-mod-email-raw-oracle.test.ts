// The DECK'S OWN email-template cards, rendered by the TS engine and
// compared byte-for-byte with the Ruby engine's bytes.
//
// Why this suite exists: the deck the TS census fixtures seed from is the
// SCRUBBED deck — card names, cardtype names and every body word are
// replaced, so its bytes cannot be compared with Ruby's at all. The RAW
// deck is the one that can. This suite seeds the email-template family
// from those real rows and pins the renders.
//
//   Before this suite the :content view of a *html message card — the
//   contentWithLinkView body in src/card/mod-loader/mods/card-mod-email.ts —
//   was rendered-unpinned: no captured byte surface reached an email
//   template's :content view. This suite is that surface.
//
// Fixture: the recorded email-template rows, built by
//   benchmarks/extract-email-template-oracle-bytes.mjs (deck opened
//   readonly; the cards + card_references row counts are recorded in the
//   fixture's provenance.no_write_proof, before === after).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withCapturePageLaneOrigin } from "../fixtures/capture-page-lane-deck-origin.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import { defaultDeckSources } from "../../../src/card/mod-loader/default-mod-deck.js";
import { normalizeSlotIds } from "../../../src/testing/diff.js";
import cardModEmail from "../../../src/card/mod-loader/mods/card-mod-email.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(
  HERE,
  "..",
  "..",
  "..",
  "fixtures",
  "captured",
  "email-templates-raw-oracle.json",
);

interface FixtureCard {
  id: number;
  // The extractor omits NULL columns (the seeder's undefined === NULL, and
  // the permission universe's rule rows are mostly nulls), so every column
  // but the id and the trash flag is optional here.
  name?: string;
  codename?: string;
  left_id?: number;
  right_id?: number;
  trash: number;
  type_id?: number;
  content?: string;
  read_rule_id?: number;
  read_rule_class?: string;
  type_name?: string | null;
  oracle_views?: Record<string, number> | null;
  oracle_shard?: string | null;
}

interface Fixture {
  cards: FixtureCard[];
  references: Array<{ referer_id: number; referee_id: number | null; referee_key: string | null }>;
  views: Record<string, Record<string, string>>;
  provenance: unknown;
}

// The oracle bytes for these five templates were captured from the deck this
// engine was ported from. That capture embeds that deck's real card names and
// correspondent addresses, which are personal data and are NOT redistributed
// in this fork. The suite is therefore conditional on the operator supplying
// the capture locally (see docs/TESTING.md); without it the suite reports as
// skipped-with-reason rather than passing silently.
const FIXTURE_PRESENT = existsSync(FIXTURE);
if (!FIXTURE_PRESENT) {
  console.warn(
    `[card-mod-email-raw-oracle] SKIPPED: ${FIXTURE} is not present. ` +
      `These oracle bytes are captured from the reference deck and carry its ` +
      `real card names and addresses, so they are not committed to this fork. ` +
      `See docs/TESTING.md for how to supply them. This suite asserts real ` +
      `render behaviour when present and guards nothing when absent.`,
  );
}

const fixture = FIXTURE_PRESENT
  ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture)
  : ({ cards: [], references: [], views: {}, provenance: null } as unknown as Fixture);

/** The five email_template cards the deck actually ships. */
const TEMPLATE_IDS = [21783, 21787, 21791, 21795, 33948] as const;

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  for (const card of fixture.cards) {
    await seedCard(s, {
      id: card.id,
      name: card.name,
      codename: card.codename,
      leftId: card.left_id,
      rightId: card.right_id,
      trash: card.trash === 1,
      typeId: card.type_id,
      dbContent: card.content,
      readRuleId: card.read_rule_id,
      readRuleClass: card.read_rule_class,
    });
  }
  for (const ref of fixture.references) {
    await seedReference(s, ref.referer_id, ref.referee_id, ref.referee_key);
  }
  // The name environment (lexicon + codename registry) is built from the
  // seeded deck; without it every `:codename` mark in the email bodies
  // ({{:title|core}}) raises CodenameNotFoundError — the same boot step the
  // render and mod-loader suites run.
  s.fetcher.installNameEnvironment();
  // The FULL default mod deck, not just the email mod: the deck's email
  // bodies nest helper views that other mods register (card-mod-format
  // set/all/base.rb:29 `view(:url) { card_url _render_linkname }`, :link,
  // :linkname; card-mod-account's :verify_url / :token_days; card-mod-follow's
  // notify views). A loader carrying only card-mod-email raises
  // UnsupportedViewError for all of them, which would measure the harness,
  // not the port.
  loader = new ModLoader(defaultDeckSources());
  loader.load();
  bindModLoaderToEngine(s, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
}, 180_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The name the engine's deck uses for a card: the stored name, or the
 *  left-card name + the type field's name when the row's name is NULL
 *  (every right-side setting card in the deck is stored that way). */
function renderNameFor(cardId: number): string {
  const card = fixture.cards.find((c) => c.id === cardId);
  if (card === undefined) throw new Error(`fixture has no card ${cardId}`);
  if (typeof card.name === "string") return card.name;
  const left = card.left_id === undefined ? undefined : fixture.cards.find((c) => c.id === card.left_id);
  const right = card.right_id === undefined ? undefined : fixture.cards.find((c) => c.id === card.right_id);
  const leftName = left === undefined ? "" : typeof left.name === "string" ? left.name : renderNameFor(left.id);
  const rightName = right === undefined ? "" : typeof right.name === "string" ? right.name : renderNameFor(right.id);
  return `${leftName}+${rightName}`;
}

/** First differing offset plus a window around it, so a failure names the
 *  mechanism instead of dumping 14 KB. */
function firstDivergence(ours: string, theirs: string): string {
  let i = 0;
  while (i < ours.length && i < theirs.length && ours[i] === theirs[i]) i++;
  const window = (s: string): string =>
    JSON.stringify(s.slice(Math.max(0, i - 60), i + 160));
  return (
    `first difference at byte ${i} (ours ${ours.length} B, oracle ${theirs.length} B)\n` +
    `  ours   : ${window(ours)}\n` +
    `  oracle : ${window(theirs)}`
  );
}

/** The `.simple-core` wrapper plus the base :content slot's opening tag —
 *  everything up to and including the `>` that closes the slot div. */
function slotHead(html: string): string {
  const slot = html.indexOf('<div id="');
  const end = html.indexOf(">", html.indexOf("data-slot="));
  if (slot === -1 || end === -1) return html.slice(0, 120);
  return html.slice(0, end + 1);
}

/** The `.email-html-link` block: the link the mod's haml adds below the
 *  content, href included, to the end of the render. */
function linkBlock(html: string): string {
  const i = html.indexOf("<div class='email-html-link");
  return i === -1 ? html.slice(-160) : html.slice(i);
}

describeOrSkipLoud(!FIXTURE_PRESENT, "tests/card/mod-loader/card-mod-email-raw-oracle.test.ts", "FIXTURE_PRESENT")(
  "U6/C8 — the reference deck's email templates against the raw Ruby oracle",
  () => {
  it("the fixture carries the five email_template cards with captured :content bytes", () => {
    const templates = fixture.cards.filter((c) => TEMPLATE_IDS.includes(c.id as never));
    expect(templates).toHaveLength(5);
    for (const t of templates) {
      expect(t.type_name).toBe("Email template");
      expect(fixture.views[String(t.id)]?.content ?? "").not.toBe("");
    }
  });

  it("the raw deck's own no-write proof is recorded (row counts unchanged)", () => {
    const proof = (fixture.provenance as { no_write_proof: { cards: { before: number; after: number } } })
      .no_write_proof;
    expect(proof.cards.before).toBe(proof.cards.after);
  });

  // ---------------------------------------------------------------------
  // What the port owns, pinned against the oracle's own bytes.
  //
  // card-mod-email set/right/html_message.rb:8-10 haml :content_with_link
  // emits `.simple-core` wrapping `super()` — Ruby's super() lands on the
  // BASE :content view, the slot-wrapped one — then the `.email-html-link`
  // block with the `path(view: :email_page, layout: :none)` href.
  // Before this suite the view was marked RENDERED-UNPINNED in the mod
  // header; these two pins are the byte surface that note was missing.
  //
  // Card 21792 (`signup alert email+*html message`) is the one whose body
  // renders end-to-end on the port, so it is where the envelope is pinned
  // byte-for-byte. The other three bodies stop at an unported helper view
  // (below) before any bytes exist.
  // ---------------------------------------------------------------------
  it("card 21792: the .simple-core wrapper + base :content slot open tag are byte-exact", async () => {
    const oracle = fixture.views["21792"]!.content!;
    const ours = await storage!.engine.render(renderNameFor(21792), "content");
    expect(ours.startsWith("<div class='simple-core'>\n"), firstDivergence(ours, oracle)).toBe(true);
    expect(
      slotHead(normalizeSlotIds(ours)),
      firstDivergence(slotHead(normalizeSlotIds(ours)), slotHead(normalizeSlotIds(oracle))),
    ).toBe(slotHead(normalizeSlotIds(oracle)));
  });

  it("card 21792: the .email-html-link block + email_page href are byte-exact", async () => {
    const oracle = fixture.views["21792"]!.content!;
    const ours = await storage!.engine.render(renderNameFor(21792), "content");
    expect(linkBlock(ours), firstDivergence(linkBlock(ours), linkBlock(oracle))).toBe(linkBlock(oracle));
  });

  // card-mod-format set/all/base.rb:28-29 `view(:url) { card_url
  // _render_linkname }` / `view(:id_url) { card_url "~#{card.id}" }`.
  // BOTH SHAPES, ONE HELPER. Ruby's card_url is origin-dependent and
  // `Env.origin` is a PER-RENDER value (card-1.110.0
  // lib/card/env/serializable.rb:20-22
  // `Cardio.config.deck_origin || "#{protocol}#{request&.host_with_port}"`;
  // card_url is env/location.rb:19-21
  // `card_url rel = "#{Env.origin}#{card_path rel}"`). Two rendered shapes
  // therefore exist for the same view:
  //   - with no origin configured (this fixture's render): `href="/User"`.
  //   - with deck_origin set (the served-page configuration): the
  //     origin-absolute form.
  // The port resolves the origin per surface, so BOTH pins below hold.
  it("base :url renders the view-lane card_url (origin absent, the fixture's own shape)", async () => {
    expect(await storage!.engine.render("verification email", "url")).toBe(
      "/verification_email",
    );
    expect(await storage!.engine.render("verification email+*html message", "url")).toBe(
      "/verification_email+*html_message",
    );
  });

  it("base :url renders the origin-absolute card_url on the PAGE lane (the page oracle)", async () => {
    // The engine's page configuration supplies deck_origin, so the test
    // installs that configuration around the page render.
    await withCapturePageLaneOrigin(async () => {
      expect(
        await storage!.engine.runWithPageConfig(() => storage!.engine.render("verification email", "url")),
      ).toBe("https://culturesmith.com/verification_email");
      expect(
        await storage!.engine.runWithPageConfig(() =>
          storage!.engine.render("verification email+*html message", "url"),
        ),
      ).toBe("https://culturesmith.com/verification_email+*html_message");
    });
  });

  it("base :id_url renders the view-lane card_url (origin absent)", async () => {
    // Ruby: card_url("~#{card.id}") (base.rb:29) through card_path →
    // `/~21783` (origin absent) or `https://<deck_origin>/~21783` (origin
    // present) — env/location.rb:6-21, serializable.rb:20-22. The pins are
    // gem-derived and exist to pin both sides of the surface seam.
    expect(await storage!.engine.render("verification email", "id_url")).toBe("/~21783");
  });

  it("base :id_url renders the origin-absolute card_url on the PAGE lane", async () => {
    await withCapturePageLaneOrigin(async () => {
      expect(
        await storage!.engine.runWithPageConfig(() => storage!.engine.render("verification email", "id_url")),
      ).toBe("https://culturesmith.com/~21783");
    });
  });

  // ---------------------------------------------------------------------
  // The four full-view pins. Each asserts the template's full :content
  // bytes; a per-template residual is named in its blocker text.
  //
  // MECHANISM (gem source, read directly):
  //   card-mod-email-0.20.0/set/abstract/test_context.rb:1-13
  //     format :html do
  //       view :core, cache: :never do
  //         contextualizing { super() }
  //       end
  //       def contextualizing(&block)
  //         if @context_card.present? || voo.hide?(:test_context)
  //           yield
  //         else
  //           card.with_context test_context_card, &block
  //         end
  //       end
  //       def test_context_card
  //         card.left.fetch(:test_context)&.first_card
  //       end
  //     end
  //   The html_message body therefore renders with SELF = the template's
  //   `*test context` card (`User` for signup alert, `Decko Bot
  //   +*account` for password reset / verification, `*changed card` for the
  //   follower notification), so `{{_|name}}` and `{{_|url}}` are the CONTEXT
  //   card's name and URL — that is why the bytes show "User" and "/User".
  //   THE SEAM IS PORTED: Ruby reaches it on the :content render through the
  //   chain right/html_message :content -> super() -> base :content
  //   (card-mod-format set/all/base.rb:89-91 `view :content do _render_core
  //   end`) -> :core, whose html :core the include_set mixed in WITH the
  //   contextualizing wrap (test_context.rb:4-6) — the port mirrors every
  //   hop: contentWithLinkBody -> contentView -> renderView("core") ->
  //   htmlMessageCoreBody -> contextualizingTestContext (views.ts:1306),
  //   with `_` nests fetching format.contextCard (format.ts:1129-1133,
  //   card-1.110.0 lib/card/format/nest/fetch.rb:12). The follower
  //   notification (21796) renders the context end-to-end: `{{_|link}}`,
  //   `{{_|last_action_verb}}` resolve against `*changed card`, and
  //   :subedits / :followed / :unfollow_url / :list_of_changes are
  //   byte-identical. Any residual delta per template is named in its
  //   blocker text.
  //
  //   These are it.fails markers, NOT skipped tests: each one still asserts
  //   the oracle bytes, and vitest reports the marker as passing only while
  //   the assertion actually fails. Unwrap them when their named residual
  //   lands.
  // ---------------------------------------------------------------------
  for (const [id, blocker, unwrapped] of [
    // The verify/reset flow views are ported and the renders below pass
    // byte-exact, so both of these pins are unwrapped.
    [21784, "card-mod-account :verify_url / :token_days (denial: :blank) through the test context", true],
    [21788, "card-mod-account :reset_password_url / :reset_password_days through the test context", true],
    // 21792 unwrapped: first_card is fetch_item_card, Card.fetch with
    // new: {} (card-mod-collection set/all/item.rb:69-73, :241-243), so the
    // missing item still yields a card — the new `User` — and
    // {{_|name}} / {{_|url}} render `User` and `/User` like the engine
    // under test does. One fixture limitation matters for this family: the
    // extractor's CARD_CAP=200 guard omits the `User` referee card
    // (id 2693) while still seeding junction 33827 with content "User", so
    // a port seam that answers "no context" for a missing item card would
    // resolve the marks against the RENDERING card instead. Not
    // hand-fixable: the fixture is recorded ground truth with provenance;
    // fixing it means re-running the extractor.
    [21792, "the test context's first item is the new card first_card fetches when the deck lacks it", true],
    // 21796 unwrapped: :subedits renders the literal mark on both sides and
    // :list_of_changes is empty on both, and the mod-level
    // :link/:nav_link registrations import the flat render/views.ts bodies
    // (linkAnchorBody — rooted href + card-title span, the one Ruby shape:
    // card-mod-format-0.20.0 set/all/base.rb:35, html helper chain
    // links.rb:101-116 + path.rb:74-77 + title.rb:19-22,39-42), so the
    // anchor regions all match. The last delta was the `{{_|url}}?
    // view=history` arm carrying an unconditional absolute origin; with
    // card_url surface-scoped (env/location.rb:19-21 + serializable.rb:20-22)
    // the origin-absent surface emits `/*changed_card?view=history` and the
    // origin-configured surface keeps the absolute form.
    [21796, "the origin delta that used to sit at byte 737 is closed (fix-d1-url-origin lane, 2026-10-01): card_url resolves the per-render Env.origin, so the view lane renders the oracle's /*changed_card?view=history", true],
  ] as const) {
    const byteExact = async () => {
      const oracle = fixture.views[String(id)]!.content!;
      const ours = await storage!.engine.render(renderNameFor(id), "content");
      expect(normalizeSlotIds(ours), firstDivergence(normalizeSlotIds(ours), normalizeSlotIds(oracle))).toBe(
        normalizeSlotIds(oracle),
      );
    };
    if (unwrapped) {
      it(`card ${id} (a *html message right): :content is byte-exact with the Ruby oracle [unwrapped at fold: ${blocker}]`, byteExact);
    } else {
      it.fails(`card ${id} (a *html message right): :content is byte-exact with the Ruby oracle [blocked: ${blocker}]`, byteExact);
    }
  }

  // The same story from the other side: the bodies that cannot render
  // fully yet stop at a NAMED helper view. Such a pin goes red the moment
  // that view lands, which is the signal to unwrap the it.fails above.
  // :verify_url / :reset_password_url and :last_action_verb are ported, so
  // their rejection pins here would assert a falsehood — the byte-exact
  // pins above are unwrapped instead (strictly stronger). The 21796 render
  // now RESOLVES — the test context rides it ({{_|link}} /
  // {{_|last_action_verb}} resolve against *changed card) — and the
  // it.fails above keeps tracking the one named residual in the
  // {{_|url}} arm.
  it("card 21796: the body resolves past :last_action_verb (ported), byte-exactness still tracked by the blocked pin above", async () => {
    await expect(storage!.engine.render(renderNameFor(21796), "content")).resolves.toContain(
      "email-html-link",
    );
  });
  },
);
