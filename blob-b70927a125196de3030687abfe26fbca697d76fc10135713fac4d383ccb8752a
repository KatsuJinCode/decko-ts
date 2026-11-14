// Role dashboards (`{{_L|configs}}`, card-mod-account set/type/role.rb
// view :configs) — corpus replay.
//
// Which admin configs a role lists is decided by each config card's
// responsible_role (card-1.110.0 mod/core/set/all/admin.rb:32-38):
// scoping_rule_card.find_existing_rule_card.item_cards.map(&:codename).
// scoping_rule_card is overridden per cardtype:
//   - Cardtype cards (card-mod-format set/type/cardtype.rb:89-91):
//     X+*type+*update, else a new X-typed card's rule (*all+*update);
//   - Setting cards (card-mod-rules set/type/setting.rb:23-25):
//     X+*right+*update, else the "*dummy+X" prototype's rule
//     (*rstar+*update on this deck = Shark);
//   - everything else: X+*self+*update, else X's own *update rule.
// The engine applied the generic *self walk to all three, so Administrator
// listed Cardtypes and Settings sections Ruby omits, Shark listed all 35
// cardtypes instead of the 8 whose X+*type+*update names Shark, and Help
// Desk lost its Settings section (*help+*right+*update = Help Desk).
//
// The admin runtime also cached every codename card into the render map
// after the page's read-verdict pass; *recaptcha settings (read rule:
// Administrator only) then rendered as a full bar to the anonymous reader.
//
// Gate: opt-in via ROLE_DASHBOARD_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.ROLE_DASHBOARD_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/render/role-dashboard-configs-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

const sections = (html: string): string[] =>
  [...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1].trim());

/** The bar slots between the "Cardtypes" heading and the next h3. */
function cardtypeNames(html: string): string[] {
  const start = html.indexOf("<h3>Cardtypes</h3>");
  if (start < 0) return [];
  const end = html.indexOf("<h3>", start + 5);
  const region = html.slice(start, end < 0 ? undefined : end);
  return [...region.matchAll(/class="card-slot bar-view[^"]*" data-card-id="\d+" data-card-name="([^"]+)"/g)].map(
    (m) => m[1],
  );
}

describeIfCorpus("role dashboards list the configs each role is responsible for", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
    const ids = (
      idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{ id: number }>
    ).map((r) => r.id);
    idLister.close();
    storage = await createRawStructureSeededStorage(new Set(ids));
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(ids);
  }, 600_000);

  afterAll(() => {
    storage?.close();
  });

  it("Administrator: only the Configurations section, *recaptcha settings denied", async () => {
    const html = await storage!.engine.renderPage("Administrator");
    expect(sections(html).filter((s) => ["Cardtypes", "Settings", "Configurations"].includes(s))).toEqual([
      "Configurations",
    ]);
    expect(html).not.toContain('data-card-name="*recaptcha settings"');
  }, 300_000);

  it("Shark: the 8 cardtypes whose X+*type+*update names Shark, plus Settings", async () => {
    const html = await storage!.engine.renderPage("Shark");
    expect(cardtypeNames(html)).toEqual([
      "Cardtype",
      "HTML",
      "JavaScript",
      "CoffeeScript",
      "CSS",
      "SCSS",
      "Skin",
      "Layout",
    ]);
    expect(sections(html)).toContain("Settings");
  }, 300_000);

  it("Help Desk: the Settings section lists *help", async () => {
    const html = await storage!.engine.renderPage("Help Desk");
    expect(sections(html)[0]).toBe("Settings");
  }, 300_000);
});
