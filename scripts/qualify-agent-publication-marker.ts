// Bounded isolated publication proof. Never admits a player or changes a public
// arena. Base writes use the original nonce journal; engine writes have their
// own durable private journal and retain uncertain exact bytes.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,keccak256,type Address} from 'viem';
import {generatePrivateKey} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {engineTransport} from '../shared/engine-transport';
import {verifyHostedArenaEvidence} from '../shared/hosted-arena-identity';
import {agentPublicationHealth} from '../shared/agent-publication-health';
import {initializePoolOperations,createPoolEngine} from '../relayer/src/agents/pool-engine';
import {provisionPoolArena} from '../relayer/src/agents/pool-hosted';
import {reusableAgentArenaAbi as abi} from '../shared/abi-ReusableAgentArena';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {hostedControl} from '../shared/hosted-control';
import {hostedOptInTransport} from '../shared/hosted-opt-in';
import {measuredFetch} from '../shared/rpc-metrics';

assert.equal(process.env.PONG_PUBLICATION_MARKER,'isolated-testnet');assert.equal(process.getuid?.(),1000);
const action=process.argv[2];assert(['deploy','open','probe','close','release'].includes(action));
const epoch=BigInt(process.env.PONG_PUBLICATION_EPOCH??'1');
assert(epoch===1n||epoch===2n,'Only the original trial or the explicit routing-repair trial is supported');
const optIn=process.env.PONG_PUBLICATION_OPT_IN==='isolated-testnet';
if(optIn)assert.equal(epoch,1n,'Provisioning consent has one separately journaled bounded trial');
const prefix=optIn?'publication-consent-20261001':'publication-marker-20261001',file='/state/publication-marker.json';
const arenaArtifact=optIn?'ProvisionedReusableAgentArena':'ReusableAgentArena';
const manifest=JSON.parse(await readFile('/metadata/manifest.json','utf8'));
const t=await chainTools(prefix),db=new Pool({connectionString:process.env.PONG_PUBLICATION_DATABASE_URL});
let r:any,engine:ReturnType<typeof createPoolEngine>|undefined;
const report:any={at:new Date().toISOString(),action,epoch:String(epoch),source:process.env.SOURCE_REVISION,passed:false,scope:'Empty isolated arena; no public migration or gameplay qualification'};
const save=async()=>{await writeFile(file+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(file+'.next',file);};
try{
 try{r=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 if(action==='deploy'){
  assert.equal(epoch,1n);
  await t.preflight(['PublicationQualificationAuthority','PublishedResultVerifier',arenaArtifact]);
  if(!r){r={prefix,source:process.env.SOURCE_REVISION,engineKey:generatePrivateKey(),phase:'deploying'};assert(r.source);await save();}
  assert.equal(r.source,process.env.SOURCE_REVISION,'Resume with the original source');
  const source=manifest.arenas[0],block=await t.base.getBlock();
  assert.equal(keccak256((await t.base.getCode({address:source.app,blockNumber:block.number}))!),source.runtimeHash);
  const [policies,kernel]=await Promise.all((['policies','kernel'] as const).map(functionName=>t.base.readContract({address:source.app,abi,functionName,blockNumber:block.number}) as Promise<Address>));
  assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash);
  r.hub=manifest.hub;r.dependencies={policies,kernel};await save();
  r.authority=await t.deploy('PublicationQualificationAuthority',[r.hub]);await save();
  r.verifier=await t.deploy('PublishedResultVerifier',[r.authority,r.hub]);await save();
  r.app=await t.deploy(arenaArtifact,[r.hub,r.authority,'0x0000000000000000000000000000000000000001',policies,kernel,r.verifier,...(optIn?[t.account.address]:[])]);await save();
  assert(!manifest.arenas.some((a:any)=>a.app.toLowerCase()===r.app.toLowerCase()));
  await t.write('bind',r.authority,(await t.artifact('PublicationQualificationAuthority')).abi,'bind',[r.app]);
  r.runtimeHash=keccak256((await t.base.getCode({address:r.app}))!);r.phase='deployed-closed';await save();
 }else{
  assert(r?.app&&r.prefix===prefix);assert.equal(keccak256((await t.base.getCode({address:r.app}))!),r.runtimeHash);
  const authority=(await t.artifact('PublicationQualificationAuthority')).abi;
  if(action==='open'){
   const d=await readHubDelegation(t.base,r.hub,r.app);assert(d.status===0&&d.epoch===epoch-1n||d.status===1&&d.epoch===epoch,'No implicit epoch rollover');
   if(epoch===2n){
    const block=await t.base.getBlock();
    const sealed=await t.base.readContract({address:r.verifier,abi:verifierAbi,functionName:'finalizedRoots',args:[r.app,1n],blockNumber:block.number});
    assert.equal(sealed[1],0);assert(!/^0x0+$/.test(sealed[0]),'The previous empty epoch must be sealed before reuse');
    assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash);report.previousSealed=sealed;
   }
   await t.write(`open-epoch${epoch}`,r.authority,authority,'open');r.phase='opened';await save();
  }else if(action==='probe'){
   const d=await readHubDelegation(t.base,r.hub,r.app);assert.equal(d.status,1);assert.equal(d.epoch,epoch);
   await initializePoolOperations(db);
   let transport:typeof fetch|undefined;
   if(optIn){
    const block=await t.base.getBlock(),ownerAbi=(await t.artifact(arenaArtifact)).abi;
    const [owner,actualHub,delegation]=await Promise.all([
     t.base.readContract({address:r.app,abi:ownerAbi,functionName:'owner',blockNumber:block.number}),
     t.base.readContract({address:r.app,abi:ownerAbi,functionName:'hub',blockNumber:block.number}),
     readHubDelegation(t.base,r.hub,r.app,block.number),
    ]);
    assert.equal(String(owner).toLowerCase(),t.account.address.toLowerCase());assert.equal(String(actualHub).toLowerCase(),r.hub.toLowerCase());
    assert.equal(delegation.status,1);assert.equal(delegation.epoch,epoch);assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash);
    const measured=measuredFetch('interlude','hosted.consent');
    const control=await hostedControl(r.hub,measured);
    const observe:typeof fetch=async(input,init)=>{
     const response=await measured(input,init);
     if(init?.method==='POST'&&!response.ok){
      const body=await response.clone().json().catch(()=>({}));
      // Do not retain arbitrary provider text: it might echo the consent.
      const message=String(body.error??'');
      report.provisioningRefusal={http:response.status,category:/signature|owner|opt.?in/i.test(message)?'owner-consent':/operator floor/i.test(message)?'operator-floor':/capacity/i.test(message)?'capacity':'other'};
     }
     return response;
    };
    transport=await hostedOptInTransport({app:r.app,epoch,owner:owner as Address,control,
     sign:message=>t.account.signMessage({message}),transport:observe});
    report.provisioningConsent={owner,control,epoch:String(epoch),block:String(block.number),hash:block.hash};
   }
   const expected={app:r.app,epoch:d.epoch,chainId:4242,baseBlock:d.baseBlock,rulesVersion:15n,runtimeHash:r.runtimeHash};
   let node:ReturnType<typeof createPublicClient>|undefined,url=`https://il-${r.app.slice(2,18).toLowerCase()}.fly.dev`;
   const deadline=Date.now()+180000;
   const inspect=async(origin:string)=>{
    const candidate=createPublicClient({transport:engineTransport(origin)});
    const [session,rulesVersion,response]=await Promise.all([candidate.request({method:'interlude_session',params:[]} as any),
     candidate.readContract({address:r.app,abi,functionName:'RULES_VERSION'}),fetch(origin+'/health',{signal:AbortSignal.timeout(5000)})]);
    assert(response.ok);const health=await response.json(),evidence={session,rulesVersion,runtimeHash:r.runtimeHash,health};
    verifyHostedArenaEvidence(expected,evidence);node=candidate;return evidence;
   };
   while(!node&&Date.now()<deadline){
    try{url=await provisionPoolArena(db,r.app,d.epoch,url,transport,{expected,inspect},r.hub);if(!node)await inspect(url);}
    catch(error){const retry=Number((error as any).retryAt??0);await new Promise(resolve=>setTimeout(resolve,Math.max(2000,Math.min(10000,retry-Date.now()))));}
   }
   assert(node,'Hosted identity unavailable before the original deadline');report.node=url;
   engine=createPoolEngine(db,t.base,r.hub,r.app,url,r.engineKey,{epoch,id:0n},undefined,
    {node:node as any,reusable:true,publicationProbe:'epoch-marker-v1',archive:async()=>{throw Error('An empty preflight cannot archive a game');}});
   await engine.probePublication();report.receiptObservedAt=new Date().toISOString();
   const publicationDeadline=Date.now()+90000;
   do{
    const health=await fetch(url+'/health',{signal:AbortSignal.timeout(5000)}).then(x=>x.json());
    const observed=agentPublicationHealth(health,r.app,epoch);report.publication=observed;
    assert(observed.healthy,'Hosted publication halted during the marker test');
    const block=await t.base.getBlock(),delegation=await readHubDelegation(t.base,r.hub,r.app,block.number);
    const [marker,commitment,current]=await Promise.all([
     t.base.readContract({address:r.app,abi,functionName:'publicationCheckpoint',blockNumber:block.number}),
     t.base.readContract({address:r.app,abi,functionName:'resultCommitment',blockNumber:block.number}),
     t.base.readContract({address:r.app,abi,functionName:'currentMatch',blockNumber:block.number}),
    ]);
    assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash);
    if(marker===epoch&&delegation.epoch===epoch&&delegation.batchIndex>0n){
     assert.equal(commitment[1],0);assert.deepEqual(current,[0n,0n]);
     report.canonical={block:String(block.number),hash:block.hash,marker:String(marker),batches:String(delegation.batchIndex),root:commitment[2],count:0};
     r.phase='publication-qualified';await save();break;
    }
    await new Promise(resolve=>setTimeout(resolve,2000));
   }while(Date.now()<publicationDeadline);
   assert(report.canonical,'No canonical publication before the original deadline');
  }else if(action==='close'){
   assert.equal((await readHubDelegation(t.base,r.hub,r.app)).epoch,epoch);
   // Empty qualification only, never a user/community result abandonment.
   const current=await t.base.readContract({address:r.app,abi,functionName:'currentMatch'});assert.deepEqual(current,[0n,0n]);
   await t.write(`close-epoch${epoch}`,r.authority,authority,'close');r.phase='closing';await save();
  }else{
   const d=await readHubDelegation(t.base,r.hub,r.app);assert.equal(d.epoch,epoch);assert(d.status===0||d.status===2);assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt);
   await t.write(`release-epoch${epoch}`,r.authority,authority,'release');
   const block=await t.base.getBlock(),released=await readHubDelegation(t.base,r.hub,r.app,block.number);
   const [sealed,commitment]=await Promise.all([
    t.base.readContract({address:r.verifier,abi:verifierAbi,functionName:'finalizedRoots',args:[r.app,epoch],blockNumber:block.number}),
    t.base.readContract({address:r.app,abi,functionName:'resultCommitment',blockNumber:block.number}),
   ]);
   assert.equal(released.status,0);assert.equal(commitment[0],epoch);assert.equal(commitment[1],0);
   assert.deepEqual(sealed,[commitment[2],0]);assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash);
   report.canonical={block:String(block.number),hash:block.hash,root:sealed[0],count:0};r.phase='released';await save();
  }
 }
 report.app=r.app;report.authority=r.authority;report.phase=r.phase;report.delegation=await readHubDelegation(t.base,r.hub,r.app);report.passed=true;
}catch(error){report.error=String((error as any).shortMessage??(error as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{
 engine?.close();await db.end();await t.close();report.finishedAt=new Date().toISOString();
 await writeFile(`/evidence/${action}-${Date.now()}.json`,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
 console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v));
}
