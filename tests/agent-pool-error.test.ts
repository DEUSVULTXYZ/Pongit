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
test('network throttling tells the player the game is saved, without protocol words',()=>{
 assert.match(poolUserError({cause:{status:429,headers:{'retry-after':'1'}}}),/game is saved/);
 assert.match(poolUserError(new Error('Failed to fetch')),/reconnecting automatically/);
 assert.match(poolUserError({code:'ENGINE_PUBLICATION_UNAVAILABLE'}),/catching up/);
 for(const error of [{cause:{status:429,headers:{'retry-after':'1'}}},new Error('Failed to fetch'),{code:'ENGINE_PUBLICATION_UNAVAILABLE'},{code:'BASE_READ_RATE_LIMIT'}])
  assert.doesNotMatch(poolUserError(error),/monad|publication|synchroni|engine/i);
});
test('session instructions read as plain sign-in steps and other short messages stay legible',()=>{
 assert.equal(poolUserError(new Error('Renew your arcade session')),'Please sign in again to continue.');
 assert.equal(poolUserError(new Error('Renew arcade session')),'Please sign in again to continue.');
 assert.equal(poolUserError(new Error('Use the passkey for this player')),'Sign in with the account that played this match.');
 assert.equal(poolUserError(new Error('Use a browser with arcade session protection')),'Please use an up-to-date browser to play.');
 const message='This account is already controlling an arena in another tab';
 assert.equal(poolUserError(new Error(message)),message);
 assert(!poolUserError(null).includes('undefined'));
});
