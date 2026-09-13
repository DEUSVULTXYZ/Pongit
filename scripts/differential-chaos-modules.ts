// Pure module qualification, not the full physics acceptance suite.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {toHex,type Address} from 'viem';
import {localChain} from './local-chain';
import {chaosPaddles,type ModifierEffect} from '../shared/chaos-modifiers';
import {chaosDrawCommitment,deriveChaosDraw,type ChaosDrawRequest} from '../shared/chaos-draw';
assert.equal(process.env.PONG_CHAOS_MODULE_TEST,'isolated-vps');
const chain=await localChain(),started=Date.now();
try{
 const modifier=JSON.parse(await readFile('contracts/out/ChaosModifiers.sol/ChaosModifiers.json','utf8'));
 const draws=JSON.parse(await readFile('contracts/out/ChaosDrawRules.sol/ChaosDrawRules.json','utf8'));
 const deployed:Address[]=[];
 for(const a of [modifier,draws])deployed.push((await chain.publicClient.waitForTransactionReceipt({hash:await chain.wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object})})).contractAddress!);
 let seed=0x63c4a05;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const effect=():ModifierEffect=>({id:random()%25,target:random()%3,startsAt:BigInt(random()%5000),expiresAt:BigInt(6000+random()%12000),consumed:random()%4===0});
 for(let batch=0;batch<10000;batch+=20){
  const cases=Array.from({length:20},()=>({a:72000000n+BigInt(random()%24000001),b:72000000n+BigInt(random()%24000001),effects:[effect(),effect()] as [ModifierEffect,ModifierEffect],now:BigInt(random()%19000),
   r:{app:deployed[1],epoch:BigInt(1+random()),matchId:BigInt(1+random()),index:random(),round:BigInt(1+random()),excluded:random()&0xfffffe} satisfies ChaosDrawRequest,randomness:toHex(BigInt(random()),{size:32})}));
  await Promise.all(cases.map(async(c,j)=>{
   const expected=chaosPaddles(c.a,c.b,c.effects,c.now);
   assert.deepEqual(await chain.publicClient.readContract({address:deployed[0],abi:modifier.abi,functionName:'calculate',args:[c.a,c.b,c.effects,c.now]}),expected,`modifiers:${batch+j}`);
   const commit=chaosDrawCommitment(c.r);
   assert.equal(await chain.publicClient.readContract({address:deployed[1],abi:draws.abi,functionName:'commitment',args:[c.r]}),commit,`commit:${batch+j}`);
   assert.deepEqual(await chain.publicClient.readContract({address:deployed[1],abi:draws.abi,functionName:'reveal',args:[c.r,commit,c.randomness]}),deriveChaosDraw(c.r,commit,c.randomness),`draw:${batch+j}`);
  }));
  if(batch%2000===0)console.log(`Pure Chaos modules: ${batch+20}/10000`);
 }
 await mkdir('artifacts/drand',{recursive:true});
 const report={scope:'Pure draw derivation and paddle modifiers, not complete event physics',modifierCases:10000,drawCases:10000,mismatches:0,ms:Date.now()-started,at:new Date().toISOString()};
 await writeFile('artifacts/drand/modules-differential.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{chain.close();}
