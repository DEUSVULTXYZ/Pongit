// Run only against a disposable PostgreSQL database on the isolated VPS test
// network. The engine below is a fault-injection double, not a hosted trial.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {encodeFunctionResult,keccak256,parseTransaction,zeroAddress,zeroHash,type Hex} from 'viem';
import {generatePrivateKey} from 'viem/accounts';
import {initializePoolOperations,createPoolEngine} from '../relayer/src/agents/pool-engine';
import {provisionPoolArena,observePoolArenaReady} from '../relayer/src/agents/pool-hosted';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';

assert.equal(process.env.PONG_AGENT_POOL_DB_TEST,'isolated-disposable');
const url=new URL(process.env.POOL_TEST_DATABASE_URL!);assert.equal(url.pathname,'/agent_pool_operations_test');
assert.equal(url.hostname,'pongit-pool-journal-test-db');
const db=new Pool({connectionString:url.toString(),max:8}),app='0x0000000000000000000000000000000000000011';
const cases:string[]=[];
try{
 await initializePoolOperations(db);await initializePoolOperations(db);
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}),begun=new Promise<void>(r=>{entered=r;});let posts=0;
 const first=provisionPoolArena(db,app,1n,undefined,(async()=>{posts++;entered();await gate;throw Error('lost reply');}) as typeof fetch);
 await begun;
 const persisted=(await db.query('SELECT provisioning FROM agent_pool.lifecycle WHERE app=$1',[app])).rows[0].provisioning;
 assert.equal(persisted.state,'sending');
 await assert.rejects(provisionPoolArena(db,app,1n,undefined,(async()=>{posts++;throw Error('duplicate');}) as typeof fetch),/already reconciling/);
 release();await assert.rejects(first,/response lost/);assert.equal(posts,1);
 await db.query("UPDATE agent_pool.lifecycle SET provisioning=jsonb_set(provisioning,'{retryAt}','0') WHERE app=$1",[app]);
 await provisionPoolArena(db,app,1n,undefined,(async(_u,init)=>{assert.equal(init?.method,'GET');return Response.json({app,url:'https://isolated.example'});}) as typeof fetch);
 await observePoolArenaReady(db,app,1n,true);
 cases.push('advisory lock across clients, intent before POST and lost response lookup');

 // A failure to append the evidence rolls back the latest-state update too.
 await db.query(`CREATE FUNCTION reject_test_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.epoch=2 THEN RAISE EXCEPTION 'injected journal failure'; END IF; RETURN NEW; END $$`);
 await db.query('CREATE TRIGGER fail_event BEFORE INSERT ON agent_pool.lifecycle_events FOR EACH ROW EXECUTE FUNCTION reject_test_event()');
 await assert.rejects(provisionPoolArena(db,app,2n,undefined,(async()=>{throw Error('must not POST');}) as typeof fetch),/injected journal/);
 assert.equal((await db.query('SELECT provision_epoch FROM agent_pool.lifecycle WHERE app=$1',[app])).rows[0].provision_epoch,'1');
 await db.query('DROP TRIGGER fail_event ON agent_pool.lifecycle_events');
 await provisionPoolArena(db,app,2n,undefined,(async()=>Response.json({app,url:'https://isolated.example'})) as typeof fetch);
 assert.equal((await db.query("SELECT count(*) FROM agent_pool.lifecycle_events WHERE app=$1 AND epoch=1 AND stage='ready'",[app])).rows[0].count,'1');
 cases.push('atomic state/evidence rollback and retained prior epoch');

 let nonce=0,epoch=1n,status=1,lose=true;const receipts=new Map<Hex,any>(),sent:Hex[]=[];
 const node:any={getTransactionCount:async()=>nonce,getTransactionReceipt:async({hash}:{hash:Hex})=>receipts.get(hash)??null,
  request:async(r:any)=>{
   if(r.method==='interlude_session')return{app,epoch:String(epoch),chainId:4242};
   assert.equal(r.method,'interlude_sendTransaction');const raw=r.params[0] as Hex;sent.push(raw);const hash=keccak256(raw);
   if(!receipts.has(hash)){assert.equal(parseTransaction(raw).nonce,nonce++);receipts.set(hash,{transactionHash:hash,status:'0x1',blockNumber:'0x20',blockHash:zeroHash});}
   if(lose)throw Error('executed response lost');return receipts.get(hash);
  }};
 const fields=roomsLifecycleHubAbi[0].outputs[0].components;
 const base:any={getBlock:async()=>({number:50n,hash:zeroHash,timestamp:1000n}),request:async()=>{
  const d:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
  Object.assign(d,{status,epoch,expiresAt:10000n});return encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:d});
 }};
 const feed:any={watch:()=>()=>{},read:async()=>({id:1n,phase:2}),receipt:async()=>({id:1n,phase:2}),invalidate(){}};
 const key=generatePrivateKey(),make=()=>createPoolEngine(db,base,zeroAddress,app,'https://isolated.example',key,{epoch,id:1n},undefined,{node,feed});
 let engine=make();await assert.rejects(engine.send('first','tick',[1n]),/lost/);engine.close();
 let rows=(await db.query('SELECT * FROM agent_pool.engine_jobs ORDER BY created_at')).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');
 // A second pending operation and a duplicate used nonce are forbidden by the
 // actual database, not just an in-process mutex or test double.
 const j=rows[0];
 await assert.rejects(db.query('INSERT INTO agent_pool.engine_jobs(app,id,operation,epoch,signer,nonce,raw,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
  [app,'illegal','illegal','1',j.signer,'1',j.raw,j.hash]),(e:any)=>e.code==='23505');
 lose=false;engine=make();await assert.rejects(engine.send('next','tick',[1n]),/Previous command reconciled/);
 assert.equal(sent.length,1);await engine.send('next','tick',[1n]);engine.close();
 rows=(await db.query('SELECT * FROM agent_pool.engine_jobs ORDER BY created_at')).rows;
 assert.deepEqual(rows.map(r=>[r.nonce,r.status]),[['0','observed'],['1','observed']]);
 assert.equal(rows[0].raw,j.raw);assert.equal(keccak256(rows[0].raw),rows[0].hash);
 cases.push('restart reconciles executed response, database uniqueness and exact immutable command');

 // A failed new epoch must not reuse an old command; successful authoritative
 // closure preserves the old row as evidence instead of deleting it.
 const raw=await (await import('viem/accounts')).privateKeyToAccount(key).signTransaction({chainId:4242,type:'eip1559',nonce:2,to:app,value:0n,data:parseTransaction(j.raw).data,
  gas:14_800_000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 await db.query('INSERT INTO agent_pool.engine_jobs(app,id,operation,epoch,signer,nonce,raw,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
  [app,'uncertain-end','uncertain-end','1',j.signer,'2',raw,keccak256(raw)]);
 status=0;engine=make();await assert.rejects(engine.send('late','tick',[1n]),/lifecycle/);engine.close();
 assert.equal((await db.query("SELECT status FROM agent_pool.engine_jobs WHERE id='uncertain-end'")).rows[0].status,'obsolete');
 status=1;epoch=2n;nonce=0;engine=make();await engine.send('new-epoch','tick',[1n]);engine.close();
 assert.equal((await db.query("SELECT nonce FROM agent_pool.engine_jobs WHERE operation='new-epoch'")).rows[0].nonce,'0');
 cases.push('verified closure retires uncertainty and isolates the replacement epoch');

 console.log(JSON.stringify({at:new Date().toISOString(),kind:'isolated-postgresql-fault-injection',passed:true,cases,
  hostedInterlude:false,productionChanged:false}));
}finally{await db.end();}
