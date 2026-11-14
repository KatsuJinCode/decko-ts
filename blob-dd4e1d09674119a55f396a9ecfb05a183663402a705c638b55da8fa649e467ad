// The :email_page view at the four addresses the enumeration audit's gap
// names (docs/runs/enumeration-audit-2026-10-25.md, A1 row `:email_page`):
//
//   /follower_notification_email+*html_message/email_page?layout=none
//   /signup_alert_email+*html_message/email_page?layout=none
//   /password_reset_email+*html_message/email_page?layout=none
//   /verification_email+*html_message/email_page?layout=none
//
// The capture bytes are the spec:
//   - fixtures/captured/email-templates-raw-oracle.json records, for each
//     of the four mail cards, the rendered :content bytes whose
//     `.email-html-link` block carries the address anchor
//     (`href='/<url key>/email_page?layout=none'`). Those anchors are
//     pinned verbatim below (the audit's evidence line, seated).
//   - The same capture records the slot-wrapped :content render, whose
//     interior IS the html format's :core render of the message field
//     (card-mod-email set/right/html_message.rb:8-10 haml: `.simple-core`
//     wraps `super()`, the BASE :content view, whose body is the slot
//     around :core). The existing card-mod-email-raw-oracle suite pins
//     that :content render byte-for-byte for all four cards, so the
//     interior extracted below from the capture's own bytes is the
//     captured :core bytes by construction.
//   - fixtures/captured/six-oracle-mails.json records the DELIVERED mail
//     bodies, whose head bytes are the :email_document envelope as the
//     Ruby engine rendered it (the same wrap the :email_page view rides).
//     The envelope head is pinned against those captured bytes, not only
//     against the port's heredoc.
//
// What this file adds over the existing suites: the proof that the
// :email_page view ANSWERS at each of the four captured addresses and
// that its response is the captured envelope around the captured core
// bytes, per the view's Ruby body (set/all/email_html.rb:21-23
// `view :email_page, wrap: :email_document do render_core end`).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW_ORACLE_FIXTURE = path.join(
  HERE,
  "..",
  "..",
  "..",
  "fixtures",
  "captured",
  "email-templates-raw-oracle.json",
);
const SIX_MAILS_FIXTURE = path.join(
  HERE,
  "..",
  "..",
  "..",
  "fixtures",
  "captured",
  "six-oracle-mails.json",
);

const FIXTURE_PRESENT = existsSync(RAW_ORACLE_FIXTURE) && existsSync(SIX_MAILS_FIXTURE);

interface FixtureCard {
  id: number;
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
}

interface Fixture {
  cards: FixtureCard[];
  references: Array<{ referer_id: number; referee_id: number | null; referee_key: string | null }>;
  views: Record<string, Record<string, string>>;
}

const rawFixture: Fixture = FIXTURE_PRESENT
  ? (JSON.parse(readFileSync(RAW_ORACLE_FIXTURE, "utf8")) as Fixture)
  : ({ cards: [], references: [], views: {} } as unknown as Fixture);

const sixMails: { scenarios: Record<string, { delivered: Array<{ html_body?: string }> }> } =
  FIXTURE_PRESENT
    ? (JSON.parse(readFileSync(SIX_MAILS_FIXTURE, "utf8")) as never)
    : ({ scenarios: {} });

/** The four mail cards the audit's evidence line names, by the raw deck's
 *  card ids: each entry is the +*html message field the address's mark
 *  carries and the anchor href the capture records for it. */
const MAIL_CARD_IDS = [21796, 21792, 21788, 21784] as const;

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  for (const card of rawFixture.cards) {
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
  for (const ref of rawFixture.references) {
    await seedReference(s, ref.referer_id, ref.referee_id, ref.referee_key);
  }
  s.fetcher.installNameEnvironment();
  // The FULL default mod deck (the raw-oracle suite's reasoning verbatim:
  // the email bodies nest helper views other mods register, and a loader
  // carrying only card-mod-email would measure the harness, not the port).
  loader = new ModLoader(defaultDeckSources());
  loader.load();
  bindModLoaderToEngine(s, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
}, 180_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The name the engine's deck uses for a card (the raw-oracle suite's
 *  helper verbatim: the stored name, or the left name plus the type
 *  field's name when the row's name is NULL). */
function renderNameFor(cardId: number): string {
  const card = rawFixture.cards.find((c) => c.id === cardId);
  if (card === undefined) throw new Error(`fixture has no card ${cardId}`);
  if (typeof card.name === "string") return card.name;
  const left = card.left_id === undefined ? undefined : rawFixture.cards.find((c) => c.id === card.left_id);
  const right = card.right_id === undefined ? undefined : rawFixture.cards.find((c) => c.id === card.right_id);
  const leftName = left === undefined ? "" : typeof left.name === "string" ? left.name : renderNameFor(left.id);
  const rightName = right === undefined ? "" : typeof right.name === "string" ? right.name : renderNameFor(right.id);
  return `${leftName}+${rightName}`;
}

