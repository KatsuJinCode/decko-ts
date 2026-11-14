// deploy/bunny-worker-src/bunny-edge-local-mail.ts — the LOCAL capture
// delivery for the account and follower mail the edge sends.
//
// WHY THIS EXISTS. The engine already renders both kinds of member mail: the
// password-reset email (src/card/auth/account-verify-reset-flows.ts, the
// send_reset_password_token trigger; Ruby signin.rb:78-84 +
// account.rb:37-44) and the follower change notice
// (src/card/notify/follow-notify.ts; Ruby notify.rb:49-58 +
// right/account.rb send_change_notice). Both go through ONE seam, the
// NotifyTransport (src/card/notify/types.ts). The hosts compose that seat
// explicitly: the handler takes `services.accountMail`
// (bunny-edge-engine-handler.ts), the write surface turns it into the flow
// context AND the save-path notify transport (cloudflare-write-routes.ts).
// The deployed entry passed no services, so on the edge the seat was absent:
// the reset trigger answered "account mail is not configured" and no follower
// mail could be delivered at all.
//
// PRODUCTION IS UNCHANGED. This module composes nothing unless
// DECKO_LOCAL_MAIL is exactly "1". The deployed script never defines that
// variable. Unset, localMailServices returns {} and the entry behaves exactly
// as before. The SMTP transport is not built here either (smtp-transport.ts
// returns NoopTransport without DECKO_SMTP_PASS).
//
// WHAT IT MIRRORS. Ruby's browser and cucumber environments never send real
// mail: delivery_method = :test (card/config/environments/test.rb:39-44,
// cucumber.rb:36). The :test method appends every delivered message to one
// array, Mail::TestMailer.deliveries (mail 2.9.0
// lib/mail/network/delivery_methods/test_mailer.rb: `deliver!` does
// `Mail::TestMailer.deliveries << mail`), which ActionMailer::Base.deliveries
// aliases. Specs read that array in delivery order, e.g.
// mod/account/spec/set/right/account_spec.rb reads `Mail::TestMailer.deliveries
// .last` and then `parts[0].body.raw_source`. This module keeps the same
// ordered record of the FULL message. Each record is also handed, in order, to
// the global hook `__deckoLocalMailSink` when a host has installed one. The
// signed-in exercise (in-process with this bundle) uses that hook to write
// every message under the run's evidence folder. No file I/O happens in the
// bundle.
//
// Both mail kinds use this one transport, as in Ruby: the reset email and the
// follow notice are each an EmailTemplate#deliver (email_template.rb), which
// ends in the same Mail::Message delivery.

import { CaptureTransport } from "../../src/card/notify/transport.js";
import type { MailMessage, NotifyTransport } from "../../src/card/notify/types.js";
import type { WorkersWriteContext } from "../../src/server/cloudflare-write-routes.js";

/** The seat the handler accepts (cloudflare-write-routes.ts WorkersWriteContext). */
export type LocalMailServices = { accountMail?: WorkersWriteContext["accountMail"] };

/** One delivered message in the form a host records and writes to disk. */
export interface LocalMailRecord {
  /** 1-based delivery order, as Mail::TestMailer.deliveries is ordered. */
  readonly seq: number;
  readonly capturedAt: string;
  readonly to: string;
  readonly from: string | undefined;
  readonly replyTo: string | undefined;
  readonly cc: string | undefined;
  readonly bcc: string | undefined;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string | undefined;
}

/** The required host-installed sink. The bundle calls it once per delivered
 *  message, synchronously in delivery order, scoped to that host's run. */
export type LocalMailSink = (record: LocalMailRecord) => void;

declare global {
  // eslint-disable-next-line no-var
  var __deckoLocalMailSink: LocalMailSink | undefined;
}

/** The capture delivery: the engine's CaptureTransport (the seam's own
 *  contract) plus the serialisable record handed to the sink. */
class LocalMailTransport implements NotifyTransport {
  readonly name = "edge-local-mail";
  private readonly inner = new CaptureTransport("edge-local-mail");
  private seq = 0;
  constructor(private readonly sink: LocalMailSink) {}

  async sendMail(msg: MailMessage): Promise<void> {
    await this.inner.sendMail(msg);
    this.seq += 1;
    this.sink({
      seq: this.seq,
      capturedAt: new Date().toISOString(),
      to: msg.to,
      from: msg.from,
      replyTo: msg.replyTo,
      cc: msg.cc,
      bcc: msg.bcc,
      subject: msg.subject,
      textBody: msg.textBody,
      htmlBody: msg.htmlBody,
    });
  }
}

const transports = new WeakMap<LocalMailSink, LocalMailTransport>();

/**
 * The services for handleBunnyEngineRequest, or {} when the local capture is
 * not armed.
 *
 * Armed means DECKO_LOCAL_MAIL=1 with the three values the seat needs to build
 * real links and subjects: the token HMAC secret (token.ts TokenRuntimeConfig,
 * the same key the link is later verified under, Ruby token.rb:7), the origin
 * card_url prefixes (location.rb:19-24), and the site title the
 * {{:title|core}} template renders (the *title card's content). If one is
 * missing the call throws instead of quietly sending nothing. The actual
 * request must share the configured loopback origin and a host sink must be
 * installed; a public request cannot arm this testing transport.
 */
export function localMailServices(env: Record<string, string | undefined>, requestUrl?: string): LocalMailServices {
  if (env.DECKO_LOCAL_MAIL !== "1") return {};
  const secret = env.DECKO_LOCAL_TOKEN_SECRET;
  const origin = env.DECKO_LOCAL_ORIGIN;
  const siteTitle = env.DECKO_LOCAL_SITE_TITLE;
  if (!secret || !origin || !siteTitle) {
    throw new Error(
      "local mail capture is armed but incomplete: DECKO_LOCAL_TOKEN_SECRET, DECKO_LOCAL_ORIGIN and DECKO_LOCAL_SITE_TITLE must all be non-empty",
    );
  }
  let configured: URL;
  let requested: URL;
  try {
    configured = new URL(origin);
    requested = new URL(requestUrl ?? "");
  } catch {
    throw new Error("local mail capture requires a valid loopback request and origin");
  }
  if (!['http:', 'https:'].includes(configured.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(configured.hostname) ||
      configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash ||
      requested.origin !== configured.origin) {
    throw new Error("local mail capture requires the same loopback request and origin");
  }
  const sink = globalThis.__deckoLocalMailSink;
  if (typeof sink !== 'function') throw new Error("local mail capture requires an installed host sink");
  let transport = transports.get(sink);
  if (transport === undefined) {
    transport = new LocalMailTransport(sink);
    transports.set(sink, transport);
  }
  return { accountMail: { transport, token: { secret }, origin, siteTitle } };
}
