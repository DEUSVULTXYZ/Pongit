import {createPublicClient,createWalletClient,http,encodeFunctionData,encodeAbiParameters,keccak256,isAddress,zeroAddress,type Address,type Hex,type Abi} from 'viem';
import {monadTestnet} from 'viem/chains';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {createInterludeClient,webStorageStore} from '@interludelayer-sdk/sdk';
import {API} from './api';
import {connect,rememberedAccount,type Identity} from './wallet';
import {RoomsCommandJournal} from './rooms-command-journal';
import {EngineFeed} from '../../shared/engine-feed';
import {EngineStream} from '../../shared/engine-stream';
import {engineTransport,engineCooldownMs} from '../../shared/engine-transport';
import {readHubDelegation} from '../../shared/rooms-hub';
import {measuredFetch,takeRpcSamples} from '../../shared/rpc-metrics';
import {independentReader} from '../../shared/independent-read';
import {familyGrantTypes,lobbyCommandTypes,ownerWriteTypes,independentDiagnosticsMessage,type FamilyGrant,type IndependentManifest,type ChainOperation} from '../../shared/independent';
import {abi as familyAbi} from '../../shared/abi-independent-ArcadeFamily';
import {abi as lobbyAbi} from '../../shared/abi-independent-IndependentLobby';
import {abi as arenaAbi} from '../../shared/abi-independent-IndependentArena';
import {abi as profileAbi} from '../../shared/abi-independent-ProfileRegistry';

