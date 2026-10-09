// Read-only identity and canonical delegation evidence for all current public arenas.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPublicClient,keccak256,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {baseReadTransport} from '../shared/base-read-transport';
import {readHubDelegations} from '../shared/rooms-hub';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {publicIndependentManifest} from '../shared/independent';
import {NO_LEASE_HUB} from '../shared/hub-lease';

const out='artifacts/responsive-20261008-r2/current-contracts-57.json';
const json=async(path:string)=>{const response=await fetch('https://pongit.xyz/api/'+path,{signal:AbortSignal.timeout(10000)});assert(response.ok);return response.json();};
const agents=validateAgentPoolManifest(await json('agents/config'));
const human=publicIndependentManifest((await json('independent/config')).manifest);
assert.equal(agents.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
assert.equal(human.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
const arenas=[...agents.arenas.map(a=>({...a,space:'agents'})),...human.arenas.map(a=>({...a,space:'human'}))];
assert.equal(arenas.length,11);assert.equal(new Set(arenas.map(a=>a.app.toLowerCase())).size,11);
const client=createPublicClient({chain:monadTestnet,transport:baseReadTransport('https://pongit.xyz/api/agents/chain-read')});
const block=await client.getBlock();
const delegations=await readHubDelegations(client,agents.hub,arenas.map(a=>a.app as Address),block.number);
const rows=[];
for(let i=0;i<arenas.length;i++){
 const arena=arenas[i],delegation=delegations[i];
 const [code,response]=await Promise.all([client.getCode({address:arena.app,blockNumber:block.number}),fetch(arena.node+'/health',{signal:AbortSignal.timeout(10000)})]);
 assert(response.ok);const health=await response.json();assert(code&&code!=='0x');
 const expectedHash='runtimeHash' in arena?arena.runtimeHash:undefined;
 const row={space:arena.space,app:arena.app,node:arena.node,status:delegation.status,epoch:String(delegation.epoch),expiresAt:String(delegation.expiresAt),baseBlock:String(delegation.baseBlock),
  codeHash:keccak256(code),expectedHash,codeMatches:!!expectedHash&&keccak256(code).toLowerCase()===expectedHash.toLowerCase(),
  nodeMatches:health.app?.toLowerCase()===arena.app.toLowerCase()&&String(health.epoch)===String(delegation.epoch)&&health.chainId===4242,
  healthy:health.ok===true&&health.sendGated===false,committedBatches:health.committedBatches};
 assert(row.status===1&&row.expiresAt==='0'&&row.nodeMatches&&row.healthy);
 if(expectedHash)assert(row.codeMatches);
 rows.push(row);
}
assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash);
const report={passed:true,readOnly:true,at:new Date().toISOString(),hub:agents.hub,block:String(block.number),hash:block.hash,agentRules:agents.rulesVersion,humanRules:human.rulesVersion,arenas:rows};
await writeFile(out,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({out,passed:true,arenas:rows.length,block:report.block,rules:[agents.rulesVersion,human.rulesVersion]}));
