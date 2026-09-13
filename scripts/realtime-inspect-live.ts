import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http} from 'viem';
import {roomsRealtimeAbi as abi} from '../shared/abi-PongRoomsRealtime';
const db=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const {game:m}=JSON.parse(await readFile('artifacts/realtime/manifests.json','utf8'));
 const jobs=(await db.query('SELECT nonce,hash,status,action,resolution FROM il_engine_jobs WHERE app=$1 ORDER BY nonce',[m.app])).rows;
 const n=createPublicClient({transport:http(m.node,{retryCount:0,timeout:8000})});
 console.log(JSON.stringify({jobs,queued:await n.readContract({address:m.app,abi,functionName:'queuedPressure',args:[2026091301n]})},(_,v)=>typeof v==='bigint'?String(v):v));
}finally{await db.end();}
