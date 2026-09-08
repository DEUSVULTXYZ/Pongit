import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {toHex,type Abi,type Hex} from "viem";
import {localChain} from "./local-chain";
import {initial,advance,resume} from "../shared/physics-rooms-chaos";
import {next} from "../shared/physics-v2";
const chain=await localChain();
try {
  const artifact=JSON.parse(await readFile("contracts/out/PhysicsRoomsChaos.sol/PhysicsRoomsChaosHarness.json","utf8"));
  const hash=await chain.wallet.deployContract({abi:artifact.abi as Abi,bytecode:artifact.bytecode.object as Hex});
  const address=(await chain.publicClient.waitForTransactionReceipt({hash})).contractAddress!;
  let seed=0xcafed00d;
  const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  for(let batch=0;batch<10000;batch+=20) {
    const cases=Array.from({length:20},()=>{
      const entropy=toHex(BigInt(random()),{size:32});let s=initial(entropy);
      s.leftDir=random()%3-1;s.rightDir=random()%3-1;
      [s]=advance(s,BigInt(random()%60000000));
      const paidA=BigInt(random()%5000)*1_000_000_000_000n,paidB=BigInt(random()%5000)*1_000_000_000_000n;
      const paused=s.awaitingServe?{...s}:null;
      if(paused && random()%2)s=resume(s,s.resumeAt,paidA,paidB);
      const target=random()%3?s.t+BigInt(random()%600000000):next(s).at;
      return {s,target,limit:[0,1,2,32,128][random()%5],paused,paidA,paidB};
    });
    await Promise.all(cases.map(async(c,j)=>{
      assert.deepEqual(await chain.publicClient.readContract({address,abi:artifact.abi,functionName:"advance",args:[c.s,c.target,BigInt(c.limit)]}),advance(c.s,c.target,c.limit),`advance ${batch+j}`);
      if(c.paused)assert.deepEqual(await chain.publicClient.readContract({address,abi:artifact.abi,functionName:"resume",args:[c.paused,c.paused.resumeAt,c.paidA,c.paidB]}),resume(c.paused,c.paused.resumeAt,c.paidA,c.paidB),`resume ${batch+j}`);
    }));
    if(batch%1000===0)console.log(`Chaos physics: ${batch+20}/10000`);
  }
  await mkdir("artifacts/rooms-chaos",{recursive:true});
  await writeFile("artifacts/rooms-chaos/differential.json",JSON.stringify({cases:10000,mismatches:0,checkedAt:new Date().toISOString(),scope:"Physics preparation only; no markets, pressure transport or rooms deployment"},null,2));
  console.log("PASS: 10000 Chaos physics cases, including pause/resume and paid-pressure inputs.");
} finally {chain.close();}
