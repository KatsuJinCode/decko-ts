import {parsePath} from '../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js';
import {expect,it} from 'vitest';
import {handleEngineRequest} from '../../deploy/bunny-worker-src/bunny-edge-engine-request.js';
import {createRenderTestStorage,seedCard} from '../card/render/render-test-storage.js';
async function fixture(){const s=await createRenderTestStorage();await seedCard(s,{id:2,name:'RichText',codename:'basic'});await seedCard(s,{id:401,name:'Feed Note',typeId:2,dbContent:'VISIBLE_FEED_BODY'});await seedCard(s,{id:402,name:'Secret Feed',typeId:2,dbContent:'SENSITIVE_RSS_BODY',readRuleId:999999});return s;}
const request=(path:string)=>new Request('https://script-placeholder.bunny.run'+path);
it.each(['/Feed_Note.rss','/Feed_Note?format=rss'])('dispatches default-disabled RSS without the HTML create surface: %s',async path=>{const s=await fixture();try{const response=await handleEngineRequest(request(path),{fetcher:s.fetcher,render:s.engine});expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');expect(await response.text()).toBe('RSS feeds disabled');expect(response.headers.get('cache-control')).toBe('no-store');}finally{s.close()}});
it.each(['/Secret_Feed.rss','/Secret_Feed?format=rss'])('retains the read gate: %s',async path=>{const s=await fixture();try{const response=await handleEngineRequest(request(path),{fetcher:s.fetcher,render:s.engine});expect(response.status).toBe(403);expect(await response.text()).not.toContain('SENSITIVE_RSS_BODY');}finally{s.close()}});
it('a missing RSS mark is not a new-card form',async()=>{const s=await fixture();try{const response=await handleEngineRequest(request('/Never_Existed.rss'),{fetcher:s.fetcher,render:s.engine});expect(response.status).toBe(404);expect(await response.text()).not.toContain('new_card');}finally{s.close()}});
it('a retained RSS handler observes a committed revocation',async()=>{const s=await fixture();try{const deck={fetcher:s.fetcher,render:s.engine};expect((await handleEngineRequest(request('/Feed_Note.rss'),deck)).status).toBe(200);await s.counting.query('UPDATE cards SET read_rule_id=999999 WHERE id=401',[]);const denied=await handleEngineRequest(request('/Feed_Note.rss'),deck);expect(denied.status).toBe(403);expect(await denied.text()).not.toContain('VISIBLE_FEED_BODY');}finally{s.close()}});

it('RSS explicit views retain their format and view identity',()=>{expect(parsePath('/Feed_Note/open.rss')).toMatchObject({name:'Feed Note',view:'open',format:'rss'})});
it('the home RSS query uses the stock default feed',()=>{expect(parsePath('/',new URLSearchParams('format=rss'))).toMatchObject({name:'Home',view:'feed',format:'rss'})});
it('JSON typeahead keeps precedence over an RSS query',()=>{expect(parsePath('/*search/search_box_complete.json',new URLSearchParams('format=rss'))).toMatchObject({name:'*search',view:'search_box_complete',format:'json'})});
it('an RSS suffix cannot alias the special status API',()=>{expect(parsePath('/api/status.rss')).not.toHaveProperty('kind','api')});
it('new-card route precedence remains unchanged',()=>{expect(parsePath('/new/RichText.rss')).toMatchObject({kind:'new',typeName:'RichText.rss'})});
it('an empty RSS mark is not the home card',()=>{expect(parsePath('/.rss')).toEqual({kind:'notFound'})});
