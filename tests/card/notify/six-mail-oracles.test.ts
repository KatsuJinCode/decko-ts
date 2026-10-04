// tests/card/notify/six-mail-oracles.test.ts — the SIX-MAIL oracle pins.
//
// fixtures/captured/six-oracle-mails.json holds the six side-effect mails
// the four-parity inventory named as uncaptured (signup verification,
// password reset, welcome, watcher-on-type notify, delete notify,
// includer/template notify), rendered by the REAL Ruby machinery (card
// 1.110.0 / decko 0.20.0, ruby 3.3.12) in the booted oracle app with
// ActionMailer TEST delivery — no SMTP, no network. The capture channel,
// scenario seeds, and determinism contract live in
// tools/oracle/mail_oracles_capture.rb (committed next to this test).
//
// Each pin drives the TS port's mail rendering for the same scenario and
// byte-compares the delivered envelope {to, from, subject, text_body,
// html_body}. The token segment inside verify/reset links is NORMALIZED
// on both sides (clock+secret-dependent; its byte parity is owned by
// fixtures/captured/auth-token.json + tests/card/auth/token.test.ts).
//
// Ruby bytes provenance:
// - account mails: safe_from_and_reply_to!'s From construction
//   (card-mod-email set/type/email_template/email_config.rb:52-79 — the
//   template's "Decko Bot" from FIELD resolves through the DeckoBot
//   account email to the BARE no-reply@decko.org; the name never
//   survives because the field content is not itself an email), the
//   template seed bytes (card-mod-account data/real.yml), the relative
//   token_url shape (right/account/views.rb:34-38 — the capture
//   runner's origin is empty), token_days = 2 (railtie.rb:12), and the
//   email_document wrapper for the html part (card-mod-email
//   set/all/email_html.rb:2-14 — the html_message renders THROUGH the
//   EmailHtmlFormat#show wrapper, not as a bare div).
// - follow mails: the STOCK follower_notification_email template
//   (card-mod-follow data/real.yml:65-99 — restored for the capture; the
//   M6 capture had rewritten it in place) + the base_views.rb view
//   bodies. The per-view VALUES (link anchors, list_of_changes rows,
//   followed description, unfollow URL) are resolved on the TS side per
//   scenario: their derivation from act records is the act/render
//   streams' surface (the canvas pins those views); THIS pin is the
//   mailer machinery — template bytes, interpolation, envelope, From
//   rule, and the html document wrapper.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CaptureTransport } from "../../../src/card/notify/transport.js";
import { renderMail, type EmailTemplate } from "../../../src/card/notify/mail.js";
import type { FollowNotice, FollowNoticeAct } from "../../../src/card/notify/mail.js";
import {
  confirmAccountVerification,
  sendAccountVerificationToken,
  sendResetPasswordToken,
  type AccountFlowContext,
} from "../../../src/card/auth/account-verify-reset-flows.js";
import { SessionStore } from "../../../src/card/auth/session-store.js";
import {
  encodeAuthToken,
  type TokenRuntimeConfig,
} from "../../../src/card/auth/token.js";
import {
  createAuthTestStorage,
  insertAccountCard,
  type AuthTestStorage,
} from "../auth/auth-test-storage.js";
import { runAuthMigrations } from "../../../src/card/auth/index.js";

const ORACLE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../fixtures/captured/six-oracle-mails.json", import.meta.url),
    ),
    "utf8",
  ),
) as {
  scenarios: Record<
    string,
    {
      input: {
        template_fields: Record<string, string>;
        site_title?: string;
        act?: { actor: string; card: string; subcard?: string; verb: string };
        follow_rule?: { set_card: string; option: string };
      };
      delivered: Array<{
        to: string;
        from: string;
        subject: string;
        text_body: string;
        html_body: string | null;
      }>;
    }
  >;
};

/** The documented normalization: everything from `token=` to the next
 *  whitespace is the clock+secret-dependent JWT. */
function normToken(s: string): string {
  return s.replace(/token=[A-Za-z0-9\-_.]+/g, "token=NORM");
}

