// notify/smtp-transport.ts — real SMTP submission behind the NotifyTransport
// seam. Until this module is activated by DECKO_SMTP_PASS, delivery stays
// NOOP (transport.ts default) — nothing mails without an app password.
//
// PROVIDER: the operator mail provider (submission docs at the provider site):
// host smtp.mail-synthetic.example, port 587, STARTTLS, AUTH PLAIN or LOGIN,
// password = an SMTP token (app password) generated at Settings → IMAP/SMTP
// → SMTP tokens — NOT the mailbox password; the From address must respect
// the token address's domain (SPF/DKIM/DMARC). Implicit TLS (Ruby
// :tls/:ssl, port 465) is deliberately NOT implemented — submission on this port
// is 587 STARTTLS; add it if a future provider needs it.
//
// RUBY PARITY — this is the port of Mail::SMTP (mail-2.9.1
// lib/mail/network/delivery_methods/smtp.rb) wired where card-1.110.0
// lib/card/mailer.rb:11-15 does `mail.delivery_method(method, smtp_settings)`:
//
//   Ruby Mail::SMTP setting      -> SmtpTransportOptions
//   :address                     -> host        (DEFAULTS 'localhost')
//   :port                        -> port        (DEFAULTS 25)
//   :domain                      -> heloDomain  (DEFAULTS 'localhost.localdomain')
//   :user_name                   -> user
//   :password                    -> pass
//   :authentication              -> auth        ('plain' | 'login')
//   :enable_starttls             -> starttls    (:always | :auto | false)
//   :open_timeout                -> openTimeoutMs (Ruby 5 s)
//   :read_timeout                -> readTimeoutMs (Ruby 5 s)
//
// Ruby's fallback when no STARTTLS flag is set is `enable_starttls :auto`
// (smtp.rb #smtp_starttls) — mirrored in DEFAULT_STARTTLS. TLS + STARTTLS
// are mutually exclusive in Ruby; here implicit TLS does not exist, so the
// exclusion cannot arise.
//
// Envelope semantics (mail-2.9.1 lib/mail/smtp_envelope.rb + message.rb:1074-1106):
//   envelope-from = return_path || sender || from_addrs.first  -> the address
//     parsed out of the resolved From header;
//   envelope-to   = destinations = To + Cc + Bcc addresses — the Bcc HEADER
//     never reaches the DATA payload, but Bcc recipients DO get RCPT TO.
//   Address validation: non-blank, no CR/LF, <= 2000 bytes
//     (SmtpEnvelope::MAX_ADDRESS_BYTESIZE, validate_addr).
//
// From-default semantics (card-mod-email-0.20.0
// set/type/email_template/email_config.rb:61-77 safe_from_and_reply_to!):
//   actual_email = config default (Card::Mailer.default[:from]) || template's
//   own address; when the template carries display text that differs from the
//   actual address, the header becomes `"#{conf_text}" <#{actual_email}>`.
//   Live templates say from "Decko Bot" (not deliverable), so the config
//   From (DECKO_SMTP_FROM, default no-reply@example.com) is what makes
//   them deliverable, with "Decko Bot" preserved as the display name.
//
// MIME layer: minimal RFC 5322/2045 renderer — Date/From/To/Cc/Message-ID/
// Subject/MIME-Version/Content-Type/CTE in Ruby's wire order, bodies
// quoted-printable (RFC 2045; what mail-2.9.1 picks for prose), text+html as
// multipart/alternative. buildMime() is the single swap point for a future
// byte-parity wire-envelope renderer.
//
// ENV CONTRACT — how credentials reach this module: process env only; no
// credentials live in this repo.
//
//   DECKO_SMTP_HOST=smtp.mail-synthetic.example        # default; only override for tests
//   DECKO_SMTP_PORT=587                       # default
//   DECKO_SMTP_USER=<mailbox address the SMTP token belongs to>
//   DECKO_SMTP_PASS=<SMTP token>              # activation gate: unset = NOOP
//   DECKO_SMTP_FROM=no-reply@example.com # default
//
// The transport connects lazily per sendMail(); failures surface as errors
// (4xx SmtpTransientError / 5xx SmtpPermanentError) that the dispatcher logs
// per-hook without aborting the save — the Ruby Net::SMTPError rescue shape
// (card-mod-email set/type/email_template.rb:3-7).

import * as net from "node:net";
import * as tls from "node:tls";
import type { MailMessage, NotifyTransport } from "./types.js";
import { NoopTransport } from "./transport.js";

