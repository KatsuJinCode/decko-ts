// notify/follow-mail-views.ts — the values behind the follower email
// template's nests, per format.
//
// The stock follower_notification_email template (card-mod-follow
// data/real.yml:65-99) nests views of the act card (`_`) and of the
// signed-in user (`_user`). Ruby renders the subject and text part through
// the email_text format and the html part through email_html; the same
// nest can produce different bytes in each (the verb is plain text in one
// and a history link in the other). This module computes both maps from
// the act's stored rows, so the mailer (mail.ts renderMail) only
// substitutes.
//
// Ruby sources, per nest:
//   {{_|name}}             the act card's name
//   {{_|url}}              card_url of the card's url_key
//   {{_|link}}             the html link view (known-card anchor + title)
//   {{_|last_action_verb}} text: follow base_views.rb:44-46, the act's
//                          main action type + "d"; html: card-mod-history
//                          set/all/history/views.rb:55-65 ("added",
//                          "deleted", or the "edited" history link)
//   {{_|list_of_changes}}  base_views.rb:6-11 + edit_info_for :71-77
//   {{_|subedits}}         base_views.rb:13-31 + wrap_subedits :85-90
//   {{_|followed}}         base_views.rb:33-39 (option description)
//   {{_|unfollow_url}}     base_views.rb:49-55
//   {{_user|name|link}}    the session user (Cardname _user part)
// Change values: card-mod-history lib/card/action/changes.rb — an action
// with no change rows is "sole" for a create (or a card's only action) and
// reads the card's current fields; otherwise only the recorded fields.

import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import { parseSetName } from "../set-patterns/set-name.js";
import { followOptionDescription } from "../follow/follow-options.js";
import { followRuleNameFor } from "../follow/follow-rule-walk.js";

/** card_changes.field codes (Card::Change::TRACKED_FIELDS). */
const FIELD_NAME = 0;
const FIELD_TYPE_ID = 1;
const FIELD_DB_CONTENT = 2;

const ACTION_TYPES = ["create", "update", "delete"] as const;
type ActionType = (typeof ACTION_TYPES)[number];

/** RELEVANT_FIELDS_BY_ACTION (base_views.rb:1-3). */
const RELEVANT_FIELDS: Record<ActionType, readonly ("name" | "cardtype" | "content")[]> = {
  create: ["cardtype", "content"],
  update: ["name", "cardtype", "content"],
  delete: ["content"],
};

const FIELD_CODE = { name: FIELD_NAME, cardtype: FIELD_TYPE_ID, content: FIELD_DB_CONTENT } as const;

export interface FollowMailViewInput {
  /** The deck origin card_url prefixes ("http://host"). */
  readonly origin: string;
  readonly actId: number;
  /** The act card (Ruby's act.card, the mail context). */
  readonly actCardId: number;
  /** The session user's card id (the `_user` part). */
  readonly actorId: number;
  /** The follower and the reason they follow (active_notice). */
  readonly followerName: string;
  readonly followedSetName: string;
  readonly followOption: string;
}

export interface FollowMailViews {
  readonly text: Record<string, string>;
  readonly html: Record<string, string>;
}

