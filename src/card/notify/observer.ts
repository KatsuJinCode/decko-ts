// notify/observer.ts — the card-event email rules: a card's *on create,
// *on update and *on delete rules name email templates delivered when the
// card is saved that way.
//
// Ruby sources:
//   card-mod-integrate set/all/observer.rb   event :observer_<action>,
//     :integrate, on: <action> — execute_card_events: every item card of
//     the card's rule for :on_<action> delivers itself with the card as
//     context (event_card.deliver self)
//   card-mod-email set/type/email_template.rb   deliver: the template's
//     fields (to, from, cc, bcc, subject, text and html messages) rendered
//     in the card's context; Mail raises on a blank recipient ("SMTP To
//     address may not be blank")
//   card-1.110.0 lib/card/set/event.rb rescuing_integration + director
//     run.rb valid_card?: an exception in an integrate event is rescued,
//     but it leaves an error on the card, and a card with errors runs no
//     later stage — after_integrate and integrate_with_delay (the follower
//     notice) are skipped for it.
//
// A recipient field naming cards (a role, a list of users) needs the
// email-address rendering of those cards, which is not ported: such a
// template is reported through the logger and not delivered. Literal
// addresses are delivered.

import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import { findRule } from "../rules/lookup.js";
import { ruleWalkPatternInput } from "../actions/rule-content-walk.js";
import { interpolateTemplate, resolveFromAddress, addressOf } from "./mail.js";
import type { MailMessage, NotifyTransport } from "./types.js";

export interface ObserverInput {
  readonly card: { id: number; name: string; typeId: number | undefined };
  readonly action: "create" | "update" | "delete";
  readonly transport: NotifyTransport;
  readonly origin: string;
  readonly deckoBotEmail: string;
  readonly actorName: string;
  readonly logger?: (line: string) => void;
}

export interface ObserverOutcome {
  /** An event raised (Ruby leaves an error on the card): the card's later
   *  integrate stages do not run. */
  readonly failed: boolean;
  readonly delivered: number;
}

const EMAIL_LIST = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+(\s*[,\n]\s*[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$/;

/** A list rule's item names: JSON array content (list cards in this
 *  Decko version) or one name per line, [[...]] brackets stripped. */
function itemNames(content: string): string[] {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") && !trimmed.startsWith("[[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter((s) => s !== "");
    } catch {
      // not JSON: lines below
    }
  }
  return trimmed.split("\n").map((l) => l.trim().replace(/^\[\[|\]\]$/g, "")).filter((s) => s !== "");
}

export async function runObserverEvents(fetch: FetchEngine, input: ObserverInput): Promise<ObserverOutcome> {
  const setting = `*on ${input.action}`;
  const pattern = await ruleWalkPatternInput(fetch, {
    name: DeckoName.parse(input.card.name),
    id: input.card.id,
    isNew: false,
    typeId: input.card.typeId ?? null,
  });
  const found = await findRule(fetch, pattern, setting);
  if (found === undefined) return { failed: false, delivered: 0 };
  const field = async (template: string, right: string): Promise<string> =>
    (await fetch.fetchByName(`${template}+${right}`))?.dbContent ?? "";
  const title = (await fetch.fetchByName("*title"))?.dbContent ?? "";
  let delivered = 0;
  for (const template of itemNames(found.rule.dbContent ?? "")) {
    const to = (await field(template, "*to")).trim();
    if (to === "") {
      // Mail::SmtpEnvelope raises on a blank recipient; the integrate
      // stage rescues it and the card keeps the error.
      input.logger?.(`[observer] ${setting} ${template} for ${input.card.name}: SMTP To address may not be blank`);
      return { failed: true, delivered };
    }
    if (!EMAIL_LIST.test(to)) {
      input.logger?.(`[observer] ${setting} ${template}: recipient field "${to}" names cards; address rendering is not ported, not delivered`);
      continue;
    }
    const vars: Record<string, string> = {
      "_|name": input.card.name,
      "_|url": `${input.origin}/${DeckoName.parse(input.card.name).urlKey}`,
      ":title|core": title,
      "_user|name": input.actorName,
    };
    const from = resolveFromAddress(await field(template, "*from"), { deckoBotEmail: input.deckoBotEmail });
    const html = await field(template, "*html message");
    const msg: MailMessage = {
      to,
      from,
      replyTo: addressOf(from),
      subject: interpolateTemplate(await field(template, "*subject"), vars),
      textBody: interpolateTemplate(await field(template, "*text message"), vars),
      ...(html !== "" ? { htmlBody: interpolateTemplate(html, vars) } : {}),
      tags: { trigger: "observer", template },
    };
    try {
      await input.transport.sendMail(msg);
      delivered++;
    } catch (err) {
      input.logger?.(`[observer] ${setting} ${template}: ${(err as Error).message}`);
      return { failed: true, delivered };
    }
  }
  return { failed: false, delivered };
}