/** Submission config. Mirrors Mail::SMTP's settings (see file header). */
export interface SmtpTransportOptions {
  /** Ruby :address. Default "smtp.mail-synthetic.example" (verified 2026-09-29). */
  readonly host?: string;
  /** Ruby :port. Default 587 (submission on this port; only port this provider supports). */
  readonly port?: number;
  /** Ruby :domain — the EHLO argument. Default "localhost.localdomain" (Ruby DEFAULTS). */
  readonly heloDomain?: string;
  /** Ruby :user_name. The the provider address the SMTP token belongs to. */
  readonly user?: string;
  /** Ruby :password. The SMTP token (app password). NEVER logged, never
   *  committed — it reaches this code only through the environment. */
  readonly pass?: string;
  /** Ruby :authentication. Default "plain" (this provider supports PLAIN + LOGIN). */
  readonly auth?: "plain" | "login";
  /** Ruby :enable_starttls. Default "auto" (Ruby's fallback); "always" throws
   *  when the server does not advertise STARTTLS rather than send plaintext. */
  readonly starttls?: "always" | "auto" | false;
  /** Default From address (DECKO_SMTP_FROM). Default "no-reply@example.com".
   *  Overridable per environment; wins over a template's own address per
   *  safe_from_and_reply_to! semantics. */
  readonly from?: string;
  /** Ruby :open_timeout (seconds there, ms here). Default 5000. */
  readonly openTimeoutMs?: number;
  /** Ruby :read_timeout. Default 5000. */
  readonly readTimeoutMs?: number;
}

const DEFAULT_HOST = "smtp.mail-synthetic.example";
const DEFAULT_PORT = 587;
const DEFAULT_HELO = "localhost.localdomain";
const DEFAULT_FROM = "no-reply@deck.example";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_STARTTLS: "always" | "auto" | false = "auto";

/** Mail::SMTP::DEFAULTS parity record (mail-2.9.1 smtp.rb) — kept for the
 *  parity ledger; the option defaults above resolve against these. */
export const RUBY_SMTP_DEFAULTS = {
  address: "localhost",
  port: 25,
  domain: "localhost.localdomain",
  authentication: null,
  enableStarttlsFallback: "auto",
  openTimeoutSec: 5,
  readTimeoutSec: 5,
} as const;

const MAX_ADDRESS_BYTESIZE = 2000; // SmtpEnvelope::MAX_ADDRESS_BYTESIZE

// ---------------------------------------------------------------------------
// Errors. The dispatcher's per-hook catch prints these; the class split
// mirrors Net::SMTP's ServerBusy (4xx) / FatalError (5xx) / UnknownError.
// ---------------------------------------------------------------------------

export class SmtpTransientError extends Error {
  constructor(readonly code: number, readonly replyText: string) {
    super(`SMTP transient error ${code}: ${replyText}`);
    this.name = "SmtpTransientError";
  }
}
export class SmtpPermanentError extends Error {
  constructor(readonly code: number, readonly replyText: string) {
    super(`SMTP permanent error ${code}: ${replyText}`);
    this.name = "SmtpPermanentError";
  }
}
export class SmtpProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpProtocolError";
  }
}

// ---------------------------------------------------------------------------
// Address handling (SmtpEnvelope validate_addr + safe_from_and_reply_to!).
// ---------------------------------------------------------------------------

interface ParsedAddress {
  /** Display text before <>, or null for a bare address. */
  readonly name: string | null;
  /** The addr-spec. NOTE: for a display-less input this is the whole trimmed
   *  string — Ruby's configured_from_name_and_email does the same ([nil, raw]). */
  readonly email: string;
}

function splitAddress(raw: string): ParsedAddress {
  const m = /(.*)<(.*)>/.exec(raw);
  if (m) return { name: m[1]!.trim() || null, email: m[2]!.trim() };
  return { name: null, email: raw.trim() };
}

/** SmtpEnvelope#validate_addr parity: blank / CR-LF / >2000 bytes all raise. */
function validateAddress(kind: "From" | "To", addr: string): string {
  if (addr.length === 0) {
    throw new Error(`SMTP ${kind} address may not be blank`);
  }
  if (/[\r\n]/.test(addr)) {
    throw new Error(`SMTP ${kind} address may not contain CR or LF line breaks`);
  }
  if (Buffer.byteLength(addr, "utf-8") > MAX_ADDRESS_BYTESIZE) {
    throw new Error(`SMTP ${kind} address may not exceed ${MAX_ADDRESS_BYTESIZE} bytes`);
  }
  return addr;
}

