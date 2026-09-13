// Run only after two-slot publication and a complete renewal cycle are verified.
import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile,mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
assert.equal(process.env.PONG_AGENT_SOAK,'dedicated-24h');
const manifestFile=process.env.PONG_AGENT_MANIFEST!,m=JSON.parse(await readFile(manifestFile,'utf8'));
const lifecycle=JSON.parse(await readFile('/secrets/lifecycle.json','utf8'));assert(lifecycle.renewalQualified,'First verify a real dedicated renewal');
assert(!m.enabled&&!m.qualified,'The public opening follows the soak, not the reverse');
const directory='/diagnostics/agents',db=new Pool({connectionString:process.env.DATABASE_URL,max:2});await mkdir(directory,{recursive:true});
const started=Date.now(),ends=started+86400000,api=process.env.PONG_AGENT_API!;let stopped=false;
process.on('SIGTERM',()=>{stopped=true;});
const report:any={startedAt:new Date(started).toISOString(),endsAt:new Date(ends).toISOString(),app:m.app,scope:'Real dedicated hosted agent service alongside unchanged human production',samples:0,available:0,humanAvailable:0,maxSimultaneous:0,errors:[],complete:false};
const file=`${directory}/soak-${started}.json`,samples=`${directory}/soak-${started}.ndjson`;
await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});
try{while(!stopped&&Date.now()<ends){
 const at=Date.now();const sample:any={at:new Date(at).toISOString()};
 try{
  const [agent,human,counts,storage,effects]=await Promise.all([
   fetch(api+'/health',{signal:AbortSignal.timeout(10000)}).then(r=>r.json()),
   fetch('https://pongit.xyz/api/interlude/config',{signal:AbortSignal.timeout(10000)}).then(r=>r.json()),
   db.query("SELECT status,mode,count(*)::int AS count FROM agent_arcade.matches WHERE app=$1 GROUP BY status,mode",[m.app]),
   db.query("SELECT pg_database_size(current_database())::text AS bytes,COALESCE(sum(octet_length(frames)),0)::text AS replay_bytes FROM agent_arcade.replays"),
   db.query("SELECT DISTINCT value FROM agent_arcade.matches,jsonb_array_elements_text(COALESCE(result->'observedEffects','[]'::jsonb)) WHERE app=$1 AND created_at>=to_timestamp($2/1000.0)",[m.app,started])]);
  assert.equal(human.app,'0x78d3341e3452d7ec1add9371de3008639eed8eb0','Human deployment changed during comparison');
  sample.game=agent.game;sample.humanAvailable=!!human.online&&!!human.admission;sample.matches=counts.rows;sample.storage=storage.rows[0];
  report.observedChaosEffects=effects.rows.map(r=>Number(r.value)).sort((a,b)=>a-b);
  const active=counts.rows.filter(r=>r.status==='active').reduce((n,r)=>n+r.count,0);report.maxSimultaneous=Math.max(report.maxSimultaneous,active);
  if(agent.game.stage==='online')report.available++;if(sample.humanAvailable)report.humanAvailable++;
 }catch(e){sample.error=String((e as Error).message).split('\n')[0].replace(/0x[\da-fA-F]{64,}/g,'[omitted]').slice(0,180);if(report.errors.length<200)report.errors.push({at:sample.at,error:sample.error});}
 report.samples++;report.lastAt=sample.at;await appendFile(samples,JSON.stringify(sample)+'\n',{mode:0o600});
 await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});
 await new Promise<void>(resolve=>{let timer:ReturnType<typeof setTimeout>;const stop=()=>{clearTimeout(timer);process.off('SIGTERM',stop);resolve();};timer=setTimeout(stop,Math.min(60000,Math.max(0,ends-Date.now())));process.once('SIGTERM',stop);});
 }
 report.complete=!stopped&&Date.now()>=ends;report.endedAt=new Date().toISOString();report.availability=report.samples?report.available/report.samples:0;report.humanAvailability=report.samples?report.humanAvailable/report.samples:0;
 report.qualification='Requires review of publication, renewal, RPC diagnostics, browser runs and sample gaps; this report never opens the public flag automatically';
 await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({file,complete:report.complete,samples:report.samples,availability:report.availability}));
}finally{await db.end();}
