// The `_left` read delegation's SEATS — corpus-replay proof that the
// delegation's verdicts reach the rendered bytes for the BW Oversight +
// TPR virtual-rule-card bar class.
//
// MECHANISM (established by the env-gated probe
// tests/card/render/p21-left-climb-probe.test.ts, still on disk): the live
// walk itself is CORRECT — canReadByRuleLookup denies
// the BW Oversight+ARCHETYPALLY+Human phantom (climb: *all plus+*read 6569
// "_left" -> left 11201 EXISTS -> *all plus again -> BW Oversight ->
// *self+*read 10577 role list, no Anonymous), denies Message+Conversation+
// *type plus right+*content options (climb lands on anchor 22018's
// BasicCs+*type+*read 22283 "Anyone Signed In"), and allows Exhibit+Item's
// identical virtual (anchor 17741 RichText -> no RichText+*type+*read ->
// *all+*read 6568 Anyone). The verdicts simply never REACH the verdict map:
// the compound unknown-nest phantom is unseated (seatUnknownRefReadVerdicts
// scopes to simple-starred) and the virtual-rule-card seat does not cover
// these set shapes. Ruby decides all three the same way — the LIVE
// recursive delegation (card-mod-permissions set/all/permissions.rb:55-71,
// read verbatim: `left_permission_rule_id` -> `lcard.permission_rule_id
// action` re-enters the winner walk; the stored read_rule_id column is not
// consulted by this chain).
//
// PINS (oracle bytes, not derivations):
// - BW Oversight+ARCHETYPALLY page: the captured oracle page carries 11
//   denial spans (23,330 bytes). Every phantom leaf
//   (+Human/+Father/+Son/+Brother/+Uncle) is the SAME climb; +Citizen
//   (11202, stored rule 6568) stays allowed.
// - Message+Conversation+*type plus right (:content view, enumeration
//   capture 000017, 18,734 bytes): exactly 4 bars (*default / *head /
//   *style / *script — the unconditional-true right-override family) +
//   17 bare denial lis; NO *content options / *content option view bars.
// - Exhibit+Item+*type plus right (GUARD, capture 000013, 69,381 bytes):
//   22 full bars incl. *content options (stored rule 17743, readable) +
//   exactly 1 denial (the *structure slot; *structure+*right+*read = 22417
//   "Anyone Signed In").
//
// Data discipline: the pinned VALUES are captures of the raw deck's real
// member pages — what ships here is the page names and the verdict numbers
// they pin, not the page bytes. The capture bytes and the raw corpus dump
// stay uncommitted: the seed reads tmp/raw-ground-truth/
// bench-corpus-raw.sqlite3 (sha256 6a44dfdc... verified before querying)
// through the committed raw-corpus recipe (tests/card/render/
// raw-corpus-seeding.ts), and the full-deck seed is a minutes-long boot.
//
// Gate: the suite opts in via PERM_LEFT_CLIMB_REPLAY=1 and never runs on
// data presence alone — a scratch clone skips for the opt-in reason, and a
// machine WITH the raw corpus runs it by setting the env var (fail-loud
// ENOENT if env is set and the corpus is missing).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  RAW_CORPUS_DB,
  createRawStructureSeededStorage,
} from "../render/raw-corpus-seeding.js";
import type { RenderTestStorage } from "../render/render-test-storage.js";

const REPLAY_REQUESTED = process.env.PERM_LEFT_CLIMB_REPLAY === "1";
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;

let storage: RenderTestStorage | undefined;

const denialSpans = (html: string): number =>
  (html.match(/class="denied"/g) ?? []).length;

/** data-card-name presence in either quote style, with each space segment
 *  tolerant of the url_key underscore form (the engine renders real rows
 *  with the spaced display name and virtual slots url_key-underscored; the
 *  pin tracks the VERDICT state, not a name-form family owned elsewhere). */
const cardNamePresent = (html: string, name: string): boolean =>
  new RegExp(
    "data-card-name=[\"']" +
      name.replace(/[+*]/g, "\\$&").replace(/ /g, "[ _]") +
      "[\"']",
  ).test(html);

beforeAll(async () => {
  const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
  const everyLiveId = (
    idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
      id: number;
    }>
  ).map((r) => r.id);
  idLister.close();
  storage = await createRawStructureSeededStorage(new Set(everyLiveId));
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon(everyLiveId);
}, 600_000);

afterAll(() => {
  storage?.close();
});