function expectEnvelopeMatches(
  actual: { to: string; from: string; subject: string; textBody: string; htmlBody?: string },
  expected: { to: string; from: string; subject: string; text_body: string; html_body: string | null },
): void {
  expect(actual.to).toBe(expected.to);
  expect(actual.from).toBe(expected.from);
  expect(actual.subject).toBe(expected.subject);
  expect(normToken(actual.textBody)).toBe(normToken(expected.text_body));
  if (expected.html_body === null) {
    expect(actual.htmlBody).toBeUndefined();
  } else {
    expect(normToken(actual.htmlBody ?? "")).toBe(normToken(expected.html_body));
  }
}

function firstCaptured(transport: CaptureTransport): {
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
} {
  const sent = transport.captured()[0];
  expect(sent).toBeDefined();
  return sent as {
    to: string;
    from: string;
    subject: string;
    textBody: string;
    htmlBody?: string;
  };
}

// --- account-mail fixture (the flows' in-memory storage) ---------------------

const IDS = {
  account: 9401,
  email: 9402,
  password: 9403,
  salt: 9404,
  status: 9405,
  title: 9406,
  decko_bot: 9407,
} as const;

const SITE_TITLE = "My Deck";
const T0 = 1_758_000_000;

function insertCodenameCard(
  storage: AuthTestStorage,
  id: number,
  codename: string,
  name: string,
  content: string | null = null,
): void {
  storage.exec(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES
       (${id}, '${name}', '${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}',
        '${codename}', NULL, NULL, NULL, '2026-10-03 11:00:00.000', '2026-10-03 11:00:00.000',
        1, 1, NULL, NULL, NULL, 0, 3, ${content === null ? "NULL" : `'${content}'`})`,
  );
}

function insertCompoundCard(
  storage: AuthTestStorage,
  id: number,
  name: string,
  leftId: number,
  rightId: number,
  content: string | null,
): void {
  storage.exec(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES
       (${id}, '${name}', NULL, NULL, ${leftId}, ${rightId}, NULL,
        '2026-10-03 11:00:00.000', '2026-10-03 11:00:00.000', 1, 1,
        NULL, NULL, NULL, 0, 1, ${content === null ? "NULL" : `'${content.replace(/'/g, "''")}'`})`,
  );
}

interface AccountMailFixture {
  storage: AuthTestStorage;
  ctx: AccountFlowContext;
  transport: CaptureTransport;
  token: TokenRuntimeConfig;
}

/** The oracle scenario's accounts: Jane Oracle Signup (verification +
 *  welcome) and Rose Oracle (reset), both active with the capture
 *  addresses, under the site title the capture app's *title carries. */
async function buildAccountFixture(): Promise<AccountMailFixture> {
  const storage = createAuthTestStorage();
  await runAuthMigrations(storage.driver);
  insertCodenameCard(storage, IDS.account, "account", "*account");
  insertCodenameCard(storage, IDS.email, "email", "*email");
  insertCodenameCard(storage, IDS.password, "password", "*password");
  insertCodenameCard(storage, IDS.salt, "salt", "*salt");
  insertCodenameCard(storage, IDS.status, "status", "*status");
  insertCodenameCard(storage, IDS.decko_bot, "decko_bot", "Decko Bot");
  insertCodenameCard(storage, IDS.title, "title", "*title", SITE_TITLE);

  const members = [
    { id: 9420, name: "Jane Oracle Signup", junction: 9421, email: "jane.oracle@example.com" },
    { id: 9430, name: "Rose Oracle", junction: 9431, email: "rose.oracle@example.com" },
  ] as const;
  let child = 9432;
  for (const m of members) {
    insertAccountCard(storage, { id: m.id, name: m.name });
    insertCompoundCard(storage, m.junction, `${m.name}+*account`, m.id, IDS.account, null);
    insertCompoundCard(storage, child++, `${m.name}+*account+*email`, m.junction, IDS.email, m.email);
    insertCompoundCard(storage, child++, `${m.name}+*account+*password`, m.junction, IDS.password, "x");
    insertCompoundCard(storage, child++, `${m.name}+*account+*salt`, m.junction, IDS.salt, "SALT");
    insertCompoundCard(storage, child++, `${m.name}+*account+*status`, m.junction, IDS.status, "active");
  }

  const transport = new CaptureTransport("six-mail-oracle");
  const token: TokenRuntimeConfig = { secret: "six-mail-oracle-secret", now: () => T0 };
  const ctx: AccountFlowContext = {
    driver: storage.driver,
    fetcher: new FetchEngine(storage.driver),
    sessions: new SessionStore({ driver: storage.driver }),
    transport,
    token,
    origin: "",
    siteTitle: SITE_TITLE,
    // safe_from_and_reply_to!'s name resolution: the "Decko Bot" from
    // FIELD reaches the envelope as the DeckoBot account's email
    // (email_config.rb:52-79 via email_field.rb:20-30).
    deckoBotEmail: "no-reply@decko.org",
  };
  return { storage, ctx, transport, token };
}