/** The captured :content bytes of one mail card's +*html message field. */
function capturedContent(cardId: number): string {
  const bytes = rawFixture.views[String(cardId)]?.content;
  if (bytes === undefined || bytes === "") throw new Error(`capture has no :content for ${cardId}`);
  return bytes;
}

/** The address anchor the capture records inside one :content render:
 *  the `<a href='...'>` line of the `.email-html-link` block. */
function capturedAnchor(content: string): string {
  const start = content.indexOf("<a href='");
  const end = content.indexOf(">", start);
  if (start === -1 || end === -1) throw new Error("capture carries no email-html-link anchor");
  return content.slice(start, end + 1);
}

/** The captured :core bytes of one mail card, extracted from the capture's
 *  own :content render. The composition (contentWithLinkBody, views.ts)
 *  is `<div class='simple-core'>\n` + the base :content slot + `\n</div>\n`
 *  + the link block, and the base :content slot is the slot div around
 *  :core; the existing raw-oracle suite pins that composition byte-exact
 *  for all four cards, so the bytes between the slot's opening tag and the
 *  slot's own closing div ARE the captured :core bytes. */
function capturedCoreBytes(content: string): string {
  const beforeLink = content.indexOf("<div class='email-html-link");
  const simpleCoreClose = content.lastIndexOf("</div>", beforeLink);
  if (beforeLink === -1 || simpleCoreClose === -1) {
    throw new Error("capture's :content lacks the email-html-link composition");
  }
  const slotClose = content.lastIndexOf("</div>", simpleCoreClose - 1);
  const start = content.indexOf(">", content.indexOf("data-slot=")) + 1;
  return content.slice(start, slotClose);
}

/** The :email_document envelope, head and tail, as the captures record it
 *  (six-oracle-mails.json's delivered bodies and the tinymce-era pin in
 *  card-mod-email.test.ts agree on these bytes). The view body replaces
 *  the INTERIOR marker with the core bytes, so the response is
 *  HEAD + "    " + core + TAIL. */
const ENVELOPE_HEAD =
  "<!DOCTYPE html>\n<html>\n  <head>\n" +
  '    <meta http-equiv="Content-type" content="text/html;charset=UTF-8"/>\n' +
  "    <style></style>\n" +
  "  </head>\n" +
  '  <body class="d0-email-body">\n';
const ENVELOPE_TAIL = "\n  </body>\n</html>\n";

describeOrSkipLoud(!FIXTURE_PRESENT, "tests/card/mod-loader/card-mod-email-email-page-addresses.test.ts", "FIXTURE_PRESENT")(
  "the :email_page view at the four captured mail-card addresses",
  () => {
  it("the captures carry the audit's four anchors and the delivered-mail envelope head", () => {
    expect(MAIL_CARD_IDS).toHaveLength(4);
    for (const id of MAIL_CARD_IDS) {
      expect(capturedAnchor(capturedContent(id))).toContain("/email_page?layout=none");
    }
    const delivered = sixMails.scenarios.password_reset_email.delivered.find((d) => d.html_body);
    expect(delivered?.html_body?.startsWith(ENVELOPE_HEAD)).toBe(true);
  });

  for (const id of MAIL_CARD_IDS) {
    it(`card ${id} (${renderNameFor(id)}): the captured anchor seats the address, and :email_page answers it with the captured envelope around the captured core bytes`, async () => {
      const content = capturedContent(id);
      const anchor = capturedAnchor(content);

      // The captured anchor IS the audit's address: '/<url key>/email_page
      // ?layout=none' (path.rb:31-38: the view rides as a path SEGMENT,
      // layout: :none is the only query param).
      const urlKey = renderNameFor(id).replace(/ /g, "_");
      expect(anchor).toBe(`<a href='/${urlKey}/email_page?layout=none'>`);

      // The view the anchor names answers at the anchor's own mark.
      const ours = normalizeSlotIds(await storage!.engine.render(renderNameFor(id), "email_page"));

      // The response is the captured envelope around the captured core
      // bytes (set/all/email_html.rb:11-13: the wrap substitutes the
      // :core render into the squiggly heredoc's INTERIOR position,
      // indented four spaces inside the body element).
      const expected = ENVELOPE_HEAD + "    " + capturedCoreBytes(content) + ENVELOPE_TAIL;
      expect(ours).toBe(expected);
    });
  }
  },
);
