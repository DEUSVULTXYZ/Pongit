import test from 'node:test';
import assert from 'node:assert/strict';
import {poolUserError} from '../shared/agent-pool-error';

test('public arena errors never render signed transport payloads',()=>{
 const payload=`0x${'ab'.repeat(200)}`;
 for(const error of [new Error(`HTTP request failed. Request body: ${payload}`),
  new Error(`Request body: {signature: ${payload}}`),new Error(payload),
  {shortMessage:'An error occurred',message:`Request body: ${payload}`}]){
  assert(!poolUserError(error).includes(payload));assert(!poolUserError(error).includes('Request body'));
 }
});
test('network throttling preserves the saved-session explanation',()=>{
 assert.match(poolUserError({cause:{status:429,headers:{'retry-after':'1'}}}),/session is saved/);
 assert.match(poolUserError(new Error('Failed to fetch')),/synchronization will retry/);
 assert.match(poolUserError({code:'ENGINE_PUBLICATION_UNAVAILABLE'}),/publication recovery/);
});
test('actionable local session instructions and cancellation remain legible',()=>{
 for(const message of ['Renew your arcade session','Use the passkey for this player','This account is already controlling an arena in another tab'])
  assert.equal(poolUserError(new Error(message)),message);
 assert(!poolUserError(null).includes('undefined'));
});
