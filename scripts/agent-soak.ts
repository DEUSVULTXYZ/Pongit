// Run only after two-slot publication and a complete renewal cycle are verified.
import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
assert.equal(process.env.PONG_AGENT_SOAK,'dedicated-24h');
const manifestFile=process.env.PONG_AGENT_MANIFEST!,m=JSON.parse(await readFile(manifestFile,'utf8'));
const lifecycle=JSON.parse(await readFile('/secrets/lifecycle.json','utf8'));assert(lifecycle.renewalQualified,'First verify a real dedicated renewal');
assert(!m.enabled&&!m.qualified,'The public opening follows the soak, not the reverse');
const directory='/diagnostics/agents',db=new Pool({connectionString:process.env.DATABASE_URL,max:2});await mkdir(directory,{recursive:true});
const started=Date.now(),ends=started+86400000,api=process.env.PONG_AGENT_API!;let stopped=false;
process.on('SIGTERM',()=>{stopped=true;});
const sourcePaths=['relayer/src/agents/server.ts','relayer/src/agents/coordinator.ts','relayer/src/agents/metrics.ts','relayer/src/agents/replays.ts','shared/agent-client.ts','shared/engine-read.ts','scripts/agent-house-worker.ts','scripts/agent-community-qualification.ts','agent-sdk/example.ts','scripts/agent-process.mjs','scripts/agent-soak.ts','scripts/agent-lifecycle.ts','scripts/agent-archive-step.ts','scripts/agent-operator-step.ts','scripts/independent-chain-tools.ts','scripts/agent-ops.mjs','scripts/agent-private-keeper.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
// The inputs that gate this soak must not move while it runs, so hash them too.
const inputPaths=[manifestFile,'/secrets/lifecycle.json'];
const inputHashes=Object.fromEntries(await Promise.all(inputPaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const report:any={startedAt:new Date(started).toISOString(),endsAt:new Date(ends).toISOString(),app:m.app,epochAtStart:m.epoch,sourceHashes,inputHashes,scope:'Real dedicated hosted agent service alongside unchanged human production',samples:0,available:0,humanAvailable:0,maxSimultaneous:0,maxSampleGapMs:0,errors:[],errorTally:{},stageTally:{},activeTally:{},unhealthySamples:0,longestUnhealthyRunMs:0,revertedJobs:0,complete:false};
// A failing arcade still answers /health and reports the failure as sampled data,
// so an exception-only error list stays empty while the environment is dead.
let unhealthySince=0;
const note=(at:string,error:string)=>{const text=String(error).split('\n')[0].replace(/0x[\da-fA-F]{64,}/g,'[omitted]').slice(0,180);report.errorTally[text]=(report.errorTally[text]||0)+1;if(report.errors.length<200)report.errors.push({at,error:text});return text;};
let previousSample=started;
const file=`${directory}/soak-${started}.json`,samples=`${directory}/soak-${started}.ndjson`;
await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});
try{while(!stopped&&Date.now()<ends){
 const at=Date.now();report.maxSampleGapMs=Math.max(report.maxSampleGapMs,at-previousSample);previousSample=at;const sample:any={at:new Date(at).toISOString()};
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
 await new Promise<void>(resolve=>{let timer:ReturnType<typeof setTimeout>;const stop=()=>{clearTimeout(timer);process.off('SIGTERM',stop);resolve();};timer=setTimeout(stop,Math.min(60000,Math.max(0,ends-Date.now())));process.once('SIGTERM',stop);});
 }
 report.endedAt=new Date().toISOString();report.availability=report.samples?report.available/report.samples:0;report.humanAvailability=report.samples?report.humanAvailable/report.samples:0;
 report.sourceUnchanged=true;for(const [path,hash] of Object.entries(sourceHashes))if(createHash('sha256').update(await readFile(path)).digest('hex')!==hash)report.sourceUnchanged=false;
 report.inputsUnchanged=true;for(const [path,hash] of Object.entries(inputHashes))if(createHash('sha256').update(await readFile(path)).digest('hex')!==hash)report.inputsUnchanged=false;
 try{report.revertedJobs=Number((await db.query("SELECT count(*)::int AS count FROM agent_arcade.engine_jobs WHERE app=$1 AND state<>'confirmed' AND created_at>=to_timestamp($2/1000.0)",[m.app,started])).rows[0].count);}catch(e){note(new Date().toISOString(),String((e as Error).message));}
 // Burning twenty-four hours of wall clock proves nothing if the arena is dead at
 // the end; the previous test asked only whether the clock had run out.
 report.clockElapsed=!stopped&&Date.now()>=ends;report.endedHealthy=report.lastStage==='online';
 report.complete=report.clockElapsed&&report.endedHealthy&&report.sourceUnchanged&&report.inputsUnchanged;
 report.qualification='Complete requires the full clock, an arena still online at the end, and unchanged source and gating inputs; review publication, renewal, RPC diagnostics, browser runs and sample gaps before opening. This report never opens the public flag automatically';
 await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({file,complete:report.complete,samples:report.samples,availability:report.availability}));
}finally{await db.end();}
