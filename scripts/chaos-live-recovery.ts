// Complete a stopped private live fixture by an explicit player concession.
// Never relabel the interrupted natural-game trial as passed.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,keccak256,toHex,parseEther,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {decodeSession} from '@interludelayer-sdk/sdk';
import {Pool} from 'pg';
import {chainTools} from './independent-chain-tools';
import {compactRoomsSession} from '../shared/compact-rooms-session';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal';
import {engineTransport} from '../shared/engine-transport';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';
import {realtimeMarketAbi as marketAbi} from '../shared/abi-RealtimeMarket';
import {createRoomsFinance} from '../relayer/src/rooms-finance';
import {loadRoomsFinance} from '../relayer/src/rooms-finance-config';

assert.equal(process.env.PONG_CHAOS_LIVE_RECOVERY,'authorized-private-concession');assert.equal(process.getuid?.(),1000);
const prefix=process.env.PONG_CHAOS_QUALIFY_ID!,run=process.env.PONG_REALTIME_RUN!;
assert(/^chaos-events-rules9-\d{8}$/.test(prefix)&&/^[1-9]$/.test(run));
const attempt=process.env.PONG_RECOVERY_ATTEMPT??'1';assert(/^[1-9]$/.test(attempt));
const file=`/secrets/${prefix}-live-${run}.json`,saved=JSON.parse(await readFile(file,'utf8'));
const old=JSON.parse(await readFile(`artifacts/drand/events-live-${run}.json`,'utf8'));assert.equal(old.passed,false);assert(saved.active?.mode===1);
const {game:m,finance}=JSON.parse(await readFile('artifacts/drand/integration-manifests.json','utf8'));
assert.equal(m.app,old.app);assert.notEqual(m.app.toLowerCase(),'0x78d3341e3452d7ec1add9371de3008639eed8eb0');
const epoch=BigInt(saved.epoch),id=BigInt(saved.active.id),player=saved.players[2],owner=privateKeyToAccount(player.key as Hex),stored=decodeSession(player.stored)!;
const persist=async()=>{await writeFile(file+'.next',JSON.stringify(saved),{mode:0o600});await rename(file+'.next',file);};
const journal=new RoomsCommandJournal({getItem:()=>saved.journals['2'],setItem:(_k,v)=>{saved.journals['2']=v;}},m.app,abi);
const node=createPublicClient({transport:engineTransport(m.node,{
 beforeSend:async(raw)=>{await journal.beforeSend(raw);await persist();},received:(method,value)=>journal.received(method,value),
})});
const t=await chainTools(prefix+'-live-'+run),db=new Pool({connectionString:process.env.PONG_CHAOS_DATABASE_URL});
const report:any={at:new Date().toISOString(),app:m.app,epoch:String(epoch),id:String(id),scope:'Recovery by explicit synthetic-player concession, not natural seventh-point qualification',passed:false};
try{
 assert.equal((await db.query('select current_database() as name')).rows[0].name,'pong_rules9_qualification');
 assert.equal((await db.query("select count(*)::int as n from il_engine_jobs where app=$1 and status='pending'",[m.app])).rows[0].n,0,'A public command still needs reconciliation');
 for(const value of Object.values(saved.journals))assert(!JSON.parse(value as string).some((j:any)=>j.state==='uncertain'),'Retain and reconcile the original uncertain player command first');
 const status:any=await node.request({method:'interlude_session',params:[]} as any);assert.equal(BigInt(status.epoch),epoch);
 journal.bindRoomControls(owner.address,stored.grant.sessionKey,epoch,stored.grant.expiry);
 const current:any=await node.readContract({address:m.app,abi,functionName:'getSnapshot',args:[id]});assert.equal(current[3].toLowerCase(),owner.address.toLowerCase());
 report.observedPhase=String(current[2]);
 if(current[2]===2n){await compactRoomsSession({node,abi,app:m.app,stored,epoch}).send('concede',[id]);report.concessionSent=true;}
 await persist();
 const until=async(fn:()=>Promise<any>,label:string)=>{const end=Date.now()+120000;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,1000));}throw Error(label);};
 const published:any=await until(async()=>{const s:any=await t.base.readContract({address:m.app,abi,functionName:'getSnapshot',args:[id]});return s[2]===3n?s:null;},'Concession publication pending');
 report.score=[published[12].scoreA,published[12].scoreB];report.winner=published[6];
 process.env.ROOMS_FINANCE_MANIFEST='artifacts/drand/test-finance.json';process.env.ROOMS_PRESSURE_KEY_FILE=`/secrets/${prefix}-pressure.json`;
 const config=await loadRoomsFinance();
 const worker=await createRoomsFinance({db,base:t.base,manifest:finance,enqueue:async(r,_internal,value=0n)=>{
  const call=config.encode(r),name='recovery-finance-'+keccak256(toHex(JSON.stringify({to:call.address,data:call.data,value},(_,v)=>typeof v==='bigint'?String(v):v))).slice(2,26);
  const receipt=await t.submit(name,call.data,call.address,value);return{id:name,hash:receipt.transactionHash};
 }});
 const bettor=privateKeyToAccount(saved.players[4].key as Hex).address;
 const payoutId=await t.base.readContract({address:finance.market,abi:marketAbi,functionName:'payoutId',args:[0,id,bettor]});
 const payout=await until(async()=>{await worker.audit();const p=await t.base.readContract({address:finance.market,abi:marketAbi,functionName:'payouts',args:[payoutId]});return p[2]===2?p:null;},'Recovery payout pending');
 assert.equal(payout[0].toLowerCase(),bettor.toLowerCase());assert.equal(payout[1],parseEther('.006'));
 report.payoutId=payoutId;report.paid=String(payout[1]);assert.equal(await node.readContract({address:m.app,abi,functionName:'activeCount'}),0n);
 assert(!journal.pending(owner.address));saved.active=null;saved.recoveredByConcessionAt=new Date().toISOString();await persist();report.passed=true;
}catch(error){report.error=(error as Error).message.split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);process.exitCode=1;}
finally{await persist();await writeFile(`artifacts/drand/events-live-${run}-recovery${attempt==='1'?'':'-'+attempt}.json`,JSON.stringify(report,null,2)+'\n');await db.end();await t.close();console.log(JSON.stringify(report));}
