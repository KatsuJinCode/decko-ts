import {it,expect} from 'vitest';
import {liveRenderApplies} from '../../deploy/bunny-worker-src/bunny-edge-engine-request.js';
const url=new URL('https://local.test/Home/edit');
const xhr=new Request(url,{headers:{'x-requested-with':'XMLHttpRequest'}});
it('admits anonymous requested XHR view through the request-local renderer',()=>expect(liveRenderApplies(xhr,url,{anonymous:true,liveRenderFlag:'1'},'edit',{})).toBe(true));
it('keeps non-XHR explicit view and explicit-layout requests on their established route',()=>{
 expect(liveRenderApplies(new Request(url),url,{anonymous:true,liveRenderFlag:'1'},'edit',{})).toBe(false);
 const layout=new URL(url);layout.searchParams.set('layout','default');expect(liveRenderApplies(new Request(layout,{headers:{'x-requested-with':'XMLHttpRequest'}}),layout,{anonymous:true,liveRenderFlag:'1'},'edit',{})).toBe(false);
});
it('keeps explicit off and historical-context requests outside batching',()=>{
 expect(liveRenderApplies(xhr,url,{anonymous:true,liveRenderFlag:'0'},'edit',{})).toBe(false);
 expect(liveRenderApplies(xhr,url,{anonymous:true,liveRenderFlag:'1'},'edit',{actId:'12'})).toBe(false);
});
