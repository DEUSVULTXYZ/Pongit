import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {createPublicClient,createWalletClient,http,parseEther,keccak256,toHex} from 'viem';
import {foundry} from 'viem/chains';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {contractsFor,domain,enterTypes,json} from '../shared/protocol';
import {DEV_KEY} from './local-chain';

// Run against a dedicated local V4 stack with its relayer stopped. Never test crashes on a live VPS.
const file=process.env.DEPLOYMENT_FILE||'deployments/local-payments-v4.json';
const d=JSON.parse(await readFile(file,'utf8'));assert.equal(d.chainId,31337);assert.equal(d.version,4);
const rpc=process.env.RPC_URL||'http://127.0.0.1:8557';assert(['localhost','127.0.0.1'].includes(new URL(rpc).hostname));
const url=process.env.DATABASE_URL||'postgres://pong:pong-local-only@127.0.0.1:15432/pong_payments_v4';assert(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const client=createPublicClient({chain:foundry,transport:http(rpc),pollingInterval:100});assert.equal(await client.getChainId(),31337);
const wallet=createWalletClient({chain:foundry,transport:http(rpc),account:privateKeyToAccount(DEV_KEY)}),abi=contractsFor(d);
const db=new pg.Client({connectionString:url});await db.connect();
const graph=process.env.INDEXER_GRAPHQL_URL||'http://localhost:18084/v1/graphql',secret=process.env.HASURA_ADMIN_SECRET||'local-payments-only';
let child:ChildProcess|undefined;
const env={...process.env,DEPLOYMENT_FILE:file,RPC_URL:rpc,ALCHEMY_RPC_URL:'',RPC_FALLBACK_URL:'',DATABASE_URL:url,RELAYER_PRIVATE_KEY:keccak256(toHex('PONGIT isolated payments relayer')),PORT:'4014',ALLOWED_ORIGIN:'http://localhost:3004',LOCAL_DEV:'true',RELAYER_DAILY_BUDGET_MON:'0',INDEXER_GRAPHQL_URL:graph,HASURA_ADMIN_SECRET:secret};
async function until<T>(read:()=>Promise<T>,ok:(x:T)=>boolean){for(let i=0;i<150;i++){const value=await read();if(ok(value))return value;await new Promise(r=>setTimeout(r,300));}throw Error('Payment recovery timed out');}
async function start(){child=spawn(process.execPath,['--import','tsx','relayer/src/main.ts'],{env,stdio:'ignore',windowsHide:true});await until(()=>fetch('http://localhost:4014/health').then(r=>r.json()).catch(()=>({ok:false})),r=>r.ok);}
async function stop(){if(!child||child.exitCode!==null)return;const done=new Promise<void>(r=>child!.once('exit',()=>r()));child.kill('SIGKILL');await done;}
async function write(module:'tournaments'|'vault',fn:string,args:unknown[],value=0n){const hash=await wallet.writeContract({address:d[module],abi:abi[module] as any,functionName:fn,args,value});const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return r;}
const entrant=privateKeyToAccount(generatePrivateKey()),fee=parseEther('0.002');
try{
 const tid=await client.readContract({address:d.tournaments,abi:abi.tournaments,functionName:'nextId'}) as bigint;
 const now=(await client.getBlock()).timestamp;
 await write('tournaments','create',[now+10n,2,fee],parseEther('0.004'));
 await write('vault','depositFor',[entrant.address],fee);
 const message={player:entrant.address,tournamentId:tid,nonce:0n,deadline:now+120n};
 const signature=await entrant.signTypedData({domain:domain('PONG Tournaments',31337,d.tournaments),types:enterTypes,primaryType:'Enter',message});
 await write('tournaments','enter',[tid,entrant.address,0n,now+120n,signature]);
 await client.request({method:'evm_setNextBlockTimestamp' as never,params:[Number(now+11n)] as never});await client.request({method:'anvil_mine' as never,params:[1] as never});
 const cancelled=await write('tournaments','cancel',[tid]);
 const candidate=`v4:tournaments:2:${tid}:${entrant.address.toLowerCase()}`;
 await until(()=>fetch(graph,{method:'POST',headers:{'content-type':'application/json','x-hasura-admin-secret':secret},body:JSON.stringify({query:'query($id:String!){PayoutCandidate(where:{id:{_eq:$id}}){id}}',variables:{id:candidate}})}).then(r=>r.json()),r=>r.data?.PayoutCandidate.length===1);
 await client.request({method:'anvil_setIntervalMining' as never,params:[0] as never});await client.request({method:'evm_setAutomine' as never,params:[false] as never});
 await start();
 const before=await until(()=>db.query("SELECT j.* FROM payout_tasks p JOIN relay_jobs j ON j.id=p.job_id WHERE p.id=$1",[candidate]).then(r=>r.rows[0]),r=>r?.status==='sent');
 await stop();
 const restart=spawn('docker',['restart','pongit-payments-indexer'],{stdio:'ignore',windowsHide:true});assert.equal(await new Promise(r=>restart.once('exit',r)),0);
 await start();await client.request({method:'evm_setAutomine' as never,params:[true] as never});await client.request({method:'anvil_setIntervalMining' as never,params:[1] as never});await client.request({method:'anvil_mine' as never,params:[1] as never});
 const after=await until(()=>db.query('SELECT * FROM relay_jobs WHERE id=$1',[before.id]).then(r=>r.rows[0]),r=>r.status==='succeeded');
 assert.equal(after.raw_tx,before.raw_tx);assert.equal(after.tx_hash,before.tx_hash);assert.equal(after.nonce,before.nonce);
 await until(()=>client.getBalance({address:entrant.address}),b=>b===fee);
 const payment=await until(()=>db.query('SELECT state,amount,tx_hash FROM payout_tasks WHERE id=$1',[candidate]).then(r=>r.rows[0]),r=>r.state==='paid'&&!!r.tx_hash);
 assert.equal((await db.query('SELECT count(*) FROM payout_tasks WHERE id=$1',[candidate])).rows[0].count,'1');
 assert.equal(await client.readContract({address:d.vault,abi:abi.vault,functionName:'balances',args:[entrant.address]}),0n);
 await writeFile('artifacts/v4-payment-recovery.json',json({tournamentId:tid,recipient:entrant.address,refundWei:fee,cancelHash:cancelled.transactionHash,payment,nonce:after.nonce,checks:['Envio cancellation candidate','relayer killed after refund broadcast before inclusion','Envio restarted during outage','same signed transaction and nonce after restart','one exact native refund','no vault credit and no receiving signature'],checkedAt:new Date().toISOString()}));
 console.log('PASS: automatic cancellation refund survives relayer and Envio restarts, same transaction, paid exactly once.');
}finally{await stop();await client.request({method:'evm_setAutomine' as never,params:[true] as never}).catch(()=>{});await client.request({method:'anvil_setIntervalMining' as never,params:[1] as never}).catch(()=>{});await db.end();}
