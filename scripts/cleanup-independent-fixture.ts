// Leave only the disposable accounts from a completed, retained qualification.
// Never concedes, overwrites a journal, or touches an unrelated account.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {encodeFunctionData,type Abi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {publicIndependentManifest,lobbyCommandTypes} from '../shared/independent';
import {independentRules} from '../shared/independent-rules';
import {independentReader} from '../shared/independent-read';
import {lobbyCommandContext} from '../shared/independent-command';
import {keccak256} from 'viem';
import {retryOperatorContention} from '../shared/operator-contention';
assert.equal(process.env.PONG_FIXTURE_CLEANUP,'completed-owned-rooms');
const run=process.env.PONG_EVENTS_RUN!;assert(/^[1-9][0-9]?$/.test(run));
const saved=JSON.parse(await readFile(`/secrets/events-live-${run}.json`,'utf8'));
const report=JSON.parse(await readFile(`artifacts/independent-candidate/events-live-${run}.json`,'utf8'));
assert(report.finishedAt,'Controller is still running');
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
const m=publicIndependentManifest(raw);assert.equal(m.rulesVersion,14);assert.equal(saved.lobby,m.lobby);
const rules=independentRules(m),t=await chainTools('human-fixture-cleanup-'+run),r=independentReader(t.base,m);
const evidence:any={at:new Date().toISOString(),run,actions:[],passed:false};
try{
 for(let i=0;i<4;i++){
  const owner=privateKeyToAccount(saved.players[i].owner),key=privateKeyToAccount(saved.players[i].arcade);
  assert.equal(await r.lobby('activeMatchOf',[owner.address]),0n,'An active match must finish normally');
  const room=await r.lobby('occupancy',[owner.address]);if(!room)continue;
  const grant=await r.family('grantOf',[owner.address]);assert.equal(grant.key.toLowerCase(),key.address.toLowerCase());
  const {hash,nonce,deadline}=await lobbyCommandContext(t.base,m,grant);
  const data=encodeFunctionData({abi:rules.lobby as Abi,functionName:'leaveRoom',args:[]});
  const signature=await key.signTypedData({domain:{name:'PONGIT Independent Lobby',version:'1',chainId:10143,verifyingContract:m.lobby},types:lobbyCommandTypes,primaryType:'LobbyCommand',message:{grantHash:hash,dataHash:keccak256(data),nonce,deadline}});
  const receipt=await retryOperatorContention(()=>t.submit('leave-'+i,encodeFunctionData({abi:rules.lobby,functionName:'relay',args:[owner.address,data,nonce,deadline,signature]}),m.lobby));
  assert.equal(await r.lobby('occupancy',[owner.address]),0n);evidence.actions.push({player:owner.address,room:String(room),hash:receipt.transactionHash});
 }
 evidence.passed=true;
}finally{await writeFile(`artifacts/independent-candidate/cleanup-${run}.json`,JSON.stringify(evidence,null,2));await t.close();}
