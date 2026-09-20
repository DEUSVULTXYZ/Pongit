// Current pool example. Run only with a dedicated creator key and an already
// deployed immutable strategy. Never use the PONGIT operator or a player's key.
import {mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createPublicClient,createWalletClient,encodeFunctionData,getAddress,http,keccak256,zeroAddress,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createPoolSponsor,preparePoolRegistration,validateAgentPoolManifest,agentMetadata,type PoolSignedCall} from './src';
import {agentCatalogAbi} from '../shared/abi-AgentCatalog';
import {settleCreatorTransaction} from '../shared/creator-transaction';

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const safe=(e:unknown)=>String((e as Error)?.message??'Registration failed').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,180);
async function main(){
 const api=new URL(process.env.AGENT_API??'https://pongit.xyz/api/agents');
 const privateRun=process.env.AGENT_PRIVATE_QUALIFICATION==='isolated-vps'&&/^pongit-series[3-9]-sponsor$/.test(api.hostname)&&api.port==='4102'&&api.pathname==='/agents';
 if(api.username||api.password||api.search||api.hash||api.protocol!=='https:'&&!privateRun)throw Error('Use a credential-free HTTPS PONGIT API');
 const call=async(path:string,body?:PoolSignedCall)=>{
  const r=await fetch(api.href.replace(/\/$/,'')+'/'+path,{method:body?'POST':'GET',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const data=await r.json().catch(()=>null);
  if(!r.ok){const wait=Number(r.headers.get('retry-after'));throw Object.assign(Error(`Agent API HTTP ${r.status}`),{status:r.status,code:data?.code,accepted:data?.accepted,retryMs:Number.isFinite(wait)&&wait>0?Math.min(60000,wait*1000):5000});}
  return data;
 };
 const manifest=validateAgentPoolManifest(await call('config'));
 if(privateRun){if(manifest.pool.toLowerCase()!==process.env.PONG_AGENT_POOL?.toLowerCase())throw Error('Private pool pin differs');}
 else if(!manifest.enabled)throw Error('Public Agent Arcade is closed. No identity or transaction was created.');
 const key=process.env.CREATOR_KEY;if(!key||!/^0x[\da-f]{64}$/i.test(key))throw Error('Set a dedicated CREATOR_KEY in your secret environment');
 const owner=privateKeyToAccount(key as Hex),strategy=getAddress(process.env.STRATEGY??'');
 const modes=Number(process.env.MODES??3);if(![1,2,3].includes(modes))throw Error('MODES must be 1, 2 or 3');
 const name=process.env.AGENT_NAME??'Tracker',avatar=Number(process.env.AGENT_AVATAR??4),metadata=agentMetadata(name,avatar);
 const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
 if(await base.getChainId()!==10143)throw Error('Monad Testnet required');
 const wallet=createWalletClient({account:owner,chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
 const path=resolve(process.env.STRATEGY_STATE??`.agent-state/pool-${manifest.pool.toLowerCase()}-${owner.address.toLowerCase()}.json`);
 mkdirSync(dirname(path),{recursive:true,mode:0o700});let fd:number;
 const lock=resolve(dirname(path),`creator-${owner.address.toLowerCase()}.lock`);
 try{fd=openSync(lock,'wx',0o600);}catch{throw Error('Creator journal is locked. Stop the other writer; inspect a stale lock before removing it.');}
 try{
  type State={pool:string;owner:string;strategy:string;values:Record<string,string>;availability?:{raw:Hex;hash:Hex;nonce:number;value:boolean};history:{hash:Hex;status:string}[]};
  let state:State;
  try{state=JSON.parse(readFileSync(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;state={pool:manifest.pool,owner:owner.address,strategy,values:{},history:[]};}
  if(state.pool!==manifest.pool||state.owner!==owner.address||state.strategy!==strategy)throw Error('Use the journal belonging to this pool, creator and strategy');
  const save=()=>{writeFileSync(path+'.next',JSON.stringify(state),{mode:0o600});renameSync(path+'.next',path);};
  const storage={getItem:(k:string)=>state.values[k]??null,setItem:(k:string,v:string)=>{state.values[k]=v;save();},removeItem:(k:string)=>{delete state.values[k];save();}};
  const sponsor=createPoolSponsor(manifest,owner.address,storage,call);
  const finish=async(prepared?:PoolSignedCall)=>{
   let first=prepared;const until=Date.now()+10*60_000;
   for(;;){
    try{const op=first?await sponsor.send(first):await sponsor.resume();first=undefined;
     if(!op||op.status==='confirmed')return;if(op.status==='failed')throw Error('Registration reverted; inspect the contract state before a new attempt');}
    catch(e){first=undefined;const status=(e as {status?:number}).status;
     if((e as {accepted?:boolean}).accepted===false||status&&status<500&&status!==429)throw e;
     if(!sponsor.pending())throw e;
     if(Date.now()>=until)throw Error('Sponsorship is unresolved. Keep this journal and rerun the same command.');
     await sleep(Number((e as {retryMs?:number}).retryMs??5000));continue;}
    if(Date.now()>=until)throw Error('Sponsorship is unresolved. Keep this journal and rerun the same command.');await sleep(3000);
   }
  };
  // Resolve a prior registration before requesting another signature or nonce.
  await finish();
  const identity=()=>base.readContract({address:manifest.catalog,abi:agentCatalogAbi,functionName:'identity',args:[strategy]});
  let entry=await identity();
  if(entry.creator===zeroAddress){await finish(await preparePoolRegistration(base,manifest,owner,{strategy,name,avatar,modes:modes as 1|2|3}));entry=await identity();}
  if(entry.creator.toLowerCase()!==owner.address.toLowerCase()||entry.metadata!==metadata||entry.modes!==modes||entry.house!==0)throw Error('Existing identity differs from the requested community registration');
  const setting=process.env.AGENT_AVAILABILITY;if(setting!==undefined&&!['on','off'].includes(setting))throw Error('AGENT_AVAILABILITY must be on or off');
  if(state.availability||setting!==undefined&&entry.available!==(setting==='on')){
   if(!state.availability){
    const value=setting==='on';
    await base.simulateContract({account:owner,address:manifest.catalog,abi:agentCatalogAbi,functionName:'setAvailable',args:[strategy,value]});
    if(await base.getTransactionCount({address:owner.address,blockTag:'pending'})!==await base.getTransactionCount({address:owner.address,blockTag:'latest'}))throw Error('Creator has another pending transaction. Resolve it before changing availability.');
    // signTransaction needs encoded calldata, not writeContract ABI arguments.
    const tx=await wallet.prepareTransactionRequest({account:owner,to:manifest.catalog,data:encodeFunctionData({abi:agentCatalogAbi,functionName:'setAvailable',args:[strategy,value]}),value:0n,chain:monadTestnet});
    const raw=await wallet.signTransaction(tx);state.availability={raw,hash:keccak256(raw),nonce:tx.nonce,value};save();
   }
   const pending=state.availability!;
   const receipt=await settleCreatorTransaction(pending,{owner:owner.address,to:manifest.catalog,
    data:encodeFunctionData({abi:agentCatalogAbi,functionName:'setAvailable',args:[strategy,pending.value]})},{
    receipt:hash=>base.getTransactionReceipt({hash}).catch(e=>{if((e as Error).name==='TransactionReceiptNotFoundError')return null;throw e;}),
    nonce:address=>base.getTransactionCount({address}),send:serializedTransaction=>wallet.sendRawTransaction({serializedTransaction}),
    wait:hash=>base.waitForTransactionReceipt({hash,timeout:120000}),
   });
   state.history.push({hash:pending.hash,status:receipt.status});delete state.availability;save();
   if(receipt.status!=='success')throw Error('Availability transaction reverted; inspect its saved receipt');entry=await identity();
   if(entry.available!==pending.value)throw Error('Published availability differs from the confirmed request');
  }
  console.log(JSON.stringify({pool:manifest.pool,strategy,creator:owner.address,available:entry.available,qualifiedMask:entry.qualified,requestedModes:modes,
   note:'Qualification needs published friendly games. This script does not run a bot or award a pass.'}));
 }finally{closeSync(fd);unlinkSync(lock);}
}
main().catch(e=>{console.error(safe(e));process.exitCode=1;});