const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
export const independentBase=()=>createPublicClient({chain:monadTestnet,batch:{multicall:{wait:10,batchSize:16384}},transport:http('https://testnet-rpc.monad.xyz',{timeout:8000,retryCount:0,fetchFn:measuredFetch('monad')})});
export async function independentApi<T=any>(path:string,body?:unknown):Promise<T>{
 const response=await measuredFetch('pongit')(API+'/independent/'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},...(body===undefined?{}:{body:json(body)}),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Game services are temporarily unavailable'),result,{status:response.status});return result;
}
export type FamilySession={grant:FamilyGrant;key:Hex;signature:Hex};
export async function reportIndependentDiagnostics(m:IndependentManifest,s:FamilySession,instance:string){
 const samples=takeRpcSamples().filter(v=>Date.now()-v.at<120000);if(!samples.length)return;
 const expires=Math.floor(Date.now()/1000)+60,digest=keccak256(new TextEncoder().encode(JSON.stringify(samples)));
 const signature=await privateKeyToAccount(s.key).signMessage({message:independentDiagnosticsMessage(m.family,s.grant.player,instance,expires,digest)});
 await independentApi('diagnostics',{player:s.grant.player,instance,expires,samples,signature});
}
const sessionKey=(m:IndependentManifest)=>`pongit:family:${m.family.toLowerCase()}`;
const pendingKey=(m:IndependentManifest)=>sessionKey(m)+':operation';
export class SponsorPending extends Error{constructor(){super('Waiting for the sponsored transaction. Your action is saved; reconnecting your passkey is not necessary.');}}
export function loadFamily(m:IndependentManifest):FamilySession|null{
 try{
  const s=JSON.parse(sessionStorage.getItem(sessionKey(m))||'null');if(!s)return null;
  if(!isAddress(s.grant?.player)||!/^0x[\da-f]{64}$/i.test(s.key)||privateKeyToAccount(s.key).address.toLowerCase()!==s.grant.key.toLowerCase())return null;
  const remembered=rememberedAccount();if(remembered&&remembered.address.toLowerCase()!==s.grant.player.toLowerCase())return null;
  return {...s,grant:{...s.grant,issuedAt:BigInt(s.grant.issuedAt),expires:BigInt(s.grant.expires),revision:BigInt(s.grant.revision)}};
 }catch{return null;}
}
export function forgetFamily(m:IndependentManifest){sessionStorage.removeItem(sessionKey(m));sessionStorage.removeItem(pendingKey(m));}
export function eraseFamilyLocal(m:IndependentManifest){
 const keys=Array.from({length:sessionStorage.length},(_,i)=>sessionStorage.key(i)!);
 for(const key of keys)if(m.arenas.some(a=>key.toLowerCase().includes(a.app.toLowerCase())))sessionStorage.removeItem(key);
 forgetFamily(m);
}
export async function validateFamily(m:IndependentManifest,s:FamilySession){
 const r=independentReader(independentBase(),m),g=await r.family('grantOf',[s.grant.player]);
 return g.key.toLowerCase()===s.grant.key.toLowerCase()&&g.expires===s.grant.expires&&g.revision===s.grant.revision&&g.issuedAt===s.grant.issuedAt;
}
export async function sponsorCall(m:IndependentManifest,to:Address,data:Hex,onProgress?:(op:ChainOperation)=>void){
 const pending={to,data,id:keccak256(encodeAbiParameters([{type:'address'},{type:'bytes'},{type:'uint256'},{type:'string'}],[to,data,0n,'']))};
 const old=sessionStorage.getItem(pendingKey(m));
 if(old&&JSON.parse(old).id!==pending.id)throw new SponsorPending();
 // Includes only the limited gameplay grant or owner-signed action, never wallet key material.
 sessionStorage.setItem(pendingKey(m),json(pending));
 let op:ChainOperation;
 try{op=await independentApi<ChainOperation>('transactions',{to,data});}
 catch(e){if((e as any).accepted===false)sessionStorage.removeItem(pendingKey(m));throw e;}
 onProgress?.(op);
 const until=Date.now()+45000;
 while(op.status==='queued'||op.status==='pending'){
  if(Date.now()>until)throw new SponsorPending();
  await new Promise(r=>setTimeout(r,750));op=await independentApi<ChainOperation>(`operations/${op.id}`);onProgress?.(op);
 }
 sessionStorage.removeItem(pendingKey(m));
 if(op.status==='failed')throw Error(op.error||'This action reverted. Reload before retrying.');return op;
}
export async function resumeSponsored(m:IndependentManifest,onProgress?:(op:ChainOperation)=>void){
 const saved=sessionStorage.getItem(pendingKey(m));if(!saved)return;const p=JSON.parse(saved);
 return sponsorCall(m,p.to,p.data,onProgress);
}
export async function openFamily(m:IndependentManifest,identity:Identity,onProgress?:(op:ChainOperation)=>void):Promise<FamilySession>{
 await resumeSponsored(m,onProgress);
 const existing=loadFamily(m);if(existing&&existing.grant.player.toLowerCase()===identity.account.address.toLowerCase()&&await validateFamily(m,existing))return existing;
 const base=independentBase(),r=independentReader(base,m),block=await base.getBlock();
 const key=generatePrivateKey(),grant:FamilyGrant={player:identity.account.address,key:privateKeyToAccount(key).address,issuedAt:block.timestamp,expires:block.timestamp+7200n,revision:await r.family('revisions',[identity.account.address])};
 const signature=await identity.account.signTypedData({domain:{name:'PONGIT Arcade Family',version:'1',chainId:10143,verifyingContract:m.family},types:familyGrantTypes,primaryType:'ArcadeFamilyGrant',message:grant});
 const s={key,grant,signature};sessionStorage.setItem(sessionKey(m),json(s));
 await sponsorCall(m,m.family,encodeFunctionData({abi:familyAbi,functionName:'register',args:[grant,signature]}),onProgress);return s;
}
/** Root consent renews the current arena too; no extra passkey ceremony between matches. */
export async function renewIndependentControl(m:IndependentManifest,identity:Identity,s:FamilySession){
 const r=independentReader(independentBase(),m),player=identity.account.address;
 if(player.toLowerCase()!==s.grant.player.toLowerCase())throw Error('Account changed during renewal');
 const id=await r.lobby('activeMatchOf',[player]);if(!id)return;
 const app=await r.lobby('arenaOf',[id]);if(app===zeroAddress)return;
 const b=await r.arena(app,'boundMatch');if(b.id!==id||!b.epoch)return;
 const d=await readHubDelegation(independentBase(),m.hub,app);if(d.status!==1)return;
 const engine=createIndependentArena(m,app);
 const storage=`pongit:arena-permission:${app.toLowerCase()}:${player.toLowerCase()}`;
 const previous=sessionStorage.getItem(storage);
 if(previous){
  const pending=JSON.parse(previous);
  if(pending.epoch===String(b.epoch)&&pending.key.toLowerCase()===s.grant.key.toLowerCase()){
   await independentApi('arena-command',{app,data:pending.data});sessionStorage.removeItem(storage);return;
  }
  sessionStorage.removeItem(storage);
 }
 const revision=await engine.client.read('authorizationRevision',[player]) as bigint,clock=(await engine.client.node.getBlock()).timestamp;
 const deadline=clock+120n<s.grant.expires?clock+120n:s.grant.expires;
 const renewal={player,key:s.grant.key,epoch:b.epoch,matchId:b.id,revision,expires:s.grant.expires,deadline};
 const signature=await identity.account.signTypedData({domain:{name:'PONGIT Arena Revocation',version:'1',chainId:10143,verifyingContract:app},types:{RenewArena:[{name:'player',type:'address'},{name:'key',type:'address'},{name:'epoch',type:'uint256'},{name:'matchId',type:'uint256'},{name:'revision',type:'uint256'},{name:'expires',type:'uint64'},{name:'deadline',type:'uint64'}]},primaryType:'RenewArena',message:renewal});
 const data=encodeFunctionData({abi:arenaAbi,functionName:'renewActive',args:[renewal,signature]});
 sessionStorage.setItem(storage,json({epoch:String(b.epoch),key:s.grant.key,data}));
 await independentApi('arena-command',{app,data});sessionStorage.removeItem(storage);
}
export async function lobbyCommand(m:IndependentManifest,s:FamilySession,name:string,args:readonly unknown[]=[],onProgress?:(op:ChainOperation)=>void){
 await resumeSponsored(m,onProgress);
 if(!await validateFamily(m,s))throw Error('Renew arcade session');
 const base=independentBase(),r=independentReader(base,m),hash=await r.family('grantDigest',[s.grant]) as Hex;
 const nonce=await r.lobby('commandNonces',[hash]),block=await base.getBlock();
 const deadline=block.timestamp+120n<s.grant.expires?block.timestamp+120n:s.grant.expires;
 const data=encodeFunctionData({abi:lobbyAbi as Abi,functionName:name,args});
 const signature=await privateKeyToAccount(s.key).signTypedData({domain:{name:'PONGIT Independent Lobby',version:'1',chainId:10143,verifyingContract:m.lobby},types:lobbyCommandTypes,primaryType:'LobbyCommand',message:{grantHash:hash,dataHash:keccak256(data),nonce,deadline}});
 return sponsorCall(m,m.lobby,encodeFunctionData({abi:lobbyAbi,functionName:'relay',args:[s.grant.player,data,nonce,deadline,signature]}),onProgress);
}
export async function withOwner<T>(player:Address,fn:(identity:Identity)=>Promise<T>){
 const identity=await connect();try{if(identity.account.address.toLowerCase()!==player.toLowerCase())throw Error('Use the passkey for the connected account.');return await fn(identity);}finally{identity.end();}
}
export async function saveIndependentProfile(m:IndependentManifest,player:Address,name:string,avatar:number){
 if(!/^[a-z][a-z0-9_]{2,19}$/i.test(name))throw Error('Use 3 to 20 letters, numbers or underscores, starting with a letter.');
 await resumeSponsored(m);
 return withOwner(player,async identity=>{
  const base=independentBase(),r=independentReader(base,m),nonce=await r.profiles('writeNonces',[player]),deadline=(await base.getBlock()).timestamp+120n;
  const selector=encodeFunctionData({abi:profileAbi,functionName:'save',args:[player,name,avatar,nonce,deadline,'0x']}).slice(0,10) as Hex;
  const action=keccak256(encodeAbiParameters([{type:'bytes4'},{type:'string'},{type:'uint8'}],[selector,name,avatar]));
  const signature=await identity.account.signTypedData({domain:{name:'PONGIT Profiles',version:'1',chainId:10143,verifyingContract:m.profiles},types:ownerWriteTypes,primaryType:'OwnerWrite',message:{player,action,nonce,deadline}});
  return sponsorCall(m,m.profiles,encodeFunctionData({abi:profileAbi,functionName:'save',args:[player,name,avatar,nonce,deadline,signature]}));
 });
}
export async function disconnectFamily(m:IndependentManifest,s:FamilySession,active?:{app:Address;binding:any}){
 await resumeSponsored(m);
 return withOwner(s.grant.player,async identity=>{
  const base=independentBase(),r=independentReader(base,m),player=s.grant.player,nonce=await r.family('writeNonces',[player]),revision=await r.family('revisions',[player]),deadline=(await base.getBlock()).timestamp+120n;
  const selector=encodeFunctionData({abi:familyAbi,functionName:'revoke',args:[player,nonce,deadline,'0x']}).slice(0,10) as Hex;
  const action=keccak256(encodeAbiParameters([{type:'bytes4'},{type:'uint256'}],[selector,revision]));
  const signature=await identity.account.signTypedData({domain:{name:'PONGIT Arcade Family',version:'1',chainId:10143,verifyingContract:m.family},types:ownerWriteTypes,primaryType:'OwnerWrite',message:{player,action,nonce,deadline}});
  let activeError=false;
  try{
   if(active){
    const engine=createIndependentArena(m,active.app),rev=await engine.client.read('authorizationRevision',[player]) as bigint;
    const signature=await identity.account.signTypedData({domain:{name:'PONGIT Arena Revocation',version:'1',chainId:10143,verifyingContract:active.app},types:{RevokeArena:[{name:'player',type:'address'},{name:'epoch',type:'uint256'},{name:'matchId',type:'uint256'},{name:'revision',type:'uint256'},{name:'deadline',type:'uint64'}]},primaryType:'RevokeArena',message:{player,epoch:active.binding.epoch,matchId:active.binding.id,revision:rev,deadline}});
    await independentApi('arena-command',{app:active.app,data:encodeFunctionData({abi:arenaAbi,functionName:'revokeActive',args:[player,deadline,signature]})});
   }
  }catch{activeError=true;}
  try{await sponsorCall(m,m.family,encodeFunctionData({abi:familyAbi,functionName:'revoke',args:[player,nonce,deadline,signature]}));}
  catch{activeError=true;}
  finally{
   // Clear every SDK child grant for this family as well as the limited family key.
   eraseFamilyLocal(m);
  }
  return {revocationPending:activeError};
 });
}
export function createIndependentArena(m:IndependentManifest,app:Address){
 const entry=m.arenas.find(a=>a.app.toLowerCase()===app.toLowerCase());if(!entry?.node)throw Error('Unknown arena');
 const journal=new RoomsCommandJournal(sessionStorage,app,arenaAbi as Abi);
 const client=createInterludeClient({app,abi:arenaAbi as Abi,node:entry.node,base:independentBase(),store:webStorageStore(sessionStorage),expirySeconds:7200,transport:engineTransport(entry.node,journal),fastPath:true});
 const feed=new EngineFeed(client,new EngineStream(entry.node,app,undefined,()=>engineCooldownMs(entry.node!)));
 return {client,feed,journal,async session(s:FamilySession){
  const d=await readHubDelegation(client.base,m.hub,app);if(d.status!==1||Number(d.expiresAt)*1000<=Date.now())throw Error('This arena is recovering. Your arcade authorization is unchanged.');
  const node=await client.status();if(BigInt(node.epoch)!==d.epoch)throw Error('Waiting for the current arena epoch');
  journal.retirePrevious(s.grant.key,d.epoch);
  const pending=journal.pending(s.grant.key);if(pending){
   if(pending.epoch!==String(d.epoch))throw Error('A previous arena command is still being reconciled');
   const receipt=await client.node.getTransactionReceipt({hash:pending.hash}).catch(()=>null);
   if(!receipt)await client.node.request({method:'interlude_sendTransaction',params:[pending.raw]} as any);
   if(journal.pending(s.grant.key))throw Error('Waiting for confirmation of the previous game command');
  }
  const expires=Number(s.grant.expires)-Math.floor(Date.now()/1000);if(expires<=0)throw Error('Renew arcade session');
  return client.openSession({wallet:createWalletClient({account:privateKeyToAccount(s.key),chain:monadTestnet,transport:http()}),scope:['input','tick','concede'],expirySeconds:Math.min(7200,expires),assertDigest:true});
 }};
}
