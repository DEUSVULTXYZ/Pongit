import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAgentSponsorRuntime} from '../shared/agent-sponsor-runtime';
import type {AgentPoolManifest} from '../shared/agent-pool';
const privateManifest={version:5,enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null} as AgentPoolManifest;
test('private sponsor requires closed public metadata, explicit isolated mode and no invented qualification',()=>{
 assert.deepEqual(validateAgentSponsorRuntime(privateManifest,'isolated-candidate','isolated-candidate',undefined),{public:false});
 for(const patch of [{enabled:true},{tournamentsEnabled:true},{verifiedCapacity:5},{releaseStage:'testnet-preview'},{qualificationEvidence:'0x01'}])
  assert.throws(()=>validateAgentSponsorRuntime({...privateManifest,...patch} as AgentPoolManifest,'isolated-candidate','isolated-candidate',undefined));
 assert.throws(()=>validateAgentSponsorRuntime(privateManifest,'isolated-candidate','reviewed-release',undefined));
 assert.throws(()=>validateAgentSponsorRuntime(privateManifest,'reviewed-release',undefined,undefined));
});
