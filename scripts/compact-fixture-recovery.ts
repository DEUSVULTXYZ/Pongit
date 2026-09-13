// Resolve only the recorded, private qualification fixture. Never a user match.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterludeClient,memoryStore,decodeSession,sendFast} from '@interludelayer-sdk/sdk';
import {http,toHex,keccak256} from 'viem';
import {compactRoomsSession} from '../shared/compact-rooms-session';
import {roomsCompactAbi as abi} from '../shared/abi-PongRoomsCompact';
import {chainTools} from './independent-chain-tools';
import {engineReceiptOutcome} from '../relayer/src/rooms-engine-recovery';
import {createRoomsFinance} from '../relayer/src/rooms-finance';
import {loadRoomsFinance} from '../relayer/src/rooms-finance-config';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal';
import {engineTransport} from '../shared/engine-transport';
assert.equal(process.env.PONG_COMPACT_FIXTURE_RECOVERY,'recorded-test-2');
const file='/secrets/compact-live-20260913-2.json',saved=JSON.parse(await readFile(file,'utf8')),m=JSON.parse(await readFile('artifacts/realtime/manifests.json','utf8'));
const id=BigInt(saved.active?.id||202609131021);assert.equal(id,202609131021n);
const t=await chainTools('compact-recovery-2'),json=(x:any)=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v),sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const observer=createInterludeClient({app:m.game.app,abi,node:m.game.node,base:t.base,store:memoryStore(),transport:http(m.game.node,{retryCount:0}),fastPath:true});
try{
 for(const job of(await t.db.query("SELECT * FROM il_engine_jobs WHERE app=$1 AND status='pending'",[m.game.app])).rows){
  assert.equal(job.match_id,String(id));assert.equal(job.action,'submitLivePressure');
  let receipt:any=await observer.node.getTransactionReceipt({hash:job.hash}).catch(()=>null);
  if(!receipt)receipt=await sendFast(observer.node,m.game.node,job.raw);
  const outcome=engineReceiptOutcome(receipt,job.hash);assert(outcome);
  await t.db.query('UPDATE il_engine_jobs SET status=$3,resolution=$4 WHERE app=$1 AND id=$2',[m.game.app,job.id,outcome,{kind:'receipt',hash:job.hash,status:receipt.status}]);
  console.log(json({reconciled:job.hash,outcome}));
 }
 const stored=decodeSession(saved.players[2].stored)!;assert(stored);
 const journal=new RoomsCommandJournal({getItem:()=>saved.journals['2']||null,setItem:(_,s)=>{saved.journals['2']=s;}},m.game.app,abi);
 const client=createInterludeClient({app:m.game.app,abi,node:m.game.node,base:t.base,store:memoryStore(),transport:engineTransport(m.game.node,{beforeSend:async(raw)=>{await journal.beforeSend(raw);await writeFile(file,json(saved),{mode:0o600});},received:(method,result)=>journal.received(method,result)}),fastPath:true});
 await client.status();journal.bindRoomControls(stored.grant.granter,stored.grant.sessionKey,1n,stored.grant.expiry);assert(!journal.pending(stored.grant.granter));
 const sender=compactRoomsSession({node:client.node,abi,app:m.game.app,stored,epoch:1n});
 for(let i=0;i<180;i++){
  const s:any=await observer.read('getSnapshot',[id]);assert.equal(s[3].toLowerCase(),stored.grant.granter.toLowerCase());
  if(s[2]===3n)break;assert.equal(s[2],2n);await sender.send('tick',[id]);await sleep(250);
 }
 const final:any=await observer.read('getSnapshot',[id]);assert.equal(final[2],3n);
 for(let i=0;i<180;i++){if((await observer.readSettled('getSnapshot',[id]) as any)[2]===3n)break;await sleep(500);}
 assert.equal((await observer.readSettled('getSnapshot',[id]) as any)[2],3n);
 process.env.ROOMS_FINANCE_MANIFEST='artifacts/realtime/test-finance.json';const config=await loadRoomsFinance();
 const worker=await createRoomsFinance({db:t.db,base:t.base,manifest:m.finance,enqueue:async(r,_i,value=0n)=>{const e=config.encode(r),name='payment-'+keccak256(toHex(json({to:e.address,data:e.data,value}))).slice(2,26),receipt=await t.submit(name,e.data,e.address,value);return{id:name,hash:receipt.transactionHash};}});
 await worker.audit();saved.active=null;await writeFile(file,json(saved),{mode:0o600});console.log(json({recovered:true,id,score:[final[12].scoreA,final[12].scoreB],published:true}));
}finally{await t.close();}