// --- the pins ----------------------------------------------------------------

describe("six-mail oracles (real Ruby ActionMailer bytes, test delivery)", () => {
  it("signup verification email", async () => {
    const { ctx, transport } = await buildAccountFixture();
    const outcome = await sendAccountVerificationToken(ctx, "Jane Oracle Signup+*account");
    if (!outcome.ok) throw new Error("outcome: " + JSON.stringify(outcome));
    const sent = firstCaptured(transport);
    expectEnvelopeMatches(sent, ORACLE.scenarios.signup_verification_email.delivered[0]);
  });

  it("password reset email", async () => {
    const { ctx, transport } = await buildAccountFixture();
    const outcome = await sendResetPasswordToken(ctx, "rose.oracle@example.com");
    expect(outcome.ok).toBe(true);
    const sent = firstCaptured(transport);
    expectEnvelopeMatches(sent, ORACLE.scenarios.password_reset_email.delivered[0]);
  });

  it("welcome email (via the verify_and_activate ladder)", async () => {
    const { ctx, transport, token } = await buildAccountFixture();
    // the valid token the verify link carries (user_id = the holder)
    const validToken = await encodeAuthToken(token, 9420);
    const outcome = await confirmAccountVerification(ctx, "Jane Oracle Signup+*account", validToken);
    expect(outcome.ok).toBe(true);
    const sent = transport.captured().find((m) => m.subject === "");
    expect(sent).toBeDefined();
    expectEnvelopeMatches(sent as { to: string; from: string; subject: string; textBody: string; htmlBody?: string }, ORACLE.scenarios.welcome_email.delivered[0]);
  });

  // --- the follow mails: the STOCK template through the TS mail renderer --

  const STOCK = ORACLE.scenarios.watcher_on_type_notify.input.template_fields;

  function stockTemplate(to: string): EmailTemplate {
    return {
      to,
      from: STOCK.from,
      subject: STOCK.subject,
      textBody: STOCK.text_message,
      htmlBody: STOCK.html_message,
    };
  }

  function followNotice(followedSet: string): FollowNotice {
    return { follower: "Sara", followedSet, followOption: "*always" };
  }

  function followAct(cardName: string, verb: "created" | "updated" | "deleted"): FollowNoticeAct {
    return { userName: "John", verb, cardName };
  }

  // The stock template's view placeholders, resolved per scenario (the
  // base_views.rb view bodies over the capture's acts; the render stream
  // owns the anchor/row bytes — the canvas pins those views).
  const BOT = "no-reply@decko.org";
  const JOHN_LINK =
    '<a class="known-card" href="/John"><span class="card-title" title="John">John</span></a>';
  const UNFOLLOW_HEAD = '/update/Sara+*follow?card%5Bsubcards%5D%5B';
  const ROW = "  new content: row8 update v2\n";
  const UNFOLLOW = (rule: string): string => `${UNFOLLOW_HEAD}${rule}%5D=%2Anever`;
  const liRow = (): string => "<li>  new content: row8 update v2</li>\n";

  it("watcher-on-type notify email (stock follower_notification_email)", () => {
    const rule = 'Basic%2B%2Atype%2BSara%2B%2Afollow';
    const sent = renderMail(
      stockTemplate("sara@example.com"),
      followNotice("Basic+*type"),
      followAct("Oracle Follow Card", "updated"),
      {
        botAccountEmail: BOT,
        wrapHtmlDocument: true,
        text: {
          "_|list_of_changes": ROW,
          "_|subedits": "",
          "_|url": "/Oracle_Follow_Card",
          "_|followed": 'all "Basics"',
          "_|unfollow_url": UNFOLLOW(rule),
        },
        html: {
          "_|link":
            '<a class="known-card" href="/Oracle_Follow_Card"><span class="card-title" title="Oracle Follow Card">Oracle Follow Card</span></a>',
          "_|url": "/Oracle_Follow_Card",
          "_|last_action_verb":
            '<a rel="nofollow" class="last-edited slotter" href="/Oracle_Follow_Card/history" data-remote="true">edited</a>',
          "_user|link": JOHN_LINK,
          "_|list_of_changes": liRow(),
          "_|subedits": "",
          "_|followed": 'all "Basics"',
          "_|unfollow_url": UNFOLLOW(rule),
        },
      },
    );
    expectEnvelopeMatches(sent, ORACLE.scenarios.watcher_on_type_notify.delivered[0]);
  });

  it("delete notify email (stash + notify_followers_after_delete)", () => {
    // the deleted card's list_of_changes is EMPTY (the delete action
    // carries no value rows) and its history anchor degrades to the bare
    // verb word (no history page) — both pinned by the oracle bytes.
    const rule = 'Basic%2B%2Atype%2BSara%2B%2Afollow';
    const sent = renderMail(
      stockTemplate("sara@example.com"),
      followNotice("Basic+*type"),
      followAct("Oracle Delete Card", "deleted"),
      {
        botAccountEmail: BOT,
        wrapHtmlDocument: true,
        text: {
          "_|list_of_changes": "",
          "_|subedits": "",
          "_|url": "/Oracle_Delete_Card",
          "_|followed": 'all "Basics"',
          "_|unfollow_url": UNFOLLOW(rule),
        },
        html: {
          "_|link":
            '<a class="known-card" href="/Oracle_Delete_Card"><span class="card-title" title="Oracle Delete Card">Oracle Delete Card</span></a>',
          "_|url": "/Oracle_Delete_Card",
          "_|last_action_verb": "deleted",
          "_user|link": JOHN_LINK,
          "_|list_of_changes": "",
          "_|subedits": "",
          "_|followed": 'all "Basics"',
          "_|unfollow_url": UNFOLLOW(rule),
        },
      },
    );
    expectEnvelopeMatches(sent, ORACLE.scenarios.delete_notify.delivered[0]);
  });

  it("includer/template notify email (one act, act-card context)", () => {
    const rule = 'Oracle+Recipe+Card%2Bingredient%2B%2Aself%2BSara%2B%2Afollow';
    const sent = renderMail(
      stockTemplate("sara@example.com"),
      followNotice("Oracle Recipe Card+ingredient+*self"),
      followAct("Oracle Recipe Card", "updated"),
      {
        botAccountEmail: BOT,
        wrapHtmlDocument: true,
        text: {
          "_|list_of_changes": ROW,
          "_|subedits": "",
          "_|url": "/Oracle_Recipe_Card",
          "_|followed": "Oracle Recipe Card+ingredient",
          "_|unfollow_url": UNFOLLOW(rule),
        },
        html: {
          "_|link":
            '<a class="known-card" href="/Oracle_Recipe_Card"><span class="card-title" title="Oracle Recipe Card">Oracle Recipe Card</span></a>',
          "_|url": "/Oracle_Recipe_Card",
          "_|last_action_verb":
            '<a rel="nofollow" class="last-edited slotter" href="/Oracle_Recipe_Card/history" data-remote="true">edited</a>',
          "_user|link": JOHN_LINK,
          "_|list_of_changes": liRow(),
          "_|subedits": "",
          "_|followed": "Oracle Recipe Card+ingredient",
          "_|unfollow_url": UNFOLLOW(rule),
        },
      },
    );
    expectEnvelopeMatches(sent, ORACLE.scenarios.includer_template_notify.delivered[0]);
  });
});
