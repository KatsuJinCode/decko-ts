#!/usr/bin/env node
// mock-walk-host.mjs — a LOCAL mock host for proving the walk comparison's
// arbitrary-base-URL path (walk-and-compare.mjs --base-a/--base-b). It serves
// the small canned site the mock journeys walk, and its pages carry one of
// everything the normalization table handles, so the proof shows every rule
// doing real work on both sides:
//
//   W1  a mock_session cookie re-issued on every response (random value)
//   W2  a fresh authenticity_token hidden input on the sign-in page
//   W3  a per-response nonce on the inline script
//   W4  a data-generated-at ISO datetime on every page
//   W5  Date (node sets it) + Expires= inside the Set-Cookie
//   W6  an ETag specific to this host instance
//
// The pages themselves are identical across instances — the positive control
// seeds its difference through --about-text (host B's /about paragraph).
//
// Usage: node mock-walk-host.mjs --port 0 --about-text "About this mock."
// --port 0 picks a free loopback port and prints "mock-walk-host on <url>".
// This host exists only for local proofs; it contacts no other host.

import http from "node:http";
import { randomBytes } from "node:crypto";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const aboutText = arg("about-text", "About this mock host.");
const port = Number(arg("port", 0));
const etagSeed = randomBytes(6).toString("hex");

const page = (title, body, nonce, now) => `<!DOCTYPE html>
<html><head><title>${title}</title><script nonce="${nonce}">window.__mock = { nonce: true };</script></head>
<body>
<h1 id="headline">${title}</h1>
<main data-generated-at="${now}">
${body}
<p><a href="/about">About this mock</a> &middot; <a href="/sign-in">Sign in</a></p>
</main>
</body></html>`;

const signInPage = (nonce, token, now) => `<!DOCTYPE html>
<html><head><title>Sign in</title></head>
<body data-generated-at="${now}">
<h1>Sign in</h1>
<form method="post" action="/sign-in">
<input type="hidden" name="authenticity_token" value="${token}">
<label>Email <input name="email" type="text"></label>
<label>Password <input name="password" type="password"></label>
<button type="submit">Sign in</button>
</form>
</body></html>`;

const server = http.createServer((req, res) => {
  const now = new Date().toISOString();
  const nonce = randomBytes(12).toString("base64");
  const token = randomBytes(18).toString("base64");
  const expires = new Date(Date.now() + 3600_000).toUTCString();
  // W1/W5: a session cookie re-issued on every response, with an Expires attr.
  res.setHeader("Set-Cookie", `mock_session=${randomBytes(16).toString("hex")}; Path=/; HttpOnly; Expires=${expires}`);
  // W6: an ETag specific to this host instance.
  res.setHeader("ETag", `"${etagSeed}-1"`);
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/sign-in") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      // Credentials stay here — R1 on the capture side redacts the stored
      // postData; this host never echoes them.
      res.writeHead(303, { Location: "/" });
      res.end();
    });
    return;
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page("Mock home", "<p>Welcome to the mock walk host.</p>", nonce, now));
    return;
  }
  if (url.pathname === "/about") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page("About", `<p>${aboutText}</p>`, nonce, now));
    return;
  }
  if (url.pathname === "/sign-in") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(signInPage(nonce, token, now));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-walk-host on http://127.0.0.1:${server.address().port}`);
});
