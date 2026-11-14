// The REGISTERED-FORMAT arm on the edge host (row D5).
//
// The edge's own grammar and request core, driven over the engine the
// render tests boot: a registered suffix on a card URL is a FORMAT, not
// part of the card's name (engine_routes.rb:22's (.:format) capture, and
// the pinned registry's own names and mime types).
import { parsePath } from '../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js';
import { expect, it } from 'vitest';
import { handleEngineRequest } from '../../deploy/bunny-worker-src/bunny-edge-engine-request.js';
import { createRenderTestStorage, seedCard } from '../card/render/render-test-storage.js';

async function fixture() {
  const s = await createRenderTestStorage();
  await seedCard(s, { id: 2, name: 'RichText', codename: 'basic' });
  await seedCard(s, { id: 401, name: 'Style Note', typeId: 2, dbContent: 'VISIBLE_CSS_BODY' });
  return s;
}
const request = (path: string) => new Request('https://script-placeholder.bunny.run' + path);

it('a registered suffix answers the card in its own format, with its own mime type', async () => {
  const s = await fixture();
  try {
    const response = await handleEngineRequest(request('/Style_Note.css'), {
      fetcher: s.fetcher,
      render: s.engine,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('VISIBLE_CSS_BODY');
  } finally {
    s.close();
  }
});

it('the other armed names answer their own mime type', async () => {
  const cases: Array<[string, string]> = [
    ['/Style_Note.js', 'text/javascript'],
    ['/Style_Note.txt', 'text/plain'],
    ['/Style_Note.xml', 'text/xml'],
  ];
  const s = await fixture();
  try {
    for (const [path, mimeType] of cases) {
      const response = await handleEngineRequest(request(path), {
        fetcher: s.fetcher,
        render: s.engine,
      });
      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-type'), path).toBe(`${mimeType}; charset=utf-8`);
    }
  } finally {
    s.close();
  }
});

it('the NAMED REMAINDERS keep their suffix in the card\'s name', async () => {
  // yaml and yml need Ruby's `to_yaml` (the port has no YAML serializer)
  // and jsonld needs the jsonld support. The suffix stays in the name, so
  // the card "Style Note.yaml" does not exist.
  const s = await fixture();
  try {
    for (const path of ['/Style_Note.yaml', '/Style_Note.yml', '/Style_Note.jsonld']) {
      const response = await handleEngineRequest(request(path), {
        fetcher: s.fetcher,
        render: s.engine,
      });
      expect(response.status, path).toBe(404);
    }
  } finally {
    s.close();
  }
});

it('the grammar splits the registered names and keeps the rest', () => {
  expect(parsePath('/Style_Note.css')).toMatchObject({ name: 'Style Note', view: 'content', format: 'css' });
  expect(parsePath('/Style_Note/open.js')).toMatchObject({ name: 'Style Note', view: 'open', format: 'js' });
  // An UNREGISTERED suffix stays in the name: the pinned deck folds it to
  // the FILE sender (response.rb:102-105), which is row D4's own arm.
  expect(parsePath('/Style_Note.bin')).toMatchObject({ name: 'Style Note.bin' });
});
