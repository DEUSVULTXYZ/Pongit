// Preserve the halted deployment as an archive; never invent its missing result.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {Pool} from 'pg';
import {roomsCompactAbi as abi} from '../shared/abi-PongRoomsCompact';
import {readHubDelegation} from '../shared/rooms-hub';
import {loadRoomsFinance} from '../relayer/src/rooms-finance-config';
import {createRoomsFinanceDirectory} from '../relayer/src/rooms-finance-directory';
assert.equal(process.env.PONG_COMPACT_RELEASE_CHECK,'authorized-testnet');
const m=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8')),old=JSON.parse(await readFile('deployments/interlude-rooms-realtime.json','utf8'));
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:12000})}),node=createPublicClient({transport:http(m.node,{retryCount:0,timeout:12000})});
const priorNode=createPublicClient({transport:http(old.node,{retryCount:0,timeout:12000})}),db=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const d=await readHubDelegation(base,m.hub,m.app),before=await readHubDelegation(base,old.hub,old.app),pinned=await base.getBlock({blockNumber:d.baseBlock});
 assert.equal(d.status,1);assert(d.expiresAt>(await base.getBlock()).timestamp+7200n);assert.equal(await node.readContract({address:m.app,abi,functionName:'activeCount'}),0n);
 assert(before.lastCommitAt<=pinned.timestamp,'Previous published ELO changed after inheritance');
 const code=await base.getCode({address:m.app});assert(code&&((code.length-2)/2)<=24576);
 const players=(await db.query('SELECT player FROM profiles ORDER BY player LIMIT 250')).rows;
 for(const {player}of players)for(const mode of [0,1]){
  const prior:any=await base.readContract({address:old.app,abi,functionName:'ratingOf',args:[player as Address,mode]});
  const next:any=await node.readContract({address:m.app,abi,functionName:'ratingOf',args:[player as Address,mode]});assert.deepEqual({...next,season:prior.season},prior);
 }
 const id=56854027836718902380128903442566135998881145689955445019239466117706424427667n;
 const live:any=await priorNode.readContract({address:old.app,abi,functionName:'getSnapshot',args:[id]}),published:any=await base.readContract({address:old.app,abi,functionName:'getSnapshot',args:[id]});
 const jobs=(await db.query("SELECT id,nonce,hash,status FROM il_engine_jobs WHERE app=$1 AND hash=$2",[old.app,'0xdc3c70f8eb20da150b4db2e00ffdf6c72c19da0c571bbad71febdac6bfc68429'])).rows;assert.equal(jobs.length,1);
 const finances=await loadRoomsFinance(),directory=await createRoomsFinanceDirectory({db,base,entries:finances.entries,app:m.app,enqueue:async()=>{throw Error('Read-only release check');}});
 const account='0x1925749fd3f407f5e3881743de2e4790ecb24c12',view=await directory.route('/interlude/finance','GET',account,{},new URLSearchParams());
 assert.equal(view.archives.length,finances.entries.length-1);assert.equal(view.manifest.app,m.app);
 const balances=[];for(const f of finances.entries){const v=await directory.route('/interlude/finance','GET',account,{},new URLSearchParams({app:f.app,financeId:f.financeId||''}));assert.equal(v.manifest.market,f.market);balances.push({app:f.app,market:f.market,vault:f.vault,balance:v.balance});}
 const report={at:new Date().toISOString(),app:m.app,hubEpoch:String(d.epoch),hubBatches:String(d.batchIndex),runtimeBytes:(code.length-2)/2,ratingsChecked:players.length*2,balances,old:{app:old.app,id:String(id),phase:Number(live[2]),liveScore:[live[12].scoreA,live[12].scoreB],publishedScore:[published[12].scoreA,published[12].scoreB],publishedBatch:String(before.batchIndex),jobs},passed:true};
 const text=JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2);await writeFile('artifacts/realtime/compact-release-check.json',text);console.log(text);
}finally{await db.end();}
