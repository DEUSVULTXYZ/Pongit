import type {Pool} from "pg";
import {decodeEventLog,padHex,toEventSelector,toHex,zeroHash,type Address,type Hex,type PublicClient} from "viem";
import {roomsSettlementAuditAbi} from "../../shared/abi-rooms-settlement-audit";
import {roomsEarlySettlementAbi} from "../../shared/abi-RoomsEarlySettlement";
import {roomsLifecycleHubAbi} from "../../shared/abi-rooms-lifecycle";
import {roomsChaosAbi} from "../../shared/abi-PongRoomsTestnet";
import {financeScope,type RoomsFinanceManifest} from "./rooms-finance-config";

const json=(x:unknown)=>JSON.stringify(x,(_,v)=>typeof v==="bigint"?String(v):v);

/** Independent of admission and Interlude RPC availability. Public chain facts only.
 * The durable audit is never used to issue compensating or repeat payments.
 */
export async function createSettlementAudit(db:Pool,base:PublicClient,m:RoomsFinanceManifest,hub:Address){
  const scope=financeScope(m),start=BigInt(m.startBlock);
  await db.query(`
    CREATE TABLE IF NOT EXISTS il_settlement_cursor(scope text PRIMARY KEY,block text NOT NULL,hash text NOT NULL,epoch text NOT NULL);
    CREATE TABLE IF NOT EXISTS il_settlement_events(scope text NOT NULL,event_id text NOT NULL,block text NOT NULL,block_hash text NOT NULL,tx_hash text NOT NULL,epoch text NOT NULL,kind text NOT NULL,args jsonb NOT NULL,canonical boolean NOT NULL DEFAULT true,observed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(scope,event_id));
    CREATE TABLE IF NOT EXISTS il_settlement_checks(scope text NOT NULL,id text NOT NULL,epoch text NOT NULL,batch text NOT NULL,accepted_hash text NOT NULL,observed_hash text NOT NULL,observed_block text NOT NULL,PRIMARY KEY(scope,id,observed_hash));
    CREATE TABLE IF NOT EXISTS il_settlement_rechecks(scope text NOT NULL,block text NOT NULL,PRIMARY KEY(scope,block));
    CREATE OR REPLACE VIEW il_settlement_challenge_report AS
      SELECT e.scope,e.event_id,e.kind,e.tx_hash,e.epoch,e.observed_at,e.canonical,e.args,
        a.args->>'id' AS match_id,a.args->>'winner' AS accepted_winner,a.args->>'resultHash' AS accepted_result_hash
      FROM il_settlement_events e LEFT JOIN il_settlement_events a ON a.scope=e.scope AND a.kind='EarlyResultAccepted' AND a.epoch=e.epoch
        AND (COALESCE(e.args->>'batchIndex',e.args->>'toBatch') IS NULL OR (a.args->>'batch')::numeric >= COALESCE(e.args->>'batchIndex',e.args->>'toBatch')::numeric)
      WHERE e.kind IN ('Challenged','AvailabilityChallenged','ChallengeResolved','ChallengeTimedOut','AvailabilityTimedOut','StateUnwound');
  `);
  let working=false,last=0,lastError="";
  async function audit(){
    if(working||Date.now()-last<10000)return;
    working=true;last=Date.now();
    try{
      const head=await base.getBlockNumber(),safe=head>2n?head-2n:0n;
      let cursor=(await db.query("SELECT * FROM il_settlement_cursor WHERE scope=$1",[scope])).rows[0];
      if(cursor){
        const block=await base.getBlock({blockNumber:BigInt(cursor.block)});
        if(block.hash!==cursor.hash){
          // Keep orphaned observations as evidence; replay from this deployment's start.
          await db.query("UPDATE il_settlement_events SET canonical=false WHERE scope=$1",[scope]);
          await db.query("DELETE FROM il_settlement_cursor WHERE scope=$1",[scope]);
          console.warn(json({event:"rooms-settlement-reorganization",at:new Date().toISOString(),scope,block:cursor.block}));
          cursor=undefined;
        }
      }
      await recheck();
      const from=cursor?BigInt(cursor.block)+1n:start;
      if(from>safe)return;
      const to=from+499n<safe?from+499n:safe;
      let epoch=cursor?BigInt(cursor.epoch):(await base.readContract({address:hub,abi:roomsLifecycleHubAbi,functionName:"sessionOf",args:[m.app,zeroHash],blockNumber:from-1n})).epoch;
      const end=await base.getBlock({blockNumber:to});
      const events:any[]=[];
      for(let low=from;low<=to;low+=100n){
        const high=low+99n<to?low+99n:to;
        const logs=await base.request({method:"eth_getLogs",params:[{address:hub,fromBlock:toHex(low),toBlock:toHex(high),topics:[roomsSettlementAuditAbi.map(toEventSelector),padHex(m.app),zeroHash]}]});
        for(const log of logs){
          const decoded=decodeEventLog({abi:roomsSettlementAuditAbi,data:log.data,topics:log.topics as [Hex,...Hex[]]});
          if(decoded.eventName==="DelegationOpened"){
            const current=(await base.readContract({address:hub,abi:roomsLifecycleHubAbi,functionName:"sessionOf",args:[m.app,zeroHash],blockNumber:BigInt(log.blockNumber!)})).epoch;
            if(current===0n)throw new Error("Cannot attribute a delegation epoch at this block; operator replay required");
            const laterOpens=logs.filter(x=>x.blockNumber===log.blockNumber&&Number(x.logIndex)>Number(log.logIndex)&&x.topics[0]===toEventSelector(roomsSettlementAuditAbi.find(x=>x.name==="DelegationOpened")!)).length;
            epoch=current-BigInt(laterOpens);
          }
          events.push({...log,blockNumber:BigInt(log.blockNumber!),logIndex:Number(log.logIndex),kind:decoded.eventName,args:decoded.args,epoch:String(epoch)});
        }
        const accepted=await base.getContractEvents({address:m.adapter,abi:roomsEarlySettlementAbi,eventName:"EarlyResultAccepted",fromBlock:low,toBlock:high});
        for(const log of accepted)events.push({...log,kind:log.eventName,epoch:String(log.args.epoch)});
      }
      if((await base.getBlock({blockNumber:to})).hash!==end.hash)throw new Error("Settlement audit range reorganized; retrying");
      const c=await db.connect();const fresh:any[]=[];
      try{
        await c.query("BEGIN");
        for(const e of events){
          const id=`${e.blockHash}:${e.transactionHash}:${e.logIndex}`;
          const r=await c.query("INSERT INTO il_settlement_events(scope,event_id,block,block_hash,tx_hash,epoch,kind,args) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(scope,event_id) DO UPDATE SET canonical=true WHERE NOT il_settlement_events.canonical RETURNING event_id",[scope,id,String(e.blockNumber),e.blockHash,e.transactionHash,e.epoch,e.kind,json(e.args)]);
          if(r.rowCount)fresh.push(e);
          if(["StateUnwound","ChallengeResolved","StakeReleased"].includes(e.kind))await c.query("INSERT INTO il_settlement_rechecks VALUES($1,$2) ON CONFLICT DO NOTHING",[scope,String(to)]);
        }
        await c.query("INSERT INTO il_settlement_cursor VALUES($1,$2,$3,$4) ON CONFLICT(scope) DO UPDATE SET block=$2,hash=$3,epoch=$4",[scope,String(to),end.hash,String(epoch)]);
        await c.query("COMMIT");
      }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
      for(const e of fresh)console.info(json({event:"rooms-settlement-audit",at:new Date().toISOString(),scope,kind:e.kind,epoch:e.epoch,block:String(e.blockNumber),txHash:e.transactionHash,args:e.args}));
      await recheck();
      lastError="";
    }catch(e){lastError=(e as Error).message;console.warn(json({event:"rooms-settlement-audit-unavailable",scope,message:lastError}));}
    finally{working=false;}
  }
  async function recheck(){
    // Persist requests before moving the event cursor so a failed RPC is retried after restart.
    const task=(await db.query("SELECT block FROM il_settlement_rechecks WHERE scope=$1 ORDER BY block::numeric LIMIT 1",[scope])).rows[0];
    if(!task)return;
    const to=BigInt(task.block);
    const accepted=(await db.query("SELECT args,epoch FROM il_settlement_events WHERE scope=$1 AND canonical AND kind='EarlyResultAccepted' AND block::numeric<=$2::numeric",[scope,String(to)])).rows;
    for(const a of accepted){
      const hash=await base.readContract({address:m.app,abi:roomsChaosAbi,functionName:"resultHashes",args:[BigInt(a.args.id)],blockNumber:to});
      if(hash===a.args.resultHash)continue;
      const r=await db.query("INSERT INTO il_settlement_checks VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id",[scope,a.args.id,a.epoch,a.args.batch,a.args.resultHash,hash,String(to)]);
      if(r.rowCount)console.warn(json({event:"rooms-accepted-result-corrected",at:new Date().toISOString(),scope,id:a.args.id,epoch:a.epoch,before:a.args.resultHash,after:hash,block:String(to)}));
    }
    await db.query("DELETE FROM il_settlement_rechecks WHERE scope=$1 AND block=$2",[scope,String(to)]);
  }
  return {audit,status:()=>lastError};
}
