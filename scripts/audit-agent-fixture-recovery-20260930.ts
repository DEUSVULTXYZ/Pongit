// Read-only evidence for two owned browser fixtures. This script cannot close,
// release, renew or capture anything; existing production services own recovery.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPublicClient,zeroAddress} from 'viem';
import {baseReadTransport} from '../shared/base-read-transport';
import {readHubDelegation} from '../shared/rooms-hub';
import {agentPublicationHealth} from '../shared/agent-publication-health';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';

const out=process.argv[2];assert(out,'Supply a new report path');
const pool='0x205d5739136d6cb73d732e1146e1ce034798a613',hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const emptyRoot='0x2733e50f526ec2fa19a22b31e8ed50f23cd1fdf94c9154ed3a7609a2f1ff981f';
const fixtures=[
 {app:'0x028f656e76cc1973ced7c41d8584d4f94be9e003',epoch:11n,id:212n,
  close:'0xf181a816538519e2977b8914e14e346e6175fc684be367fadecc04b4745a1134',releaseAt:'2026-09-30T16:10:45.000Z'},
 {app:'0x40178b386730985a9d1df46c3a811f8e7138e4ec',epoch:12n,id:213n,
  close:'0x5033066c192785e8ddbda022ad0b6908deb540c5f1b7fbb6ec54790beea2f266',releaseAt:'2026-09-30T16:20:56.000Z'},
] as const;
const base=createPublicClient({transport:baseReadTransport(process.env.RPC_URL??'https://testnet-rpc.monad.xyz',{intervalMs:150,maxConcurrent:2})});
const report:any={at:new Date().toISOString(),scope:'Canonical recovery and allowlisted hosted health only; no transaction submitted',allRecovered:false,fixtures:[]};
try{
 assert.equal(await base.getChainId(),10143);
 const block=await base.getBlock();report.block=block.number;report.blockHash=block.hash;
 const verifier=await base.readContract({address:pool,abi:poolAbi,functionName:'verifier',blockNumber:block.number});
 for(const f of fixtures){
  const ref={chainId:10143n,arena:f.app,epoch:f.epoch,id:f.id};
  const row:any={ref,expectedReleaseAt:f.releaseAt,recovered:false};report.fixtures.push(row);
  const [delegation,sealed,record,receipt]=await Promise.all([
   readHubDelegation(base,hub,f.app,block.number),
   base.readContract({address:verifier,abi:verifierAbi,functionName:'finalizedRoots',args:[f.app,f.epoch],blockNumber:block.number}),
   base.readContract({address:pool,abi:poolAbi,functionName:'record',args:[ref],blockNumber:block.number}),
   base.getTransactionReceipt({hash:f.close}),
  ]);
  assert.equal(receipt.status,'success');assert.equal(receipt.to?.toLowerCase(),pool);
  assert(receipt.blockNumber<=block.number);
  assert.equal((await base.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash,'Close receipt reorganized');
  assert.equal(record.ref.id,f.id);assert.equal(record.ref.epoch,f.epoch);
  assert.equal(record.tournament,0n);assert.equal(record.ranked,false);
  row.close={hash:receipt.transactionHash,block:receipt.blockNumber};
  row.delegation={epoch:delegation.epoch,status:delegation.status,releaseAt:delegation.stakeUnlockAt};
  row.sealed={root:sealed[0],count:sealed[1]};row.captured=record.captured;
  if(delegation.epoch===f.epoch&&delegation.status===2)
   assert.equal(new Date(Number(delegation.stakeUnlockAt)*1000).toISOString(),f.releaseAt,'Release deadline changed');
  if(record.captured){
   const result=await base.readContract({address:pool,abi:poolAbi,functionName:'result',args:[ref],blockNumber:block.number});
   assert.equal(sealed[0],emptyRoot);assert.equal(sealed[1],0);
   assert.equal(result.status,4);assert.equal(result.finality,true);assert.equal(result.winner,zeroAddress);
   assert.equal(result.scoreA,0);assert.equal(result.scoreB,0);
   row.result=result;row.recovered=true;
  }
  try{
   const response=await fetch(`https://il-${f.app.slice(2,18)}.fly.dev/health`,{signal:AbortSignal.timeout(5000)});
   row.hostedHttp=response.status;
   if(response.ok)row.hosted=agentPublicationHealth(await response.json(),f.app,delegation.epoch);
  }catch{row.hostedObservation='unavailable-or-identity-mismatch';}
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Observation block reorganized');
 report.allRecovered=report.fixtures.every((f:any)=>f.recovered);
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].slice(0,180);process.exitCode=1;}
finally{
 await writeFile(out,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({allRecovered:report.allRecovered,error:report.error,fixtures:report.fixtures.map((f:any)=>({id:String(f.ref.id),recovered:f.recovered,releaseAt:f.expectedReleaseAt,hosted:f.hosted}))}));
}
