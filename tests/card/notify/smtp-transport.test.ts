// tests/card/notify/smtp-transport.test.ts — the Proton SMTP transport.
//
// What this test proves (NO real email is sent — the SMTP peer is an
// in-process mock server on 127.0.0.1):
//   - transportFromEnv() wires DECKO_SMTP_* into the transport and stays
//     NOOP when DECKO_SMTP_PASS is unset (the activation gate).
//   - SmtpTransport speaks RFC 5321 submission against the mock: EHLO,
//     AUTH PLAIN, MAIL FROM / RCPT TO / DATA with the Ruby-parity envelope
//     (envelope-from = the resolved From address; envelope-to = To+Cc+Bcc
//     while the Bcc HEADER never reaches DATA — mail-2.9.1 SmtpEnvelope).
//   - From-default semantics port card-mod-email email_config.rb:61-77
//     (safe_from_and_reply_to!): config From wins as the actual address,
//     template display text is preserved as `"Name" <address>`.
//   - STARTTLS policy: "auto" proceeds when unadvertised (mock has no TLS),
//     "always" throws rather than send plaintext.

import { describe, it, expect, afterEach } from "vitest";
import * as net from "node:net";
import {
  SmtpTransport,
  NoopTransport,
  transportFromEnv,
  type SmtpTransportOptions,
} from "../../../src/card/notify/index.js";
import type { MailMessage } from "../../../src/card/notify/types.js";

// ---------------------------------------------------------------------------
// Mock SMTP server. Speaks just enough ESMTP for the transport's plain
// (post-STARTTLS-decision) conversation: greeting, EHLO, AUTH, envelope,
// DATA, QUIT. Records every command and the raw DATA payload.
// ---------------------------------------------------------------------------

interface MockCaptured {
  ehlos: string[];
  authLine: string | null;
  mailFrom: string | null;
  rcptTos: string[];
  data: string | null;
  quitSeen: boolean;
}

interface MockServer {
  port: number;
  captured: MockCaptured;
  /** Advertise STARTTLS in the EHLO response (we cannot upgrade a real
   *  TLS session in-test; default false so "auto" proceeds plaintext). */
  advertiseStarttls: boolean;
  /** Override the status returned to MAIL FROM (e.g. "530 auth required"). */
  mailFromReply: string;
  close(): Promise<void>;
}

