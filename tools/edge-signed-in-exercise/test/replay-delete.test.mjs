import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { replayDelete } from '../lib/replay-delete.mjs';

test('owner delete waits for its actual AJAX redirect landing, even after 2500ms', async () => {
  let landingFinished = false;
  let deleteResponseBody = '';
  const server = createServer((req, res) => {
    if (req.url === '/delete/ReplayCard') {
      res.setHeader('content-type', 'application/json');
      deleteResponseBody = JSON.stringify({ redirect: '/landing' });
      res.end(deleteResponseBody);
    } else if (req.url === '/landing') {
      setTimeout(() => { landingFinished = true; res.end('<h1>Deleted</h1>'); }, 3300);
    } else {
      res.setHeader('content-type', 'text/html');
      res.end(`<a href="/delete/ReplayCard">Delete</a><script>
        document.querySelector('a').onclick = async event => {
          event.preventDefault();
          const result = await (await fetch(event.currentTarget.href)).json();
          location.href = result.redirect;
        };
      </script>`);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright-core');
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  assert.ok(executablePath, 'installed browser required');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage();
    await page.goto(origin);
    await replayDelete({ page, name: 'ReplayCard', origin,
      responseBodyFallback: () => deleteResponseBody });
    assert.equal(landingFinished, true, 'the next owner step must not race the pending redirect');
    assert.equal(page.url(), `${origin}/landing`);
    assert.equal(await page.locator('h1').textContent(), 'Deleted');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
