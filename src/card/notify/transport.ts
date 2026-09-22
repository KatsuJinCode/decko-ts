// notify/transport.ts — the transport seam.
//
// Three implementations:
//   - NoopTransport  — drops every message. Default (nothing mails by
//                     default per the module's "no surprises" contract).
//   - CaptureTransport — records every message into an array, for tests.
//                     The `drain()` method returns and clears.
//   - LoggingTransport — extends CaptureTransport with a `console.log`
//                     side effect, for local debugging.
//
// Why an interface (not a function reference)? The transport often needs
// to know its OWN name for capture diagnostics, and a future
// PostmarkTransport / SmtpTransport will carry config. Captures need to
// assert against the transport's *identity*, not just its behavior
// (different transports can produce different envelopes — DeliveryMethod
// in Ruby, see lib/card/mailer.rb:11-15).

import type { MailMessage, NotifyTransport } from "./types.js";

export class NoopTransport implements NotifyTransport {
  readonly name = "noop";
  async sendMail(_msg: MailMessage): Promise<void> {
    // Intentionally empty. Callers MUST NOT assume a default transport
    // does anything; this is the "module loads, nothing happens" default.
  }
}

export interface CapturedMail extends MailMessage {
  /** Sequence number (1-based) for ordering. */
  readonly seq: number;
  /** Wall-clock time stamp the transport recorded. */
  readonly capturedAt: number;
}

export class CaptureTransport implements NotifyTransport {
  readonly name: string;
  private readonly _captured: CapturedMail[] = [];
  private _seq = 0;
  constructor(name: string = "capture") {
    this.name = name;
  }

  async sendMail(msg: MailMessage): Promise<void> {
    this._seq += 1;
    this._captured.push({
      ...msg,
      seq: this._seq,
      capturedAt: Date.now(),
    });
  }

  /** All captured messages, in send order. Snapshot — does not clear. */
  captured(): readonly CapturedMail[] {
    return this._captured.slice();
  }

  /** Return and clear. Tests call this between scenarios so each scenario
   *  sees only its own messages. */
  drain(): CapturedMail[] {
    const out = this._captured.slice();
    this._captured.length = 0;
    this._seq = 0;
    return out;
  }

  /** Most recent captured message, or undefined if none. Convenience for
   *  tests that fire one notification per scenario. */
  last(): CapturedMail | undefined {
    return this._captured[this._captured.length - 1];
  }

  /** Count of captured messages (snapshot). */
  count(): number {
    return this._captured.length;
  }
}

export class LoggingTransport implements NotifyTransport {
  readonly name: string;
  private readonly inner: NotifyTransport;
  constructor(inner: NotifyTransport, private readonly log: (line: string) => void = console.log) {
    this.inner = inner;
    this.name = `${inner.name}+log`;
  }

  async sendMail(msg: MailMessage): Promise<void> {
    this.log(`[notify] -> to=${msg.to} subject=${JSON.stringify(msg.subject)} text=${msg.textBody.length}B${msg.htmlBody ? ` html=${msg.htmlBody.length}B` : ""}`);
    await this.inner.sendMail(msg);
  }
}

/** Default transport the module exports. Anything that imports the
 *  notify module without wiring its own transport gets a no-op. This
 *  matches Ruby's default `config.action_mailer.perform_deliveries = false`
 *  (tools/oracle/decko-oracle-app/config/application.rb:21-25 — the
 *  oracle app boots with mail OFF). */
export const defaultTransport: NotifyTransport = new NoopTransport();
