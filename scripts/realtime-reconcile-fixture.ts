import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore,storageKey} from '@interludelayer-sdk/sdk';
import {Pool} from 'pg';
import {roomsRealtimeAbi as abi} from '../shared/abi-PongRoomsRealtime';
import {engineReceiptOutcome} from '../relayer/src/rooms-engine-recovery';
assert.equal(process.env.PONG_REALTIME_LIVE,'authorized-testnet');
const {game:m}=JSON.parse(await readFile('artifacts/realtime/manifests.json','utf8')),f=JSON.parse(await readFile('/secrets/realtime-live-20260913.json','utf8'));
assert.equal(f.active.id,'2026091301');const db=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:10000})});
 const store=memoryStore(),owner=privateKeyToAccount(f.players[2].key);store.set(storageKey(m.app,10143,owner.address),f.players[2].stored);
 const client=createInterludeClient({app:m.app,abi,node:m.node,base,store,transport:http(m.node,{retryCount:0,timeout:10000}),fastPath:true});
 const jobs=(await db.query("SELECT id,hash FROM il_engine_jobs WHERE app=$1 AND resolution->>'status'='0x1' AND status='failed'",[m.app])).rows;
 for(const job of jobs){const r=await client.node.getTransactionReceipt({hash:job.hash});assert.equal(engineReceiptOutcome(r,job.hash),'observed');await db.query("UPDATE il_engine_jobs SET status='observed' WHERE app=$1 AND id=$2",[m.app,job.id]);}
 const session=await client.restoreSession(owner.address);assert(session);
 for(let i=0;i<10;i++){const s:any=await client.read('getSnapshot',[2026091301n]);if(s[2]>=3n)break;await session.send('tick',[2026091301n]);}
 const s:any=await client.read('getSnapshot',[2026091301n]);assert.equal(s[2],3n);
 await writeFile('artifacts/realtime/fixture-recovery.json',JSON.stringify({at:new Date().toISOString(),app:m.app,id:f.active.id,score:[s[12].scoreA,s[12].scoreB],halfA:String(s[12].halfA),waiting:s[12].awaitingServe,receiptReconciled:true}));
 console.log('Fixture completed; raw hexadecimal success receipt reconciled. No production match touched.');
}finally{await db.end();}
