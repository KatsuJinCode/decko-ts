import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createDeterministicLoopbackFetch } from '../lib/deterministic-loopback-fetch.mjs';

/** One throwaway loopback http server answering a fixed JSON body. */
async function startJsonServer(handler) {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => handler(req, res, Buffer.concat(chunks)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('loopback http POST rides the keep-alive transport and answers a real Response', async () => {
  const seen = [];
  const { server, url } = await startJsonServer((req, res, body) => {
    seen.push({ method: req.method, path: req.url, body: body.toString('utf8'), acceptEncoding: req.headers['accept-encoding'] });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, echo: body.toString('utf8') }));
  });
  try {
    const fetch = createDeterministicLoopbackFetch({ fallback: async () => { throw new Error('fallback must not run for loopback http'); } });
    const response = await fetch(`${url}/v2/pipeline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip, identity' },
      body: JSON.stringify({ requests: [{ type: 'execute' }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.statusText, 'OK');
    assert.equal(response.ok, true);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    const parsed = await response.json();
    assert.equal(parsed.ok, true);
    assert.deepEqual(await (await fetch(`${url}/again`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'second' })).text(), JSON.stringify({ ok: true, echo: 'second' }));
    assert.equal(seen.length, 2);
    assert.equal(seen[0].path, '/v2/pipeline');
    assert.equal(seen[1].method, 'POST');
    assert.equal(seen[0].acceptEncoding, 'identity', 'loopback answers must stay uncompressed so Response bytes match headers');
    assert.equal(JSON.parse(seen[0].body).requests[0].type, 'execute');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('https, foreign hosts and Request/stream bodies fall back to the wrapped fetch unchanged', async () => {
  const calls = [];
  const fallback = async (input, init) => {
    calls.push({ input, init });
    return new Response('fallback-answer', { status: 201 });
  };
  const fetch = createDeterministicLoopbackFetch({ fallback });
  // https even on loopback: the local stack's own origin is https and is served by edge-host, not this transport
  const httpsResponse = await fetch('https://127.0.0.1:54930/update/x', { method: 'POST', body: 'x' });
  assert.equal(httpsResponse.status, 201);
  // foreign host
  await fetch('http://example.invalid/v2/pipeline', { method: 'POST', body: 'x' });
  // Request object input
  await fetch(new Request('http://127.0.0.1:1/v2/pipeline', { method: 'POST', body: 'x' }));
  // stream body
  await fetch('http://127.0.0.1:1/v2/pipeline', { method: 'POST', body: new ReadableStream() });
  assert.equal(calls.length, 4);
  assert.match(calls[0].input, /^https:/);
  assert.match(calls[1].input, /example\.invalid/);
  assert.ok(calls[2].input instanceof Request);
  assert.ok(calls[3].init.body instanceof ReadableStream);
});

test('GET carries no body and error statuses surface as Response status (driver contract)', async () => {
  const { server, url } = await startJsonServer((req, res) => {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('boom');
  });
  try {
    const fetch = createDeterministicLoopbackFetch({ fallback: async () => { throw new Error('fallback must not run'); } });
    const response = await fetch(`${url}/probe`);
    assert.equal(response.ok, false);
    assert.equal(response.status, 503);
    assert.equal(await response.text(), 'boom');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('beats the global dispatcher on a serial POST loop in a tax-afflicted process too', async () => {
  // Timing assertion kept LOOSE on purpose: the fix's claim is determinism,
  // not a specific microsecond figure. 200 serial 1-stmt POSTs must average
  // far below the ~13-15 ms/call global-fetch tax observed on this machine;
  // through the keep-alive transport the same loop measures ~0.4-1 ms.
  const { server, url } = await startJsonServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"results":[]}');
  });
  try {
    const fetch = createDeterministicLoopbackFetch({ fallback: async () => { throw new Error('fallback must not run'); } });
    const body = JSON.stringify({ requests: [{ type: 'execute', stmt: { sql: 'SELECT 1', args: [], want_rows: true } }] });
    const started = performance.now();
    for (let i = 0; i < 200; i += 1) await (await fetch(`${url}/v2/pipeline`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).arrayBuffer();
    const perCall = (performance.now() - started) / 200;
    assert.ok(perCall < 5, `loopback transport averaged ${perCall.toFixed(2)} ms/call over 200 POSTs; the tax it exists to remove is ~13-15 ms/call`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
