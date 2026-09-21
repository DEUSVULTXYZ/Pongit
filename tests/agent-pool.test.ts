import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateAgentPoolManifest,pooledHouseBots,scheduledTournament,type AgentPoolManifest} from '../shared/agent-pool';
import {type Address} from 'viem';
import {agentPoolCspOrigins} from '../shared/agent-pool-csp';
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
test('retired authorities preserve their manifest without creating writable slots or leaking journal fields',()=>{
 const m=manifest(),old={...manifest(),pool:addr(20),catalog:addr(21),tournaments:addr(22),ratings:addr(23),challenges:addr(24),qualifications:addr(25),
  arenas:[28,29,30].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}` as const}))};
 const contaminated={...old,privateJournal:'private fixture',arenas:old.arenas.map(a=>({...a,grant:'private fixture'}))};
 const safe=validateAgentPoolManifest({...m,history:[contaminated]});
 assert.equal(safe.arenas.length,3);assert.equal(safe.history?.[0].pool,old.pool);assert(!JSON.stringify(safe).includes('private fixture'));
 assert.throws(()=>validateAgentPoolManifest({...m,history:[{...old,enabled:true}]}),/read-only/);
 assert.throws(()=>validateAgentPoolManifest({...m,history:[{...old,history:[m]}]}),/flat/);
 assert.throws(()=>validateAgentPoolManifest({...m,history:[old,old]}),/Duplicate/);
 assert.throws(()=>validateAgentPoolManifest({...m,history:[{...old,arenas:m.arenas}]}),/Ambiguous/);
 assert.throws(()=>validateAgentPoolManifest({...m,history:[old]},[old.arenas[0].app]),/another space/);
 assert.throws(()=>validateAgentPoolManifest({...m,history:Array(9).fill(old)}),/bounds/);
});
test('explicit testnet preview cannot be mislabeled as completed qualification',()=>{
 const m:AgentPoolManifest={...manifest(),version:4,rulesVersion:15,enabled:true,tournamentsEnabled:true,
  releaseStage:'testnet-preview',previewEvidence:`0x${'c'.repeat(64)}`};
 const safe=validateAgentPoolManifest(m);assert.equal(safe.releaseStage,'testnet-preview');assert.equal(safe.verifiedCapacity,0);assert.equal(safe.qualificationEvidence,null);
 for(const patch of [{previewEvidence:undefined},{previewEvidence:`0x${'0'.repeat(64)}`},{verifiedCapacity:2},{qualificationEvidence:`0x${'b'.repeat(64)}`},{version:3,rulesVersion:11},{releaseStage:undefined}])
  assert.throws(()=>validateAgentPoolManifest({...m,...patch} as AgentPoolManifest));
 assert.throws(()=>validateAgentPoolManifest(m,[m.arenas[0].app]));
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
test('reusable manifests keep a separate generation and cannot call registered arenas verified capacity',()=>{
 const m={...manifest(),version:4 as const,rulesVersion:15 as const,enabled:false,tournamentsEnabled:false,verifiedCapacity:0 as const,qualificationEvidence:null};
 assert.equal(validateAgentPoolManifest(m).version,4);
 assert.throws(()=>validateAgentPoolManifest({...m,enabled:true}),/reviewed capacity/);
 assert.throws(()=>validateAgentPoolManifest({...m,version:3}),/Unsupported/);
 assert.throws(()=>validateAgentPoolManifest({...m,arenas:m.arenas.slice(0,2)}),/3 to 32/);
});

test('the browser policy accepts reusable arenas without widening origins or admission gates',()=>{
 const m={...manifest(),version:4 as const,rulesVersion:15 as const,
  arenas:manifest().arenas.map(a=>({...a,node:`https://il-${a.app.slice(2,18)}.fly.dev`}))};
 const origins=agentPoolCspOrigins(m).split(' ');
 assert.deepEqual(origins,m.arenas.flatMap(a=>[a.node,a.node.replace('https:','wss:')]));
 assert.equal(m.enabled,false);assert.equal(m.verifiedCapacity,0);
 const retired={...m,pool:addr(20),catalog:addr(21),tournaments:addr(22),ratings:addr(23),challenges:addr(24),qualifications:addr(25),
  arenas:[28,29,30].map(n=>({app:addr(n),node:`https://il-${addr(n).slice(2,18)}.fly.dev`,runtimeHash:`0x${'d'.repeat(64)}` as const}))};
 assert.equal(agentPoolCspOrigins({...m,history:[retired]}),agentPoolCspOrigins(m),'retired history never adds engine origins');
 for(const node of ["https://il-123.fly.dev; connect-src *",'https://il-123.fly.dev.evil.test','https://user:password@il-123.fly.dev','http://il-123.fly.dev'])
  assert.throws(()=>agentPoolCspOrigins({...m,arenas:m.arenas.map(a=>({...a,node}))}));
 assert.throws(()=>agentPoolCspOrigins({...m,rulesVersion:11}));
 assert.throws(()=>agentPoolCspOrigins({...m,enabled:true}));
 for(const [version,rulesVersion] of [[2,10],[3,11]])assert(agentPoolCspOrigins({...m,version,rulesVersion}).includes('wss://'));
});
