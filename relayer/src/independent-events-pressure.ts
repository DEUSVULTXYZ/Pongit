import {parseEther,type Abi,type Address,type Hex,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {Pool} from 'pg';
import type {IndependentManifest} from '../../shared/independent';
import {independentReader} from '../../shared/independent-read';
import {independentRules} from '../../shared/independent-rules';
import {eventsPressureDomain,eventsPressureTypes,livePressureCheckpoint} from '../../shared/rooms-live-pressure';
import type {independentEngine} from './independent-engine';

type Queue=(at:Address,abi:Abi,name:string,args?:readonly unknown[],value?:bigint,priority?:number)=>Promise<unknown>;
/** The approved testnet bridge observes paid Monad amounts. It never stops a
 * rally waiting for a bet. A delayed checkpoint is queued for the next point. */
export async function independentEventsPressure(db:Pool,base:PublicClient,m:IndependentManifest,key:Hex,queue:Queue){
 const rules=independentRules(m);if(!rules.events)throw Error('Events pressure needs rules 12');
 const signer=privateKeyToAccount(key);if(signer.address.toLowerCase()!==m.pressureSigner.toLowerCase())throw Error('Bridge signer mismatch');
 await db.query(`CREATE TABLE IF NOT EXISTS independent_live_pressure(
  lobby text NOT NULL,arena text NOT NULL,epoch numeric(78,0) NOT NULL,id numeric(78,0) NOT NULL,
  source_block bigint NOT NULL,source_hash text NOT NULL,paid_a numeric(78,0) NOT NULL,paid_b numeric(78,0) NOT NULL,checkpoint text NOT NULL,
  PRIMARY KEY(lobby,arena,epoch,id,source_block));`);
 const read=(at:Address,abi:Abi,name:string,args:readonly unknown[]=[],blockNumber?:bigint):Promise<any>=>base.readContract({address:at,abi,functionName:name,args,blockNumber} as any);
 async function checkpoint(e:ReturnType<typeof independentEngine>){
  const ref=e.reference(),s=await e.read();if(s.id!==ref.id||s.phase!==2||s.state.mode!==1||!s.chaos||e.busy())return;
  const head=await base.getBlockNumber({cacheTime:0}),source=head>2n?head-2n:0n;if(!source)return;
  const r=independentReader(base,m,source),binding=await r.arena(e.app,'boundMatch');
  if(binding.id!==ref.id||binding.epoch!==ref.epoch)return;
  const [book,market]=await Promise.all([read(m.market,rules.market,'books',[ref.id],source),read(m.settlement,rules.settlement,'markets',[ref.id],source)]);
  if(book[2]===0n||market[1]===0n){
   const published=await r.arena(e.app,'getSnapshot',[ref.id]);
   const phase=rules.version===14?published.phase:published[2],state=rules.version===14?published.state:published[12];
   if(Number(phase)!==2||state.mode!==1||state.seed!==s.state.seed)return;
   if(book[2]===0n){await queue(m.market,rules.market,'open',[ref.id,parseEther('0.005')],parseEther('0.004'),2);return;}
   await queue(m.settlement,rules.settlement,'openRound',[ref.id],0n,1);return;
  }
  if(market[0].toLowerCase()!==e.app.toLowerCase()||market[1]!==ref.epoch)throw Error('Pressure market belongs to another arena epoch');
  const [block,paid]=await Promise.all([base.getBlock({blockNumber:source}),read(m.market,rules.market,'pressure',[ref.id],source)]);
  if(!block.hash)throw Error('Confirmed betting block unavailable');
  const queued=await e.node.readContract({address:e.app,abi:rules.arena,functionName:'queuedPressure',args:[ref.id]});
  const [paidA,paidB]=paid as [bigint,bigint];
  if(paidA<queued[0]||paidB<queued[1])throw Error('Betting source changed; retaining the last authenticated paddle sizes');
  if(paidA===queued[0]&&paidB===queued[1]||source<=queued[2])return;
  const digest=livePressureCheckpoint(e.app,m.market,ref.id,ref.epoch,s.state.seed,source,block.hash,paidA,paidB);
  if((await base.getBlock({blockNumber:source})).hash!==block.hash)throw Error('Betting source reorganized');
  const id=[m.lobby.toLowerCase(),e.app.toLowerCase(),String(ref.epoch),String(ref.id),String(source)];
  await db.query('INSERT INTO independent_live_pressure VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[...id,block.hash,String(paidA),String(paidB),digest]);
  const stored=(await db.query('SELECT checkpoint FROM independent_live_pressure WHERE lobby=$1 AND arena=$2 AND epoch=$3 AND id=$4 AND source_block=$5',id)).rows[0];
  if(stored?.checkpoint!==digest)throw Error('Conflicting confirmed betting source');
  const current=await e.read(),currentRef=e.reference();
  if(currentRef.id!==ref.id||currentRef.epoch!==ref.epoch||current.id!==ref.id||current.phase!==2||current.state.seed!==s.state.seed)return;
  const rally=current.chaos?.physics.score.rally;if(!Number.isSafeInteger(rally)||!rally)throw Error('Verified rally counter unavailable');
  const engineBlock=await e.node.getBlock();
  const p={matchId:ref.id,epoch:ref.epoch,seed:s.state.seed as Hex,rally,paidA,paidB,sourceBlock:source,checkpoint:digest,expires:engineBlock.timestamp+25n};
  // A proof that became ready during the Monad reads owns the next command.
  if(e.busy()||e.reference().id!==ref.id||e.reference().epoch!==ref.epoch)return;
  const signature=await signer.signTypedData({domain:eventsPressureDomain(e.app),types:eventsPressureTypes,primaryType:'LivePressure',message:p});
  await e.send('submitLivePressure',[p,signature]);
  // A receipt may describe catch-up without installing this checkpoint. The
  // next pass reads queuedPressure again rather than treating delivery as final.
 }
 return {checkpoint};
}
