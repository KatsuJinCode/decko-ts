// Rule-board "editing" group: the restricted content-options pair — corpus
// replay.
//
// Ruby (card-mod-rules set/type/set.rb:76-84 visible_settings ->
// card-1.110.0 lib/card/setting.rb applies_to_cardtype): a setting with
// restricted_to_type (content_options / content_option_view:
// %i[list pointer session]) is listed only when the set's PROTOTYPE type is
// one of those types. The prototype's type is type.rb ensure_type_id:
// type_id_from_code (static assign_type) || type_id_from_template, and the
// template (card-mod-content templating.rb new_card_template) is the
// *default rule card UNLESS a *structure rule applies to the
// *default-typed dup, in which case the structure card (and its type).
//
// The engine ignored the *structure half and compensated with fitted
// escapes (template-derived types excluded, then re-admitted for every set
// except one named outlier, or whenever a stored pair rule existed); on the
// captured deck that listed the pair on 51 boards Ruby does not.
//
// PINS (reference capture; the Ruby derivation above predicts all 829
// captured set boards' editing badges):
// - RichText+Gallery10+*type plus right: *default RichText (*all plus),
//   structure HTML -> badge 3.
// - Item+Coverage+*type plus right -> badge 3.
// - Message+Conversation+*type plus right: *default List, structure
//   Search -> badge 3.
// - *input type+*right: assign_type right::input_type = pointer -> badge 5.
//
// Gate: opt-in via RULE_BOARD_RESTRICTED_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.RULE_BOARD_RESTRICTED_REPLAY === "1";
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;

const editingBadge = (html: string): number | undefined => {
  const m = /\nediting <span class="_count badge bg-secondary ms-3">(\d+)<\/span>/.exec(html);
  return m === null ? undefined : Number(m[1]);
};

describeIfCorpus("rule boards list the restricted pair only for list/pointer/session prototypes", () => {
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

  it.each([
    ["RichText+Gallery10+*type plus right", 3],
    ["Item+Coverage+*type plus right", 3],
    ["Message+Conversation+*type plus right", 3],
    ["*input type+*right", 5],
  ])("%s: editing badge %i", async (page, badge) => {
    const html = await storage!.engine.renderPage(page);
    expect(editingBadge(html)).toBe(badge);
    const pairBars = (html.match(/data-card-name="[^"]*\+\*content_options"/g) ?? []).length;
    if (badge === 3) expect(pairBars).toBe(0);
  }, 300_000);

  // The `+*content options` rule bar on *input type+*right summarizes the
  // card Ruby overrides (card-mod-list set/self/input_type/right/
  // content_options.rb `def content` = the list-input-options basket):
  // one_line_content counts item_strings of card.content, so the bar reads
  // "11 items", not the stored placeholder row "overridden".
  it("*input type+*right: the content-options bar counts the overridden items", async () => {
    const html = await storage!.engine.renderPage("*input type+*right");
    const at = html.indexOf("data-card-name='*input type+*right+*content options'");
    expect(at).toBeGreaterThan(-1);
    const region = html.slice(at, at + 1200);
    expect(region).toContain('<div class="text-muted one-line">11 items</div>');
    expect(region).not.toContain(">overridden<");
  }, 300_000);
});
