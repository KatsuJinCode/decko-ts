// Deck-backed resolver wiring for the follow-notify hook — the seam
// between the save path and cards that live in THIS deck, through the
// async fetch engine. The follower rule-algebra walk (card-mod-follow
// set/all/follow.rb: direct/indirect follower sets) is a deferred stream;
// the follower resolver stays host-supplied (tests use the fixed sugar).
// The email-template half IS deck-backed here: M6's real capture
// (fixtures/captured/follow-notification.json) proved the template lives
// in `follower notification email` + its `*subject` / `*text message` /
// `*html message` children (card-mod-email data/real.yml:42-58 codenames).

import type { FetchEngine } from "../fetch.js";
import type { EmailTemplate } from "./mail.js";
import type { EmailTemplateResolver } from "./follow-notify.js";

const TEMPLATE_CARD = "follower notification email";
const SUBJECT_CHILD = `${TEMPLATE_CARD}+*subject`;
const TEXT_CHILD = `${TEMPLATE_CARD}+*text message`;
const HTML_CHILD = `${TEMPLATE_CARD}+*html message`;

async function readContent(fetch: FetchEngine, name: string): Promise<string> {
  const card = await fetch.fetchByName(name);
  return card?.dbContent ?? "";
}

/**
 * The EmailTemplateResolver the save path uses in production: reads the
 * follower_notification_email template triple from the deck on every fire
 * (Ruby re-reads the cards per notification too — notify.rb walks
 * `Card[:follower_notification_email]` fresh). A missing card or child
 * reads as an empty string, and buildFollowNotifyHook skips silently on
 * an all-empty template — the "deck hasn't configured mail yet" shape.
 */
export function deckEmailTemplateResolver(fetch: FetchEngine): EmailTemplateResolver {
  return async (): Promise<EmailTemplate> => {
    const templateCard = await fetch.fetchByName(TEMPLATE_CARD);
    if (templateCard === undefined) {
      return { to: "", from: "", subject: "", textBody: "", htmlBody: "" };
    }
    return {
      to: "",
      from: await readContent(fetch, `${TEMPLATE_CARD}+*from`),
      subject: await readContent(fetch, SUBJECT_CHILD),
      textBody: await readContent(fetch, TEXT_CHILD),
      htmlBody: await readContent(fetch, HTML_CHILD),
    };
  };
}
