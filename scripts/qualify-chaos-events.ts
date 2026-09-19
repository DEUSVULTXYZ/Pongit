// Isolated rules-8 qualification on the hosted node and Monad Testnet.
// It never edits a production manifest, database row or player balance.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,encodeAbiParameters,keccak256,toHex,toFunctionSelector,zeroAddress,zeroHash,parseAbiItem,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {DrandBeaconTransport} from '../shared/drand-beacon';
import {readEngineSnapshot} from '../shared/engine-snapshot';
import {engineState} from '../shared/engine-stream';
assert.equal(process.env.PONG_CHAOS_QUALIFY,'isolated-hosted-testnet');
const mode=process.argv[2];assert(['provision','exercise'].includes(mode));
const prefix=process.env.PONG_CHAOS_QUALIFY_ID;assert(prefix,'Set a new isolated qualification ID');
assert(/^chaos-events-[a-z0-9-]{1,60}$/.test(prefix));
const path=`/secrets/${prefix}.json`;
let r:any;try{r=JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(path+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(path+'.next',path);};
if(!r){r={keys:Array.from({length:11},()=>generatePrivateKey()),transactions:{},modules:{},createdAt:new Date().toISOString()};await save();}
const keys=r.keys.map((key:Hex)=>privateKeyToAccount(key)),hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address;
const artifact=JSON.parse(await readFile('contracts/out/PongChaosEvents.sol/PongChaosEvents.json','utf8'));
const t=await chainTools(prefix);
const safe=(e:any)=>String(e.shortMessage||e.details||e.message||e).split('Request body')[0].replace(/0x[\da-f]{130,}/gi,'[hex omitted]').slice(0,1400);
await mkdir('artifacts/drand',{recursive:true});
const reportPath='artifacts/drand/chaos-hosted.json';let report:any={startedAt:new Date().toISOString(),app:r.app,node:r.node,mode,passed:false,commands:[]};
if(mode==='exercise')try{const prior=JSON.parse(await readFile(reportPath,'utf8'));if(prior.app===r.app&&prior.mode==='exercise')report={...prior,passed:false,resumedAt:new Date().toISOString()};}catch{/* First exercise. */}
const flush=()=>writeFile(reportPath,JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));
try{
 if(mode==='provision'){
  // Every deployment is reconciled through the one operator nonce journal.
  for(const [name,args] of [
   ['ChaosEffects',[]],['ChaosModifiers',[]],['ChaosRally',[]],['ChaosDynamics',['ChaosEffects','ChaosModifiers']],
   ['ChaosContacts',['ChaosDynamics']],['ChaosPhysics',['ChaosEffects','ChaosRally','ChaosDynamics','ChaosContacts']],
   ['ChaosCodec',[]],['DrandEvmnet',[]],['ChaosDrawRules',[]],['ChaosEngine',['ChaosCodec','ChaosPhysics','DrandEvmnet','ChaosDrawRules']],
  ] as const){r.modules[name]=await t.deploy(name,args.map(n=>r.modules[n]));await save();}
  const instance=process.env.PONG_CHAOS_REPLAY_ROOT==='1'?'PongChaosEventsReplay':undefined;
  const nextApp=await t.deploy('PongChaosEvents',[hub,keys[4].address,keys[5].address,t.account.address,zeroAddress,r.modules.ChaosEngine],instance);
  if(r.app&&r.app!==nextApp){assert(!r.node,'An active qualification must be closed before replacement');assert.equal((await readHubDelegation(t.base,hub,r.app)).status,0);r.supersededApps=[...(r.supersededApps||[]),r.app];}
  r.app=nextApp;report.app=nextApp;await save();
  const before=await readHubDelegation(t.base,hub,r.app);
  if(before.status===0)await t.write('open-candidate',r.app,artifact.abi,'renewEngine');
  const opened=await readHubDelegation(t.base,hub,r.app);assert.equal(opened.status,1);assert.equal(opened.epoch,1n);r.epoch='1';await save();
  const lookup=await fetch(`https://control.interludelayer.xyz/sessions/${r.app}`,{signal:AbortSignal.timeout(15000)});let session:any=await lookup.json();
  if(lookup.status===404){
   assert(!r.nodeRequestAt,'Inspect uncertain hosted creation before another request');r.nodeRequestAt=new Date().toISOString();await save();
   const response=await fetch('https://control.interludelayer.xyz/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app:r.app}),signal:AbortSignal.timeout(60000)});
   session=await response.json();r.nodeHttp=response.status;await save();assert(response.ok,`Hosted creation HTTP ${response.status}`);
  }else assert(lookup.ok);
  r.node=session.url||session.node;assert(r.node?.startsWith('https://'));r.state='provisioned';await save();
  report={...report,app:r.app,node:r.node,modules:r.modules,rootRuntimeBytes:(artifact.deployedBytecode.object.length-2)/2,epoch:r.epoch,passed:true};
 }else{
  assert(r.app&&r.node);const node=createPublicClient({transport:http(r.node,{retryCount:0,timeout:12000})});
  assert.equal(await node.getChainId(),4242);assert.equal(await node.readContract({address:r.app,abi:artifact.abi,functionName:'RULES_VERSION'}),8n);
  const baseStart=r.baseStart??String(await t.base.getBlockNumber());r.baseStart=baseStart;await save();
  const read=async(id:bigint)=>engineState(await readEngineSnapshot({app:r.app,abi:artifact.abi,node:node as any},id));
  async function send(op:string,index:number,name:string,args:readonly unknown[]=[]){
   let tx=r.transactions[op];const signer=keys[index];
   if(!tx){
    const unresolved=Object.values(r.transactions).filter((x:any)=>x.address===signer.address&&x.state!=='confirmed');assert.equal(unresolved.length,0,'Reconcile this signer before another command');
    const nonce=await node.getTransactionCount({address:signer.address,blockTag:'pending'});
    assert.equal(nonce,await node.getTransactionCount({address:signer.address,blockTag:'latest'}));
    const data=encodeFunctionData({abi:artifact.abi,functionName:name,args});
    const raw=await signer.signTransaction({chainId:4242,type:'eip1559',to:r.app,data,nonce,gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n,value:0n});
    tx=r.transactions[op]={raw,hash:keccak256(raw),address:signer.address,nonce,name,state:'prepared'};await save();
   }
   if(tx.state==='confirmed')return;
   const at=performance.now();let receipt:any=await node.getTransactionReceipt({hash:tx.hash}).catch(()=>null);
   if(!receipt){tx.state='sending';await save();try{receipt=await node.request({method:'interlude_sendTransaction',params:[tx.raw]} as any);}
    catch(e){tx.state='uncertain';tx.error=safe(e);await save();throw e;}}
   assert.equal(receipt.transactionHash.toLowerCase(),tx.hash.toLowerCase());
   tx.state=['success','0x1'].includes(receipt.status)?'confirmed':'reverted';tx.gasUsed=String(receipt.gasUsed);await save();
   assert.equal(tx.state,'confirmed',`Candidate ${name} reverted`);
   report.commands.push({name,hash:tx.hash,ms:performance.now()-at,bytes:(tx.raw.length-2)/2,gasUsed:tx.gasUsed,logs:receipt.logs.length});await flush();
  }
  const selectors=['acceptMatch','input','tick','cancelMatch','concede'].map(name=>{
   const f=artifact.abi.find((x:any)=>x.type==='function'&&x.name===name);
   // viem computes tuple signatures, including the existing admission offer.
   return toFunctionSelector(f);
  });
  const grantInputs=[{type:'tuple',components:[{name:'granter',type:'address'},{name:'sessionKey',type:'address'},{name:'expiry',type:'uint64'},{name:'epoch',type:'uint64'},{name:'anyFunction',type:'bool'},{name:'selectors',type:'bytes4[]'}]},{type:'bytes'}] as const;
  for(let i=0;i<4;i++){
   // Fresh scoped controls use a separate random key from their wallet identity.
   r.grants??={};if(!r.grants[i]){
    const now=(await node.getBlock()).timestamp;const g={granter:keys[i].address,sessionKey:keys[7+i].address,expiry:now+3600n,epoch:0n,anyFunction:false,selectors};
    const hash=await node.readContract({address:r.app,abi:artifact.abi,functionName:'sessionDigest',args:[g]}) as Hex;
    r.grants[i]=encodeAbiParameters(grantInputs,[g,await keys[i].sign({hash})]);await save();
   }
   await send(`controls-${i}`,7+i,'registerControls',[r.grants[i]]);
  }
  r.offers??={};
  for(let j=0;j<2;j++){
   const id=BigInt(j+1);let s=await read(id);
   if(s.phase===0){
    const now=(await node.getBlock()).timestamp;
    const offer={id,room:toHex(id,{size:32}),a:keys[j*2].address,b:keys[j*2+1].address,mode:1,ranked:j===0,expires:now+25n,rules:8n,entropy:keccak256(toHex(`chaos-qualification-${j}`))};
    const hash=await node.readContract({address:r.app,abi:artifact.abi,functionName:'ticketDigest',args:[offer]}) as Hex;
    const signature=await keys[4].sign({hash});
    r.offers[j]={offer:{...offer,id:String(id),expires:String(offer.expires),rules:'8'},signature};await save();
   }
   const saved=r.offers[j];assert(saved);const offer={...saved.offer,id,expires:BigInt(saved.offer.expires),rules:8n};
   await send(`accept-${j}-a`,7+j*2,'acceptMatch',[offer,saved.signature]);await send(`accept-${j}-b`,8+j*2,'acceptMatch',[offer,saved.signature]);
  }
  const beacon=new DrandBeaconTransport();const end=Date.now()+180000;let count=0;
  while(Date.now()<end){
   let running=0;
   for(let j=0;j<2;j++){
    const id=BigInt(j+1),s=await read(id);assert(s.chaos);report[`match${id}`]={phase:s.phase,score:[s.state.scoreA,s.state.scoreB],time:s.state.t,revision:s.revision,request:s.chaos.request};
    if(s.phase>=3)continue;running++;
    if(s.chaos.request!==0n&&s.chaos.pending===0n){const q=s.chaos.request,round=BigInt.asUintN(64,q),available=1727521075n+(round-1n)*3n;
     if(BigInt(Math.floor(Date.now()/1000))>=available){const proof=await beacon.read(round);await send(`proof-${id}-${round}`,6,'submitRandomness',[id,q,proof.signature]);}
    }
    await send(`tick-${id}-${count}`,6,'tick',[id]);
   }
   await flush();if(!running)break;count++;await new Promise(resolve=>setTimeout(resolve,300));
  }
  const final=await Promise.all([read(1n),read(2n)]);assert(final.every(s=>s.phase===3),'Both complete games must finish on the engine');
  assert(final.every(s=>Math.max(s.state.scoreA,s.state.scoreB)===7));
  report.live=final.map(s=>({id:String(s.id),score:[s.state.scoreA,s.state.scoreB],winner:s.winner,phase:s.phase}));
  const deadline=Date.now()+150000;
  while(Date.now()<deadline){
   const published=await Promise.all([1n,2n].map(id=>t.base.readContract({address:r.app,abi:artifact.abi,functionName:'getSnapshot',args:[id]}) as Promise<any>));
   if(published.every(s=>s[2]===3n)){
    for(let i=0;i<2;i++){assert.equal(published[i][6],final[i].winner);assert.equal(published[i][12].scoreA,final[i].state.scoreA);assert.equal(published[i][12].scoreB,final[i].state.scoreB);}
    const d=await readHubDelegation(t.base,hub,r.app);assert.equal(d.epoch,1n);assert(d.batchIndex>0n);
    const commits=[];const last=await t.base.getBlockNumber();
    for(let from=BigInt(baseStart);from<=last;from+=100n){const to=from+99n<last?from+99n:last;
     commits.push(...await t.base.getLogs({address:hub,event:parseAbiItem('event Committed(address indexed app, bytes32 indexed partition, uint256 batchIndex, bytes32 stateRoot, bytes32 txRoot)'),args:{app:r.app,partition:zeroHash},fromBlock:from,toBlock:to}));
    }
    report.publications=await Promise.all(commits.map(async log=>{const tx=await t.base.getTransaction({hash:log.transactionHash});return {hash:log.transactionHash,batch:log.args.batchIndex,calldataBytes:(tx.input.length-2)/2,block:log.blockNumber};}));
    report.passed=true;delete report.error;delete report.causes;break;
   }
   const health:any=await fetch(`${r.node}/health`).then(v=>v.json());if(health.halted)throw Error(String(health.halted));
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
  assert(report.passed,'Complete results were not published on Monad');
  r.state='two-games-published';await save();
 }
}catch(e){report.error=safe(e);report.causes=[];for(let c:any=e;c;c=c.cause)report.causes.push({name:c.name,code:c.code,message:safe(c),details:typeof c.details==='string'?safe({message:c.details}):undefined});process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await flush();console.log(JSON.stringify({...report,commands:report.commands.length},(_,v)=>typeof v==='bigint'?v.toString():v));await t.close();}
