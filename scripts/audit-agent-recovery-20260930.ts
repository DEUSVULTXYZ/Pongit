// Read-only, block-pinned proof for the explicitly approved match-190 recovery.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPublicClient} from 'viem';
import {baseReadTransport} from '../shared/base-read-transport';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
const out=process.argv[2];assert(out);
const app='0xf202862714f61d6f6b8b14c1d2f5d3ca7ea3e41b',pool='0x205d5739136d6cb73d732e1146e1ce034798a613';
const hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595',book='0xabeb417646c2b57eefbc4adb75ba1a336b5cbe87';
const ref={chainId:10143n,arena:app,epoch:1n,id:190n} as const;
const base=createPublicClient({transport:baseReadTransport(process.env.RPC_URL??'https://testnet-rpc.monad.xyz',{intervalMs:150,maxConcurrent:2})});
const report:any={at:new Date().toISOString(),ref,recovered:false,scope:'Canonical recovery and tournament retry; no transaction submitted'};
try{
 assert.equal(await base.getChainId(),10143);const block=await base.getBlock();
 report.block=block.number;report.blockHash=block.hash;
 const verifier=await base.readContract({address:pool,abi:poolAbi,functionName:'verifier',blockNumber:block.number});
 const [d,sealed,record,fixture]=await Promise.all([
  readHubDelegation(base,hub,app,block.number),
  base.readContract({address:verifier,abi:verifierAbi,functionName:'finalizedRoots',args:[app,1n],blockNumber:block.number}),
  base.readContract({address:pool,abi:poolAbi,functionName:'record',args:[ref],blockNumber:block.number}),
  base.readContract({address:book,abi:bookAbi,functionName:'fixture',args:[11n,4],blockNumber:block.number}),
 ]);
 report.delegation={epoch:d.epoch,status:d.status,releaseAt:d.stakeUnlockAt};
 report.sealed={root:sealed[0],count:sealed[1]};report.record=record;report.fixture=fixture;
 const result=record.captured ? await base.readContract({address:pool,abi:poolAbi,functionName:'result',args:[ref],blockNumber:block.number}) : undefined;
 report.result=result;
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Observation block reorganized');
 if(record.captured){
  assert(result);
  assert.equal(sealed[0],'0x95f4875acf696d6f3fc736a9c55f7f3b218feafc3373b4925e1c4f5d4c941a70');
  assert.equal(BigInt(sealed[1]),2n);assert.equal(result.status,4);assert.equal(result.finality,true);
  assert.equal(result.scoreA,0);assert.equal(result.scoreB,0);assert.equal(result.winner,'0x0000000000000000000000000000000000000000');
  report.recovered=true;report.retryConfirmed=fixture.attempt>1;
 }
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].slice(0,200);process.exitCode=1;}
finally{await writeFile(out,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({recovered:report.recovered,retryConfirmed:report.retryConfirmed,delegation:report.delegation,error:report.error},(_,v)=>typeof v==='bigint'?String(v):v));}
