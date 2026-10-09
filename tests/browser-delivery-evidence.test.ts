import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryEvidence} from '../scripts/browser-delivery-evidence';
const hash=`0x${'ab'.repeat(32)}`;
const error={at:1500,hash,error:true,message:'transaction validation error: nonce 122 too low, expected 127'};
test('a late rejected duplicate requires an earlier exact successful receipt',()=>{
 const receipt={hash,status:'0x1',confirmedAt:1200};
 const result=deliveryEvidence([error],[receipt]);assert.deepEqual(result.duplicateCopies,[error]);assert.deepEqual(result.unresolved,[]);
 for(const bad of [{...receipt,hash:`0x${'cd'.repeat(32)}`},{...receipt,status:'0x0'},{...receipt,confirmedAt:1600},{...receipt,confirmedAt:NaN}])
  assert.deepEqual(deliveryEvidence([error],[bad]).unresolved,[error]);
 assert.deepEqual(deliveryEvidence([error],[]).unresolved,[error]);
});
test('matching receipts never excuse rate limits, transport errors or other rejections',()=>{
 for(const message of ['NodeBusyError','-32005','request failed','transaction rejected','nonce 122 too high']){
  const e={...error,message};assert.deepEqual(deliveryEvidence([e],[{hash,status:'success',confirmedAt:1200}]).unresolved,[e]);
 }
});
test('HTTP metadata and ISO clocks use the same strict evidence rule without deleting errors',()=>{
 const e={at:'2026-10-08T19:41:15.773Z',hash,rpcError:{message:error.message}};
 const receipts=[{hash,status:'0x1',confirmedAt:Date.parse('2026-10-08T19:41:15.441Z')}];
 assert.deepEqual(deliveryEvidence([e],receipts).duplicateCopies,[e]);assert(e.rpcError);
});


test('submillisecond observation order is retained without excusing a future receipt',()=>{
 const e={...error,at:1500,observedAt:1500.9};
 assert.deepEqual(deliveryEvidence([e],[{hash,status:'0x1',confirmedAt:1500.7}]).duplicateCopies,[e]);
 assert.deepEqual(deliveryEvidence([e],[{hash,status:'0x1',confirmedAt:1501}]).unresolved,[e]);
 assert.deepEqual(deliveryEvidence([{...e,observedAt:NaN}],[{hash,status:'0x1',confirmedAt:1500.7}]).unresolved,[{...e,observedAt:NaN}]);
});

test('late duplicate of a terminal revert needs exact earlier receipt and verified terminal recovery',()=>{
 const receipt={hash,status:'0x0',confirmedAt:1200,action:'heartbeat',revertName:'InvalidMatch'};
 const timing={stage:'terminal',hash,command:'heartbeat'};
 const result=deliveryEvidence([error],[receipt],[timing]);
 assert.deepEqual(result.terminalCopies,[error]);assert.deepEqual(result.duplicateCopies,[]);assert.deepEqual(result.unresolved,[]);
 for(const r of [{...receipt,revertName:'StaleInput'},{...receipt,confirmedAt:1600},{...receipt,action:'input'}])
  assert.deepEqual(deliveryEvidence([error],[r],[timing]).unresolved,[error]);
 assert.deepEqual(deliveryEvidence([error],[receipt]).unresolved,[error]);
 assert.deepEqual(deliveryEvidence([error],[],[timing]).unresolved,[error]);
 assert.deepEqual(deliveryEvidence([{...error,message:'NodeBusyError'}],[receipt],[timing]).unresolved.length,1);
});

test('late instrumentation requires an earlier exact send and bounded acknowledgment and successful receipt',()=>{
 const receipt={hash,status:'0x1',confirmedAt:1522};
 const ack={stage:'acknowledged',hash,startedAt:1200,timeOrigin:100,ms:193};
 const result=deliveryEvidence([error],[receipt],[ack]);
 assert.deepEqual(result.reconciledCopies,[error]);assert.deepEqual(result.unresolved,[]);
 assert.deepEqual(result.duplicateCopies,[]);
 assert.deepEqual(deliveryEvidence([error],[receipt],[{...ack,ms:202.2}]).reconciledCopies,[error]);
 for(const bad of [{...ack,ms:701},{...ack,startedAt:1401},{...ack,ms:NaN},{...ack,hash:'0xdead'},{...ack,stage:'send'},{...ack,timeOrigin:NaN},{...ack,ms:-1}])
  assert.deepEqual(deliveryEvidence([error],[receipt],[bad]).unresolved,[error]);
 for(const r of [{...receipt,confirmedAt:2001},{...receipt,status:'0x0'},{...receipt,hash:'0xdead'}])
  assert.deepEqual(deliveryEvidence([error],[r],[ack]).unresolved,[error]);
 assert.deepEqual(deliveryEvidence([{...error,message:'NodeBusyError'}],[receipt],[ack]).unresolved.length,1);
});
