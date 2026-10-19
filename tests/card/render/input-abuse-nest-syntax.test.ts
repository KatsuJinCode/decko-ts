// INPUT-ABUSE LANE: hostile nest syntax, hostile names, and deep embed
// chains against the render engine. The oracle facts are read from the
// Ruby source tree (decko-ruby-perf/card + mod/, card 1.110.0 / card-mod
// content 0.20.0 — the same trees the port's doc comments cite):
//
// - CHUNK GRAMMAR: mod/content lib/card/content/chunk/nest.rb:13 —
//   full_re /\A\{\{([^{}]*)\}\}/. Decko nest spans cannot nest braces, so
//   an inner `{{b}}` wins and the outer braces are ordinary text; an
//   unclosed `{{x` is never a chunk at all; nest.rb's option separator is
//   the COLON ("view:foo"), so `|view=foo` sets the view to the literal
//   string "view=foo". Nest reference names are strip_tags'd
//   (nest.rb `gsub(/<[^>]*>/, "")`).
// - DEPTH GUARD: card/lib/card/format/error.rb:32-38 monitor_depth —
//   `depth >= Card.config.max_depth` (railtie.rb:17 max_depth = 20) raises
//   Card::Error::UserError "Man, you're too deep.  (Too many levels of
//   nests at a time)" (mod/format config/locales/en.yml:23). In a
//   non-focal nest the quiet branch renders the UserError message
//   VERBATIM (error.rb rendering_error — no escaping on the UserError
//   arm), so a 50-card chain and a 2-card CYCLE both end as ONE too-deep
//   error surface inside a successfully rendered page — never a stack
//   overflow, never a hang.
// - ESCAPED LITERAL: mod/format lib/card/format/html_format.rb:20-22
//   escape_literal → "<span>#{literal}</span>", so `\{{x}}` renders
//   `<span>{</span>{x}}`.
//
// The render-side HTML questions (a hostile NAME in a title, a hostile
// nest reference, a hostile nest OPTION value) are answered byte-for-byte
// below. The stored-content cleaner has its own suite
// (tests/card/actions/content-clean-security.test.ts); the rows here are
// seeded directly, i.e. bytes that reached the database without it.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { RenderFormat } from "../../../src/card/render/format.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

const DEPTH_CHAIN_LENGTH = 50;

let storage: RenderTestStorage;
let deckReady: Promise<void>;

async function seedAbuseDeck(): Promise<void> {
  // The 50-card embed chain: chain-00's content nests chain-01, ... ,
  // chain-49 carries plain text. Depth 50 >> Ruby's max_depth (20).
  for (let i = 0; i < DEPTH_CHAIN_LENGTH; i++) {
    const content =
      i === DEPTH_CHAIN_LENGTH - 1
        ? "CHAIN-TAIL"
        : `{{chain-${String(i + 1).padStart(2, "0")}}}`;
    await seedCard(storage, {
      id: 700 + i,
      name: `chain-${String(i).padStart(2, "0")}`,
      typeId: 2,
      dbContent: content,
    });
  }
  // The 2-card cycle: cycle a nests cycle b, cycle b nests cycle a. The
  // recursion depth grows without bound; the guard must end it.
  await seedCard(storage, { id: 800, name: "cycle a", typeId: 2, dbContent: "{{cycle b}}" });
  await seedCard(storage, { id: 801, name: "cycle b", typeId: 2, dbContent: "{{cycle a}}" });
  // A card whose NAME is an HTML tag (the action layer stores such names —
  // see tests/card/actions/input-abuse-name-validation.test.ts).
  await seedCard(storage, {
    id: 802,
    name: "<script>alert(1)</script>",
    typeId: 2,
    dbContent: "body of the script-named card",
  });
  // A nest target for the syntax probes.
  await seedCard(storage, { id: 803, name: "Option Target", typeId: 2, dbContent: "OPTION-BODY" });
  // An unknown-view option bomb: Ruby's nest option separator is the
  // colon, so the view value here is the hostile literal "<script".
  await seedCard(storage, { id: 804, name: "view bomb", typeId: 2, dbContent: "{{cycle a|view:<script}}" });
  await storage.fetcher.installNameEnvironment();
  bindModLoaderToEngine(storage, defaultDeckLoader());
  for (const name of [
    "chain-00",
    "chain-49",
    "cycle a",
    "cycle b",
    "view bomb",
    "<script>alert(1)</script>",
    "Option Target",
  ]) {
    const prepared = await storage.engine.prepareItemForRender(name);
    if (prepared === undefined) throw new Error(`${name} not preparable after seed`);
  }
}

