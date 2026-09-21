// Leave only the disposable accounts from a completed, retained qualification.
// Never concedes, overwrites a journal, or touches an unrelated account.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,type Abi,type Hex} from 'viem';
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
const publicRelease=process.env.PONG_EVENTS_TARGET==='public-release';
if(publicRelease)assert(report.scope.startsWith('Actual public HTTPS API sponsorship'));
const rules=independentRules(m),t=publicRelease?undefined:await chainTools('human-fixture-cleanup-'+run);
const base=t?.base??createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})}),r=independentReader(base,m);
const journalPath=`/secrets/events-live-${run}.cleanup.json`;
let journal:Record<string,{to:string;data:Hex}>={};
try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if((e as any).code!=='ENOENT')throw e;}
async function publicSubmit(i:number,data:Hex){
 if(!journal[i]){journal[i]={to:m.lobby,data};await writeFile(journalPath+'.next',JSON.stringify(journal),{mode:0o600});await rename(journalPath+'.next',journalPath);}
 async function api(path:string,body?:unknown){const response=await fetch('https://pongit.xyz/api/independent/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});assert(response.ok,`Sponsor HTTP ${response.status}; keep exact journaled intent`);return response.json();}
 let op=await api('transactions',journal[i]);const end=Date.now()+180000;
 while(['queued','pending'].includes(op.status)&&Date.now()<end){await new Promise(resolve=>setTimeout(resolve,1000));op=await api('operations/'+op.id);}
 assert.equal(op.status,'confirmed','Retain unresolved signed command');return{transactionHash:op.hash};
}
const evidence:any={at:new Date().toISOString(),run,actions:[],passed:false};
try{
 for(let i=0;i<4;i++){
  const owner=privateKeyToAccount(saved.players[i].owner),key=privateKeyToAccount(saved.players[i].arcade);
  assert.equal(await r.lobby('activeMatchOf',[owner.address]),0n,'An active match must finish normally');
  const room=await r.lobby('occupancy',[owner.address]);if(!room)continue;
  const grant=await r.family('grantOf',[owner.address]);assert.equal(grant.key.toLowerCase(),key.address.toLowerCase());
  const {hash,nonce,deadline}=await lobbyCommandContext(base,m,grant);
  const data=encodeFunctionData({abi:rules.lobby as Abi,functionName:'leaveRoom',args:[]});
  const signature=await key.signTypedData({domain:{name:'PONGIT Independent Lobby',version:'1',chainId:10143,verifyingContract:m.lobby},types:lobbyCommandTypes,primaryType:'LobbyCommand',message:{grantHash:hash,dataHash:keccak256(data),nonce,deadline}});
  const relay=encodeFunctionData({abi:rules.lobby,functionName:'relay',args:[owner.address,data,nonce,deadline,signature]});
  const receipt=publicRelease?await publicSubmit(i,relay):await retryOperatorContention(()=>t!.submit('leave-'+i,relay,m.lobby));
  assert.equal(await r.lobby('occupancy',[owner.address]),0n);evidence.actions.push({player:owner.address,room:String(room),hash:receipt.transactionHash});
 }
 evidence.passed=true;
}finally{await writeFile(`artifacts/independent-candidate/cleanup-${run}.json`,JSON.stringify(evidence,null,2));await t?.close();}
