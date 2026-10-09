/** Real isolated PostgreSQL, real local signing, deterministic chain transport.
 * No RPC endpoint or funded account is accepted. Retains the scratch database. */
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPublicClient,custom,encodeFunctionData,keccak256,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {independentWriter} from '../relayer/src/independent-writer';
import {bundlePoolAdmissions,batchPoolChallenge,poolOperationId,validatePoolSignedCall,strictPoolAdmissionEstimates} from '../shared/agent-pool-sponsor';
import {agentChallengesAbi} from '../shared/abi-AgentChallenges';
import type {AgentPoolManifest} from '../shared/agent-pool';
assert.equal(process.env.PONG_BUNDLE_QUALIFICATION,'isolated-vps');
const connectionString=process.env.DATABASE_URL!;assert(new URL(connectionString).hostname==='pongit-bundle50-pg');
const admin=new Pool({connectionString});
assert.equal(Number((await admin.query("SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")).rows[0].count),0,'Requires a fresh isolated database');
await admin.query('CREATE SCHEMA business; CREATE SCHEMA operator');await admin.end();
const business=new Pool({connectionString,options:'-c search_path=business'}),journal=new Pool({connectionString,options:'-c search_path=operator'});
const directory=await mkdtemp(join(tmpdir(),'bundle-pg-')),keyFile=join(directory,'key.json'),key=generatePrivateKey(),owner=privateKeyToAccount(key).address;
await writeFile(keyFile,JSON.stringify({privateKey:key}),{mode:0o600});
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const m={version:5,rulesVersion:17,challengeAdmission:'atomic-v1',pool:addr(1),challenges:addr(2),catalog:addr(3),family:addr(4)} as AgentPoolManifest;
let failUpdate=false,failEstimate=false,observed=false;const sent:Hex[]=[];
const db={query:async(...args:any[])=>{
 if(failUpdate&&String(args[0]).startsWith('UPDATE independent_operations')){failUpdate=false;throw Error('injected cross-database crash');}
 return (business.query as any)(...args);
},connect:()=>business.connect()} as unknown as Pool;
const values:any={eth_chainId:'0x279f',eth_estimateGas:'0x1e8480',eth_maxPriorityFeePerGas:'0x2',eth_gasPrice:'0x12',
 eth_getBlockByNumber:{number:'0x1',timestamp:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',baseFeePerGas:'0xf',transactions:[]}};
const base=createPublicClient({chain:monadTestnet,transport:custom({request:async({method}:any)=>{
 if(method==='eth_getTransactionCount')return `0x${Number((await journal.query("SELECT count(*) FROM il_lifecycle_jobs WHERE status='confirmed'")).rows[0].count).toString(16)}`;
 assert(method in values);return values[method];}},{retryCount:0})});
const client={...base,estimateGas:async()=>{if(failEstimate)throw Error('429');return 2_000_000n;},
 getTransactionReceipt:async({hash}:any)=>{if(!observed)throw Error('missing receipt');return{transactionHash:hash,status:'success'};},
 sendRawTransaction:async({serializedTransaction}:any)=>{const row=(await journal.query("SELECT raw,hash FROM il_lifecycle_jobs WHERE status='pending'")).rows;
  assert.equal(row.length,1);assert.equal(row[0].raw,serializedTransaction);sent.push(keccak256(serializedTransaction));return keccak256(serializedTransaction);}};
const scope={keyFile,address:owner,allowCall:(to:Address,data:Hex,value:bigint)=>{assert.equal(value,0n);validatePoolSignedCall(m,{to,data});},
 strictEstimate:(to:Address,data:Hex,value:bigint)=>strictPoolAdmissionEstimates(m,{to,data}).map(c=>({...c,value})),bundle:(calls:any)=>bundlePoolAdmissions(m,calls)};
let writer:Awaited<ReturnType<typeof independentWriter>>|undefined;
const start=async()=>{writer=await independentWriter(db,client as any,journal,scope);writer.stop();};
const restart=async()=>{await writer?.close();await start();};
async function seed(first:number){
 for(let n=first;n<first+4;n++){
  const call=batchPoolChallenge(m,{to:m.challenges,data:encodeFunctionData({abi:agentChallengesAbi,functionName:'command',args:[addr(n),1,addr(80),1,0n,0n,9999999999n,`0x${'ab'.repeat(65)}`]})});
  await business.query('INSERT INTO independent_operations(id,target,data,value,priority) VALUES($1,$2,$3,$4,$5)',[poolOperationId(call),call.to.toLowerCase(),call.data,'0',1]);
 }
}
try{
 await start();await seed(10);failUpdate=true;await writer!.dispatch();await writer!.close();
 assert.equal(Number((await journal.query('SELECT count(*) FROM il_lifecycle_jobs')).rows[0].count),1);
 assert.equal(Number((await business.query("SELECT count(*) FROM independent_operations WHERE status='queued'")).rows[0].count),4);
 await restart();await writer!.dispatch();await writer!.dispatch();assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);
 observed=true;await writer!.observe();assert.equal(Number((await business.query("SELECT count(*) FROM independent_operations WHERE status='confirmed'")).rows[0].count),4);
 await restart();await writer!.dispatch();assert.equal(sent.length,2);
 await seed(20);observed=false;failEstimate=true;await writer!.dispatch();assert.equal(Number((await business.query('SELECT count(*) FROM independent_operation_batches')).rows[0].count),2);
 assert.equal(Number((await journal.query('SELECT count(*) FROM il_lifecycle_jobs')).rows[0].count),1);
 await restart();failEstimate=false;await writer!.dispatch();observed=true;await writer!.observe();
 const jobs=(await journal.query('SELECT nonce,status FROM il_lifecycle_jobs ORDER BY nonce')).rows;
 assert.deepEqual(jobs.map(j=>Number(j.nonce)),[0,1]);assert(jobs.every(j=>j.status==='confirmed'));
 assert.equal(Number((await business.query("SELECT count(*) FROM independent_operations WHERE status='confirmed'")).rows[0].count),8);
 console.log(JSON.stringify({passed:true,kind:'isolated PostgreSQL and deterministic chain transport',intents:8,nonces:2,groups:2,
  crossDatabaseCrash:true,identicalResend:true,unsigned429:true,restart:true,productionTransactions:0}));
}finally{await writer?.close();await business.end();await journal.end();await rm(directory,{recursive:true,force:true});}
