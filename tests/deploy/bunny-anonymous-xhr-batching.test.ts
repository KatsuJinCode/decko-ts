import {it,expect} from 'vitest';
import {liveRenderApplies} from '../../deploy/bunny-worker-src/bunny-edge-engine-request.js';

it('snippet editor params use request-local rendering while history selectors still use the history path',()=>{
 const url=new URL('https://example.test/Probe?view=modal_nest_editor&tinymce_id=owned-editor');
 const request=new Request(url,{headers:{'x-requested-with':'XMLHttpRequest'}});
 const params={editorParams:{tinymce_id:'owned-editor',tm_snippet_start:'0'}};
 for(const options of [{anonymous:true,liveRenderFlag:'1'},{viewer:{actorId:123,signedIn:true},liveRenderFlag:'1'}]){
  expect(liveRenderApplies(request,url,options,'modal_nest_editor',params)).toBe(true);
  expect(liveRenderApplies(request,url,options,'modal_nest_editor',{...params,actId:'12'})).toBe(false);
  expect(liveRenderApplies(request,url,{...options,liveRenderFlag:'0'},'modal_nest_editor',params)).toBe(false);
 }
});
const url=new URL('https://local.test/Home/edit');
const xhr=new Request(url,{headers:{'x-requested-with':'XMLHttpRequest'}});
it('admits anonymous requested XHR view through the request-local renderer',()=>expect(liveRenderApplies(xhr,url,{anonymous:true,liveRenderFlag:'1'},'edit',{})).toBe(true));
it('admits anonymous full-page explicit views while retaining explicit-layout dispatch',()=>{
 expect(liveRenderApplies(new Request(url),url,{anonymous:true,liveRenderFlag:'1'},'edit',{})).toBe(true);
 const layout=new URL(url);layout.searchParams.set('layout','default');expect(liveRenderApplies(new Request(layout,{headers:{'x-requested-with':'XMLHttpRequest'}}),layout,{anonymous:true,liveRenderFlag:'1'},'edit',{})).toBe(false);
});
it('keeps explicit off and historical-context requests outside batching',()=>{
 expect(liveRenderApplies(xhr,url,{anonymous:true,liveRenderFlag:'0'},'edit',{})).toBe(false);
 expect(liveRenderApplies(xhr,url,{anonymous:true,liveRenderFlag:'1'},'edit',{actId:'12'})).toBe(false);
});
