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

test('a public five-lane preview still requires the exact review reference',()=>{
 const evidence=`0x${'c'.repeat(64)}` as const;
 const m:AgentPoolManifest={...privateManifest,enabled:true,releaseStage:'testnet-preview',previewEvidence:evidence};
 assert.deepEqual(validateAgentSponsorRuntime(m,'reviewed-release','reviewed-release',evidence),{public:true});
 assert.throws(()=>validateAgentSponsorRuntime(m,'reviewed-release','reviewed-release',undefined));
 assert.throws(()=>validateAgentSponsorRuntime(m,'reviewed-release','reviewed-release',`0x${'d'.repeat(64)}`));
});
