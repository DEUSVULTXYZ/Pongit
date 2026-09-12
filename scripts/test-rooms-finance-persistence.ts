import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {Pool} from "pg";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {encodeEventTopics,encodeAbiParameters,zeroHash,type Address} from "viem";
import {roomsSettlementAuditAbi} from "../shared/abi-rooms-settlement-audit";
import {createRoomsFinanceRouter} from "../relayer/src/rooms-finance-router";
import {financeScope,type RoomsFinanceManifest} from "../relayer/src/rooms-finance-config";
import {initial} from '../shared/physics-v2';

// Isolated PostgreSQL database on the VPS; RPC responses are deterministic fixtures.
if(!process.env.FINANCE_TEST_DATABASE_URL)throw new Error("Isolated test database required");
const db=new Pool({connectionString:process.env.FINANCE_TEST_DATABASE_URL});
const name=(await db.query("SELECT current_database() AS name")).rows[0].name;
if(!/^pong_finance_test_/.test(name))throw new Error("Refusing non-test database");
const address=(n:number)=>("0x"+n.toString(16).padStart(40,"0")) as Address;
const privateKey=generatePrivateKey(),signer=privateKeyToAccount(privateKey);
const dir=await mkdtemp(path.join(tmpdir(),"pong-finance-"));
await writeFile(path.join(dir,"key.json"),JSON.stringify({privateKey}),{mode:0o600});
process.env.ROOMS_PRESSURE_KEY_FILE=path.join(dir,"key.json");
const legacy:RoomsFinanceManifest={app:address(1),adapter:address(2),market:address(3),vault:address(4),pressureSigner:signer.address,chainId:10143,startBlock:"1000"};
const early:RoomsFinanceManifest={...legacy,adapter:address(5),market:address(6),vault:address(7),financeId:"early-v1",settlement:"early-published-testnet"};
const player=address(8),hub=address(9),scope=financeScope(early);
let head=1012n,paid=false,captured=false,challenge=false,corrected=false,reorg=false,readFailure=false;
const pause={...initial(zeroHash,1),awaitingServe:true,resumeAt:3000000n,scoreA:1};
let publishedPause={...pause,awaitingServe:false},roundOpened=false,roundRace=false;
const hash=(n:bigint)=>("0x"+n.toString(16).padStart(64,"0")) as `0x${string}`;
const sent:any[]=[];
const realNow=Date.now;let now=realNow();Date.now=()=>now;
const base:any={
 getBlockNumber:async()=>head,
 getBlock:async({blockNumber}:any)=>({hash:hash(blockNumber+(reorg?100000n:0n)),number:blockNumber}),
 getBalance:async()=>100n,
 readContract:async({address:target,functionName:f,args=[],blockNumber}:any)=>{
  const m=[legacy,early].find(x=>[x.adapter,x.market,x.vault].includes(target))||early;
  if(f==="pressureSigner")return signer.address;if(f==="results")return m.adapter;
  if(f==="modules"||f==="modulesSealed")return true;if(f==="moduleCount")return 1n;
  if(f==="game")return m.app;if(f==="vault")return m.vault;if(f==="hub")return hub;
  if(f==="books")return [0n,0n,(args[0]===1n&&m===legacy||args[0]===2n&&m===early)?1n:0n];
  if(f==="sessionOf")return {status:1,epoch:1n};
  if(f==="balances"||f==="nonces")return 0n;
  if(f==='checkpointReady')return [false,0n];
  if(f==='rounds')return [roundOpened?head+40n:0n,pause.resumeAt,1,zeroHash];
  if(f==='getSnapshot'){assert.equal(blockNumber,head,'published snapshot is pinned to a Monad block');return [3n,1n,2n,,,,,,,,,,publishedPause];}
  if(f==="result")return [address(10),address(11),captured&&m===early?address(10):address(0),captured&&m===early?3:2];
  if(f==="resultHashes"){if(readFailure)throw new Error("Injected RPC outage");return corrected?hash(99n):hash(77n);}
  if(f==="positions")return [10n,0n,5n,paid];
  if(f==="payoutId")return hash(22n);if(f==="payouts")return [player,10n,paid?2:0,1];
  throw new Error("Unexpected read: "+f);
 },
 getContractEvents:async({eventName,fromBlock,toBlock}:any)=>eventName==="EarlyResultAccepted"&&fromBlock<=1002n&&toBlock>=1002n?[{eventName,args:{id:2n,epoch:1n,batch:7n,resultHash:hash(77n),winner:address(10),status:3},blockNumber:1002n,blockHash:hash(1002n+(reorg?100000n:0n)),transactionHash:hash(123n),logIndex:0}]:[],
 request:async({params:[p]}:any)=>{
   const logs:any[]=[];
   const add=(kind:"Challenged"|"ChallengeResolved",block:bigint,args:any,data:any)=>{if(BigInt(p.fromBlock)>block||BigInt(p.toBlock)<block)return;
     logs.push({address:hub,data,topics:encodeEventTopics({abi:roomsSettlementAuditAbi,eventName:kind,args}),blockNumber:"0x"+block.toString(16),blockHash:hash(block),transactionHash:hash(block+100n),logIndex:"0x0"});};
   if(challenge)add("Challenged",1014n,{app:early.app,partition:zeroHash},encodeAbiParameters([{type:"uint256"},{type:"address"},{type:"bytes32"},{type:"bytes32"}],[7n,player,hash(77n),hash(99n)]));
   if(corrected)add("ChallengeResolved",1015n,{app:early.app,partition:zeroHash},encodeAbiParameters([{type:"bytes32"},{type:"bool"}],[hash(99n),true]));
   return logs;
 },
};
const enqueue=async(r:any)=>{sent.push(r);if(r.functionName==='openRound'){if(roundRace)throw Object.assign(new Error('Changed at preflight'),{reason:'not a Chaos pause'});roundOpened=true;}if(r.functionName==="finalizeResult")captured=true;if(r.functionName==="claim")paid=true;return {id:hash(BigInt(sent.length))};};
try{
 await db.query("CREATE TABLE il_results(app text,id text,phase int,mode int,ended_at timestamptz)");
 const make=()=>createRoomsFinanceRouter({db,base,entries:[legacy,early],enqueue});
 let router=await make();
 const live=[3n,1n,2n,,,,,,,,,,pause];
 let checkpoints=0;
 await router.pressure('3',live,async()=>{checkpoints++;});
 assert.equal(sent.length,0,'an unpublished live pause must not enqueue a market or round');
 publishedPause={...pause,resumeAt:1n};
 await router.pressure('3',live,async()=>{checkpoints++;});assert.equal(sent.length,0,'old published rally is not the live rally');
 publishedPause={...pause};roundRace=true;
 await router.pressure('3',live,async()=>{checkpoints++;});assert.equal(sent.at(-1).functionName,'openRound','a confirmed preflight race remains retryable');
 roundRace=false;await router.pressure('3',live,async()=>{checkpoints++;});
 assert(roundOpened);const opened=sent.filter(r=>r.functionName==='openRound').length;
 await router.pressure('3',live,async()=>{checkpoints++;});assert.equal(sent.filter(r=>r.functionName==='openRound').length,opened);
 assert.equal(checkpoints,0,'a window still open cannot authorize a handicap');
 sent.length=0;
 const account:any=await router.route("/interlude/finance","GET",player,{},new URLSearchParams());
 assert.equal(account.manifest.market,early.market);assert.equal(account.archives[0].manifest.market,legacy.market);
 await router.route("/interlude/finance/buy","POST",player,{bet:{matchId:"1",player},signature:"0x"+"11".repeat(65)},new URLSearchParams());
 assert.equal(sent.at(-1).roomFinance,undefined);
 await router.route("/interlude/finance/buy","POST",player,{bet:{matchId:"2",player},signature:"0x"+"11".repeat(65),financeId:"early-v1"},new URLSearchParams());
 assert.equal(sent.at(-1).roomFinance,"early-v1");
 await assert.rejects(router.route("/interlude/finance/buy","POST",player,{bet:{matchId:"1",player},financeId:"early-v1"},new URLSearchParams()),/Financial deployment changed/);
 // No il_results row exists: the payout worker must discover the published terminal hash itself.
 sent.length=0;await router.audit();assert.ok(sent.some(r=>r.functionName==="finalizeResult"&&r.roomFinance==="early-v1"));
 now+=11000;await router.audit();assert.ok(sent.some(r=>r.functionName==="claim"&&r.roomFinance==="early-v1"));
 now+=11000;await router.audit();
 const before=sent.filter(r=>r.functionName==="claim").length;
 router=await make();now+=11000;await router.audit();assert.equal(sent.filter(r=>r.functionName==="claim").length,before);
 assert.equal((await db.query("SELECT count(*) FROM il_settlement_events WHERE kind='EarlyResultAccepted'")).rows[0].count,"1");
 challenge=true;corrected=true;head=1020n;readFailure=true;now+=11000;await router.audit();
 assert.equal((await db.query("SELECT count(*) FROM il_settlement_challenge_report WHERE kind='Challenged' AND match_id='2'")).rows[0].count,"1");
 assert.equal((await db.query("SELECT count(*) FROM il_settlement_rechecks")).rows[0].count,"1");
 readFailure=false;router=await make();now+=11000;await router.audit();
 assert.equal((await db.query("SELECT count(*) FROM il_settlement_checks WHERE id='2'")).rows[0].count,"1");
 assert.equal((await db.query("SELECT count(*) FROM il_settlement_rechecks")).rows[0].count,"0");
 assert.equal(sent.filter(r=>r.functionName==="claim").length,before);
 reorg=true;now+=11000;await router.audit();
 assert.ok(Number((await db.query("SELECT count(*) FROM il_settlement_events WHERE NOT canonical")).rows[0].count)>0);
 console.log(JSON.stringify({passed:true,unpublishedChaosPauseWaits:true,wrongRallyWaits:true,preflightRaceRecovers:true,noPrematureCheckpoint:true,routing:true,restart:true,payoutWithoutLobbyResult:true,challengeLogged:true,correctionAfterRpcFailure:true,noDoublePayment:true,orphanedEvidenceRetained:true}));
}finally{Date.now=realNow;await db.end();await rm(dir,{recursive:true,force:true});}
