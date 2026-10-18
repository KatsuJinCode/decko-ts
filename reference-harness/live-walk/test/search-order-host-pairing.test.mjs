import test from 'node:test';
import assert from 'node:assert/strict';
import {walkAndCompare} from '../lib/search-order-compare.mjs';

const home='<form class="search-box-form" action="/*search"><input data-completepath="/*complete.json"></form>';
const results='<div class="search-result-list"><div class="search-result-item"><div data-card-name="Topic"><a class="full-page-link" href="/Topic">Topic</a></div></div></div>';

function instrument({gateHomes=false}={}) {
  let release;
  const gate=new Promise(resolve=>release=resolve),active=new Map(),max=new Map(),calls=[];
  return {calls,max,release,fetchImpl:async raw=>{
    const url=new URL(raw),origin=url.origin;
    active.set(origin,(active.get(origin)??0)+1);
    max.set(origin,Math.max(max.get(origin)??0,active.get(origin)));
    calls.push(url);
    try {
      if(gateHomes&&url.pathname==='/')await gate;
      else await new Promise(resolve=>setImmediate(resolve));
      const body=url.pathname==='/'?home:url.pathname.endsWith('.json')?JSON.stringify([{action:'goto',value:'Topic',url:'/Topic'}]):results;
      return {status:200,text:async()=>body};
    } finally {active.set(origin,active.get(origin)-1)}
  }};
}

test('independent hosts start together while each host keeps term/surface order and one outstanding request',async()=>{
  const io=instrument({gateHomes:true});
  const run=walkAndCompare('http://a.test','http://b.test',{terms:['a','b'],fetchImpl:io.fetchImpl});
  try {
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(new Set(io.calls.map(u=>u.origin)).size,2,'both independent home reads must start before either is released');
  } finally {io.release();await run}
  const result=await run;
  assert.equal(result.summary.orderIdentical,4);
  assert.deepEqual(result.probes.map(p=>p.term),['a','b']);
  for(const origin of ['http://a.test','http://b.test']) {
    assert.equal(io.max.get(origin),1);
    assert.deepEqual(io.calls.filter(u=>u.origin===origin).map(u=>u.pathname),['/','/*complete.json','/*search','/*complete.json','/*search']);
  }
});

test('two labels for the same origin never overlap their requests',async()=>{
  const io=instrument();
  const result=await walkAndCompare('http://same.test','http://same.test/',{terms:['a'],fetchImpl:io.fetchImpl});
  assert.equal(io.max.get('http://same.test'),1);
  assert.equal(result.summary.orderIdentical,2);
});