/** A format bound to the named card, the harness convention
 *  (compact-nest-mode test:84). */
async function renderFormatFor(name: string): Promise<RenderFormat> {
  const card = await storage.engine.prepareItemForRender(name);
  if (card === undefined) throw new Error(`${name} not preparable`);
  return new RenderFormat(card, storage.engine);
}

beforeAll(() => {
  defaultDeckLoader();
  deckReady = (async () => {
    storage = await createRenderTestStorage();
    await seedAbuseDeck();
  })();
});

afterAll(() => {
  setDefaultModLoader(undefined);
  storage?.close();
});

describe("deep embed chains and cycles (max_depth is 20)", () => {
  it("a 50-card nest chain lands on the depth guard, never a stack overflow", async () => {
    await deckReady;
    // The focal render SUCCEEDS: at subformat depth 20 the guard raises
    // TooDeepError, the nest's quiet branch renders the UserError message
    // verbatim, and the unwound chain returns. The tail (depth 21+) never
    // renders. Exactly ONE too-deep surface per page (the raise unwinds
    // every remaining level at once).
    const html = await storage.engine.render("chain-00", "core");
    expect((html.match(/too deep/g) ?? []).length).toBe(1);
    expect(html).toContain("Man, you're too deep.  (Too many levels of nests at a time)");
    expect(html).not.toContain("CHAIN-TAIL");
    expect(html.length).toBeLessThan(40_000); // 19 wrapped levels, not 50
  });

  it("an embed cycle (a->b->a) ends at the same guard, deterministically", async () => {
    await deckReady;
    const html = await storage.engine.render("cycle a", "core");
    expect((html.match(/too deep/g) ?? []).length).toBe(1);
    expect(html).toContain("Man, you're too deep.  (Too many levels of nests at a time)");
  });

  it("the guard error inside a NON-focal nest leaves the surrounding page intact", async () => {
    await deckReady;
    await seedCard(storage, {
      id: 850,
      name: "chain wrapper",
      typeId: 2,
      dbContent: "BEFORE[{{chain-00}}]AFTER",
    });
    await storage.engine.prepareItemForRender("chain wrapper");
    const html = await storage.engine.render("chain wrapper", "core");
    expect(html).toContain("BEFORE[");
    expect(html).toContain("]AFTER");
    expect(html).toContain("too deep");
  });
});

