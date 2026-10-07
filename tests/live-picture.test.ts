import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adoptLivePicture} from '../shared/live-picture';
import type {EngineState} from '../shared/engine-stream';
const state=(revision:bigint,head:bigint,observedAt:number)=>({id:1n,revision,head,observedAt}) as EngineState;
test('a delayed heartbeat or poll cannot replace a newer live picture',()=>{
 const live=state(9n,30n,200);
 assert.equal(adoptLivePicture(live,state(8n,29n,201)),live);
 assert.equal(adoptLivePicture(live,state(9n,30n,190)),live);
 const newer=state(10n,32n,210);assert.equal(adoptLivePicture(live,newer),newer);
 assert.equal(adoptLivePicture(live,{...newer,id:2n}),live);
});
test('only the independently verified feed reset can rewind the current match',()=>{
 const live=state(9n,30n,200),reset={...state(5n,10n,210),reset:true};
 assert.equal(adoptLivePicture(live,reset),reset);
 assert.equal(adoptLivePicture(live,{...reset,observedAt:190}),live);
});
