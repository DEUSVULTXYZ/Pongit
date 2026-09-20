import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terminalAfterRevert} from '../shared/terminal-command';
const ended={name:'AppRevertError',errorName:'InvalidMatch'};
test('confirmed end-of-match revert reads the actual result instead of inventing one',async()=>{
 let reads=0;const state={id:9n,phase:3,scoreA:7,scoreB:6};
 assert.equal(await terminalAfterRevert(ended,9n,()=>undefined,async()=>{reads++;return state;}),state);
 assert.equal(reads,1);
 assert.equal(await terminalAfterRevert(ended,9n,()=>undefined,async()=>({id:9n,phase:2})),undefined);
 assert.equal(await terminalAfterRevert(ended,9n,()=>undefined,async()=>({id:10n,phase:3})),undefined);
});
test('lost response, unresolved journal and another revert never qualify as a terminal race',async()=>{
 let reads=0;const read=async()=>{reads++;return{id:9n,phase:3};};
 for(const error of [Error('response lost'),{name:'AppRevertError',errorName:'StaleInput'},null])
  assert.equal(await terminalAfterRevert(error,9n,()=>undefined,read),undefined);
 assert.equal(await terminalAfterRevert(ended,9n,()=>({hash:'uncertain'}),read),undefined);assert.equal(reads,0);
});
test('a failed confirmation read still fails instead of accepting a stale result',async()=>{
 await assert.rejects(terminalAfterRevert(ended,9n,()=>undefined,async()=>{throw Error('RPC unavailable');}),/RPC unavailable/);
});
