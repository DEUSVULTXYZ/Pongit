import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateAgentPoolManifest,pooledHouseBots,scheduledTournament,type AgentPoolManifest} from '../shared/agent-pool';
import {type Address} from 'viem';
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
function manifest():AgentPoolManifest{return{version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(11),family:addr(7),
 arenas:[8,9,10].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}`})),enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};}
test('public pool is gated by evidence and remains separate from human apps',()=>{
 const m=manifest();validateAgentPoolManifest(m);assert.throws(()=>validateAgentPoolManifest({...m,enabled:true}),/qualification/);
 assert.throws(()=>validateAgentPoolManifest(m,[addr(8)]),/another space/);
 assert.throws(()=>validateAgentPoolManifest({...m,arenas:[m.arenas[0],m.arenas[0],m.arenas[2]]}),/duplicated/);
 assert.throws(()=>validateAgentPoolManifest({...m,tournamentsEnabled:true}),/closed/);
 assert.throws(()=>validateAgentPoolManifest({...m,arenas:m.arenas.map(a=>({...a,node:'https://user:secret@example.org'}))}),/credential/);
 validateAgentPoolManifest({...m,enabled:true,tournamentsEnabled:true,verifiedCapacity:2,qualificationEvidence:`0x${'b'.repeat(64)}`});
 const contaminated={...m,operatorKey:'private fixture',arenas:m.arenas.map(a=>({...a,rawTransaction:'private fixture'}))};
 const safe=validateAgentPoolManifest(contaminated);assert.equal(JSON.stringify(safe).includes('private fixture'),false);
 assert.throws(()=>validateAgentPoolManifest({...m,enabled:'false'} as unknown as AgentPoolManifest),/boolean/);
});
test('the displayed automatic cycle exactly matches the contract schedule',()=>{
 assert.deepEqual([1n,2n,3n,4n,5n].map(scheduledTournament),[
 {mode:0,format:'elimination'},{mode:1,format:'elimination'},{mode:0,format:'championship'},{mode:1,format:'championship'},{mode:0,format:'elimination'}]);
 assert.throws(()=>scheduledTournament(0n));assert.equal(pooledHouseBots.length,8);assert.equal(new Set(pooledHouseBots.map(x=>x.avatar)).size,8);
});
test('series manifests retain their version, require both common lanes and cannot bypass capacity review',()=>{
 const m={...manifest(),version:3 as const,rulesVersion:11 as const,arenas:manifest().arenas.slice(0,2)};
 assert.equal(validateAgentPoolManifest(m).rulesVersion,11);assert.equal(validateAgentPoolManifest(m).version,3);
 assert.throws(()=>validateAgentPoolManifest({...m,rulesVersion:10}),/Unsupported/);
 assert.throws(()=>validateAgentPoolManifest({...m,version:2}),/Unsupported/);
 assert.throws(()=>validateAgentPoolManifest({...m,enabled:true}),/qualification/);
 assert.throws(()=>validateAgentPoolManifest({...m,challenges:addr(0)}),/Invalid common/);
 assert.throws(()=>validateAgentPoolManifest({...m,arenas:[m.arenas[0]]}),/2 to 16/);
});
