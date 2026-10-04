import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedEngineSend} from '../shared/bounded-engine-send';

test('a handshake that never opens releases the command without sending',async()=>{
 let sent=0;
 await assert.rejects(boundedEngineSend(()=>new Promise(()=>{}),async()=>{sent++;},20),/timed out/);
 assert.equal(sent,0);
});
test('a late handshake is closed without transmitting the journaled command',async()=>{
 let connected!:(s:{close:()=>void})=>void,sent=0,closed=0;
 const pending=new Promise<{close:()=>void}>(resolve=>connected=resolve);
 await assert.rejects(boundedEngineSend(()=>pending,async()=>{sent++;},20),/timed out/);
 connected({close:()=>{closed++;}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sent,0);assert.equal(closed,1);
});
test('an unanswered write closes transport but never retries or acknowledges',async()=>{
 let sent=0,closed=0;
 await assert.rejects(boundedEngineSend(async()=>({close:()=>{closed++;}}),()=>{sent++;return new Promise(()=>{});},20),/timed out/);
 assert.equal(sent,1);assert.equal(closed,1);
});
test('a prompt receipt or explicit RPC rejection retains its original result',async()=>{
 let closed=0;const connect=async()=>({close:()=>{closed++;}});
 assert.equal(await boundedEngineSend(connect,async()=>42,100),42);
 const rejection=Object.assign(Error('Rejected'),{code:-32601});
 await assert.rejects(boundedEngineSend(connect,async()=>{throw rejection;},100),e=>e===rejection);
 assert.equal(closed,0);
});
