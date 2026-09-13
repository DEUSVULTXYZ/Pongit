// Qualify the complete coordinator, including lifecycle wiring and all archives.
// Only use with an idle, unexposed candidate, never alongside its production writer.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http} from 'viem';
import {roomsRealtimeAbi as abi} from '../shared/abi-PongRoomsRealtime';
import {readHubDelegation} from '../shared/rooms-hub';
import {loadRoomsFinance} from '../relayer/src/rooms-finance-config';
import {createRoomsCoordinator} from '../relayer/src/interlude-rooms';
assert.equal(process.env.PONG_REALTIME_STARTUP,'idle-candidate');
const m=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const publicConfig:any=await (await fetch('https://pongit.xyz/api/interlude/config')).json();assert.notEqual(publicConfig.app,m.app,'Candidate already exposed');
const node=createPublicClient({transport:http(m.node,{retryCount:0,timeout:8000})}),base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:12000})});
const d=await readHubDelegation(base,m.hub,m.app);assert.equal(d.status,1);assert(d.expiresAt>BigInt(Math.floor(Date.now()/1000)+7200));assert.equal(await node.readContract({address:m.app,abi,functionName:'activeCount'}),0n);
const db=new Pool({connectionString:process.env.DATABASE_URL});let coordinator:Awaited<ReturnType<typeof createRoomsCoordinator>>=null;
try{
 coordinator=await createRoomsCoordinator({db,origin:'https://pongit.xyz',financeConfig:await loadRoomsFinance(),enqueue:async()=>{throw Error('Read-only candidate qualification');},body:async()=>({}),send:()=>{},graphql:async()=>({})});assert(coordinator);
 for(let i=0;i<40&&!coordinator.status().online;i++)await new Promise(r=>setTimeout(r,500));
 const status=coordinator.status();assert(status.online&&status.maintenance?.healthy&&!status.lastError);
 await writeFile('artifacts/realtime/coordinator-startup.json',JSON.stringify({at:new Date().toISOString(),status,passed:true},null,2));console.log(JSON.stringify({online:status.online,stage:status.maintenance?.stage,passed:true}));
}finally{coordinator?.stop();await new Promise(r=>setTimeout(r,500));await db.end();}
