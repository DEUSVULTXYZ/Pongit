import {test} from 'node:test';import assert from 'node:assert/strict';
import {agentAvailability,freshArenaState,type AgentCapacity} from '../shared/agent-availability';
const capacity:AgentCapacity={observedAt:100000,known:true,freeChallengeLanes:4,readyArenas:5,admissions:true};
const bot={modeSupported:true,qualified:true,available:true,exclusiveBusy:false};
test('identity compatibility cannot masquerade as available operational capacity',()=>{
 assert.equal(agentAvailability(capacity,bot),'available');
 assert.equal(agentAvailability({...capacity,known:false},bot),'service-unavailable');
 assert.equal(agentAvailability({...capacity,admissions:false},bot),'service-unavailable');
 assert.equal(agentAvailability({...capacity,readyArenas:0},bot),'capacity-occupied');
 assert.equal(agentAvailability({...capacity,freeChallengeLanes:0},bot),'capacity-occupied');
 assert.equal(agentAvailability(capacity,{...bot,exclusiveBusy:true}),'agent-busy');
 assert.equal(agentAvailability(capacity,{...bot,qualified:false}),'qualifying');
 assert.equal(agentAvailability(capacity,{...bot,modeSupported:false}),'incompatible');
});
test('health must belong to the current epoch and a recent non-future observation',()=>{
 const row={app:'arena',epoch:'8',stage:'available',observedAt:100000};
 assert(freshArenaState(row,8n,110000));assert(!freshArenaState(row,9n,110000));
 assert(!freshArenaState(row,8n,115001));assert(!freshArenaState(row,8n,99999));assert(!freshArenaState(undefined,8n,110000));
});
