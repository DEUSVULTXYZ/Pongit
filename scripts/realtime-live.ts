// Real Monad and hosted Interlude, disposable accounts. Private grants never enter reports.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,createWalletClient,http,encodeFunctionData,keccak256,parseEther,toHex,type Hex} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,storageKey,sendFast} from '@interludelayer-sdk/sdk';
import {chainTools} from './independent-chain-tools';
import {createRoomsFinance} from '../relayer/src/rooms-finance';
import {loadRoomsFinance} from '../relayer/src/rooms-finance-config';
import {roomsRealtimeAbi as abi} from '../shared/abi-PongRoomsRealtime';
import {realtimeMarketAbi as marketAbi} from '../shared/abi-RealtimeMarket';
import {roomsVaultAbi as vaultAbi} from '../shared/abi-RoomsVault';
import {betTypes,domain} from '../shared/protocol';
import {engineReceiptOutcome} from '../relayer/src/rooms-engine-recovery';
assert.equal(process.env.PONG_REALTIME_LIVE,'authorized-testnet');
const run=process.env.PONG_REALTIME_RUN||'1';assert(/^[1-9]$/.test(run));
const file=`/secrets/realtime-live-20260913-${run}.json`;try{await readFile(file);throw Error('Reconcile the previous live fixture first');}catch(e){if((e as any).code!=='ENOENT')throw e;}
const manifests=JSON.parse(await readFile('artifacts/realtime/manifests.json','utf8')),m=manifests.game,finance=manifests.finance;
await writeFile('artifacts/realtime/test-finance.json',JSON.stringify([finance]));process.env.ROOMS_FINANCE_MANIFEST='artifacts/realtime/test-finance.json';
const t=await chainTools('realtime-live-20260913-'+run),config=await loadRoomsFinance(),base=t.base;
const admission=privateKeyToAccount(process.env.INTERLUDE_COORDINATOR_KEY as Hex);assert.equal(admission.address.toLowerCase(),m.coordinator.toLowerCase());
const make=(store=memoryStore())=>createInterludeClient({app:m.app,abi,node:m.node,base,store,transport:http(m.node,{retryCount:0,timeout:10000}),fastPath:true});
const observer=make(),players:any[]=[],secrets:any={players:[]},report:any={at:new Date().toISOString(),app:m.app,scope:'Real testnet contracts, SDK sessions and actual pressure worker; synthetic EOA owners, no physical passkey test',matches:[],payments:[]};
const json=(v:any)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2),save=()=>writeFile(file,json(secrets),{mode:0o600}),sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(fn:()=>Promise<any>,label:string,timeout=60000)=>{const start=Date.now();while(Date.now()-start<timeout){const v=await fn();if(v)return v;await sleep(500);}throw Error('Timeout: '+label);};
const worker=await createRoomsFinance({db:t.db,base,manifest:finance,enqueue:async(r,_internal,value=0n)=>{
 const encoded=config.encode(r),name='finance-'+keccak256(toHex(json({to:encoded.address,data:encoded.data,value}))).slice(2,26);
 const receipt=await t.submit(name,encoded.data,encoded.address,value);return {id:name,hash:receipt.transactionHash};
}});
async function publicSend(data:Hex,id:bigint){
 const pending=(await t.db.query("SELECT * FROM il_engine_jobs WHERE app=$1 AND status='pending' ORDER BY nonce LIMIT 1",[m.app])).rows[0];assert(!pending,'Reconcile the earlier engine command');
 const nonce=await observer.node.getTransactionCount({address:admission.address});
 const raw=await admission.signTransaction({to:m.app,chainId:4242,type:'eip1559',nonce,data,value:0n,gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 const hash=keccak256(raw),op=crypto.randomUUID();
 await t.db.query("INSERT INTO il_engine_jobs(app,id,nonce,raw,hash,status,epoch,signer,action,match_id) VALUES($1,$2,$3,$4,$5,'pending',1,$6,'submitLivePressure',$7)",[m.app,op,nonce,raw,hash,admission.address.toLowerCase(),String(id)]);
 const receipt:any=await sendFast(observer.node,m.node,raw);assert(receipt,'Missing pressure receipt');
 const outcome=engineReceiptOutcome(receipt,hash);assert(outcome);
 await t.db.query("UPDATE il_engine_jobs SET status=$4,resolution=$3 WHERE app=$1 AND id=$2",[m.app,op,{kind:'receipt',hash,blockHash:receipt.blockHash,status:receipt.status},outcome]);assert.equal(outcome,'observed');
}
try{
 const status=await observer.status();assert.equal(status.epoch,1);assert.equal(await observer.read('activeCount'),0n);
 for(let i=0;i<5;i++){
  const key=generatePrivateKey(),owner=privateKeyToAccount(key),store=memoryStore(),client=make(store);
  const session=await client.openSession({wallet:createWalletClient({account:owner,chain:monadTestnet,transport:http()}),scope:['acceptMatch','input','tick','cancelMatch','concede'],expirySeconds:1800,assertDigest:true});
  players.push({owner,client,session,seq:0n,dir:0});secrets.players.push({key,stored:store.get(storageKey(m.app,10143,owner.address))});await save();
 }
 const bettor=players[4].owner;
 await t.write('fund-betting-credit',finance.vault,vaultAbi,'depositFor',[bettor.address],parseEther('.02'));
 for(const mode of [0,1]){
  const id=BigInt('2026091300')+BigInt(run)*10n+BigInt(mode),pair=players.slice(mode*2,mode*2+2);
  secrets.active={id:String(id),mode};await save();
  const offer={id,room:toHex(id,{size:32}),a:pair[0].owner.address,b:pair[1].owner.address,mode,ranked:false,expires:BigInt(Math.floor(Date.now()/1000)+25),rules:5n,entropy:keccak256(toHex('realtime qualification '+id))};
  const signature=await admission.sign({hash:await observer.read('ticketDigest',[offer]) as Hex});
  for(const p of pair)await p.session.send('acceptMatch',[offer,signature]);
  let bought=false,pressureDelivered=false,lastScore=0,stoppedBridgeAt=0;const frames:any[]=[];const start=Date.now();
  let financialTask:Promise<any>|undefined,financialError:unknown;
  while(Date.now()-start<150000){
   if(financialError)throw financialError;
   const s:any=await observer.read('getSnapshot',[id]),state=s[12];
   frames.push({ms:Date.now()-start,t:String(state.t),score:[state.scoreA,state.scoreB],halves:[String(state.halfA),String(state.halfB)],awaitingServe:state.awaitingServe,phase:Number(s[2])});
   assert.equal(state.awaitingServe,false,'Realtime Chaos must never wait for a checkpoint');
   if(s[2]>=3n)break;
   const points=state.scoreA+state.scoreB;
   if(mode&&!stoppedBridgeAt&&!financialTask){
    financialTask=worker.pressure(String(id),s,data=>publicSend(data,id),()=>observer.read('queuedPressure',[id])).catch(e=>{financialError=e;}).finally(()=>financialTask=undefined);
   }
   if(mode&&!bought){
    const window:any=await base.readContract({address:finance.adapter,abi:config.encode({deployment:'rooms',roomApp:m.app,roomFinance:finance.financeId,contract:'game',functionName:'openRound',args:[String(id)]}).abi,functionName:'bettingWindow',args:[id,0]});
    if(window[0]){
     const bet={player:bettor.address,matchId:id,side:0,shares:parseEther('.006'),maxCost:parseEther('.01'),version:window[1],nonce:await base.readContract({address:finance.market,abi:marketAbi,functionName:'nonces',args:[bettor.address]}),deadline:BigInt(Math.floor(Date.now()/1000)+90)};
     const sig=await bettor.signTypedData({domain:domain('PONG Market',10143,finance.market),types:betTypes,primaryType:'Bet',message:bet});
     await t.write('buy-live-chaos',finance.market,marketAbi,'buy',[bet,sig]);bought=true;
    }
   }
   if(mode&&state.halfA===36000000n)pressureDelivered=true;
   if(mode&&pressureDelivered&&!stoppedBridgeAt){
    const window:any=await base.readContract({address:finance.adapter,abi:config.encode({deployment:'rooms',roomApp:m.app,roomFinance:finance.financeId,contract:'game',functionName:'openRound',args:[String(id)]}).abi,functionName:'bettingWindow',args:[id,0]});
    const bet={player:bettor.address,matchId:id,side:1,shares:parseEther('.006'),maxCost:parseEther('.01'),version:window[1],nonce:await base.readContract({address:finance.market,abi:marketAbi,functionName:'nonces',args:[bettor.address]}),deadline:BigInt(Math.floor(Date.now()/1000)+90)};
    const sig=await bettor.signTypedData({domain:domain('PONG Market',10143,finance.market),types:betTypes,primaryType:'Bet',message:bet});
    await t.write('buy-live-other-side',finance.market,marketAbi,'buy',[bet,sig]);stoppedBridgeAt=Date.now();
   }
   // Keep the game alive while its first market publication and bet arrive;
   // afterwards move both paddles away to prove continuous natural points.
   for(let j=0;j<2;j++){
    const p=pair[j],position=j===0?state.left:state.right;
    let target=50000000n;
    if(mode&&!pressureDelivered){
     const plane=j===0?40000000n:984000000n,dt=state.vx===0n?0n:(plane-state.x)*1000000n/state.vx;
     let y=state.y+(dt>0n?state.vy*dt/1000000n:0n)-6000000n,period=1128000000n;y=((y%period)+period)%period;
     target=6000000n+(y>564000000n?period-y:y);
    }
    const direction=position<target-8000000n?1:position>target+8000000n?-1:0;
    if(direction!==p.dir){const latest:any=await observer.read('getSnapshot',[id]);if(latest[2]!==2n)break;
     await p.session.send('input',[id,direction,latest[j===0?9:10]+1n,latest[7]+150n]);p.dir=direction;
    }
   }
   if(points>lastScore)lastScore=points;
   if(mode&&stoppedBridgeAt)assert(Date.now()-start<150000);
   if((await observer.read('getSnapshot',[id]) as any)[2]===2n)await pair[0].session.send('tick',[id]);await sleep(250);
  }
  if(financialTask)await financialTask;
  const final:any=await observer.read('getSnapshot',[id]);assert.equal(final[2],3n,'Natural seventh point');assert.equal(Math.max(final[12].scoreA,final[12].scoreB),7);
  const published:any=await until(async()=>{const s:any=await observer.readSettled('getSnapshot',[id]);return s[2]===3n?s:null;},'published result',120000);
  assert.equal(published[6],final[6]);
  if(mode){assert(bought&&pressureDelivered,'Live bet reached the next point');
   await until(async()=>{await worker.audit();const p=await base.readContract({address:finance.market,abi:marketAbi,functionName:'positions',args:[id,bettor.address]});return p[3];},'automatic settlement',60000);
   const payoutId=await base.readContract({address:finance.market,abi:marketAbi,functionName:'payoutId',args:[0,id,bettor.address]});
   report.payments.push({payoutId,payout:await base.readContract({address:finance.market,abi:marketAbi,functionName:'payouts',args:[payoutId]}),wallet:await base.getBalance({address:bettor.address})});
  }
  report.matches.push({mode,id,score:[final[12].scoreA,final[12].scoreB],frames,bought,pressureDelivered});secrets.active=null;await save();
 }
 report.passed=true;
}catch(e){report.passed=false;report.error=String((e as any).shortMessage||(e as Error).message).split('\n')[0];}
finally{await save();await writeFile(`artifacts/realtime/live-${run}.json`,json(report));console.log(json({passed:report.passed,error:report.error,matches:report.matches.map((m:any)=>({mode:m.mode,score:m.score,frames:m.frames.length})),payments:report.payments}));await t.close();if(!report.passed)process.exitCode=1;}
