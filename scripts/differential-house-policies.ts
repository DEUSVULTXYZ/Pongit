// Exact browser/contract mirror, independent from the earlier float controller.
// Uses a disposable local chain; never reads deployment keys or sends test MON.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {toHex,type Abi,type Address} from 'viem';
import {localChain,artifact} from './local-chain';
import {decideHouse,packPolicy,unpackPolicy,type PolicyView,type PolicyMemory} from '../shared/house-policy';
const U=1_000_000_000_000n,chain=await localChain();
const report={at:new Date().toISOString(),compared:0,legacy:0,progressive:0,styles:Array(8).fill(0),mismatches:[] as unknown[]};
let seed=0xdec1de;
const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
try{
 for(const progressive of [false,true]){
  const a=await artifact(progressive?'ProgressiveHousePolicies':'HousePolicies');
  const tx=await chain.wallet.deployContract({abi:a.abi as Abi,bytecode:a.bytecode.object});
  const address=(await chain.publicClient.waitForTransactionReceipt({hash:tx})).contractAddress! as Address;
  const count=Number(process.env.DIFFERENTIAL_CASES??10000);assert(Number.isInteger(count)&&count>=8);
  for(let i=0;i<count;i++){
   const style=i%8,t=BigInt(random()%360000001),side=(random()%2) as 0|1,half=BigInt(32+random()%89)*U;
   const v:PolicyView={balls:Array.from({length:i%3},()=>({x:BigInt(random()%1025)*U,y:BigInt(random()%577)*U,
    vx:i%31===0?0n:BigInt((random()%6001)-3000)*1_000_000n,vy:BigInt((random()%6001)-3000)*1_000_000n})),
    side,t,paddle:half+BigInt(random()%Number((576n*U-2n*half)/U+1n))*U,half,opponent:BigInt(random()%577)*U,
    seed:toHex(BigInt(random()),{size:32}),rally:random(),tournament:BigInt(random())};
   const brain:PolicyMemory={nextDecision:i%5===0?t+100000n:0n,held:(random()%3-1) as -1|0|1,
    meanVy:BigInt(random()%6000000001)-3000000000n,samples:i%19===0?65535:i%7,lastTarget:288n*U};
   const expected=decideHouse(style,v,brain,progressive);
   const [held,actual]=await chain.publicClient.readContract({address,abi:a.abi as Abi,functionName:'decide',args:[style,v,brain]}) as [number,PolicyMemory];
   report.compared++;report[progressive?'progressive':'legacy']++;report.styles[style]++;
   try{assert.deepEqual(actual,expected);assert.equal(held,expected.held);assert.deepEqual(unpackPolicy(packPolicy(expected)),expected);}
   catch(error){report.mismatches.push({i,style,progressive,v,brain,actual,expected});throw error;}
  }
 }
 console.log(JSON.stringify({compared:report.compared,legacy:report.legacy,progressive:report.progressive,styles:report.styles,mismatches:report.mismatches.length}));
}finally{
 chain.close();await mkdir('artifacts/agents',{recursive:true});
 await writeFile(`artifacts/agents/house-policy-mirror-${Date.now()}.json`,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
}
