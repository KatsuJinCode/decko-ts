import { EventEmitter } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import { recordJourneyNetwork } from "../lib/journey-network.mjs";
test("records AJAX errors and failed assets without query credentials or bodies",()=>{
 const context=new EventEmitter(), result={}; recordJourneyNetwork(context,result);
 const request={method:()=>"POST",resourceType:()=>"xhr",isNavigationRequest:()=>false,url:()=>"https://user:password@localhost/update/account?token=secret",failure:()=>({errorText:"net::ERR_FAILED"}),redirectedFrom:()=>null,timing:()=>({startTime:1,responseEnd:-1})};
 context.emit("response",{url:request.url,request:()=>request,status:()=>422,headers:()=>({})});
 context.emit("requestfailed",{...request,method:()=>"GET",resourceType:()=>"stylesheet",url:()=>"https://cdn.example/skin.css?credential=secret"});
 assert.equal(result.network[0].status,422);assert.equal(result.network[0].resourceType,"xhr");
 assert.equal(result.network[1].failure,"net::ERR_FAILED");assert.doesNotMatch(JSON.stringify(result),/secret|password|credential/);
});
