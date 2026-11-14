// Read verdicts for SIMPLE, non-starred unknown nest targets — corpus replay.
//
// Ruby (card-mod-permissions 0.20.0 set/all/permissions.rb:139-146):
//   def ok_to_read?
//     return true if Auth.always_ok?
//     self.read_rule_id ||= permission_rule_id :read
//     return true if Auth.as_card.read_rules_hash[read_rule_id]
//     deny_because you_cant "read this"
//   end
// applies to every NEW card, simple or compound, starred or not. A nest of a
// name with no row (`{{user design|closed}}`) fetches a new card typed from
// the *default template (on this deck *all+*default = BasicCs), whose read
// rule is BasicCs+*type+*read ("Anyone Signed In"): the anonymous reader is
// denied and the mini_bar frame carries two quiet denial spans.
//
// The engine seated verdicts only for compound and starred simple unknown
// names; a plain simple name got no verdict, and a verdict-less unknown card
// rendered its full bar (title, menu, edit link) to the anonymous reader.
//
// PINS (both Ruby captures agree):
// - Person+discussion: the `user design` slot is a denied mini_bar.
// - Intellectual Property+Unsecured: 13 denied items in the oracle; the six
//   BasicCs-typed unknown names below were rendered as full bars.
//
// Gate: opt-in via PERM_SIMPLE_UNKNOWN_REPLAY=1 (the full-deck seed reads the
// uncommitted raw corpus at tmp/raw-ground-truth/bench-corpus-raw.sqlite3).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  RAW_CORPUS_DB,
  createRawStructureSeededStorage,
} from "../render/raw-corpus-seeding.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import type { RenderTestStorage } from "../render/render-test-storage.js";

const REPLAY_REQUESTED = process.env.PERM_SIMPLE_UNKNOWN_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/permissions/read-rule-simple-unknown-nest-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

/** The slot region for one mini_bar slot, located by its data-card-name. */
function slotRegion(html: string, cardName: string): string | undefined {
  const re = new RegExp(`data-card-name=["']${cardName.replace(/[+*]/g, "\\$&")}["']`);
  const m = re.exec(html);
  if (m === null) return undefined;
  const start = html.lastIndexOf("<div id=", m.index);
  return html.slice(start, start + 1400);
}

const isDeniedMiniBar = (region: string | undefined): boolean =>
  region !== undefined &&
  region.includes("mini_bar-view") &&
  !region.includes("bar-body") &&
  (region.match(/class="denied"/g) ?? []).length >= 2;

describeIfCorpus("simple unknown nest targets: read verdict from the *default type's read rule", () => {
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

  it("Person+discussion: the `user design` nest is denied to the anonymous reader", async () => {
    const html = await storage!.engine.renderPage("Person+discussion");
    const region = slotRegion(html, "user design");
    expect(region).toBeDefined();
    expect(isDeniedMiniBar(region)).toBe(true);
    // No bar machinery for the denied card: no edit/create link, no title.
    expect(region).not.toContain("/user_design/edit");
    // The denied bar frame names the card by slot_cardname (wrap.rb:50-54):
    // display form for a simple name, url_key only for a new compound.
    expect(region).toContain("data-card-name='user design'");
  }, 300_000);

  it("Intellectual Property+Unsecured: BasicCs-typed unknown items are denied", async () => {
    const html = await storage!.engine.renderPage("Intellectual Property+Unsecured");
    for (const name of [
      "Archetypal Resonance Imaging",
      "Arts of Peace",
      "Associative Inclusion Dynamics",
      "Equalit",
      "Equanim",
    ]) {
      expect({ name, denied: isDeniedMiniBar(slotRegion(html, name)) }).toEqual({ name, denied: true });
    }
  }, 300_000);
});
