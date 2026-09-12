import {encodeAbiParameters,keccak256,parseEther,zeroHash,type Abi,type Address,type Hex,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {Pool} from 'pg';
import type {IndependentManifest} from '../../shared/independent';
import {abi as marketAbi} from '../../shared/abi-independent-MarketV4';
import {abi as settlementAbi} from '../../shared/abi-independent-IndependentSettlement';
import {independentReader} from '../../shared/independent-read';
import {sameChaosPause} from '../../shared/independent-recovery';
import type {EngineState} from '../../shared/engine-stream';
import type {independentEngine} from './independent-engine';

type Enqueue=(at:Address,abi:Abi,name:string,args?:readonly unknown[],value?:bigint,priority?:number)=>Promise<unknown>;
/** Finance observes Monad independently of game admission and of expired engines. */
export async function independentFinance(db:Pool,base:PublicClient,m:IndependentManifest,key:Hex,queue:Enqueue){
 const signer=privateKeyToAccount(key),r=independentReader(base,m);
 if(signer.address.toLowerCase()!==m.pressureSigner.toLowerCase())throw Error('Bridge signer mismatch');
 await db.query(`CREATE TABLE IF NOT EXISTS independent_pressure(
 lobby text NOT NULL,arena text NOT NULL,epoch text NOT NULL,id text NOT NULL,rally integer NOT NULL,resume_at text NOT NULL,
 source_block text NOT NULL,source_hash text NOT NULL,paid_a text NOT NULL,paid_b text NOT NULL,checkpoint text NOT NULL,
 PRIMARY KEY(lobby,id,rally));
 CREATE TABLE IF NOT EXISTS independent_bettors(lobby text NOT NULL,id text NOT NULL,player text NOT NULL,settled boolean NOT NULL DEFAULT false,PRIMARY KEY(lobby,id,player));
 CREATE TABLE IF NOT EXISTS independent_finance_cursor(lobby text PRIMARY KEY,block_number bigint NOT NULL);
 CREATE TABLE IF NOT EXISTS independent_payments(lobby text NOT NULL,payout_id text NOT NULL,state text NOT NULL,hash text NOT NULL,PRIMARY KEY(lobby,payout_id));`);
 const read=(at:Address,abi:Abi,name:string,args:readonly unknown[]=[],blockNumber?:bigint):Promise<any>=>base.readContract({address:at,abi,functionName:name,args,blockNumber} as any);
 async function checkpoint(e:ReturnType<typeof independentEngine>){
  const s=await e.read();if(s.phase!==2||s.state.mode!==1||!s.state.awaitingServe)return;
  const b=await r.arena(e.app,'boundMatch');if(b.id!==s.id)throw Error('Pressure match reference changed');
  const published=await r.arena(e.app,'getSnapshot',[s.id]);
  // openRound reads Monad. An earlier published pause is not the current engine
  // rally, even if the calldata is identical. Wait without repeated simulations.
  if(Number(published[2])!==2||!sameChaosPause(s.state,published[12]))return;
  const rally=s.state.scoreA+s.state.scoreB,resume=s.state.resumeAt;
  const book=await read(m.market,marketAbi,'books',[s.id]);
  if(!book[2]){await queue(m.market,marketAbi,'open',[s.id,parseEther('0.01')],parseEther('0.01'),2);return;}
  const round=await read(m.settlement,settlementAbi,'rounds',[s.id,rally]);
  if(!round[0]){await queue(m.settlement,settlementAbi,'openRound',[s.id],0n,1);return;}
  const [ready,source]=await read(m.settlement,settlementAbi,'checkpointReady',[s.id,rally,resume]);if(!ready)return;
  if(round[5].toLowerCase()!==e.app.toLowerCase()||round[4]!==b.epoch)throw Error('Pressure round belongs to another delegation');
  const block=await base.getBlock({blockNumber:source});if(!block.hash)throw Error('Checkpoint block unavailable');
  let p=(await db.query('SELECT * FROM independent_pressure WHERE lobby=$1 AND id=$2 AND rally=$3',[m.lobby.toLowerCase(),String(s.id),rally])).rows[0];
  if(!p){
   const paid=await read(m.market,marketAbi,'pressure',[s.id],source);
   const checkpoint=keccak256(encodeAbiParameters([
    {type:'uint256'},{type:'address'},{type:'address'},{type:'uint256'},{type:'uint256'},{type:'uint8'},{type:'uint64'},{type:'uint64'},{type:'bytes32'},{type:'uint128'},{type:'uint128'}
   ],[10143n,e.app,m.market,b.epoch,s.id,rally,resume,source,block.hash,paid[0],paid[1]]));
   await db.query('INSERT INTO independent_pressure VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING',[m.lobby.toLowerCase(),e.app.toLowerCase(),String(b.epoch),String(s.id),rally,String(resume),String(source),block.hash,String(paid[0]),String(paid[1]),checkpoint]);
   p=(await db.query('SELECT * FROM independent_pressure WHERE lobby=$1 AND id=$2 AND rally=$3',[m.lobby.toLowerCase(),String(s.id),rally])).rows[0];
  }
  if(p.source_hash!==block.hash||p.epoch!==String(b.epoch)||p.arena!==e.app.toLowerCase()||p.resume_at!==String(resume)||p.source_block!==String(source)){
   console.error(JSON.stringify({event:'chaos-checkpoint-review',arena:e.app,id:String(s.id),epoch:String(b.epoch),sourceBlock:String(source),at:new Date().toISOString()}));
   throw Error('Chaos checkpoint changed. This rally needs review.');
  }
  const engineBlock=await e.node.getBlock();
  const attestation={epoch:b.epoch,matchId:s.id,rally,resumeAt:resume,paidA:BigInt(p.paid_a),paidB:BigInt(p.paid_b),sourceBlock:source,checkpoint:p.checkpoint as Hex,expires:engineBlock.timestamp+25n};
  // Match the contract's domain exactly; no wallet spending authority is involved.
  const digest=await r.arena(e.app,'pressureDigest',[attestation]);
  const signature=await signer.sign({hash:digest});
  await e.send('submitPressure',[attestation,signature]);
  await e.send('tick',[s.id]);
 }
 async function rallyStatus(app:Address,s:EngineState){
  if(s.phase!==2||s.state.mode!==1||!s.state.awaitingServe)return null;
  const identity={id:String(s.id),rally:s.state.scoreA+s.state.scoreB,resumeAt:String(s.state.resumeAt)};
  const published=await r.arena(app,'getSnapshot',[s.id]);
  if(Number(published[2])!==2||!sameChaosPause(s.state,published[12]))return {...identity,label:'Waiting for point publication'};
  const round=await read(m.settlement,settlementAbi,'rounds',[s.id,s.state.scoreA+s.state.scoreB]);
  if(!round[0])return {...identity,label:'Preparing betting window'};
  const head=await base.getBlockNumber();
  return {...identity,label:head<round[0]?'Betting open':head<round[0]+2n?'Closing bets':'Preparing next rally',closeBlock:String(round[0]),head:String(head)};
 }
 async function payments(){
  const head=await base.getBlockNumber();
  const row=(await db.query('SELECT block_number FROM independent_finance_cursor WHERE lobby=$1',[m.lobby.toLowerCase()])).rows[0];
  const from=row?BigInt(row.block_number)>8n?BigInt(row.block_number)-8n:0n:BigInt(m.startBlock??process.env.PONG_INDEPENDENT_START_BLOCK??head);
  const to=from+99n<head?from+99n:head;
  const logs=await base.getContractEvents({address:m.market,abi:marketAbi,fromBlock:from,toBlock:to});
  const c=await db.connect();try{
   await c.query('BEGIN');
   for(const log of logs){const a=log.args as any;
    if(log.eventName==='BetPlaced')await c.query('INSERT INTO independent_bettors(lobby,id,player) VALUES($1,$2,$3) ON CONFLICT(lobby,id,player) DO UPDATE SET settled=false',[m.lobby.toLowerCase(),String(a.matchId),a.player.toLowerCase()]);
    if(['PayoutPaid','PayoutDeferred'].includes(log.eventName))await c.query('INSERT INTO independent_payments VALUES($1,$2,$3,$4) ON CONFLICT(lobby,payout_id) DO UPDATE SET state=$3,hash=$4',[m.lobby.toLowerCase(),a.payoutId,log.eventName,log.transactionHash]);
   }
   await c.query('INSERT INTO independent_finance_cursor VALUES($1,$2) ON CONFLICT(lobby) DO UPDATE SET block_number=$2',[m.lobby.toLowerCase(),String(to)]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  const pending=(await db.query('SELECT id,player FROM independent_bettors WHERE lobby=$1 AND NOT settled ORDER BY id LIMIT 20',[m.lobby.toLowerCase()])).rows;
  for(const p of pending){
   const id=BigInt(p.id),result=await read(m.settlement,settlementAbi,'result',[id]);if(result[3]<3)continue;
   const position=await read(m.market,marketAbi,'positions',[id,p.player]);
   if(position[2]&&!position[3]){await queue(m.market,marketAbi,'claim',[id,p.player],0n,3);continue;}
   if(position[3]){
    const payoutId=await read(m.market,marketAbi,'payoutId',[0,id,p.player]),payout=await read(m.market,marketAbi,'payouts',[payoutId]);
    if(payout[2]===1&&payout[3]<6){await queue(m.market,marketAbi,'retryPayout',[payoutId],0n,4);continue;}
   }
   await db.query('UPDATE independent_bettors SET settled=true WHERE lobby=$1 AND id=$2 AND player=$3',[m.lobby.toLowerCase(),p.id,p.player]);
  }
 }
 async function view(id:bigint,player:Address,side:number,shares:bigint){
  const [book,window,result,position,paid,quote,head]=await Promise.all([
   read(m.market,marketAbi,'books',[id]),read(m.settlement,settlementAbi,'bettingWindow',[id,0]),read(m.settlement,settlementAbi,'result',[id]),
   read(m.market,marketAbi,'positions',[id,player]),read(m.market,marketAbi,'pressure',[id]),read(m.market,marketAbi,'quote',[id,side,shares]).catch(()=>null),base.getBlockNumber()]);
  const payoutId=await read(m.market,marketAbi,'payoutId',[0,id,player]);
  const payout=await read(m.market,marketAbi,'payouts',[payoutId]);
  const payment=(await db.query('SELECT state,hash FROM independent_payments WHERE lobby=$1 AND payout_id=$2',[m.lobby.toLowerCase(),payoutId])).rows[0]??null;
  return {book,window,result,position,paid,quote,head,payoutId,payout,payment};
 }
 async function accountPayments(player:Address){
  const rows=(await db.query('SELECT id FROM independent_bettors WHERE lobby=$1 AND player=$2 ORDER BY id DESC LIMIT 50',[m.lobby.toLowerCase(),player.toLowerCase()])).rows;
  const results=[];for(const row of rows){
   const id=BigInt(row.id),payoutId=await read(m.market,marketAbi,'payoutId',[0,id,player]);
   const [payout,result,position]=await Promise.all([read(m.market,marketAbi,'payouts',[payoutId]),read(m.settlement,settlementAbi,'result',[id]),read(m.market,marketAbi,'positions',[id,player])]);
   const payment=(await db.query('SELECT state,hash FROM independent_payments WHERE lobby=$1 AND payout_id=$2',[m.lobby.toLowerCase(),payoutId])).rows[0]??null;
   results.push({id,payoutId,payout,result,position,payment});
  }return results;
 }
 return {checkpoint,payments,view,accountPayments,rallyStatus};
}
