// Run only after two-slot publication and a complete renewal cycle are verified.
import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile,mkdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {afterClock,lifecycleView,soakSources} from './agent-soak-rules';
assert.equal(process.env.PONG_AGENT_SOAK,'dedicated-24h');
// The lifecycle's own record says whether a renewal is running. The lifecycle replaces it by rename
// on every change, so a single-file mount stops following it at the first one: mount its directory
// and name the file here. readRecord refuses that stale view rather than trusting it.
const manifestFile=process.env.PONG_AGENT_MANIFEST!,recordFile=process.env.PONG_AGENT_LIFECYCLE_RECORD??'/secrets/lifecycle.json',m=JSON.parse(await readFile(manifestFile,'utf8'));
const lifecycle=JSON.parse(await readFile(recordFile,'utf8'));assert(lifecycle.renewalQualified,'First verify a real dedicated renewal');
assert(!m.enabled&&!m.qualified,'The public opening follows the soak, not the reverse');
const directory='/diagnostics/agents',db=new Pool({connectionString:process.env.DATABASE_URL,max:2});await mkdir(directory,{recursive:true});
const started=Date.now(),ends=started+86400000,api=process.env.PONG_AGENT_API!;let stopped=false;
process.on('SIGTERM',()=>{stopped=true;});
// Everything the running roles execute, not only their entry points: every relative import they
// reach and every script they start, so the lifecycle's hosted-renewal client and the environment
// script the keeper recreates the services with are covered too (see soakSources). A closure with
// a hole in it is no baseline, so the soak does not start on one.
const hashSources=async(paths:string[])=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(path).then(bytes=>createHash('sha256').update(bytes).digest('hex'),()=>'missing')])));
const sources=await soakSources();assert.deepEqual(sources.unresolved,[],'Unresolved imports would leave the source hash incomplete');
const sourceHashes:Record<string,string>=await hashSources(sources.paths);
// What gates this soak must not move while it runs. Not the files whole: a renewal rewrites
// both on purpose, the manifest's epoch and the lifecycle's own record, and a soak that
// cannot span a renewal cannot show one works. Only what opens the gate is frozen.
const gate=async()=>{
 const [manifest,record]=(await Promise.all([readFile(manifestFile,'utf8'),readFile(recordFile,'utf8')])).map(text=>JSON.parse(text));
 return createHash('sha256').update(JSON.stringify({app:manifest.app,hub:manifest.hub,node:manifest.node,coordinator:manifest.coordinator,
  enabled:manifest.enabled,qualified:manifest.qualified,renewalQualified:record.renewalQualified??null})).digest('hex');
};
const inputHashes={gate:await gate()};
const report:any={startedAt:new Date(started).toISOString(),endsAt:new Date(ends).toISOString(),app:m.app,epochAtStart:m.epoch,sourceHashes,inputHashes,scope:'Real dedicated hosted agent service alongside unchanged human production',samples:0,available:0,humanAvailable:0,maxSimultaneous:0,maxSampleGapMs:0,errors:[],errorTally:{},stageTally:{},lifecycleTally:{},activeTally:{},unhealthySamples:0,longestUnhealthyRunMs:0,revertedJobs:0,complete:false};
// A failing arcade still answers /health and reports the failure as sampled data,
// so an exception-only error list stays empty while the environment is dead.
let unhealthySince=0;
const note=(at:string,error:string)=>{const text=String(error).split('\n')[0].replace(/0x[\da-fA-F]{64,}/g,'[omitted]').slice(0,180);report.errorTally[text]=(report.errorTally[text]||0)+1;if(report.errors.length<200)report.errors.push({at,error:text});return text;};
let previousSample=started;
const file=`${directory}/soak-${started}.json`,samples=`${directory}/soak-${started}.ndjson`;
await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});
// Opened and checked as one file. A record the lifecycle has replaced has no link left, and that is
// what a single-file mount keeps showing once the lifecycle writes past it: the record as it was
// when the soak started, which must not decide whether a renewal is running. A rename landing
// between the open and the check does the same once, so a second open settles it.
async function readRecord(){
 for(let attempt=0;;attempt++){
  const handle=await open(recordFile,'r');
  try{
   if((await handle.stat()).nlink===0){if(attempt)throw Error('replaced under a single-file mount; mount its directory and set PONG_AGENT_LIFECYCLE_RECORD');continue;}
   return JSON.parse(await handle.readFile('utf8'));
  }finally{await handle.close();}
 }
}
// Noted when the problem changes, not every minute: a stale mount would otherwise fill the list.
let recordProblem='';
const currentRecord=async(at:string)=>{
 try{const record=await readRecord();recordProblem='';return record;}
 catch(e){const text=String((e as Error).message);if(text!==recordProblem){recordProblem=text;note(at,`Lifecycle record: ${text}`);}report.lifecycleUnreadableSamples=(report.lifecycleUnreadableSamples||0)+1;return undefined;}
};
// A renewal takes the arcade offline for over an hour by design (drain, close, the hub's
// one-hour challenge window, release, reopen), and epochs roll every few hours, so the clock
// can run out in the middle of one. Only then, and for at most two hours, the soak keeps
// sampling until the renewal completes. Whether one is running is the lifecycle's record, not
// the service's /health: every renewal ends by restarting the service, whose samples then fail
// or read 'starting', and the service's own 'waiting-publication' is a publication backlog with
// admissions open, which is no renewal. A stuck renewal still ends it unhealthy, and any other
// lifecycle stage at the end, an intervention or an unreadable record, gets no grace at all.
const graceMs=7200000,settleMs=300000;
try{while(!stopped){
 const at=Date.now(),view=lifecycleView(await currentRecord(new Date(at).toISOString()));
 if(at>=ends){const decision=afterClock({now:at,ends,graceMs,settleMs,lifecycle:view,service:report.lastStage});report.graceReason=decision.reason;if(!decision.sample)break;}
 report.maxSampleGapMs=Math.max(report.maxSampleGapMs,at-previousSample);previousSample=at;const sample:any={at:new Date(at).toISOString(),lifecycle:view?.stage??'unreadable'};
 report.lastLifecycleStage=sample.lifecycle;report.lifecycleTally[sample.lifecycle]=(report.lifecycleTally[sample.lifecycle]||0)+1;
 try{
  const [agent,human,counts,storage,effects]=await Promise.all([
   fetch(api+'/health',{signal:AbortSignal.timeout(10000)}).then(r=>r.json()),
   fetch('https://pongit.xyz/api/interlude/config',{signal:AbortSignal.timeout(10000)}).then(r=>r.json()),
   db.query("SELECT status,mode,count(*)::int AS count FROM agent_arcade.matches WHERE app=$1 GROUP BY status,mode",[m.app]),
   db.query("SELECT pg_database_size(current_database())::text AS bytes,COALESCE(sum(octet_length(frames)),0)::text AS replay_bytes FROM agent_arcade.replays"),
   db.query("SELECT DISTINCT value FROM agent_arcade.matches,jsonb_array_elements_text(COALESCE(result->'observedEffects','[]'::jsonb)) WHERE app=$1 AND created_at>=to_timestamp($2/1000.0)",[m.app,started])]);
  assert.equal(human.app,'0x78d3341e3452d7ec1add9371de3008639eed8eb0','Human deployment changed during comparison');
  sample.game=agent.game;sample.humanAvailable=!!human.online&&!!human.admission;sample.matches=counts.rows;sample.storage=storage.rows[0];
  report.initialStorage??=sample.storage;report.latestStorage=sample.storage;report.initialMatches??=counts.rows;report.latestMatches=counts.rows;
  report.observedChaosEffects=effects.rows.map(r=>Number(r.value)).sort((a,b)=>a-b);
  const active=counts.rows.filter(r=>r.status==='active').reduce((n,r)=>n+r.count,0);report.maxSimultaneous=Math.max(report.maxSimultaneous,active);
  report.initialActive??=active;report.activeTally[active]=(report.activeTally[active]||0)+1;
  const stage=String(agent.game&&agent.game.stage?agent.game.stage:'unknown');report.stageTally[stage]=(report.stageTally[stage]||0)+1;report.lastStage=stage;
  if(stage==='online'){report.available++;unhealthySince=0;}else{report.unhealthySamples++;if(!unhealthySince)unhealthySince=at;report.longestUnhealthyRunMs=Math.max(report.longestUnhealthyRunMs,at-unhealthySince);sample.stage=stage;}
  if(agent.game&&agent.game.lastError)sample.lastError=note(sample.at,String(agent.game.lastError));
  if(sample.humanAvailable)report.humanAvailable++;
 }catch(e){sample.error=note(sample.at,String((e as Error).message));report.lastStage='error';report.stageTally.error=(report.stageTally.error||0)+1;report.unhealthySamples++;if(!unhealthySince)unhealthySince=at;report.longestUnhealthyRunMs=Math.max(report.longestUnhealthyRunMs,at-unhealthySince);}
 report.samples++;report.lastAt=sample.at;await appendFile(samples,JSON.stringify(sample)+'\n',{mode:0o600});
 await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});
 await new Promise<void>(resolve=>{let timer:ReturnType<typeof setTimeout>;const stop=()=>{clearTimeout(timer);process.off('SIGTERM',stop);resolve();};timer=setTimeout(stop,Date.now()<ends?Math.min(60000,ends-Date.now()):60000);process.once('SIGTERM',stop);});
 }
 report.endedAt=new Date().toISOString();report.availability=report.samples?report.available/report.samples:0;report.humanAvailability=report.samples?report.humanAvailable/report.samples:0;
 // The closure is walked again, so a file a role newly imports or starts counts as a change too.
 const final=await soakSources().catch(e=>({paths:[] as string[],unresolved:[`closure: ${String((e as Error).message)}`]}));
 const finalHashes:Record<string,string>=await hashSources([...new Set([...Object.keys(sourceHashes),...final.paths])]);
 report.sourceChanged=Object.keys(finalHashes).filter(path=>finalHashes[path]!==sourceHashes[path]).sort();
 if(final.unresolved.length)report.sourceUnresolved=final.unresolved;
 report.sourceUnchanged=!report.sourceChanged.length&&!final.unresolved.length;
 report.inputsUnchanged=await gate()===inputHashes.gate;
 try{report.revertedJobs=Number((await db.query("SELECT count(*)::int AS count FROM agent_arcade.engine_jobs WHERE app=$1 AND state<>'confirmed' AND created_at>=to_timestamp($2/1000.0)",[m.app,started])).rows[0].count);}catch(e){note(new Date().toISOString(),String((e as Error).message));}
 // Burning twenty-four hours of wall clock proves nothing if the arena is dead at
 // the end; the previous test asked only whether the clock had run out.
 report.clockElapsed=!stopped&&Date.now()>=ends;report.graceUsedMs=Math.max(0,Date.now()-ends);report.endedHealthy=report.lastStage==='online';
 report.complete=report.clockElapsed&&report.endedHealthy&&report.sourceUnchanged&&report.inputsUnchanged;
 report.qualification='Complete requires the full clock, an arena still online at the end, and unchanged source and gating inputs; review publication, renewal, RPC diagnostics, browser runs and sample gaps before opening. This report never opens the public flag automatically';
 await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({file,complete:report.complete,samples:report.samples,availability:report.availability}));
}finally{await db.end();}