describeIfCorpus("BW Oversight+ARCHETYPALLY: the _left climb reaches the phantom leaves", () => {
  it("renders the page with the oracle's 11 denial spans (phantom leaves denied, card itself allowed)", async () => {
    const html = await storage!.engine.renderPage("BW Oversight+ARCHETYPALLY");
    // Oracle: 11 spans (5 phantom leaves x 2 + 1 elsewhere). Pre-fix engine: 1.
    expect(denialSpans(html)).toBe(11);
  });

  it("denies the +Human phantom leaf (2-span body) instead of rendering its bar body", async () => {
    const html = await storage!.engine.renderPage("BW Oversight+ARCHETYPALLY");
    // The oracle's url_key slot form (mixed18 expected bytes:
    // data-card-name="BW_Oversight+ARCHETYPALLY+Human"); quote/underscore
    // tolerant so the pin tracks the VERDICT state, not a name-form family
    // owned elsewhere.
    const match = html.match(/data-card-name=["']BW_Oversight\+ARCHETYPALLY\+Human["']/);
    expect(match).not.toBeNull();
    const slot = match!.index ?? 0;
    const region = html.slice(slot, slot + 1600);
    // The oracle bar body is the quiet denial twice (the bar frame renders
    // the denial in place of bar_middle + body); the pre-fix engine rendered
    // <div class='bar-body row g-0'> with full leaf content.
    expect(region).not.toContain("bar-body");
    expect((region.match(/class="denied"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Typing rides the *default template walk (RichText+*type+*default 21450)
    // — the engine's type must STAY on the frame (the falsification guard:
    // typing lands, the verdict must follow).
    expect(region).toMatch(/data-card-type-id=["']3["']/);
  });
});

describeIfCorpus("TPR virtual rule cards: the anchor-type read chain decides the bars", () => {
  it("Message+Conversation (anchor BasicCs): the content-option virtuals stay denied bare lis", async () => {
    const html = await storage!.engine.render(
      "Message+Conversation+*type plus right",
      "content",
    );
    // The *default slot is a REAL rule row (22020, stored 6568 — readable):
    // its bar renders. (Real rows carry the spaced display-name form.)
    expect(cardNamePresent(html, "Message+Conversation+*type plus right+*default")).toBe(true);
    // The content-option virtuals have NO rule rows; Ruby denies them via the
    // climb (22283) and renders bare denial lis with no card name in
    // either the display or url_key form (oracle 000017: bare <li><span
    // class="denied">).
    expect(cardNamePresent(html, "Message+Conversation+*type plus right+*content options")).toBe(false);
    expect(cardNamePresent(html, "Message+Conversation+*type plus right+*content option view")).toBe(false);
    // The *head/*style/*script virtual bars render (the unconditional-true
    // right-override family — oracle 000017 bars 2-4).
    expect(cardNamePresent(html, "Message+Conversation+*type plus right+*head")).toBe(true);
    // Oracle total is 17; the engine carries 2 EXTRA bare denial lis at this
    // tip (slots[21]/[22] of the probe census — the whole-lis are settings
    // the oracle's list drops entirely: the restricted-to-prototype-type
    // enumeration family, NOT a verdict; named in the lane receipt).
    // Pin the floor the climb class owns: at least the oracle's 17.
    expect(denialSpans(html)).toBeGreaterThanOrEqual(17);
  });

  it("GUARD Exhibit+Item (anchor RichText): the allowed bars stay allowed, 1 denial total", async () => {
    const html = await storage!.engine.render("Exhibit+Item+*type plus right", "content");
    // *content options IS a real rule card here (17743, stored 6568) and the
    // *content option view virtual resolves allowed through the climb's
    // fall-through (anchor RichText -> no RichText+*type+*read -> 6568
    // Anyone): BOTH bars must stay.
    expect(cardNamePresent(html, "Exhibit+Item+*type plus right+*content options")).toBe(true);
    expect(cardNamePresent(html, "Exhibit+Item+*type plus right+*content option view")).toBe(true);
    // Oracle 000013: the single denial is the *structure slot (*structure+
    // *right+*read 22417 = "Anyone Signed In") — the climb arm must not
    // touch it; the *default (17744) and *follow virtual bars stay.
    expect(denialSpans(html)).toBe(1);
    expect(cardNamePresent(html, "Exhibit+Item+*type plus right+*default")).toBe(true);
    expect(cardNamePresent(html, "Exhibit+Item+*type plus right+*follow")).toBe(true);
  });
});
