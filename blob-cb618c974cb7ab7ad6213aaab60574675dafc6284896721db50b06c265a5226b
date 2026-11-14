import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchPagePasses} from '../lib/search-page.mjs';

test('search acceptance requires successful HTTP, the real search card, and no rendered error view',()=>{
  const page={status:200,searchRoot:true,errorViews:[]};
  assert.equal(searchPagePasses(page),true);
  assert.equal(searchPagePasses({...page,status:500}),false);
  assert.equal(searchPagePasses({...page,status:403}),false);
  assert.equal(searchPagePasses({...page,searchRoot:false}),false);
  assert.equal(searchPagePasses({...page,errorViews:['server_error-view']}),false);
  assert.equal(searchPagePasses({...page,errorViews:undefined}),false);
});
