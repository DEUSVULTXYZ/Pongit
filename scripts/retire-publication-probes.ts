// Retire only documented, non-financial PONGIT diagnostics. The abandoned game
// fixture below never had a market and published no game (see CHAOS_RECOVERY_2026-09-09).
// Shares the production operator lock and transaction journal; no live player arena.
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,createWalletClient,http,parseAbi,encodeFunctionData,keccak256,zeroHash,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';
if(process.env.PONG_RETIRE_PROBES!=='expired-publication-diagnostics')throw Error('Explicit probe retirement configuration required');
const hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const abandonedFixture:Address='0x526ef5822169ff21da4e5323d36426df0462dfcb';
const apps:Address[]=['0xe4f978d978cbafe6682d0ac056d773fe2c950c94','0x6d5db79aef6f551319a867d881a019e017bd9263',abandonedFixture];
const db=new Pool({connectionString:process.env.DATABASE_URL});
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL)});
const key=JSON.parse(await readFile(process.env.ROOMS_LIFECYCLE_KEY_FILE!,'utf8'));
const account=privateKeyToAccount(key.privateKey);
const wallet=createWalletClient({account,chain:monadTestnet,transport:http(process.env.RPC_URL)});
const abi=parseAbi(['function forceClose(address,bytes32)','function releaseStake(address,bytes32)','function value() view returns(uint256)','function activeCount() view returns(uint256)']);
const c=await db.connect();
try{
 if(!(await c.query('SELECT pg_try_advisory_lock(701340) AS ok')).rows[0].ok)throw Error('Lifecycle operator is busy; retry later');
 if(await base.getChainId()!==10143)throw Error('Testnet only');
 for(const app of apps){
  const d=await readHubDelegation(base,hub,app),now=BigInt(Math.floor(Date.now()/1000));
  if(d.status===0){console.log(JSON.stringify({app,state:'released'}));continue;}
  if(d.status!==1&&d.status!==2)throw Error('Challenged probe requires review');
  if(d.status===1&&d.expiresAt>=now)throw Error('Probe has not expired');
  if(d.status===2&&d.stakeUnlockAt>now){console.log(JSON.stringify({app,state:'waiting',releaseAt:String(d.stakeUnlockAt)}));continue;}
  if(app===abandonedFixture){
   if(d.batchIndex!==0n||await base.readContract({address:app,abi,functionName:'activeCount'})!==0n)throw Error('Abandoned fixture has published activity; inspect before retirement');
  }else{
   const counter=await base.readContract({address:app,abi,functionName:'value'});
   if(counter>1n)throw Error('Probe activity differs from its diagnostic record');
  }
  const action=d.status===1?'forceClose':'releaseStake',id=`retire-probe:${app}:${d.epoch}:${action}`;
  let job=(await db.query('SELECT * FROM il_lifecycle_jobs WHERE id=$1',[id])).rows[0];
  if(!job){
   if((await db.query("SELECT 1 FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending'",[account.address.toLowerCase()])).rowCount)throw Error('Operator has an uncertain journaled transaction');
   const nonce=await base.getTransactionCount({address:account.address,blockTag:'pending'});
   if(nonce!==await base.getTransactionCount({address:account.address,blockTag:'latest'}))throw Error('Operator has a pending transaction');
   const data=encodeFunctionData({abi,functionName:action,args:[app,zeroHash]});
   await base.call({account:account.address,to:hub,data});
   const request=await wallet.prepareTransactionRequest({to:hub,data,nonce});request.gas=request.gas*12n/10n;
   const raw=await wallet.signTransaction(request);job={raw,hash:keccak256(raw),status:'pending'};
   await db.query("INSERT INTO il_lifecycle_jobs(id,app,owner,nonce,raw,hash,status) VALUES($1,$2,$3,$4,$5,$6,'pending')",[id,app,account.address.toLowerCase(),nonce,raw,job.hash]);
  }
  if(job.status==='failed')throw Error('Probe retirement reverted; inspect receipt');
  let receipt=await base.getTransactionReceipt({hash:job.hash}).catch(()=>null);
  if(!receipt){try{await base.sendRawTransaction({serializedTransaction:job.raw});}catch{/* Retain uncertainty and reconcile the same hash. */}
   receipt=await base.waitForTransactionReceipt({hash:job.hash,timeout:45000});}
  await db.query('UPDATE il_lifecycle_jobs SET status=$2 WHERE id=$1',[id,receipt.status==='success'?'confirmed':'failed']);
  if(receipt.status!=='success')throw Error('Probe retirement reverted');
  console.log(JSON.stringify({at:new Date().toISOString(),app,action,hash:job.hash,block:String(receipt.blockNumber)}));
 }
}finally{await c.query('SELECT pg_advisory_unlock(701340)');c.release();await db.end();}
