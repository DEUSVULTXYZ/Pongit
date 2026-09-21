// Explicitly leave only accounts retained by a completed public browser trial.
// Uses their limited arcade key and the production sponsor, never an operator.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,keccak256,type Hex} from 'viem';
import {monadTestnet} from 'viem/chains';
import {privateKeyToAccount} from 'viem/accounts';
import {independentReader} from '../shared/independent-read';
import {lobbyCommandContext} from '../shared/independent-command';
import {independentRules} from '../shared/independent-rules';
import {lobbyCommandTypes,publicIndependentManifest} from '../shared/independent';

assert.equal(process.env.PONG_BROWSER_CLEANUP,'completed-owned-rooms');
const run=process.env.INDEPENDENT_TEST_RUN!;assert(/^public(?:edge|chrome)[1-9][0-9]?$/.test(run));
const chaos=process.env.INDEPENDENT_SCENARIO==='chaos';
const suffix=`${chaos?'-chaos':''}-${run}`;
const path=`/secrets/independent-browser-v2${suffix}.json`;
const saved=JSON.parse(await readFile(path,'utf8'));
const report=JSON.parse(await readFile(`artifacts/independent-candidate/browser${suffix}/report.json`,'utf8'));
assert(report.finishedAt,'Browser still running');assert(report.target.startsWith('Public HTTPS'));
const m=publicIndependentManifest(JSON.parse(await readFile('deployments/independent.json','utf8')));
assert.equal(saved.lobby,m.lobby);assert.equal(m.rulesVersion,14);
const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{timeout:10000,retryCount:0})});
const r=independentReader(base,m),abi=independentRules(m).lobby;
const evidence:any={startedAt:new Date().toISOString(),run,actions:[],passed:false};
const journalPath=path+'.cleanup';let journal:Record<string,{to:string;data:Hex}>={};
try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if((e as any).code!=='ENOENT')throw e;}
const persist=async()=>{await writeFile(journalPath+'.next',JSON.stringify(journal),{mode:0o600});await rename(journalPath+'.next',journalPath);};
async function api(path:string,body?:unknown){
 const response=await fetch('https://pongit.xyz/api/independent/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 assert(response.ok,`Sponsor response ${response.status}; retained command must be reconciled`);return response.json();
}
try{
 for(const p of saved.players){
  assert.equal(await r.lobby('activeMatchOf',[p.address]),0n,'Never concede an active fixture');
  const room=await r.lobby('occupancy',[p.address]);if(!room)continue;
  const session=JSON.parse(p.session[`pongit:family:${m.family.toLowerCase()}`]);
  const key=privateKeyToAccount(session.key),grant=await r.family('grantOf',[p.address]);
  assert.equal(grant.player.toLowerCase(),p.address.toLowerCase());assert.equal(grant.key.toLowerCase(),key.address.toLowerCase());
  if(!journal[p.address]){
   const {hash,nonce,deadline}=await lobbyCommandContext(base,m,grant);
   const data=encodeFunctionData({abi,functionName:'leaveRoom'});
   const signature=await key.signTypedData({domain:{name:'PONGIT Independent Lobby',version:'1',chainId:10143,verifyingContract:m.lobby},types:lobbyCommandTypes,primaryType:'LobbyCommand',message:{grantHash:hash,dataHash:keccak256(data),nonce,deadline}});
   journal[p.address]={to:m.lobby,data:encodeFunctionData({abi,functionName:'relay',args:[p.address,data,nonce,deadline,signature]})};await persist();
  }
  let op=await api('transactions',journal[p.address]);const end=Date.now()+180000;
  while(['queued','pending'].includes(op.status)&&Date.now()<end){await new Promise(resolve=>setTimeout(resolve,1000));op=await api('operations/'+op.id);}
  assert.equal(op.status,'confirmed','Keep uncertain command unchanged');assert.equal(await r.lobby('occupancy',[p.address]),0n);
  evidence.actions.push({player:p.address,room:String(room),hash:op.hash});
 }
 evidence.passed=true;
}catch(e){evidence.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,250);process.exitCode=1;}
finally{evidence.finishedAt=new Date().toISOString();await writeFile(`artifacts/independent-candidate/cleanup-browser${suffix}.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));}
