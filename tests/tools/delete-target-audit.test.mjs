import test from 'node:test';import assert from 'node:assert/strict';
import {unexpectedDeleteTargets} from '../../tools/edge-signed-in-exercise/lib/delete-target-audit.mjs';
test('allows only the intended soft-delete tombstone',()=>{
 const tombstone={id:10,name:'Harness_delete_one',trash:1};assert.deepEqual(unexpectedDeleteTargets([tombstone],10),[]);
 for(const extra of [{id:10,name:tombstone.name,trash:0},{id:11,name:tombstone.name,trash:0},{id:12,name:'delete',trash:1}])assert.deepEqual(unexpectedDeleteTargets([tombstone,extra],10),[extra]);
 assert.deepEqual(unexpectedDeleteTargets([tombstone],undefined),[tombstone]);
});