interface ActionRow {
  readonly id: number;
  readonly cardId: number;
  readonly type: ActionType;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Rails' CGI.escape (form encoding): unreserved [A-Za-z0-9_.-~] stay,
 *  space becomes "+", everything else is %XX of its UTF-8 bytes. */
function cgiEscape(s: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(s)) {
    const ch = String.fromCharCode(byte);
    if (/[A-Za-z0-9_.~-]/.test(ch)) out += ch;
    else if (ch === " ") out += "+";
    else out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/** to_text (card-mod-format set/all/text.rb): Rails strip_tags (comments
 *  and tags removed, text kept), then HTML entities decoded. */
function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function followMailViews(
  fetch: FetchEngine,
  input: FollowMailViewInput,
): Promise<FollowMailViews> {
  const driver = fetch.driver;
  const nameOf = async (id: number): Promise<string> =>
    (await fetch.fetchById(id, { lookInTrash: true }))?.name?.s ?? "";
  const cardUrl = (name: string): string => `${input.origin}/${DeckoName.parse(name).urlKey}`;
  const linkHtml = (name: string): string => {
    const parts = DeckoName.parse(name).partNames.map((p) => escapeHtml(p.s));
    return `<a class="known-card" href="${cardUrl(name)}"><span class="card-title" title="${escapeHtml(name)}">` +
      `${parts.join("<span>+</span>")}</span></a>`;
  };

  const actRows = await driver.query<{ id: number; card_id: number; action_type: number }>(
    "SELECT id, card_id, action_type FROM card_actions WHERE card_act_id = ? ORDER BY id",
    [input.actId],
  );
  const actions: ActionRow[] = actRows.rows.map((r) => ({
    id: Number(r.id),
    cardId: Number(r.card_id),
    type: ACTION_TYPES[Number(r.action_type)] ?? "update",
  }));
  // act.main_action: the action on the act card, else the act's first.
  const main = actions.find((a) => a.cardId === input.actCardId) ?? actions[0];

  /** Action#value(field): the recorded change, or the card's current
   *  field when the action is sole (no change rows; a create, or the
   *  card's only action). Undefined = no value (the field is skipped). */
  const changeValue = async (action: ActionRow, field: "name" | "cardtype" | "content"): Promise<string | undefined> => {
    const rows = await driver.query<{ field: number; value: string | null }>(
      "SELECT field, value FROM card_changes WHERE card_action_id = ? ORDER BY id",
      [action.id],
    );
    let raw: string | null | undefined;
    if (rows.rows.length > 0) {
      const hit = rows.rows.find((r) => Number(r.field) === FIELD_CODE[field]);
      if (hit === undefined) return undefined;
      raw = hit.value;
    } else {
      let sole = action.type === "create";
      if (!sole) {
        const n = await driver.query<{ n: number }>(
          "SELECT count(*) AS n FROM card_actions WHERE card_id = ?",
          [action.cardId],
        );
        sole = Number(n.rows[0]?.n ?? 0) === 1;
      }
      if (!sole) return undefined;
      const card = await fetch.fetchById(action.cardId, { lookInTrash: true });
      if (card === undefined) return undefined;
      raw = field === "name" ? card.name?.s : field === "cardtype"
        ? (card.typeId === undefined ? undefined : String(card.typeId))
        : card.dbContent ?? "";
    }
    if (raw === null || raw === undefined) return undefined;
    if (field === "cardtype") return nameOf(Number(raw));
    return raw;
  };

  /** Action#previous_value(field): the card's most recent change of that
   *  field before this action (nil for a create). */
  const previousValue = async (action: ActionRow, field: "name" | "cardtype" | "content"): Promise<string | undefined> => {
    if (action.type === "create") return undefined;
    const rows = await driver.query<{ value: string | null }>(
      "SELECT c.value FROM card_changes c JOIN card_actions a ON a.id = c.card_action_id " +
        "WHERE a.card_id = ? AND a.id < ? AND c.field = ? ORDER BY a.id DESC, c.id DESC LIMIT 1",
      [action.cardId, action.id, FIELD_CODE[field]],
    );
    const raw = rows.rows[0]?.value;
    if (raw === null || raw === undefined) return undefined;
    return field === "cardtype" ? nameOf(Number(raw)) : raw;
  };

  /** edit_info_for + notification_action_label, joined (list_of_changes). */
  const listOfChanges = async (action: ActionRow, html: boolean): Promise<string> => {
    const label = action.type === "update" ? "new" : action.type === "delete" ? "deleted" : "";
    let out = "";
    for (const field of RELEVANT_FIELDS[action.type]) {
      let value = await changeValue(action, field);
      if (value === undefined) continue;
      if (action.type === "delete") value = (await previousValue(action, field)) ?? "";
      // The text part renders through the text format (card-mod-format
      // set/all/text.rb to_text): tags and comments stripped, entities
      // decoded.
      if (!html && field === "content") value = htmlToText(value);
      const item = `  ${label} ${field}: ${value}`;
      out += html ? `<li>${item}</li>\n` : `${item}\n`;
    }
    return out;
  };

  // subedits: the act's actions on the act card's nestees (history_card_ids
  // = nestee_ids + id), the act card's own action excluded.
  const nestees = await driver.query<{ referee_id: number }>(
    "SELECT referee_id FROM card_references WHERE referer_id = ? AND ref_type = 'I' AND referee_id IS NOT NULL",
    [input.actCardId],
  );
  const nesteeIds = new Set(nestees.rows.map((r) => Number(r.referee_id)));
  const subeditActions = actions.filter((a) => a.cardId !== input.actCardId && nesteeIds.has(a.cardId));
  const subedits = async (html: boolean): Promise<string> => {
    let items = "";
    for (const action of subeditActions) {
      const newName = await changeValue(action, "name");
      const before = newName !== undefined ? await previousValue(action, "name") : undefined;
      const name = before ?? (await nameOf(action.cardId));
      const body = `${name} ${action.type}d\n${await listOfChanges(action, html)}`;
      // Text items: wrap_subedit_item (base_views.rb:113-115) contributes the
      // LEADING newline only in the delivered bytes — the body already ends
      // with its list's newline (wrap_list_item, :109-111), and the harness's
      // Ruby capture pins exactly one blank line between items and after the
      // header (the trailing wrapper newline never survives to the mail).
      // The synthetic-v1 oracle settled the two readings: the recorded
      // bytes carry the blank line after "the following
      // changes:", which only the leading-newline form produces.
      items += html ? `<li>${body}</li>
` : `
${body}`;
    }
    if (items === "") return "";
    // Text list tail: the Ruby capture pins the section ending with a blank
    // line of its own before the template's next line ("Tag 02\n" + "\n\n"),
    // alongside the one-blank-line header and item separations.
    const list = html ? `<ul>${items}</ul>\n` : `${items}\n\n`;
    return `\nThis update included the following changes:\n${list}`;
  };

  // A delete that also renamed the act card (a closed account's holder,
  // renamed ANON-... in its own delete action) is announced under the name
  // the card had before the act: the act card Ruby notifies about is the
  // object the request loaded, which never saw the rename.
  const mainRename = main !== undefined && main.cardId === input.actCardId && main.type === "delete"
    ? await changeValue(main, "name")
    : undefined;
  const actCardName = (mainRename !== undefined ? await previousValue(main!, "name") : undefined) ??
    await nameOf(input.actCardId);
  const userName = await nameOf(input.actorId);
  const url = cardUrl(actCardName);

  // followed: the follow option's description of the followed set.
  const setParsed = parseSetName(input.followedSetName);
  const setLabel = setParsed.spec ? setParsed.spec.shortLabel(setParsed.anchorName?.s) : input.followedSetName;
  const followed = input.followedSetName !== "" && input.followOption !== ""
    ? followOptionDescription(input.followOption.replace(/^\*/, ""), setLabel)
    : "*followed set of cards*";

  // unfollow_url: update the follower's +*follow card, setting this set's
  // rule for the follower to *never.
  const ruleName = followRuleNameFor(input.followedSetName, input.followerName);
  const followMark = DeckoName.parse(`${input.followerName}+*follow`).urlKey;
  const unfollowUrl = input.followedSetName === ""
    ? ""
    : `${input.origin}/update/${followMark}?${cgiEscape(`card[subcards][${ruleName}]`)}=${cgiEscape("*never")}`;

  const verb = `${main?.type ?? "edite"}d`;
  // the history mod's html last_action_verb: the card's action in its
  // last act.
  const ownAction = actions.find((a) => a.cardId === input.actCardId);
  const htmlVerb = ownAction === undefined
    ? ""
    : ownAction.type === "create"
      ? "added"
      : ownAction.type === "delete"
        ? "deleted"
        : `<a rel="nofollow" class="last-edited slotter" href="${url}/history" data-remote="true">edited</a>`;

  const changesOf = async (html: boolean): Promise<string> =>
    main === undefined ? "" : listOfChanges(main, html);

  return {
    text: {
      "_|name": actCardName,
      "_|url": url,
      "_|link": actCardName,
      "_|last_action_verb": verb,
      "_|list_of_changes": await changesOf(false),
      "_|subedits": await subedits(false),
      "_|followed": followed,
      "_|unfollow_url": unfollowUrl,
      "_user|name": userName,
      "_user|link": userName,
    },
    html: {
      "_|name": escapeHtml(actCardName),
      "_|url": url,
      "_|link": linkHtml(actCardName),
      "_|last_action_verb": htmlVerb,
      "_|list_of_changes": await changesOf(true),
      "_|subedits": await subedits(true),
      "_|followed": escapeHtml(followed),
      "_|unfollow_url": unfollowUrl,
      "_user|name": escapeHtml(userName),
      "_user|link": linkHtml(userName),
    },
  };
}
