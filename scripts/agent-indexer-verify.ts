// Read-only real Envio backfill and shared retention verification on the VPS.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
assert.equal(process.env.PONG_AGENT_INDEXER_VERIFY,'isolated-vps');
// Verifies whichever arcade is configured, never the human application. The
// address comes from the manifest so a redeployment carries it automatically.
const app=(process.env.PONG_AGENT_APP??(process.env.PONG_AGENT_MANIFEST?JSON.parse(await readFile(process.env.PONG_AGENT_MANIFEST,'utf8')).app:'')).toLowerCase();
assert(/^0x[\da-f]{40}$/.test(app)&&app!=='0x78d3341e3452d7ec1add9371de3008639eed8eb0','Point the verification at a dedicated arcade');
const database=new URL(process.env.DATABASE_URL!);assert.match(database.hostname,/^pongit-agent-db-20\d{6}$/,'Verify a dedicated agent database');
const agents=new Pool({connectionString:String(database),max:2});database.pathname='/agent_indexer';
const indexer=new Pool({connectionString:String(database),max:2});
const ref=(r:any)=>`10143:${r.app}:${r.epoch}:${r.id}`;
const report:any={at:new Date().toISOString(),app,scope:'Real Monad events indexed by Envio into a private database; read-only verification',passed:false};
try{
 const expected=(await agents.query("SELECT id,app,epoch,a,b,mode,result FROM agent_arcade.matches WHERE app=$1 AND status='complete' ORDER BY id",[app])).rows;
 assert(expected.length>=5,'Complete hosted games are required');
 const deadline=Date.now()+15*60000;let indexed:any[]=[];
 while(Date.now()<deadline){
  indexed=(await indexer.query('SELECT * FROM indexer."Match"')).rows;
  if(expected.every(r=>indexed.some(i=>i.id===ref(r))))break;
  await new Promise(r=>setTimeout(r,10000));
 }
 const reader=await indexer.connect();let lists:any[]=[];
 try{await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');indexed=(await reader.query('SELECT * FROM indexer."Match"')).rows;lists=(await reader.query('SELECT * FROM indexer."RecentReplays"')).rows;await reader.query('COMMIT');}
 catch(e){await reader.query('ROLLBACK');throw e;}finally{reader.release();}
 for(const match of expected){const actual=indexed.find(i=>i.id===ref(match));assert(actual,`Backfill is missing ${ref(match)}`);
  assert.equal(actual.rulesVersion,7);assert.equal(actual.playerA,match.a);assert.equal(actual.playerB,match.b);assert.equal(actual.mode,match.mode);
  assert.equal(actual.scoreA,match.result.scoreA);assert.equal(actual.scoreB,match.result.scoreB);assert.equal(actual.winner,match.result.winner.toLowerCase());
 }
 assert(indexed.some(i=>i.rulesVersion===6),'The human archive must be present in the same index');
 for(const list of lists){
  const eligible=indexed.filter(i=>i.played&&i.status>=3&&(i.playerA===list.id||i.playerB===list.id)).sort((a,b)=>b.endedAt.localeCompare(a.endedAt)||b.id.localeCompare(a.id)).slice(0,3).map(i=>i.id);
  assert.deepEqual(list.matches,eligible,`Shared top-three order differs for ${list.id}`);
 }
 const kept=new Set(lists.flatMap(r=>r.matches));
 for(const match of indexed.filter(i=>i.played&&i.status>=3&&!kept.has(i.id)))assert.equal(match.replayAvailability,'pruned');
 let retained:any[]=[];const pruneDeadline=Date.now()+120000;
 while(Date.now()<pruneDeadline){
  retained=(await agents.query("SELECT m.id,m.app,m.epoch,r.availability,r.frames IS NOT NULL AS has_frames FROM agent_arcade.replays r JOIN agent_arcade.matches m ON m.id=r.match_id WHERE m.app=$1 AND m.status='complete'",[app])).rows;
  if(retained.every(r=>!indexed.some(i=>i.id===ref(r)&&i.replayAvailability==='pruned')||r.availability==='pruned'&&!r.has_frames))break;
  await new Promise(r=>setTimeout(r,10000));
 }
 for(const r of retained)if(indexed.some(i=>i.id===ref(r)&&i.replayAvailability==='pruned')){assert.equal(r.availability,'pruned');assert.equal(r.has_frames,false);}
 report.agentResultsVerified=expected.length;report.humanResults=indexed.filter(i=>i.rulesVersion===6).length;report.sharedPlayerLists=lists.length;report.prunedResults=indexed.filter(i=>i.replayAvailability==='pruned').length;
 report.checks=['Published identities, modes and scores match agent summaries','Human and agent archives share the same three-per-player ordering','Old replay frames are deleted while result summaries remain'];report.passed=true;
}catch(e){report.error=String((e as Error).message).split('\n')[0].slice(0,250);process.exitCode=1;}
finally{await Promise.all([agents.end(),indexer.end()]);report.finishedAt=new Date().toISOString();await mkdir('artifacts/agents',{recursive:true});await writeFile('artifacts/agents/indexer-backfill.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
