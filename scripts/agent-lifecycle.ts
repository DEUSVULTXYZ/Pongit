// One bounded lifecycle step, independent of controller and publication loops.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,parseAbi,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';
import {requestHostedRenewal} from '../relayer/src/rooms-hosted-renewal';
import {initializeAgents} from '../relayer/src/agents/schema';
import {validateAgentManifest} from '../shared/agents';
assert(['qualify-cycle','maintenance'].includes(process.env.PONG_AGENT_LIFECYCLE!));
if(!process.env.DATABASE_URL)process.env.DATABASE_URL=`postgresql://pong:${encodeURIComponent(process.env.POSTGRES_PASSWORD!)}@postgres:5432/pong_relayer`;
const force=process.env.PONG_AGENT_LIFECYCLE==='qualify-cycle',manifestFile='/secrets/manifest.json',recordFile='/secrets/lifecycle.json';
const m=JSON.parse(await readFile(manifestFile,'utf8'));
// The guard is that this is never the human application, not that it is one frozen address:
// a literal here silently became wrong the moment the arcade was redeployed.
assert.notEqual(String(m.app).toLowerCase(),'0x78d3341e3452d7ec1add9371de3008639eed8eb0','The lifecycle never drives the human application');
validateAgentManifest(m);
if(force)assert(!m.enabled&&!m.qualified,'Forced qualification cannot close a public service');
let record:any;try{record=JSON.parse(await readFile(recordFile,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;record={events:[]};}
const save=async()=>{await writeFile(recordFile+'.next',JSON.stringify(record,null,2),{mode:0o600});await rename(recordFile+'.next',recordFile);};
assert(process.env.AGENT_DATABASE_URL,'A separate agent database is required');
const lifecyclePrefix=process.env.PONG_AGENT_LIFECYCLE_PREFIX??'agent-arcade-lifecycle-20260913';
assert(/^agent-arcade-lifecycle-\d{8}$/.test(lifecyclePrefix),'Keep the dated lifecycle prefix shape');
const t=await chainTools(lifecyclePrefix),db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:3});
const event=async(stage:string,detail:Record<string,unknown>={})=>{
 if(record.stage!==stage){record.stage=stage;record.events.push({at:new Date().toISOString(),stage,...detail});await save();console.log(JSON.stringify({at:new Date().toISOString(),app:m.app,stage,...detail}));}
};
try{
 await initializeAgents(db);const d=await readHubDelegation(t.base,m.hub,m.app),now=(await t.base.getBlock()).timestamp;
 if(!record.startedEpoch){record.startedEpoch=String(d.epoch);record.epochOpenedAt=Number(now);await save();}
 // Releasing a stake replays every batch committed during the epoch, in one
 // transaction that has to fit in a single Monad block. Measured on this hub
 // across nine real releases: gas = 224788 + 83192 * batches, so a 150,000,000
 // block is exhausted near 1800 batches and the stake becomes unreleasable for
 // good. Close on batch pressure first and age second, well before that wall.
 const maxBatches=BigInt(process.env.PONG_AGENT_MAX_BATCHES??'1000'),maxAge=BigInt(process.env.PONG_AGENT_MAX_EPOCH_SECONDS??'14400');
 const age=record.epochOpenedAt?now-BigInt(record.epochOpenedAt):0n;
 const pressure=d.batchIndex>=maxBatches?'batches':age>=maxAge?'age':d.expiresAt-now<420n?'expiry':'';
 if(force&&record.renewalQualified){await event('qualification-cycle-complete',{epoch:m.epoch});}
 else if(force&&record.renewalReady){
  const published=Number((await db.query("SELECT count(*) FROM agent_arcade.matches WHERE app=$1 AND epoch=$2 AND status='complete' AND publication->>'state'='published'",[m.app,m.epoch])).rows[0].count);
  if(published){record.renewalQualified=true;await save();await event('qualification-cycle-complete',{epoch:m.epoch,publishedMatches:published});}
  else await event('verifying-renewed-publication',{epoch:m.epoch});
 }
 else if(d.status===1&&String(d.epoch)===String(record.startedEpoch)&&(force||pressure)){
  await db.query('INSERT INTO agent_arcade.control(app,admissions,reason) VALUES($1,false,$2) ON CONFLICT(app) DO UPDATE SET admissions=false,reason=$2,updated_at=now()',[m.app,'Delegation renewal']);
  const active=Number((await db.query("SELECT count(*) FROM agent_arcade.matches WHERE app=$1 AND status IN ('preparing','offered','active','publishing')",[m.app])).rows[0].count);
  if(active){await event(now>=d.expiresAt?'intervention-required':'draining',{active,closing:pressure,batches:String(d.batchIndex),...(now>=d.expiresAt?{reason:'Delegation expired with unfinished games. Reconcile published state before closing; do not discard uncertain commands.'}:{})});}
  else{
   const node=createPublicClient({transport:http(m.node,{retryCount:0,timeout:10000})});const status:any=await node.request({method:'interlude_session',params:[]} as any);
   assert.equal(String(status.epoch),String(d.epoch));assert.equal(status.app.toLowerCase(),m.app);assert.equal(status.chainId,4242);
   const [live,published]=await Promise.all([node.readContract({address:m.app,abi,functionName:'activeCount'}),t.base.readContract({address:m.app,abi,functionName:'activeCount'})]);
   const uncertain=Number((await db.query("SELECT count(*) FROM agent_arcade.engine_jobs WHERE app=$1 AND state IN ('prepared','uncertain')",[m.app])).rows[0].count);
   if(live!==0n||published!==0n||status.pendingDiffs.length||uncertain)await event('waiting-publication',{live:String(live),published:String(published),diffs:status.pendingDiffs.length,uncertain});
   else{const tx=await t.write(`close-${d.epoch}`,m.app,abi,'closeEngine');await event('closed',{epoch:String(d.epoch),tx:tx.transactionHash,closing:pressure,batches:String(d.batchIndex),ageSeconds:String(age)});}
  }
 }else if(d.status===2){
  if(now<d.stakeUnlockAt)await event('challenge-window',{releaseAt:new Date(Number(d.stakeUnlockAt)*1000).toISOString()});
  else{const tx=await t.write(`release-${d.epoch}`,m.hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[m.app,zeroHash]);await event('released',{tx:tx.transactionHash});}
 }else if(d.status===0){
  const tx=await t.write(`open-after-${d.epoch}`,m.app,abi,'renewEngine');await event('reopened',{tx:tx.transactionHash});
 }else if(d.status===1&&String(d.epoch)!==String(record.startedEpoch)){
  const node=createPublicClient({transport:http(m.node,{retryCount:0,timeout:10000})});let valid=false;
  try{const status:any=await node.request({method:'interlude_session',params:[]} as any);valid=status.app.toLowerCase()===m.app&&String(status.epoch)===String(d.epoch)&&status.chainId===4242;
   if(valid){assert.equal(await node.readContract({address:m.app,abi,functionName:'RULES_VERSION'}),7n);const h=await fetch(m.node+'/health').then(x=>x.json());valid=!h.halted;}
  }catch{}
  if(!valid){
   await db.query('INSERT INTO agent_arcade.lifecycle(app) VALUES($1) ON CONFLICT DO NOTHING',[m.app]);
   const adapter:any={query:(sql:string,args:unknown[])=>db.query(sql.replaceAll('il_lifecycle','agent_arcade.lifecycle'),args)};
   await requestHostedRenewal(adapter,m.app,d.epoch,m.node);await event('provisioning',{epoch:String(d.epoch)});
  }else{
   m.epoch=String(d.epoch);await writeFile(manifestFile+'.next',JSON.stringify(m,null,2),{mode:0o600});await rename(manifestFile+'.next',manifestFile);
   const health=(await db.query('SELECT detail FROM agent_arcade.health WHERE app=$1',[m.app])).rows[0];
   if(health?.detail?.epoch!==m.epoch)await event('restart-required',{epoch:m.epoch});
   else{await db.query("UPDATE agent_arcade.control SET admissions=true,reason='',updated_at=now() WHERE app=$1",[m.app]);record.startedEpoch=m.epoch;record.epochOpenedAt=Number(now);record.renewalReady=true;await save();await event('online',{epoch:m.epoch});}
  }
 }else if(d.status===1)await event('online',{epoch:String(d.epoch),expiresAt:String(d.expiresAt)});
 else await event('intervention-required',{hubStatus:d.status});
}finally{await t.close();await db.end();}
