import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress,type Address} from 'viem';
import {independentRoomAdmission} from '../relayer/src/independent-room-admission';

const winner='0x0000000000000000000000000000000000000001' as Address;
const room=(id:bigint,away:boolean[]=[])=>({id,proposal:0n,winner:zeroAddress as Address,members:away.map(away=>({away}))});

test('empty/absent/history rooms cannot delay a new joined room through reverted writes',async()=>{
 const writes:bigint[]=[],reads:bigint[]=[];
 const admission=independentRoomAdmission({page:async()=>Array.from({length:16},(_,i)=>BigInt(i+1)),
  room:async id=>{reads.push(id);return room(id,id===99n?[false,false]:id===2n?[false,true]:[]);},
  propose:async id=>{assert.equal(id,99n);writes.push(id);assert.equal(reads.length,4);}});
 admission.hint(99n);admission.hint(99n);await admission.run();assert.deepEqual(writes,[99n]);
});

test('bounded parallel reads tolerate failure and preserve rematch and existing proposal semantics',async()=>{
 let active=0,maximum=0;const writes:bigint[]=[];
 const admission=independentRoomAdmission({page:async()=>[1n,2n,3n,4n,5n,6n,7n],room:async id=>{
  active++;maximum=Math.max(active,maximum);await new Promise(resolve=>setTimeout(resolve,2));active--;
  if(id===1n)throw Error('Unavailable');
  const r=room(id,[false,false]);if(id===2n)r.proposal=10n;
  if(id===3n)r.winner=winner;
  if(id===4n){r.winner=winner;r.members.push({away:false});}
  return r;
 },propose:async id=>{writes.push(id);}});
 await admission.run();assert.equal(maximum,4);assert.deepEqual(writes,[4n,5n]);
});

test('missed notifications are recovered by rotating durable pages even with fresh hints',async()=>{
 const offsets:number[]=[],writes:bigint[]=[];
 const admission=independentRoomAdmission({page:async offset=>{offsets.push(offset);return offset===0?Array.from({length:16},(_,i)=>BigInt(i+1)):[17n];},
  room:async id=>room(id,id===17n?[false,false]:[]),propose:async id=>{writes.push(id);}});
 for(let i=0;i<3;i++){admission.hint(100n);await admission.run();}
 assert.deepEqual(offsets,[0,16,0]);assert.deepEqual(writes,[17n]);
});

test('a stale hint or rejected proposal cannot suppress another room or the following retry',async()=>{
 const writes:bigint[]=[];let failed=true;
 const admission=independentRoomAdmission({page:async()=>[1n,2n],room:async id=>room(id,[false,false]),propose:async id=>{
  if(id===1n&&failed)throw Error('Contract changed');writes.push(id);
 }});
 await admission.run();failed=false;await admission.run();assert.deepEqual(writes,[2n,1n,2n]);
});