function addressSpec(raw: string): string {
  return validateAddress("From", splitAddress(raw).email);
}

/** "a@b, c@d <x@y>" -> ["a@b", "x@y"] — the envelope's RCPT TO list entries. */
function addressList(raw: string): string[] {
  return raw
    .split(",")
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
    .map((piece) => validateAddress("To", splitAddress(piece).email));
}

/** card-mod-email email_config.rb:61-77 (safe_from_and_reply_to!) port:
 *  the config default wins as the actual address; the template's display
 *  text (or its whole raw value when display-less) is preserved as
 *  `"text" <actual>` when it differs. */
export function resolveFromHeader(
  templateFrom: string | undefined,
  defaultFrom: string | undefined,
): string {
  const conf = templateFrom !== undefined && templateFrom.trim().length > 0
    ? splitAddress(templateFrom)
    : null;
  const actual = defaultFrom !== undefined && defaultFrom.trim().length > 0
    ? addressSpec(defaultFrom)
    : (conf?.email ?? "");
  if (actual.length === 0) {
    throw new Error(
      "SMTP From address may not be blank: set DECKO_SMTP_FROM (or message.from)",
    );
  }
  const confText = conf?.name ?? conf?.email ?? null;
  if (confText !== null && confText !== actual) {
    return `"${confText}" <${actual}>`;
  }
  return actual;
}

// ---------------------------------------------------------------------------
// MIME: quoted-printable (RFC 2045), encoded-word subjects (RFC 2047),
// multipart/alternative for text+html.
// ---------------------------------------------------------------------------

/** QP-encode one body to CRLF lines of at most 76 chars (soft break "=CRLF"),
 *  trailing space/tab force-encoded per RFC 2045 6.7. Operates on UTF-8
 *  bytes (TextEncoder) so surrogate pairs encode correctly. */
export function qpEncode(text: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  const outLines: string[] = [];
  for (const line of lines) {
    const bytes = new TextEncoder().encode(line);
    let current = "";
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      const isLast = i === bytes.length - 1;
      let tok: string;
      if (b === 0x3d) tok = "=3D";
      else if (b === 0x20) tok = isLast ? "=20" : " ";
      else if (b === 0x09) tok = isLast ? "=09" : "\t";
      else if (b >= 0x21 && b <= 0x7e) tok = String.fromCharCode(b);
      else tok = "=" + b.toString(16).toUpperCase().padStart(2, "0");
      if (current.length + tok.length > 75) {
        outLines.push(current + "=");
        current = "";
      }
      current += tok;
    }
    outLines.push(current);
  }
  return outLines.join("\r\n");
}

/** RFC 2047 Q encoded-word(s), folded when the word would exceed 75 chars. */
export function qEncodeWord(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const words: string[] = [];
  let payload = "";
  const pushWord = () => {
    words.push(`=?utf-8?q?${payload}?=`);
    payload = "";
  };
  for (const b of bytes) {
    let tok: string;
    if (b === 0x20) tok = "_";
    else if (b === 0x3d || b === 0x3f || b === 0x5f) {
      tok = "=" + b.toString(16).toUpperCase().padStart(2, "0");
    } else if (b >= 0x21 && b <= 0x7e) tok = String.fromCharCode(b);
    else tok = "=" + b.toString(16).toUpperCase().padStart(2, "0");
    // 10 = len("=?utf-8?q?"), 2 = len("?=")
    if (payload.length + tok.length > 63) pushWord();
    payload += tok;
  }
  pushWord();
  return words.join("\r\n ");
}

function subjectHeader(subject: string): string {
  // Pure printable-ASCII subjects go on the wire raw (what mail-2.9.1 does);
  // anything else becomes one or more RFC 2047 Q encoded-words.
  if (/^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/.test(subject) && subject.length <= 78) {
    return subject;
  }
  return qEncodeWord(subject);
}

function messageIdHeader(envelopeFrom: string): string {
  const domain = envelopeFrom.includes("@") ? envelopeFrom.slice(envelopeFrom.indexOf("@") + 1) : "localhost";
  const rand = Math.random().toString(16).slice(2, 10);
  const stamp = Date.now().toString(36);
  return `<${stamp}.${rand}@${domain}>`;
}

