import type {Pool} from 'pg';
import type {Address,PublicClient} from 'viem';
import {abi as ratingsAbi} from '../../shared/abi-independent-PublishedRatings';
import {independentReader} from '../../shared/independent-read';
import {arenaReference,type IndependentManifest} from '../../shared/independent';
import type {EngineState} from '../../shared/engine-stream';
type Graphql=(query:string,variables?:any)=>Promise<any>;
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
export async function independentHistory(db:Pool,base:PublicClient,m:IndependentManifest,graphql?:Graphql){
 const scope=m.lobby.toLowerCase(),r=independentReader(base,m);
 await db.query(`CREATE TABLE IF NOT EXISTS independent_history(lobby text NOT NULL,id text NOT NULL,ref text NOT NULL,record jsonb NOT NULL,block_number bigint NOT NULL,ended_at bigint NOT NULL,replay text NOT NULL DEFAULT 'recording',PRIMARY KEY(lobby,id));
 CREATE TABLE IF NOT EXISTS independent_frames(lobby text NOT NULL,id text NOT NULL,revision bigint NOT NULL,snapshot jsonb NOT NULL,PRIMARY KEY(lobby,id,revision));
 CREATE TABLE IF NOT EXISTS independent_history_cursor(lobby text PRIMARY KEY,block_number bigint NOT NULL);`);
 const buffer=new Map<string,{app:Address;epoch:bigint;s:EngineState}>();let writing=false;
 function record(app:Address,epoch:bigint,s:EngineState){if(s.id&&epoch)buffer.set(String(s.id),{app,epoch,s});}
 async function flush(){if(writing)return;writing=true;try{
  const entries=[...buffer.values()];
  for(const item of entries){const {s}=item;
   const status=(await db.query('SELECT replay FROM independent_history WHERE lobby=$1 AND id=$2',[scope,String(s.id)])).rows[0]?.replay;
   if(status==='pruned'){if(buffer.get(String(s.id))===item)buffer.delete(String(s.id));continue;}
   if(s.reset)await db.query('DELETE FROM independent_frames WHERE lobby=$1 AND id=$2 AND revision>=$3',[scope,String(s.id),String(s.revision)]);
   await db.query('INSERT INTO independent_frames VALUES($1,$2,$3,$4) ON CONFLICT(lobby,id,revision) DO UPDATE SET snapshot=$4',[scope,String(s.id),String(s.revision),json(s)]);
   if(buffer.get(String(s.id))===item)buffer.delete(String(s.id));
  }
 }finally{writing=false;}}
 async function observe(){
  const head=await base.getBlockNumber(),old=(await db.query('SELECT block_number FROM independent_history_cursor WHERE lobby=$1',[scope])).rows[0];
  const start=old?BigInt(old.block_number)>8n?BigInt(old.block_number)-8n:0n:BigInt(m.startBlock??process.env.PONG_INDEPENDENT_START_BLOCK??head);
  const end=start+99n<head?start+99n:head;
  const logs=await base.getContractEvents({address:m.ratings,abi:ratingsAbi,fromBlock:start,toBlock:end});
  const revisited=(await db.query('SELECT id FROM independent_history WHERE lobby=$1 AND block_number>=$2 AND block_number<=$3',[scope,String(start),String(end)])).rows;
  for(const row of revisited)if(!await r.ratings('indexOf',[BigInt(row.id)]))await db.query('DELETE FROM independent_history WHERE lobby=$1 AND id=$2',[scope,row.id]);
  for(const log of logs){
   if(!['ResultPublished','ResultCorrected','ResultFinal'].includes(log.eventName))continue;
   const id=BigInt((log.args as any).id),entry=await r.ratings('entry',[id]),ref=arenaReference(entry.first.arena,entry.first.epoch,id);
   // Full current ledger state verifies every cached summary. Original payment
   // decisions and corrected results are both retained; no second payout is queued.
   const previous=(await db.query('SELECT record FROM independent_history WHERE lobby=$1 AND id=$2',[scope,String(id)])).rows[0]?.record;
   await db.query(`INSERT INTO independent_history(lobby,id,ref,record,block_number,ended_at,replay) VALUES($1,$2,$3,$4,$5,$6,'available')
    ON CONFLICT(lobby,id) DO UPDATE SET record=$4`,[scope,String(id),ref,json(entry),String(log.blockNumber),String(entry.at)]);
   if(log.eventName==='ResultCorrected'&&previous?.latest.hash!==entry.latest.hash)console.warn(json({event:'published-result-corrected',arena:entry.first.arena,epoch:entry.first.epoch,id,initial:entry.first.hash,correction:entry.latest.hash,transaction:log.transactionHash,at:new Date().toISOString()}));
  }
  await db.query('INSERT INTO independent_history_cursor VALUES($1,$2) ON CONFLICT(lobby) DO UPDATE SET block_number=$2',[scope,String(end)]);
  await retain();
 }
 async function retain(){
  // Envio owns the shared V1+ retention list. While its new generation is not
  // caught up, only prune entries proven outside both participants' newest three
  // within this generation. Older summaries and all financial data remain intact.
  const rows=(await db.query('SELECT * FROM independent_history WHERE lobby=$1 ORDER BY block_number DESC,id DESC',[scope])).rows;
  const counts=new Map<string,number>(),keep=new Set<string>();
  for(const row of rows){const e=row.record.latest;if(e.status!==3)continue;
   for(const address of [e.a,e.b]){const player=address.toLowerCase(),n=(counts.get(player)||0)+1;counts.set(player,n);if(n<=3)keep.add(row.id);}
  }
  for(const row of rows){
   if(row.replay==='pruned')continue;
   let drop=!keep.has(row.id);
   if(graphql){const view=await graphql('query($id:String!){Match(where:{id:{_eq:$id}}){replayAvailability}}',{id:row.ref}).catch(()=>null);
    if(view?.Match[0]?.replayAvailability==='pruned')drop=true;
   }
   if(drop){await db.query('UPDATE independent_history SET replay=\'pruned\' WHERE lobby=$1 AND id=$2',[scope,row.id]);await db.query('DELETE FROM independent_frames WHERE lobby=$1 AND id=$2',[scope,row.id]);}
  }
 }
 async function recent(player:Address){
  const rows=(await db.query("SELECT * FROM independent_history WHERE lobby=$1 AND record->'latest'->>'status'='3' AND (lower(record->'latest'->>'a')=$2 OR lower(record->'latest'->>'b')=$2) ORDER BY ended_at DESC,id DESC LIMIT 3",[scope,player.toLowerCase()])).rows;
  const verified:any[]=[];for(const row of rows){if(!await r.ratings('indexOf',[BigInt(row.id)]))continue;const entry=await r.ratings('entry',[BigInt(row.id)]);if(entry.latest.status===3)verified.push({ref:row.ref,id:row.id,...entry,endedBlock:String(row.block_number),replayAvailability:row.replay});}
  if(graphql){const old=await graphql('query($player:String!){RecentReplays(where:{id:{_eq:$player}}){matches}}',{player:player.toLowerCase()}).catch(()=>null);
   const ids=old?.RecentReplays[0]?.matches.filter((x:string)=>/^v[1-4]:\d+$/.test(x))||[];
   if(ids.length){const data=await graphql('query($ids:[String!]!){Match(where:{id:{_in:$ids}}){id rawId status playerA playerB winner scoreA scoreB mode ranked endedAt replayAvailability}}',{ids});
    for(const v of data.Match)verified.push({legacy:true,ref:v.id,id:v.rawId,finality:true,latest:{a:v.playerA,b:v.playerB,winner:v.winner,status:v.status,scoreA:v.scoreA,scoreB:v.scoreB,mode:v.mode,ranked:v.ranked},endedBlock:v.endedAt.split(':')[0],replayAvailability:v.replayAvailability});
   }
  }
  return verified.sort((a,b)=>BigInt(a.endedBlock)===BigInt(b.endedBlock)?b.ref.localeCompare(a.ref):BigInt(a.endedBlock)>BigInt(b.endedBlock)?-1:1).slice(0,3);
 }
 async function replay(id:bigint,after:bigint){
  const row=(await db.query('SELECT ref,record,replay FROM independent_history WHERE lobby=$1 AND id=$2',[scope,String(id)])).rows[0];
  if(!row)return {availability:'not-recorded',frames:[]};
  if(!await r.ratings('indexOf',[id]))return {availability:'reorganizing',frames:[]};
  if(row.replay==='pruned')return {availability:'pruned',ref:row.ref,frames:[]};
  const frames=(await db.query('SELECT snapshot FROM independent_frames WHERE lobby=$1 AND id=$2 AND revision>$3 ORDER BY revision LIMIT 1000',[scope,String(id),String(after)])).rows.map(r=>r.snapshot);
  return {availability:frames.length?'available':'not-recorded',ref:row.ref,record:row.record,frames};
 }
 async function frequent(player:Address){
  const rows=(await db.query("SELECT record FROM independent_history WHERE lobby=$1 AND ended_at>$3 AND record->'latest'->>'status'='3' AND (lower(record->'latest'->>'a')=$2 OR lower(record->'latest'->>'b')=$2)",[scope,player.toLowerCase(),Math.floor(Date.now()/1000)-30*86400])).rows;
  const count=new Map<string,{player:Address;count:number;at:number}>(),records=rows.map(row=>({...row.record.latest,at:Number(row.record.at)}));
  const old=(await db.query("SELECT a,b,extract(epoch FROM ended_at)::bigint AS at FROM il_results WHERE verified AND phase=3 AND ended_at>now()-interval '30 days' AND (lower(a)=$1 OR lower(b)=$1)",[player.toLowerCase()]).catch(()=>({rows:[]}))).rows;
  records.push(...old);
  if(graphql){let offset=0;const cutoff=Math.floor(Date.now()/1000)-30*86400,blocks=new Map<string,number>();
   for(;;){const data=await graphql('query($player:String!,$offset:Int!){Match(where:{played:{_eq:true},status:{_eq:3},_or:[{playerA:{_eq:$player}},{playerB:{_eq:$player}}]},order_by:{block:desc},limit:100,offset:$offset){id playerA playerB endedAt block}}',{player:player.toLowerCase(),offset}).catch(()=>null);if(!data)break;
    let past=false;for(const v of data.Match){if(!/^v[1-4]:\d+$/.test(v.id))continue;const height=v.endedAt?.split(':')[0]||v.block;
     let at=blocks.get(height);if(at===undefined){at=Number((await base.getBlock({blockNumber:BigInt(height)})).timestamp);blocks.set(height,at);}
     if(at<cutoff){past=true;continue;}records.push({a:v.playerA,b:v.playerB,at});
    }if(past||data.Match.length<100)break;offset+=100;
   }
  }
  for(const e of records){const other=(e.a.toLowerCase()===player.toLowerCase()?e.b:e.a).toLowerCase() as Address;
   const item=count.get(other)||{player:other,count:0,at:0};item.count++;item.at=Math.max(item.at,Number(e.at));count.set(other,item);
  }
  return [...count.values()].sort((a,b)=>b.count-a.count||b.at-a.at||a.player.localeCompare(b.player)).slice(0,8);
 }
 const timer=setInterval(()=>void flush().catch(()=>{}),250);timer.unref();
 return {record,observe,recent,replay,frequent,stop:()=>clearInterval(timer)};
}
