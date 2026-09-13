import {gzipSync,gunzipSync} from 'node:zlib';
import type {Pool} from 'pg';
import type {EngineState} from '../../../shared/engine-stream';
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
/** Verified snapshots only. Continuous matches never create an infinite frame archive. */
export class AgentReplays {
 private queue:Promise<void>=Promise.resolve();
 private last=new Map<string,{time:bigint;revision:bigint;score:string;phase:number}>();
 constructor(private db:Pool,private graphql?:(query:string,variables:unknown)=>Promise<any>){}
 capture(s:EngineState){
  if(s.phase<2)return;const id=String(s.id),prior=this.last.get(id),score=`${s.state.scoreA}:${s.state.scoreB}`;
  if(!s.reset&&prior&&s.revision<=prior.revision)return;
  if(!s.reset&&prior&&s.state.t-prior.time<100000n&&score===prior.score&&s.phase===prior.phase)return;
  this.last.set(id,{time:s.state.t,revision:s.revision,score,phase:s.phase});
  const frame=json({version:1,...s});
  this.queue=this.queue.then(async()=>{
   await this.db.query('INSERT INTO agent_arcade.replays(match_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
   if(s.reset)await this.db.query('DELETE FROM agent_arcade.frames WHERE match_id=$1 AND revision>=$2',[id,String(s.revision)]);
   await this.db.query(`INSERT INTO agent_arcade.frames(match_id,revision,frame) SELECT $1,$2,$3
    WHERE EXISTS(SELECT 1 FROM agent_arcade.replays WHERE match_id=$1 AND availability='recording')
    AND (SELECT count(*) FROM agent_arcade.frames WHERE match_id=$1)<4000 ON CONFLICT DO NOTHING`,[id,String(s.revision),frame]);
  }).catch(()=>{console.error(JSON.stringify({at:new Date().toISOString(),service:'agent-replays',error:'Snapshot persistence failed',match:id}));});
 }
 async finish(id:string){
  await this.queue;
  const rows=(await this.db.query('SELECT frame FROM agent_arcade.frames WHERE match_id=$1 ORDER BY revision',[id])).rows.map(x=>x.frame);
  const effects=[...new Set(rows.flatMap((r:any)=>(r.chaos?.physics?.effects??[]).filter((e:any)=>e.id>0&&Number(r.chaos.physics.t)/1000>=e.startsAt).map((e:any)=>Number(e.id))))].sort((a,b)=>a-b);
  if(effects.length)await this.db.query("UPDATE agent_arcade.matches SET result=jsonb_set(result,'{observedEffects}',$2::jsonb) WHERE id=$1 AND result IS NOT NULL",[id,JSON.stringify(effects)]);
  if(rows.length){const packed=gzipSync(json(rows));await this.db.query("UPDATE agent_arcade.replays SET availability='available',frames=$2,frame_count=$3 WHERE match_id=$1 AND availability='recording'",[id,packed,rows.length]);}
  await this.db.query('DELETE FROM agent_arcade.frames WHERE match_id=$1',[id]);this.last.delete(id);await this.prune();
 }
 async prune(){
  // One shared replay survives while it is in either participant's latest three.
  // Include archived Agent Arcade deployments and both modes in the same rank.
  await this.db.query(`WITH participants AS (
    SELECT id,a AS player,updated_at FROM agent_arcade.matches WHERE status='complete'
    UNION ALL SELECT id,b AS player,updated_at FROM agent_arcade.matches WHERE status='complete'
   ),recent AS(SELECT id,row_number() OVER(PARTITION BY player ORDER BY updated_at DESC,id DESC) AS place FROM participants)
   UPDATE agent_arcade.replays r SET availability='pruned',frames=NULL WHERE r.availability='available'
   AND NOT EXISTS(SELECT 1 FROM recent WHERE recent.id=r.match_id AND place<=3)`);
  if(this.graphql){
   const rows=(await this.db.query(`SELECT m.id,m.app,m.epoch FROM agent_arcade.replays r JOIN agent_arcade.matches m ON m.id=r.match_id WHERE r.availability='available'`)).rows;
   for(let at=0;at<rows.length;at+=100){
    const chunk=rows.slice(at,at+100),ref=(r:any)=>`10143:${r.app}:${r.epoch}:${r.id}`;
    // The same rollback-aware Envio list owns human V1+ and agent retention.
    // An unavailable or not-yet-indexed result never authorizes deletion.
    const data=await this.graphql('query($ids:[String!]!){Match(where:{id:{_in:$ids}}){id replayAvailability}}',{ids:chunk.map(ref)});
    for(const row of chunk)if(data.Match.some((x:any)=>x.id===ref(row)&&['pruned','not-played'].includes(x.replayAvailability)))
     await this.db.query("UPDATE agent_arcade.replays SET availability='pruned',frames=NULL WHERE match_id=$1",[row.id]);
   }
  }
 }
 async reconcile(){
  const pending=(await this.db.query(`SELECT m.id FROM agent_arcade.matches m JOIN agent_arcade.replays r ON r.match_id=m.id
    WHERE m.status IN ('complete','cancelled') AND r.availability='recording' ORDER BY id LIMIT 5`)).rows;
  for(const row of pending)await this.finish(row.id);
  await this.prune();
 }
 async read(id:string){const r=(await this.db.query('SELECT * FROM agent_arcade.replays WHERE match_id=$1',[id])).rows[0];
  return r?{availability:r.availability,frames:r.frames?JSON.parse(gunzipSync(r.frames,{maxOutputLength:16000000}).toString()):[],frameCount:r.frame_count}:{availability:'unavailable',frames:[],frameCount:0};
 }
 async flush(){await this.queue;}
}