function startMockServer(opts: {
  advertiseStarttls?: boolean;
  mailFromReply?: string;
} = {}): Promise<MockServer> {
  const captured: MockCaptured = {
    ehlos: [],
    authLine: null,
    mailFrom: null,
    rcptTos: [],
    data: null,
    quitSeen: false,
  };
  const server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    socket.write("220 mock ESMTP service ready\r\n");
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          captured.data = buffer.slice(0, end + 2); // include trailing CRLF before the dot
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write("250 OK queued\r\n");
          continue;
        }
        const lineEnd = buffer.indexOf("\r\n");
        if (lineEnd === -1) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        if (/^EHLO /i.test(line)) {
          captured.ehlos.push(line.slice(5));
          const exts = ["250-mock greets you"];
          if (opts.advertiseStarttls ?? false) exts.push("250-STARTTLS");
          exts.push("250 AUTH PLAIN LOGIN");
          socket.write(exts.join("\r\n") + "\r\n");
        } else if (/^AUTH /i.test(line)) {
          captured.authLine = line;
          socket.write("235 2.7.0 accepted\r\n");
        } else if (/^MAIL FROM:/i.test(line)) {
          if (opts.mailFromReply !== undefined && !opts.mailFromReply.startsWith("2")) {
            socket.write(opts.mailFromReply + "\r\n");
            socket.end();
            return;
          }
          captured.mailFrom = line.slice("MAIL FROM:".length).trim().replace(/^<|>$/g, "");
          socket.write("250 OK\r\n");
        } else if (/^RCPT TO:/i.test(line)) {
          captured.rcptTos.push(line.slice("RCPT TO:".length).trim().replace(/^<|>$/g, ""));
          socket.write("250 OK\r\n");
        } else if (/^DATA$/i.test(line)) {
          socket.write("354 go ahead\r\n");
          inData = true;
        } else if (/^QUIT$/i.test(line)) {
          captured.quitSeen = true;
          socket.write("221 bye\r\n");
          socket.end();
          return;
        } else {
          socket.write("500 unrecognized\r\n");
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        captured,
        advertiseStarttls: opts.advertiseStarttls ?? false,
        mailFromReply: opts.mailFromReply ?? "250 OK",
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

const openServers: MockServer[] = [];
afterEach(async () => {
  while (openServers.length > 0) {
    await openServers.pop()!.close();
  }
});

function makeTransport(server: MockServer, over: Partial<SmtpTransportOptions> = {}): SmtpTransport {
  return new SmtpTransport({
    host: "127.0.0.1",
    port: server.port,
    user: "casey@culturesmith.com",
    pass: "test-app-password",
    from: "no-reply@culturesmith.com",
    ...over,
  });
}

function textMessage(over: Partial<MailMessage> = {}): MailMessage {
  return {
    to: "jane@example.net",
    from: "Decko Bot",
    subject: "reset password for Culturesmith",
    textBody: "Hello Jane,\n\nUse this link to reset your password.\n",
    tags: { trigger: "password_reset" },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Config wiring (env -> transport). RED-FIRST: this block was written and
// run BEFORE smtp-transport.ts existed (fails on unresolved import), then
// made green by the implementation.
// ---------------------------------------------------------------------------

describe("transportFromEnv config wiring", () => {
  it("returns the NoopTransport when DECKO_SMTP_PASS is unset — nothing mails", () => {
    const t = transportFromEnv({ DECKO_SMTP_HOST: "smtp.protonmail.ch", DECKO_SMTP_USER: "x" });
    expect(t).toBeInstanceOf(NoopTransport);
    expect(t.name).toBe("noop");
  });

  it("returns an SmtpTransport when DECKO_SMTP_PASS is set, with Proton defaults", () => {
    const t = transportFromEnv({ DECKO_SMTP_PASS: "secret", DECKO_SMTP_USER: "casey@culturesmith.com" });
    expect(t).toBeInstanceOf(SmtpTransport);
    expect(t.name).toBe("smtp");
    const s = t as SmtpTransport;
    expect(s.describe()).toContain("smtp.protonmail.ch");
    expect(s.describe()).toContain("587");
    expect(s.describe()).toContain("starttls=auto");
    expect(s.describe()).toContain("from=no-reply@culturesmith.com");
    expect(s.describe()).toContain("user=casey@culturesmith.com");
    // the app password must never be describable
    expect(s.describe()).not.toContain("secret");
  });

  it("env overrides land on the transport (host, port, user, from)", () => {
    const t = transportFromEnv({
      DECKO_SMTP_PASS: "secret",
      DECKO_SMTP_HOST: "smtp.example.org",
      DECKO_SMTP_PORT: "2587",
      DECKO_SMTP_USER: "bot@example.org",
      DECKO_SMTP_FROM: "welcome@example.org",
    }) as SmtpTransport;
    const d = t.describe();
    expect(d).toContain("smtp.example.org");
    expect(d).toContain("2587");
    expect(d).toContain("user=bot@example.org");
    expect(d).toContain("from=welcome@example.org");
  });

  it("throws loudly when DECKO_SMTP_PASS is set but DECKO_SMTP_USER is missing", () => {
    expect(() => transportFromEnv({ DECKO_SMTP_PASS: "secret" })).toThrow(/DECKO_SMTP_USER/);
  });
});

// ---------------------------------------------------------------------------
// The wire: envelope + DATA bytes against the mock server.
// ---------------------------------------------------------------------------

describe("SmtpTransport wire conversation", () => {
  it("sends one text message: EHLO, AUTH PLAIN, envelope, DATA, QUIT", async () => {
    const server = await startMockServer();
    openServers.push(server);
    const t = makeTransport(server);
    await t.sendMail(textMessage());

    expect(server.captured.ehlos.length).toBe(1);
    // AUTH PLAIN initial response = base64("\0user\0pass") — the credential
    // proof without ever storing the pass outside config.
    expect(server.captured.authLine).toMatch(/^AUTH PLAIN /i);
    const b64 = server.captured.authLine!.slice("AUTH PLAIN ".length);
    expect(Buffer.from(b64, "base64").toString("utf-8")).toBe(
      "\u0000casey@culturesmith.com\u0000test-app-password",
    );
    // envelope-from = resolved actual address; envelope-to = the recipient.
    expect(server.captured.mailFrom).toBe("no-reply@culturesmith.com");
    expect(server.captured.rcptTos).toEqual(["jane@example.net"]);
    expect(server.captured.quitSeen).toBe(true);

    const data = server.captured.data!;
    // Ruby wire order (probe, notify receipt): Date, From, To, ...,
    // Message-ID, Subject, MIME-Version, Content-Type, CTE.
    const headerBlock = data.split("\r\n\r\n")[0]!;
    const headers = headerBlock.split("\r\n").filter((l) => /^[A-Za-z-]+:/.test(l));
    const names = headers.map((h) => h.slice(0, h.indexOf(":")));
    expect(names).toEqual(["Date", "From", "To", "Message-ID", "Subject", "MIME-Version", "Content-Type", "Content-Transfer-Encoding"]);
    expect(headerBlock).toContain('From: "Decko Bot" <no-reply@culturesmith.com>');
    expect(headerBlock).toContain("To: jane@example.net");
    expect(headerBlock).toContain("Subject: reset password for Culturesmith");
    expect(headerBlock).toContain("Content-Type: text/plain; charset=utf-8");
    // Message-ID references the envelope domain.
    expect(headerBlock).toMatch(/Message-ID: <[^@]+@culturesmith\.com>/);
  });

  it("Cc+Bcc join RCPT TO but the Bcc header never reaches DATA (Ruby SmtpEnvelope)", async () => {
    const server = await startMockServer();
    openServers.push(server);
    const t = makeTransport(server);
    await t.sendMail(textMessage({
      cc: "carol@example.net",
      bcc: "hidden@example.net",
    }));

    expect(server.captured.rcptTos).toEqual([
      "jane@example.net",
      "carol@example.net",
      "hidden@example.net",
    ]);
    const data = server.captured.data!;
    expect(data).toContain("Cc: carol@example.net");
    expect(data).not.toContain("hidden@example.net");
    expect(data.toLowerCase()).not.toContain("bcc:");
  });

  it("a configured From default overrides even a bare template address (email_config.rb:64: Card::Mailer.default[:from] wins)", async () => {
    const server = await startMockServer();
    openServers.push(server);
    const t = makeTransport(server); // from = no-reply@culturesmith.com
    await t.sendMail(textMessage({ from: "casey@culturesmith.com" }));

    // actual address = config default; the template's bare address (which is
    // its conf_text under configured_from_name_and_email) becomes the
    // display name since it differs from the actual.
    expect(server.captured.mailFrom).toBe("no-reply@culturesmith.com");
    const headerBlock = server.captured.data!.split("\r\n\r\n")[0]!;
    expect(headerBlock).toContain(
      'From: "casey@culturesmith.com" <no-reply@culturesmith.com>',
    );
  });

  it("dot-stuffs body lines starting with a period (RFC 5321 4.5.2)", async () => {
    const server = await startMockServer();
    openServers.push(server);
    const t = makeTransport(server);
    await t.sendMail(textMessage({ textBody: "top line\n.leading dot line\nlast line" }));

    const data = server.captured.data!;
    expect(data).toContain("\r\n..leading dot line\r\n");
    // unstuffing the payload reproduces the original body
    const body = data.slice(data.indexOf("\r\n\r\n") + 4, -5); // strip headers + CRLF.CRLF
    const unstuffed = body.replace(/^\.(\r\n|\r(?!\n)|[^\r\n])/gm, "$1");
    expect(unstuffed).toContain(".leading dot line");
  });

  it("html + text bodies render multipart/alternative with quoted-printable parts", async () => {
    const server = await startMockServer();
    openServers.push(server);
    const t = makeTransport(server);
    await t.sendMail(textMessage({
      textBody: "Reset here: https://example.test/r?token=abc",
      htmlBody: "<p>Reset <b>here</b>.</p>",
    }));

    const data = server.captured.data!;
    const headerBlock = data.split("\r\n\r\n")[0]!;
    expect(headerBlock).toMatch(/Content-Type: multipart\/alternative; boundary="[a-zA-Z0-9.=-]+"/);
    expect(data).toContain("Content-Type: text/plain; charset=utf-8");
    expect(data).toContain("Content-Type: text/html; charset=utf-8");
    // QP encodes "=" inside the URL as =3D (RFC 2045); the decode round-trip
    // is proven by the next test.
    expect(data).toContain("Reset here: https://example.test/r?token=3Dabc");
  });

  it("quoted-printable encodes non-ASCII and decodes back to the original text", async () => {
    const server = await startMockServer();
    openServers.push(server);
    const t = makeTransport(server);
    const body = "Sofia note — résumé arrived";
    await t.sendMail(textMessage({ textBody: body }));

    const data = server.captured.data!;
    const bodyPart = data.slice(data.indexOf("\r\n\r\n") + 4).replace(/(?:\r\n)+$/, "");
    // em dash -> =E2=80=94, é -> =C3=A9
    expect(bodyPart).toContain("=E2=80=94");
    expect(bodyPart).toContain("=C3=A9");
    // full round-trip decode
    const decoded = bodyPart
      .replace(/=\r\n/g, "")
      .replace(/=([0-9A-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    const decodedUtf8 = Buffer.from(
      Array.from(decoded).map((c) => c.charCodeAt(0) & 0xff),
    ).toString("utf-8");
    expect(decodedUtf8).toBe(body);
  });

  it("Q-encodes a non-ASCII subject as an RFC 2047 encoded-word; ASCII stays raw", async () => {
    const server = await startMockServer();
    openServers.push(server);
    const t = makeTransport(server);
    await t.sendMail(textMessage({ subject: "Objet en retard — suivi" }));

    const headerBlock = server.captured.data!.split("\r\n\r\n")[0]!;
    expect(headerBlock).toMatch(/Subject: =\?utf-8\?[Qq]\?/);
    expect(headerBlock).toContain("retard");
  });

  it("surfaces a 5xx rejection as an error naming the status, without a QUIT", async () => {
    const server = await startMockServer({ mailFromReply: "530 5.7.0 authentication required" });
    openServers.push(server);
    const t = makeTransport(server);
    await expect(t.sendMail(textMessage())).rejects.toThrow(/530/);
    expect(server.captured.quitSeen).toBe(false);
  });

  it("starttls=always throws when the server does not advertise STARTTLS", async () => {
    const server = await startMockServer({ advertiseStarttls: false });
    openServers.push(server);
    const t = makeTransport(server, { starttls: "always" });
    await expect(t.sendMail(textMessage())).rejects.toThrow(/STARTTLS/);
  });

  it("starttls=auto proceeds when the server does not advertise STARTTLS", async () => {
    const server = await startMockServer({ advertiseStarttls: false });
    openServers.push(server);
    const t = makeTransport(server, { starttls: "auto" });
    await t.sendMail(textMessage());
    expect(server.captured.data).not.toBeNull();
  });
});
