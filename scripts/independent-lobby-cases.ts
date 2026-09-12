import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,keccak256,maxUint256,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {abi as lobbyAbi} from '../shared/abi-independent-IndependentLobby';
assert.equal(process.env.PONG_INDEPENDENT_WRITE,'authorized-testnet');
const source=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));assert.equal(source.production,false);
const m=publicIndependentManifest(source),base=createPublicClient({transport:http(process.env.RPC_URL,{timeout:10000,retryCount:0})}),r=independentReader(base,m);
const secret='/secrets/independent-lobby-cases-v2.json';let state:any;
try{state=JSON.parse(await readFile(secret,'utf8'));assert.equal(state.lobby,m.lobby);}catch(e){if((e as any).code!=='ENOENT')throw e;state={lobby:m.lobby,roots:[generatePrivateKey(),generatePrivateKey()],keys:[generatePrivateKey(),generatePrivateKey()],operations:{},completed:0,checks:[]};}
const roots=state.roots.map(privateKeyToAccount),keys=state.keys.map(privateKeyToAccount),wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const save=async()=>{await writeFile(secret+'.next',JSON.stringify(state),{mode:0o600});await rename(secret+'.next',secret);};await save();
const request=async(path:string,body?:unknown)=>{const response=await fetch('http://independent-service:4012/independent/'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});const value=await response.json() as any;if(!response.ok)throw Error(`Sponsored API ${response.status}: ${value.code}, ${value.requestId}`);return value;};
async function sponsored(label:string,prepare:()=>Promise<{to:string;data:Hex}>){
 let saved=state.operations[label];if(!saved){saved=state.operations[label]=await prepare();await save();}
 let [op,duplicate]=await Promise.all([request('transactions',saved),request('transactions',saved)]);assert.equal(op.id,duplicate.id,'Duplicate request allocated a second operation');
 const deadline=Date.now()+90000;while(['queued','pending'].includes(op.status)&&Date.now()<deadline){await wait(750);op=await request('operations/'+op.id);}
 assert.equal(op.status,'confirmed',`Operation ${label} ${op.status}`);saved.hash=op.hash;await save();return op;
}
async function command(player:number,label:string,method:string,args:readonly unknown[]=[]){
 return sponsored(label,async()=>{const grant=await r.family('grantOf',[roots[player].address]),hash=await r.family('grantDigest',[grant]);assert.equal(grant.key.toLowerCase(),keys[player].address.toLowerCase());
  const data=encodeFunctionData({abi:lobbyAbi,functionName:method as any,args:args as any}),nonce=await r.lobby('commandNonces',[hash]),deadline=(await base.getBlock()).timestamp+120n;
  const digest=await r.lobby('commandDigest',[hash,data,nonce,deadline]),signature=await keys[player].sign({hash:digest});
  return {to:m.lobby,data:encodeFunctionData({abi:lobbyAbi,functionName:'relay',args:[roots[player].address,data,nonce,deadline,signature]})};
 });
}
const report:any={at:new Date().toISOString(),lobby:m.lobby,checks:state.checks,completed:state.completed};
try{
 for(let i=0;i<2;i++)await sponsored(`grant-${i}`,async()=>{const now=(await base.getBlock()).timestamp,g={player:roots[i].address,key:keys[i].address,issuedAt:now,expires:now+7200n,revision:await r.family('revisions',[roots[i].address])};const signature=await roots[i].sign({hash:await r.family('grantDigest',[g])});return {to:m.family,data:encodeFunctionData({abi:familyAbi,functionName:'register',args:[g,signature]})};});
 for(let cycle=state.completed;cycle<20;cycle++){
  for(let i=0;i<2;i++)await command(i,`${cycle}-queue-${i}`,'queue',[cycle%2]);
  let room=0n;const until=Date.now()+60000;
  while(Date.now()<until){const value=await r.lobby('occupancy',[roots[0].address]);if(value&&value!==maxUint256){room=value;break;}await wait(1000);}
  if(!room){for(let i=0;i<2;i++)await command(i,`${cycle}-cancel-${i}`,'cancelQueue');throw Error('No proposal slot available; queue cancellation passed, full matchmaking cycle remains unqualified');}
  let proposal=await r.lobby('proposal',[(await r.lobby('room',[room])).proposal]);assert.equal(proposal.status,1);
  if(cycle%5===4){
   while((await base.getBlock()).timestamp<=proposal.expires)await wait(1000);
   await sponsored(`${cycle}-expire`,async()=>({to:m.lobby,data:encodeFunctionData({abi:lobbyAbi,functionName:'expireProposal',args:[proposal.id]})}));
  }else await command(0,`${cycle}-decline`,'declineProposal',[proposal.id]);
  for(let i=0;i<2;i++){await command(i,`${cycle}-leave-${i}`,'leaveRoom');assert.equal(await r.lobby('occupancy',[roots[i].address]),0n);assert.equal(await r.lobby('activeMatchOf',[roots[i].address]),0n);}
  state.completed=cycle+1;state.checks.push({cycle:cycle+1,mode:cycle%2,kind:cycle%5===4?'expiry':'decline',duplicateRequests:true,participationReleased:true});await save();console.log(JSON.stringify(state.checks.at(-1)));
 }
 report.passed=true;
}catch(e){report.passed=false;report.error=(e as Error).message.split('\n')[0].replace(/0x[\da-f]{130,}/gi,'[signed data omitted]');process.exitCode=1;}
finally{report.completed=state.completed;report.finishedAt=new Date().toISOString();await mkdir('artifacts/independent-candidate',{recursive:true});await writeFile('artifacts/independent-candidate/lobby-cases.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,completed:report.completed,error:report.error}));}
