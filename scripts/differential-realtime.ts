import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {toHex,type Address} from 'viem';
import {localChain} from './local-chain';
import {initial} from '../shared/physics-rooms-chaos';
import {initial as classicInitial,advance as classicAdvance} from '../shared/physics-interlude';
import {advance} from '../shared/physics-realtime-chaos';
import {next} from '../shared/physics-v2';
assert.equal(process.env.PONG_REALTIME_TEST,'isolated-vps');
const chain=await localChain(),started=Date.now();
try{
 const chaos=JSON.parse(await readFile('contracts/out/PhysicsRealtimeChaos.sol/RealtimeChaosRules.json','utf8'));
 const classic=JSON.parse(await readFile('contracts/out/RoomsRules.sol/RoomsRules.json','utf8'));
 const deployed:Address[]=[];
 for(const a of [classic,chaos])deployed.push((await chain.publicClient.waitForTransactionReceipt({hash:await chain.wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object})})).contractAddress!);
 let seed=0x0facade;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(const mode of [0,1])for(let batch=0;batch<10000;batch+=20){
  const cases=Array.from({length:20},()=>{
   const entropy=toHex(BigInt(random()),{size:32});let s=mode?initial(entropy):classicInitial(entropy);
   s.leftDir=random()%3-1;s.rightDir=random()%3-1;
   if(mode)[s]=advance(s,BigInt(random()%30000000));else [s]=classicAdvance(s,BigInt(random()%30000000));
   const paidA=[0n,1999999999999999n,2000000000000000n,2000000000000001n,6000000000000000n,10000000000000000n][random()%6];
   const paidB=[0n,4000000000000000n,2000000000000000n][random()%3];
   return {s,paidA,paidB,target:random()%3?s.t+BigInt(random()%600000000):next(s).at,limit:[0,1,2,32,128][random()%5]};
  });
  await Promise.all(cases.map(async(c,j)=>{
   const args=mode?[c.s,c.target,BigInt(c.limit),c.paidA,c.paidB]:[c.s,c.target,BigInt(c.limit)];
   const expected=mode?advance(c.s,c.target,c.limit,c.paidA,c.paidB):classicAdvance(c.s,c.target,c.limit);
   assert.deepEqual(await chain.publicClient.readContract({address:deployed[mode],abi:mode?chaos.abi:classic.abi,functionName:'advance',args}),expected,`${mode}:${batch+j}`);
  }));
  if(batch%2000===0)console.log(`Mode ${mode}: ${batch+20}/10000`);
 }
 await mkdir('artifacts/realtime',{recursive:true});
 await writeFile('artifacts/realtime/differential.json',JSON.stringify({rules:5,classic:10000,chaos:10000,mismatches:0,ms:Date.now()-started,at:new Date().toISOString()},null,2));
}finally{chain.close();}
