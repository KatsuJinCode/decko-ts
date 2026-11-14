import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordJourneyNetwork } from '../lib/journey-network.mjs';

const make = (url='http://127.0.0.1/update/card?token=private', previous=null) => {
  const values = { startTime: 1000, domainLookupStart: -1, domainLookupEnd: -1, connectStart: -1, secureConnectionStart: -1, connectEnd: -1, requestStart: 2, responseStart: 12, responseEnd: -1 };
  return { values, url:()=>url, method:()=> 'POST', resourceType:()=> 'xhr', isNavigationRequest:()=> false, redirectedFrom:()=>previous, timing:()=>({...values}), failure:()=>({errorText:'net::ERR_ABORTED'}) };
};
const response = (request,status=200) => ({request:()=>request,url:request.url,status:()=>status,headers:()=>({'server-timing':'db;dur=12;stmt=3, total;dur=15','set-cookie':'credential=private','x-private':'private'})});
const setup = result => {let clock=100;const context=new EventEmitter();const handle=recordJourneyNetwork(context,result,{monotonicNow:()=>clock+=10,epochNow:()=>1000});return {context,...handle}};

test('records distinct observer clocks, raw Server-Timing and final Playwright responseEnd',()=>{
 const result={}, {context}=setup(result), request=make();
 context.emit('request',request);context.emit('response',response(request));
 assert.equal(result.network[0].timing.request.responseEnd,-1);
 request.values.responseEnd=18;context.emit('requestfinished',request);context.emit('close');
 const row=result.network[0];
 assert.equal(row.state,'finished');assert.equal(row.status,200);assert.equal(row.path,'/update/card');
 assert.equal(row.timing.requestedAtMs,120);assert.equal(row.timing.responseAtMs,130);assert.equal(row.timing.finishedAtMs,140);
 assert.equal(row.timing.request.startTime,1000);assert.equal(row.timing.request.responseEnd,18);assert.equal(row.timing.request.domainLookupStart,-1);
 assert.equal(row.serverTiming,'db;dur=12;stmt=3, total;dur=15');assert.equal(result.networkTiming.captures[0].closedAtMs,150);
 assert.equal(result.networkRequests.length,1);assert.equal(result.networkRequests[0].timing.request.responseEnd,18);
 assert.deepEqual(result.networkUnfinished,[]);assert.doesNotMatch(JSON.stringify(result),/private|credential|cookie|token/);
});

test('links distinct redirect requests without conflating their timing or HTTP statuses',()=>{
 const result={}, {context}=setup(result), first=make('http://localhost/old?token=private'), next=make('http://localhost/new?token=private',first);
 context.emit('request',first);context.emit('response',response(first,302));first.values.responseEnd=14;context.emit('requestfinished',first);
 context.emit('request',next);context.emit('response',response(next,200));next.values.responseEnd=22;context.emit('requestfinished',next);context.emit('close');
 assert.equal(result.network.length,2);assert.equal(result.network[0].redirectedToId,result.network[1].requestId);assert.equal(result.network[1].redirectedFromId,result.network[0].requestId);
 assert.deepEqual(result.network.map(r=>r.status),[302,200]);assert.deepEqual(result.network.map(r=>r.timing.request.responseEnd),[14,22]);
 assert.doesNotMatch(JSON.stringify(result),/private|token/);
});

test('failed requests retain failure outcome and unavailable timings without invented durations',()=>{
 const result={}, {context}=setup(result), request=make('https://cdn.example/asset.js?key=private');
 context.emit('request',request);context.emit('requestfailed',request);context.emit('close');
 const row=result.network[0];assert.equal(row.status,null);assert.equal(row.state,'failed');assert.equal(row.failure,'net::ERR_ABORTED');
 assert.equal(row.timing.responseAtMs,null);assert.equal(row.timing.finishedAtMs,null);assert.equal(row.timing.failedAtMs,130);assert.equal(row.timing.request.responseEnd,-1);assert.deepEqual(result.networkUnfinished,[]);
 assert.doesNotMatch(JSON.stringify(result),/private|key=/);
});

test('HTTP errors finish normally and are not rewritten as transport failures',()=>{
 const result={}, {context}=setup(result), request=make();context.emit('request',request);context.emit('response',response(request,503));request.values.responseEnd=90;context.emit('requestfinished',request);context.emit('close');
 assert.equal(result.network[0].state,'finished');assert.equal(result.network[0].status,503);assert.equal(result.network[0].failure,undefined);
});

test('unfinished requests with and without response are separately captured at closeout',()=>{
 const result={}, {context,finalize}=setup(result), pending=make('https://cdn.example/pending'), headersOnly=make('https://cdn.example/headers');
 context.emit('request',pending);context.emit('request',headersOnly);context.emit('response',response(headersOnly));finalize();finalize();
 assert.equal(result.network.length,1);assert.equal(result.network[0].status,200);assert.equal(result.networkUnfinished.length,2);assert.equal(result.networkTiming.captures[0].unfinished,2);
 assert.deepEqual(result.networkUnfinished.map(r=>r.timing.finishedAtMs),[null,null]);assert.deepEqual(result.networkUnfinished.map(r=>r.timing.request.responseEnd),[-1,-1]);
 context.emit('requestfailed',pending);assert.equal(result.network.length,1);assert.equal(context.listenerCount('request'),0);
});

test('fresh contexts share a result with distinct capture/request IDs',()=>{
 const result={};for(let i=0;i<2;i++){const {context}=setup(result),request=make();context.emit('request',request);context.emit('response',response(request));context.emit('requestfinished',request);context.emit('close')}
 assert.deepEqual(result.network.map(r=>r.requestId),['1:1','2:1']);assert.equal(result.networkTiming.captures.length,2);
});

test('missing observed request event and unavailable API timing remain explicit',()=>{
 const result={}, {context}=setup(result),request=make();request.timing=()=>{throw Error('private token must not be recorded')};
 context.emit('response',response(request));context.emit('close');
 assert.equal(result.network[0].timing.requestedAtMs,null);assert.equal(result.network[0].timing.request,null);assert.equal(result.networkUnfinished.length,1);
 assert.equal(result.networkTiming.errors[0].reason,'request timing unavailable');assert.doesNotMatch(JSON.stringify(result),/private|token/);
});

test('a body failure after response retains both legacy observations and a single failed trace',()=>{
 const result={}, {context}=setup(result),request=make();context.emit('request',request);context.emit('response',response(request));context.emit('requestfailed',request);context.emit('close');
 assert.deepEqual(result.network.map(r=>r.status),[200,null]);assert.equal(result.networkRequests.length,1);assert.equal(result.networkRequests[0].status,200);assert.equal(result.networkRequests[0].state,'failed');
 assert.equal(result.networkRequests[0].failure,'net::ERR_ABORTED');assert.equal(result.networkRequests[0].timing.finishedAtMs,null);
});

test('a finished request without observed headers is not silently dropped or assigned a made-up status',()=>{
 const result={}, {context}=setup(result),request=make();context.emit('request',request);request.values.responseEnd=40;context.emit('requestfinished',request);context.emit('close');
 assert.equal(result.network.length,0);assert.equal(result.networkRequests.length,1);assert.equal(result.networkRequests[0].status,undefined);assert.equal(result.networkRequests[0].state,'finished');assert.equal(result.networkRequests[0].timing.request.responseEnd,40);
});
