// Explicit Monad testnet rehearsal. Two disposable players and one bettor.
// Uses public application paths, a capped test-credit bet, and persistent private
// command recovery. No public queue, ranked match or user wallet is involved.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createPublicClient,createWalletClient,http,parseEther,decodeEventLog} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,decodeSession,storageKey} from '@interludelayer-sdk/sdk';
import {roomsChaosAbi as abi} from '../shared/abi-PongRoomsTestnet.ts';
import {marketV4Abi} from '../shared/abis-v4.ts';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal.ts';
import {engineTransport} from '../shared/engine-transport.ts';
import {roomsCreditMessage} from '../shared/rooms-pressure.ts';
import {domain,betTypes} from '../shared/protocol.ts';
import {readHubDelegation} from '../shared/rooms-hub.ts';

assert.equal(process.env.PAID_CHAOS_TEST,'authorized-testnet');
const privateFile=process.env.PAID_CHAOS_RECOVERY;
assert(privateFile?.startsWith('/secrets/'));
try{await readFile(privateFile);throw Error('Inspect the existing recovery record; do not create another bet');}catch(e){if(e.code!=='ENOENT')throw e;}
const manifest=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const natural=process.env.PAID_CHAOS_COMPLETE==='true';
const origin='https://pongit.xyz',out=natural?'artifacts/paid-chaos-full':'artifacts/paid-chaos';
const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:10000})});
assert.equal(await base.getChainId(),10143);
const report={startedAt:new Date().toISOString(),app:manifest.app,endpoint:manifest.node,natural,checks:[],transactions:[],passed:false};
const wire=new Map(),journal=new RoomsCommandJournal({getItem:k=>wire.get(k)||null,setItem:(k,v)=>wire.set(k,v)},manifest.app,abi);
const players=[];let room,offer,betRecord,saveTail=Promise.resolve(),funded=false;
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v);
async function save(){const bytes=json({players:players.map(p=>({address:p.address,ownerKey:p.ownerKey,stored:p.store.get(storageKey(manifest.app,10143,p.address)),cookie:p.cookie})),room,offer,bet:betRecord,commands:Object.fromEntries(wire)});saveTail=saveTail.then(async()=>{await writeFile(privateFile+'.next',bytes,{mode:0o600});await rename(privateFile+'.next',privateFile);});await saveTail;}
const transport=()=>engineTransport(manifest.node,{
 async beforeSend(raw){await journal.beforeSend(raw);await save();},
 received(method,result){journal.received(method,result);void save();}
});
const make=store=>createInterludeClient({app:manifest.app,abi,node:manifest.node,base,store,transport:transport(),fastPath:true});
const observer=make(memoryStore()),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,path,body){
 const response=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'content-type':'application/json',...(p.cookie?{cookie:p.cookie,'x-pongit-player':p.address}:{})},body:body===undefined?undefined:json(body),signal:AbortSignal.timeout(15000)});
 const cookie=response.headers.get('set-cookie');if(cookie)p.cookie=cookie.split(';')[0];
 const value=await response.json();assert(response.ok,path+': '+String(value.error||response.status));return value;
}
const action=(p,path,body={})=>api(p,'interlude/'+path,{...body,operation:crypto.randomUUID()});
async function until(fn,label,seconds=120,interval=1500){const end=Date.now()+seconds*1000;while(Date.now()<end){const value=await fn();if(value)return value;await sleep(interval);}throw Error('Timed out: '+label);}
async function job(p,id){return until(async()=>{const j=await api(p,'jobs/'+id);assert(j.status!=='failed','Sponsored transaction failed: '+String(j.error||j.id));return j.status==='succeeded'?j:null;},'sponsored receipt',90);}
async function send(p,name,args){assert(!journal.pending(p.address),'Uncertain command must be reconciled before another write');const r=await p.session.send(name,args);report.transactions.push({action:name,hash:r.hash,latencyMs:r.latencyMs});return r;}
await mkdir(out,{recursive:true});
try{
 const d=await readHubDelegation(base,manifest.hub,manifest.app);assert.equal(d.status,1);assert(d.expiresAt>BigInt(Math.floor(Date.now()/1000)+900));
 await observer.status();assert.equal(await observer.read('activeCount',[]),0n,'Wait until no existing game is active');
 for(let i=0;i<3;i++){
  const ownerKey=generatePrivateKey(),owner=privateKeyToAccount(ownerKey),store=memoryStore(),client=make(store);
  const p={address:owner.address.toLowerCase(),ownerKey,owner,store,client,cookie:''};players.push(p);await save();
  p.session=await client.openSession({wallet:createWalletClient({account:owner,chain:monadTestnet,transport:http()}),scope:['acceptMatch','input','tick','concede','cancelMatch'],expirySeconds:7200,assertDigest:true});await save();
  const stored=decodeSession(store.get(storageKey(manifest.app,10143,p.address))),challenge=await api(p,'interlude/auth/challenge',{player:p.address});
  await api(p,'interlude/auth/session',{player:p.address,nonce:challenge.nonce,signature:await privateKeyToAccount(stored.privateKey).signMessage({message:challenge.message}),grant:stored.grant,grantSignature:stored.signature});await save();await sleep(1000);
 }
 const [a,b,bettor]=players,expires=Math.floor(Date.now()/1000)+180;
 const credit=await api(bettor,'interlude/finance/credit',{expires,signature:await bettor.owner.signMessage({message:roomsCreditMessage(bettor.address,manifest.app,expires)})});
 const credited=await job(bettor,credit.id);report.transactions.push({action:'test-credit',job:credit.id,hash:credited.tx_hash||credited.hash});funded=true;
 const account=await api(bettor,'interlude/finance');assert.equal(account.manifest.settlement,'early-published-testnet');assert(BigInt(account.balance)>=parseEther('.02'));
 report.finance={adapter:account.manifest.adapter,market:account.manifest.market,vault:account.manifest.vault,financeId:account.manifest.financeId};
 room=(await action(a,'rooms',{mode:1,players:[b.address,bettor.address]})).room;await save();await action(b,'rooms/join',{room});
 offer=await until(async()=>{const s=await api(a,'interlude/state');return s.room?.offer?.status==='offered'?s.room.offer:null;},'consensual friendly offer');await save();
 assert.equal(offer.mode,1);assert.equal(offer.ranked,false);
 for(const p of [a,b]){
  await action(p,'offers/accept',{id:offer.id});const args={...offer,id:BigInt(offer.id),expires:BigInt(offer.expires),rules:BigInt(offer.rules)};
  const r=await send(p,'acceptMatch',[args,offer.signature]);await action(p,'offers/accept',{id:offer.id,receiptHash:r.hash});
 }
 const id=BigInt(offer.id);report.matchId=offer.id;
 // Miss a rally deliberately, leaving the point calculation to the game.
 const s=await observer.read('getSnapshot',[id]);const p=a.address===offer.a.toLowerCase()?a:b;
 await send(p,'input',[id,-1,s[9]+1n,s[7]+150n]);
 const window=await until(async()=>{const v=await api(bettor,`interlude/markets/${id}?side=1&shares=${parseEther('.005')}`);return v.window[0]&&v.quote?v:null;},'published Chaos betting window',150,1000);
 assert.equal(window.manifest.market.toLowerCase(),report.finance.market.toLowerCase());
 const quote=BigInt(window.quote),maxCost=quote+quote/20n+100n;assert(maxCost<parseEther('.01'),'Test spend cap');
 assert(quote>=parseEther('.002'),'Gross paid must exceed the handicap threshold');
 const bet={player:bettor.address,matchId:id,side:1,shares:parseEther('.005'),maxCost,version:BigInt(window.window[1]),nonce:BigInt(account.marketNonce),deadline:BigInt(Math.floor(Date.now()/1000)+90)};
 betRecord={message:bet,signature:await bettor.owner.signTypedData({domain:domain('PONG Market',10143,report.finance.market),types:betTypes,primaryType:'Bet',message:bet}),status:'prepared'};await save();
 betRecord.status='submission-uncertain';await save();const submitted=await api(bettor,'interlude/finance/buy',{bet,signature:betRecord.signature,financeId:report.finance.financeId});betRecord.job=submitted.id;await save();
 const bought=await job(bettor,submitted.id);betRecord.status='confirmed';await save();report.transactions.push({action:'bet',job:submitted.id,hash:bought.tx_hash||bought.hash});
 const position=await base.readContract({address:report.finance.market,abi:marketV4Abi,functionName:'positions',args:[id,bettor.address]});assert.equal(position[1],parseEther('.005'));assert(position[2]>=parseEther('.002'));report.paid=String(position[2]);
 // The bettor stops using the application before the result or payout.
 const balanceBefore=await base.getBalance({address:bettor.address});
 const resumed=await until(async()=>{const x=await observer.read('getSnapshot',[id]);assert.equal(x[2],2n,'Match ended before pressure was checked');return !x[12].awaitingServe&&x[12].halfB<48000000n?x:null;},'confirmed paid checkpoint and rally resume',150,2000);
 assert.equal(resumed[12].halfA,48000000n);assert.equal(resumed[12].halfB,36000000n);report.checks.push('Paid MON beyond the threshold produces 96/72 paddle heights in the next rally');
 if(natural){
  let heartbeat=0;
  const terminal=await until(async()=>{
   if(Date.now()-heartbeat>10000){for(const x of [a,b])await action(x,'presence');heartbeat=Date.now();}
   const x=await observer.read('getSnapshot',[id]);return x[2]===3n?x:null;
  },'natural seventh point',600,2000);
  assert.equal(Math.max(terminal[12].scoreA,terminal[12].scoreB),7);
  report.score=[terminal[12].scoreA,terminal[12].scoreB];report.checks.push('Natural seventh point produced a terminal engine result');
 }else{
  // Concede the opposite side; the contract chooses winner B.
  await send(p,'concede',[id]);
 }
 const published=await until(async()=>{const x=await observer.readSettled('getSnapshot',[id]);return x[2]===3n?x:null;},'terminal result published on Monad',90,2500);
 if(!natural)assert.equal(published[6].toLowerCase(),offer.b.toLowerCase());
 const expected=published[6].toLowerCase()===offer.b.toLowerCase()?parseEther('.005'):0n;
 report.winner=published[6];report.expectedPayout=String(expected);report.checks.push('A terminal engine result was published on Monad');
 const payoutId=await base.readContract({address:report.finance.market,abi:marketV4Abi,functionName:'payoutId',args:[0,id,bettor.address]});
 const payout=await until(async()=>{const x=await base.readContract({address:report.finance.market,abi:marketV4Abi,functionName:'payouts',args:[payoutId]});return Number(x[2])===2?x:null;},'automatic native payout',150,2500);
 const balanceAfter=await base.getBalance({address:bettor.address});assert.equal(balanceAfter-balanceBefore,expected);assert.equal(payout[0].toLowerCase(),bettor.address);assert.equal(payout[1],expected);
 const after=await readHubDelegation(base,manifest.hub,manifest.app);assert.equal(after.status,1);assert.equal(after.epoch,d.epoch);
 const to=await base.getBlockNumber(),logs=await base.getLogs({address:report.finance.market,fromBlock:to-99n,toBlock:to});
 const receipt=logs.map(l=>{try{return {log:l,event:decodeEventLog({abi:marketV4Abi,data:l.data,topics:l.topics})};}catch{return null;}}).find(x=>x?.event.eventName==='PayoutPaid'&&x.event.args.payoutId===payoutId);
 assert(receipt,'Native PayoutPaid event');report.transactions.push({action:'payout',hash:receipt.log.transactionHash,block:receipt.log.blockNumber});
 report.payout={id:payoutId,recipient:bettor.address,amount:balanceAfter-balanceBefore,hubStatus:after.status,epoch:after.epoch};
 report.checks.push(expected>0n?'Bettor received the exact winning shares while disconnected and the delegation was still active, without another signature':'Losing shares were settled once with zero payout');report.passed=true;
}catch(e){report.error=String(e.shortMessage||e.message).split('Request body')[0].split('Request Arguments')[0].slice(0,900);process.exitCode=1;}
finally{
 if(offer)try{const s=await observer.read('getSnapshot',[BigInt(offer.id)]);if(s[2]===1n||s[2]===2n){const p=players.find(p=>p.address===offer.a.toLowerCase());assert(!journal.pending(p.address),'Test cleanup waits for uncertain command reconciliation');p.session=await p.client.restoreSession(p.address);await send(p,s[2]===1n?'cancelMatch':'concede',[BigInt(offer.id)]);}}catch(e){report.cleanupError=String(e.shortMessage||e.message).split('Request body')[0].slice(0,500);}
 for(const p of players)if(p.cookie)try{await action(p,'rooms/leave');}catch{}
 report.testCreditUsed=funded;report.finishedAt=new Date().toISOString();await save();await writeFile(out+'/report.json',json(report));console.log(json(report));
}
