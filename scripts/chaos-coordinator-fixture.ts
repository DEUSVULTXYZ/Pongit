// Private VPS coordinator with real hosted execution and isolated business tables.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {Pool} from 'pg';
import {WebSocketServer} from 'ws';
import {keccak256,toHex} from 'viem';
import {chainTools} from './independent-chain-tools';
import {loadRoomsFinance} from '../relayer/src/rooms-finance-config';
import {createRoomsCoordinator} from '../relayer/src/interlude-rooms';
import {chaosQualificationRecord,verifyQualificationApp} from './chaos-qualification-record';
assert.equal(process.env.PONG_CHAOS_QUALIFY,'isolated-hosted-testnet');
const production=process.env.PONG_CHAOS_PRODUCTION_FIXTURE==='authorized-testnet-candidate';
const historyOnly=process.env.PONG_CHAOS_HISTORY_ONLY==='true';
assert(!historyOnly||!production,'History-only rehearsal is restricted to the private fixture');
const fixture=production?null:await chaosQualificationRecord();
const prefix=fixture?.prefix??'chaos-events-production-20260913',r=fixture?.record??JSON.parse(await readFile(`/secrets/${prefix}.json`,'utf8'));
const m=JSON.parse(await readFile(`artifacts/drand/${production?'production':'integration'}-manifests.json`,'utf8'));
if(production)assert.equal(r.app,'0x78d3341e3452d7ec1add9371de3008639eed8eb0');assert.equal(m.game.app,r.app);
const databaseUrl=production?process.env.TEST_DATABASE_URL!:process.env.PONG_CHAOS_DATABASE_URL!;
assert.equal(new URL(databaseUrl).hostname,production?'pongit-chaos-history':'pongit-rules8-db');
const t=await chainTools(prefix+'-coordinator');
if(!production)await verifyQualificationApp(t,prefix,r.app);
// The test coordinator cannot renew/close the engine. Its normal lifecycle is
// qualified separately; financial transactions still share the operator journal.
delete process.env.ROOMS_LIFECYCLE_KEY_FILE;
if(production){assert(process.env.INTERLUDE_COORDINATOR_KEY);process.env.ROOMS_PRESSURE_KEY_FILE='/secrets/pressure.json';}
else{process.env.INTERLUDE_COORDINATOR_KEY=r.keys[4];process.env.ROOMS_PRESSURE_KEY_FILE=`/secrets/${prefix}-pressure.json`;}
process.env.ROOMS_CHAOS_ENABLED='true';process.env.ROOMS_ADMISSION_ENABLED=historyOnly?'false':'true';process.env.ROOMS_STATE_STREAM_ENABLED='true';process.env.ROOMS_PRIVATE_FINANCE_TEST='true';
await writeFile('artifacts/drand/test-game.json',JSON.stringify(m.game));await writeFile('artifacts/drand/test-finance.json',JSON.stringify([m.finance]));
process.env.INTERLUDE_ROOMS_MANIFEST='artifacts/drand/test-game.json';process.env.ROOMS_FINANCE_MANIFEST='artifacts/drand/test-finance.json';
const config=await loadRoomsFinance(),db=new Pool({connectionString:databaseUrl});
if(!production)assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name,'pong_rules8_qualification');
await db.query(`CREATE TABLE IF NOT EXISTS profiles(player text PRIMARY KEY,handle text UNIQUE NOT NULL,avatar integer NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());CREATE TABLE IF NOT EXISTS player_blocks(player text NOT NULL,blocked text NOT NULL,PRIMARY KEY(player,blocked));`);
const origin='https://pongit.xyz',send=(res:any,v:any,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(v,(_,v)=>typeof v==='bigint'?String(v):v));};
const service=await createRoomsCoordinator({db,origin,financeConfig:config,body:async req=>{let data='';for await(const chunk of req){data+=chunk;if(data.length>131072)throw Error('Request too large');}return JSON.parse(data||'{}');},send,
 graphql:async(q,v)=>{if(!process.env.TEST_GRAPHQL_URL)return {Match:[],RecentReplays:[]};const response=await fetch(process.env.TEST_GRAPHQL_URL,{method:'POST',headers:{'content-type':'application/json',...(process.env.TEST_HASURA_SECRET?{'x-hasura-admin-secret':process.env.TEST_HASURA_SECRET}:{})},body:JSON.stringify({query:q,variables:v})});const result=await response.json();if(result.errors)throw Error('Fixture indexer query failed');return result.data;},
 enqueue:async(request,_internal,value=0n)=>{assert(!historyOnly,'History-only fixture cannot submit financial or archive transactions');const e=config.encode(request),op='finance-'+keccak256(toHex(JSON.stringify({to:e.address,data:e.data,value},(_,v)=>typeof v==='bigint'?String(v):v))).slice(2,26);const receipt=await t.submit(op,e.data,e.address,value);return{id:op,hash:receipt.transactionHash};}});
assert(service);
// Earlier history-only fixtures used a reduced table in this disposable DB.
// Restore its missing coordinator fields before exercising archive publication.
await db.query('ALTER TABLE il_results ADD COLUMN IF NOT EXISTS room text;ALTER TABLE il_results ADD COLUMN IF NOT EXISTS winner text;ALTER TABLE il_results ADD COLUMN IF NOT EXISTS ranked boolean;ALTER TABLE il_results ADD COLUMN IF NOT EXISTS hash text;');
const server=createServer(async(req,res)=>{const path=new URL(req.url!,origin).pathname;try{if(path==='/health')return send(res,service.status());if(await service.route(req,res,path))return;send(res,{error:'Private fixture route not found'},404);}catch{send(res,{error:'Private fixture request failed'},500);}});
const ws=new WebSocketServer({server,path:'/ws'});ws.on('connection',(socket,req)=>{socket.on('message',async raw=>{try{const m=JSON.parse(raw.toString());if(m.type==='subscribe-rooms')await service.subscribe(socket,req,String(m.player));}catch{socket.send(JSON.stringify({type:'rooms-unavailable'}));}});});
server.listen(4013,'0.0.0.0',()=>console.log(`Isolated rules-${m.game.rulesVersion} coordinator listening on the private container network`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{service.stop();ws.close();server.close();void Promise.all([db.end(),t.close()]).then(()=>process.exit(0));});