function rfc5322Date(now: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${days[now.getUTCDay()]}, ${p(now.getUTCDate())} ${months[now.getUTCMonth()]} ` +
    `${now.getUTCFullYear()} ${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())} +0000`
  );
}

/** Render the DATA payload (headers + body, CRLF). The Bcc header is
 *  deliberately never written (envelope parity: Bcc recipients ride RCPT TO). */
export function buildMime(msg: MailMessage, fromHeader: string, now: Date = new Date()): string {
  const envelopeFrom = addressSpec(fromHeader);
  const headers: string[] = [
    `Date: ${rfc5322Date(now)}`,
    `From: ${fromHeader}`,
    ...(msg.replyTo ? [`Reply-To: ${msg.replyTo}`] : []),
    `To: ${msg.to}`,
    ...(msg.cc ? [`Cc: ${msg.cc}`] : []),
    `Message-ID: ${messageIdHeader(envelopeFrom)}`,
    `Subject: ${subjectHeader(msg.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (msg.htmlBody === undefined) {
    headers.push("Content-Type: text/plain; charset=utf-8");
    headers.push("Content-Transfer-Encoding: quoted-printable");
    return `${headers.join("\r\n")}\r\n\r\n${qpEncode(msg.textBody)}\r\n`;
  }

  const boundary = `deckomail-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  headers.push("Content-Transfer-Encoding: 7bit");
  const part = (type: string, body: string) =>
    `--${boundary}\r\nContent-Type: ${type}; charset=utf-8\r\n` +
    `Content-Transfer-Encoding: quoted-printable\r\n\r\n${qpEncode(body)}\r\n`;
  return (
    `${headers.join("\r\n")}\r\n\r\n` +
    `This is a multi-part message in MIME format.\r\n` +
    part("text/plain", msg.textBody) +
    part("text/html", msg.htmlBody) +
    `--${boundary}--\r\n`
  );
}

// ---------------------------------------------------------------------------
// The transport.
// ---------------------------------------------------------------------------

interface SmtpReply {
  readonly code: number;
  readonly lines: readonly string[];
}

function isTransient(code: number): boolean {
  return code >= 400 && code < 500;
}

export class SmtpTransport implements NotifyTransport {
  readonly name = "smtp";
  private readonly host: string;
  private readonly port: number;
  private readonly heloDomain: string;
  private readonly user: string | undefined;
  private readonly pass: string | undefined;
  private readonly auth: "plain" | "login";
  private readonly starttls: "always" | "auto" | false;
  private readonly from: string | undefined;
  private readonly openTimeoutMs: number;
  private readonly readTimeoutMs: number;

  constructor(opts: SmtpTransportOptions = {}) {
    this.host = opts.host ?? DEFAULT_HOST;
    this.port = opts.port ?? DEFAULT_PORT;
    this.heloDomain = opts.heloDomain ?? DEFAULT_HELO;
    this.user = opts.user;
    this.pass = opts.pass;
    this.auth = opts.auth ?? "plain";
    this.starttls = opts.starttls ?? DEFAULT_STARTTLS;
    this.from = opts.from ?? DEFAULT_FROM;
    this.openTimeoutMs = opts.openTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.readTimeoutMs = opts.readTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Redacted one-line description for diagnostics. The app password can
   *  never appear here — it is not carried by any field this method reads. */
  describe(): string {
    return (
      `smtp host=${this.host} port=${this.port} user=${this.user ?? "-"}` +
      ` auth=${this.auth} starttls=${String(this.starttls)} from=${this.from ?? "-"}`
    );
  }

  async sendMail(msg: MailMessage): Promise<void> {
    const fromHeader = resolveFromHeader(msg.from, this.from);
    const envelopeFrom = addressSpec(fromHeader);
    const envelopeTo = [
      ...addressList(msg.to),
      ...(msg.cc ? addressList(msg.cc) : []),
      ...(msg.bcc ? addressList(msg.bcc) : []),
    ];
    const mime = buildMime(msg, fromHeader);
    await this.deliver(envelopeFrom, envelopeTo, mime);
  }

  /** The RFC 5321 conversation. Ruby shape: Net::SMTP#sendmail(message,
   *  from_addr, to_addrs) after starttls/auth (smtp_connection.rb:51-55). */
  private async deliver(envelopeFrom: string, envelopeTo: string[], mime: string): Promise<void> {
    const socket = await this.connect();
    try {
      const readReply = this.makeReplyReader(socket);
      const command = this.makeCommandRunner(socket, readReply);

      await readReply(); // 220 greeting
      let caps = this.makeCapabilities(await command(`EHLO ${this.heloDomain}`, [250]));

      // STARTTLS (RFC 3207). "auto": upgrade when advertised; "always":
      // refuse to continue plaintext; false: skip.
      if (this.starttls !== false) {
        if (caps.has("STARTTLS")) {
          await command("STARTTLS", [220]);
          const tlsSocket = await this.upgradeTls(socket);
          // continue the conversation over TLS — fresh EHLO per RFC 3207,
          // then auth + envelope over the encrypted channel
          const tlsRead = this.makeReplyReader(tlsSocket);
          const tlsCommand = this.makeCommandRunner(tlsSocket, tlsRead);
          caps = this.makeCapabilities(await tlsCommand(`EHLO ${this.heloDomain}`, [250]));
          await this.authenticate(tlsCommand);
          await this.envelopeAndData(tlsCommand, envelopeFrom, envelopeTo, mime);
          await tlsCommand("QUIT", [221]);
          tlsSocket.end();
          return;
        }
        if (this.starttls === "always") {
          socket.destroy();
          throw new SmtpProtocolError(
            `starttls=always but ${this.host}:${this.port} does not advertise STARTTLS — refusing plaintext`,
          );
        }
      }

      await this.authenticate(command);
      await this.envelopeAndData(command, envelopeFrom, envelopeTo, mime);
      await command("QUIT", [221]);
      socket.end();
    } catch (err) {
      socket.destroy();
      throw err;
    }
  }

  private async connect(): Promise<net.Socket> {
    return await new Promise<net.Socket>((resolve, reject) => {
      const socket = net.connect({ host: this.host, port: this.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new SmtpProtocolError(`connect timeout after ${this.openTimeoutMs}ms to ${this.host}:${this.port}`));
      }, this.openTimeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        socket.setTimeout(this.readTimeoutMs, () => {
          socket.destroy(new SmtpProtocolError(`read timeout after ${this.readTimeoutMs}ms on ${this.host}:${this.port}`));
        });
        resolve(socket);
      });
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(new SmtpProtocolError(`connection to ${this.host}:${this.port} failed: ${err.message}`));
      });
    });
  }

  private async upgradeTls(plain: net.Socket): Promise<tls.TLSSocket> {
    return await new Promise<tls.TLSSocket>((resolve, reject) => {
      const secure = tls.connect({
        socket: plain,
        servername: this.host,
        rejectUnauthorized: true,
      });
      const timer = setTimeout(() => {
        secure.destroy();
        reject(new SmtpProtocolError(`TLS upgrade timeout with ${this.host}`));
      }, this.openTimeoutMs);
      secure.once("secureConnect", () => {
        clearTimeout(timer);
        secure.setTimeout(this.readTimeoutMs, () => {
          secure.destroy(new SmtpProtocolError(`read timeout after TLS on ${this.host}`));
        });
        resolve(secure);
      });
      secure.once("error", (err) => {
        clearTimeout(timer);
        reject(new SmtpProtocolError(`TLS upgrade with ${this.host} failed: ${err.message}`));
      });
    });
  }

  private makeReplyReader(socket: net.Socket): () => Promise<SmtpReply> {
    let buffer = "";
    let waiter: { resolve: (r: SmtpReply) => void; reject: (e: Error) => void } | null = null;
    const settle = () => {
      if (waiter === null) return;
      const idx = buffer.indexOf("\r\n");
      if (idx === -1) return;
      const lines: string[] = [];
      let code = 0;
      for (;;) {
        const nl = buffer.indexOf("\r\n");
        if (nl === -1) return; // need more bytes
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        lines.push(line);
        const m = /^(\d{3})([ -])(.*)$/.exec(line);
        if (m === null) {
          const w = waiter; waiter = null;
          w.reject(new SmtpProtocolError(`unparseable SMTP reply line: ${JSON.stringify(line)}`));
          return;
        }
        code = Number(m[1]);
        if (m[2] === " ") break; // final line of the reply
      }
      const w = waiter; waiter = null;
      w.resolve({ code, lines });
    };
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      settle();
    });
    socket.on("error", (err) => {
      if (waiter) { const w = waiter; waiter = null; w.reject(err); }
    });
    socket.on("close", () => {
      if (waiter) { const w = waiter; waiter = null; w.reject(new SmtpProtocolError("connection closed by peer mid-reply")); }
    });
    return () => new Promise<SmtpReply>((resolve, reject) => {
      waiter = { resolve, reject };
      settle();
    });
  }

  private makeCommandRunner(
    socket: net.Socket,
    readReply: () => Promise<SmtpReply>,
  ): (cmd: string, expect: number[]) => Promise<SmtpReply> {
    return async (cmd, expect) => {
      socket.write(cmd + "\r\n");
      const reply = await readReply();
      if (!expect.includes(reply.code)) {
        if (isTransient(reply.code)) throw new SmtpTransientError(reply.code, reply.lines.join(" | "));
        if (reply.code >= 500 && reply.code < 600) throw new SmtpPermanentError(reply.code, reply.lines.join(" | "));
        throw new SmtpProtocolError(
          `unexpected reply ${reply.code} to ${cmd.split(" ")[0]} (wanted ${expect.join("/")}): ${reply.lines.join(" | ")}`,
        );
      }
      return reply;
    };
  }

  private makeCapabilities(reply: SmtpReply): Set<string> {
    const caps = new Set<string>();
    for (const line of reply.lines.slice(1)) caps.add(line.split(" ")[0]!.toUpperCase());
    return caps;
  }

  private async authenticate(
    command: (cmd: string, expect: number[]) => Promise<SmtpReply>,
  ): Promise<void> {
    if (!this.user || !this.pass) return; // Ruby: authentication nil -> no AUTH
    if (this.auth === "plain") {
      // RFC 4616 initial response: base64("\0user\0pass")
      const initial = Buffer.from(`\u0000${this.user}\u0000${this.pass}`, "utf-8").toString("base64");
      await command(`AUTH PLAIN ${initial}`, [235]);
      return;
    }
    await command("AUTH LOGIN", [334]);
    await command(Buffer.from(this.user, "utf-8").toString("base64"), [334]);
    await command(Buffer.from(this.pass, "utf-8").toString("base64"), [235]);
  }

  private async envelopeAndData(
    command: (cmd: string, expect: number[]) => Promise<SmtpReply>,
    envelopeFrom: string,
    envelopeTo: string[],
    mime: string,
  ): Promise<void> {
    await command(`MAIL FROM:<${envelopeFrom}>`, [250]);
    for (const rcpt of envelopeTo) {
      await command(`RCPT TO:<${rcpt}>`, [250, 251, 252]);
    }
    await command("DATA", [354]);
    // RFC 5321 4.5.2 dot-stuffing, then terminate with CRLF.CRLF.
    const stuffed = mime
      .split("\r\n")
      .map((line) => (line.startsWith(".") ? `.${line}` : line))
      .join("\r\n");
    await command(`${stuffed}\r\n.`, [250]);
  }
}

// ---------------------------------------------------------------------------
// Env wiring. The activation gate: no DECKO_SMTP_PASS -> NoopTransport.
// ---------------------------------------------------------------------------

/** Build SmtpTransportOptions from a process-like env map. Secrets enter
 *  here and never leave (describe() redacts; nothing else reads config). */
export function smtpOptionsFromEnv(env: NodeJS.ProcessEnv): SmtpTransportOptions {
  return {
    host: env.DECKO_SMTP_HOST,
    port: env.DECKO_SMTP_PORT !== undefined ? Number(env.DECKO_SMTP_PORT) : undefined,
    user: env.DECKO_SMTP_USER,
    pass: env.DECKO_SMTP_PASS,
    from: env.DECKO_SMTP_FROM,
  };
}

/** The transport factory the app wires at boot. DECKO_SMTP_PASS unset or
 *  empty -> NoopTransport (nothing mails — Ruby's shipped
 *  perform_deliveries=false default). PASS without USER is a loud
 *  misconfiguration, not a silent NOOP: the process would otherwise believe
 *  password-reset mail is flowing when it never leaves the queue. */
export function transportFromEnv(env: NodeJS.ProcessEnv = process.env): NotifyTransport {
  const pass = env.DECKO_SMTP_PASS;
  if (pass === undefined || pass.length === 0) return new NoopTransport();
  if (env.DECKO_SMTP_USER === undefined || env.DECKO_SMTP_USER.length === 0) {
    throw new Error(
      "DECKO_SMTP_PASS is set but DECKO_SMTP_USER is missing — refusing to start with half-configured mail (set DECKO_SMTP_USER to the token's mailbox address)",
    );
  }
  const opts = smtpOptionsFromEnv(env);
  return new SmtpTransport(opts);
}
