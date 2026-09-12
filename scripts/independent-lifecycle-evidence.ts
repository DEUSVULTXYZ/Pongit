// Read-only public evidence from the private journal; raw calldata never leaves this process.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,decodeFunctionData,decodeEventLog,type Abi,type Address} from 'viem';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {readHubDelegation} from '../shared/rooms-hub';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {abi as lobbyAbi} from '../shared/abi-independent-IndependentLobby';
import {abi as marketAbi} from '../shared/abi-independent-MarketV4';
const privateManifest=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));assert.equal(privateManifest.production,false);
const m=publicIndependentManifest(privateManifest),base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})}),r=independentReader(base,m),db=new Pool({connectionString:process.env.DATABASE_URL});
const report:any={at:new Date().toISOString(),lobby:m.lobby,arenas:[],operations:[],payments:[]};
try{
 for(const a of m.arenas){
  const b=await r.arena(a.app,'boundMatch'),d=await readHubDelegation(base,m.hub,a.app),indexed=await r.ratings('indexOf',[b.id]);
  const entry=indexed?await r.ratings('entry',[b.id]):null;
  const journal=(await db.query('SELECT nonce,hash,status,action,match_id,resolution FROM il_engine_jobs WHERE app=$1 AND epoch=$2 ORDER BY nonce',[a.app.toLowerCase(),String(b.epoch)])).rows.map(j=>({nonce:j.nonce,hash:j.hash,status:j.status,action:j.action,matchId:j.match_id,resolution:j.resolution?{kind:j.resolution.kind,hash:j.resolution.hash,blockHash:j.resolution.blockHash,epoch:j.resolution.epoch,at:j.resolution.at}:null}));
  report.arenas.push({app:a.app,id:b.id,epoch:b.epoch,hubStatus:d.status,lastCommitUTC:new Date(Number(d.lastCommitAt)*1000).toISOString(),releaseUTC:d.stakeUnlockAt?new Date(Number(d.stakeUnlockAt)*1000).toISOString():null,entry,journal});
 }
 const rows=(await db.query('SELECT target,data,status,hash FROM independent_operations WHERE target=ANY($1) ORDER BY created_at',[[m.hub,m.lobby,m.market].map(a=>a.toLowerCase())])).rows;
 for(const row of rows){
  const isHub=row.target===m.hub.toLowerCase(),isMarket=row.target===m.market.toLowerCase(),abi=(isHub?hubAbi:isMarket?marketAbi:lobbyAbi) as Abi;
  let decoded;try{decoded=decodeFunctionData({abi,data:row.data});}catch{continue;}
  if(!['forceClose','releaseStake','closeArena','capture','openArena','buy','claim','retryPayout'].includes(decoded.functionName))continue;
  if(isHub&&!m.arenas.some(a=>a.app.toLowerCase()===String(decoded.args?.[0]).toLowerCase()))continue;
  const item:any={action:decoded.functionName,target:row.target,status:row.status,hash:row.hash};
  if(row.hash){const receipt=await base.getTransactionReceipt({hash:row.hash}).catch(()=>null);
   if(receipt){item.block=receipt.blockNumber;item.receiptStatus=receipt.status;
    item.events=receipt.logs.flatMap(log=>{if(log.address.toLowerCase()!==m.market.toLowerCase())return [];try{const event=decodeEventLog({abi:marketAbi,data:log.data,topics:log.topics});return ['BetPlaced','PayoutPaid','PayoutDeferred'].includes(event.eventName)?[{event:event.eventName,args:event.args}]:[];}catch{return [];}});
   }
  }report.operations.push(item);
 }
 const bettors=(await db.query('SELECT id,player,settled FROM independent_bettors WHERE lobby=$1',[m.lobby.toLowerCase()])).rows;
 for(const p of bettors){const id=BigInt(p.id),player=p.player as Address;
  const position=await base.readContract({address:m.market,abi:marketAbi,functionName:'positions',args:[id,player]});
  const payoutId=await base.readContract({address:m.market,abi:marketAbi,functionName:'payoutId',args:[0,id,player]});
  const payout=await base.readContract({address:m.market,abi:marketAbi,functionName:'payouts',args:[payoutId]});
  report.payments.push({...p,position,payoutId,payout});
 }
 await writeFile('artifacts/independent-candidate/lifecycle.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
 console.log(JSON.stringify({arenas:report.arenas.map((a:any)=>({app:a.app,hubStatus:a.hubStatus,releaseUTC:a.releaseUTC,result:a.entry?.latest.status})),operations:report.operations.length,payments:report.payments.length}));
}finally{await db.end();}
