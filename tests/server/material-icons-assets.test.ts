import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ASSET_PREFIX,assets} from '../../vendor/decko-material-icons/assets.js';
import {handleBunnyEngineRequest} from '../../deploy/bunny-worker-src/bunny-edge-engine-handler.js';

it('serves exact pinned font, stylesheet and license through the real edge handler without a database',async()=>{
  for(const [name,asset]of Object.entries(assets)) {
    const response=await handleBunnyEngineRequest(new Request('https://local.test'+ASSET_PREFIX+name),{});
    expect(response.status).toBe(200);
    const bytes=Buffer.from(await response.arrayBuffer());
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    expect(response.headers.get('content-type')).toBe(asset.contentType);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  }
  const provenance=JSON.parse(readFileSync('vendor/decko-material-icons/provenance.json','utf8'));
  const css=Buffer.from(assets['material-icons.css']!.base64,'base64').toString();
  expect(css).not.toMatch(/https?:/);
  expect(createHash('sha256').update(css.replace('./material-icons.woff2',provenance.fontUrl)).digest('hex')).toBe(provenance.originalCssSha256);
});

it('supports HEAD/revalidation and refuses missing names, encoded aliases and writes',async()=>{
  const url='https://local.test'+ASSET_PREFIX+'material-icons.woff2';
  const head=await handleBunnyEngineRequest(new Request(url,{method:'HEAD'}),{});
  expect(head.status).toBe(200);expect(head.body).toBeNull();expect(Number(head.headers.get('content-length'))).toBe(128352);
  const unchanged=await handleBunnyEngineRequest(new Request(url,{headers:{'if-none-match':head.headers.get('etag')!}}),{});
  expect(unchanged.status).toBe(304);expect(unchanged.body).toBeNull();
  for(const name of ['missing.woff2','%6daterial-icons.woff2'])expect((await handleBunnyEngineRequest(new Request('https://local.test'+ASSET_PREFIX+name),{})).status).toBe(404);
  expect((await handleBunnyEngineRequest(new Request(url,{method:'POST'}),{})).status).toBe(405);
});