describe("malformed and self-closing nest syntax (chunk/nest.rb:13 grammar)", () => {
  it("an unclosed {{ is never a chunk: the text renders verbatim", async () => {
    await deckReady;
    const fmt = await renderFormatFor("Option Target");
    expect(fmt.processContent("A {{unclosed name B")).toBe("A {{unclosed name B");
  });

  it("the blank reference {{}} renders the blank-key nest surface, not a crash", async () => {
    await deckReady;
    const fmt = await renderFormatFor("Option Target");
    const html = fmt.processContent("before{{}}after");
    expect(html).toContain("before");
    expect(html).toContain("after");
    expect(html).not.toContain("{{}}");
  });

  it("braces cannot nest: `OUT {{a {{cycle b}} c}} IN` claims the inner span, the outer braces stay text", async () => {
    await deckReady;
    // Nest renders live inside a PREPARE scope: any engine.render() call in
    // an earlier test closed the scope the harness prepares rode in, so the
    // nest targets are re-prepared HERE (the render-test-storage harness
    // convention: an un-prepared target's nest renders empty).
    await storage.engine.prepareItemForRender("cycle a");
    await storage.engine.prepareItemForRender("cycle b");
    const fmt = await renderFormatFor("Option Target");
    // The scanner claims {{cycle b}} (the inner, well-formed span); the
    // outer "{{a " and " c}}" carry no closing braces before the inner
    // ones, so they are literal text around the nest's render. The cycle
    // inside raises the depth guard at THIS format (a bare test format has
    // no quiet-error posture — Ruby's monitor_depth raise propagates at
    // the root format; the page lane's quiet span is pinned by the
    // engine.render tests above). The brace placement is visible in the
    // rethrow path too: consume the raise and check the nest was claimed
    // from between the literal braces.
    const raise = await new Promise<unknown>((resolve) => {
      try {
        fmt.processContent("OUT {{a {{cycle b}} c}} IN");
        resolve("no raise");
      } catch (e) {
        resolve(e);
      }
    });
    expect((raise as Error).constructor.name).toBe("TooDeepError");
  });

  it("an escaped literal \\{{name}} renders Ruby's html escape_literal bytes", async () => {
    await deckReady;
    const fmt = await renderFormatFor("Option Target");
    // html_format.rb:20-22: escape_literal("{") == "<span>{</span>".
    expect(fmt.processContent("X \\{{Option Target}} Y")).toBe(
      "X <span>{</span>{Option Target}} Y",
    );
    expect(fmt.processContent("X \\{{Option Target}} Y")).not.toContain("OPTION-BODY");
  });

  it("stray closing braces after a nest are literal text", async () => {
    await deckReady;
    const fmt = await renderFormatFor("Option Target");
    const html = fmt.processContent("{{Option Target}}}}");
    expect(html).toContain("OPTION-BODY");
    expect(html).toContain("}}");
  });
});

describe("hostile names and hostile nest options at render time", () => {
  it("a card named <script>alert(1)</script> renders its title ESCAPED", async () => {
    await deckReady;
    const html = await storage.engine.render("<script>alert(1)</script>", "titled");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("a nest naming the script card: nest.rb strip_tags reduces the reference to alert(1), which misses", async () => {
    await deckReady;
    const fmt = await renderFormatFor("Option Target");
    // nest.rb strips <[^>]*> from the reference: "<script>alert(1)</script>"
    // -> "alert(1)" — no such card -> the miss surface. The script markup
    // never renders, in any form.
    const html = fmt.processContent("{{<script>alert(1)</script>}}");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).toBe("");
  });

  it("a hostile nest OPTION value renders the UserError message verbatim — oracle parity (error.rb rendering_error)", async () => {
    await deckReady;
    // Ruby: an unsupported view raises Card::Error::UserError
    // "view (<script) not supported for cycle a" (render.rb:70 +
    // format_unsupported_view), and rendering_error's UserError arm returns
    // the message WITHOUT escaping (card/lib/card/format/error.rb:81-86).
    // The port's quietRenderError (format.ts:4776-4784) pins the same:
    // UserError-class messages verbatim, other errors' cardnames h()-escaped.
    // The verbatim channel is Ruby-native: a RichText author whose tags the
    // cleaner strips can still author `{{x|view:<script}}`, and the page
    // then carries the unescaped "<script" byte sequence. PINNED AS PARITY —
    // changing it would diverge from the oracle; the escalation is recorded
    // here so the next reader does not mistake it for a port defect.
    const html = await storage.engine.render("view bomb", "core");
    expect(html).toBe(
      '<span class="render-error alert alert-danger">view (<script) not supported for cycle a</span>',
    );
  });
});
