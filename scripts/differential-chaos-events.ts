import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {toHex,type Address} from 'viem';
import {localChain} from './local-chain';
import {initialChaosEvents,advanceChaosEvents,CHAOS_P as P,type ChaosPhysicsState} from '../shared/physics-chaos-events';
import {announceEffect} from '../shared/chaos-effects';
assert.equal(process.env.PONG_CHAOS_PHYSICS_TEST,'isolated-vps');
const count=Number(process.env.PONG_CHAOS_PHYSICS_CASES||10000);assert(Number.isInteger(count)&&count>=1&&count<=10000);
const chain=await localChain(),started=Date.now();
try{
 const artifacts=new Map<string,any>(),addresses=new Map<string,Address>();
 for(const [name,args] of [['ChaosEffects',[]],['ChaosModifiers',[]],['ChaosRally',[]],['ChaosDynamics',['ChaosEffects','ChaosModifiers']],['ChaosContacts',['ChaosDynamics']],['ChaosPhysics',['ChaosEffects','ChaosRally','ChaosDynamics','ChaosContacts']]] as const){
  const a=JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`,'utf8'));artifacts.set(name,a);
  const receipt=await chain.publicClient.waitForTransactionReceipt({hash:await chain.wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object,args:args.map(x=>addresses.get(x)!)} )});assert(receipt.contractAddress);addresses.set(name,receipt.contractAddress);
 }
 let seed=0x24c0ffee;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const a=artifacts.get('ChaosPhysics'),address=addresses.get('ChaosPhysics')!;
 for(let batch=0;batch<count;batch+=10){
  const cases=Array.from({length:Math.min(10,count-batch)},()=>{
   let s=initialChaosEvents(toHex(BigInt(random()),{size:32}),72000000+random()%24000001,72000000+random()%24000001);
   const first=random()%24+1,second=random()%24+1;
   [s.effects]=announceEffect(s.effects,first,random()%2,random(),1,0);
   if(second!==first)[s.effects]=announceEffect(s.effects,second,random()%2,random(),2,0);
   s.t=1000000n;s.nextForce=s.t;s.leftDir=random()%3-1;s.rightDir=random()%3-1;s.lastLeft=s.leftDir;s.lastRight=s.rightDir;
   s.balls[0].x=BigInt(20+random()%985)*P;s.balls[0].y=BigInt(10+random()%557)*P;
   s.balls[0].vx=BigInt(32+random()%6000)*1000000n*(random()%2?1n:-1n);s.balls[0].vy=BigInt(random()%800)*1000000n*(random()%2?1n:-1n);s.balls[0].lastHitter=random()%3;
   s.score.a=random()%7;s.score.b=random()%7;
   // Include partial budgets, zero-component trajectories, point boundaries and
   // states reached after forces/obstacles have already become active.
   if(random()%8===0)s.balls[0].vy=0n;
   if(random()%4===0)[s]=advanceChaosEvents(s,s.t+BigInt(random()%120000),256);
   return {s,target:s.t+BigInt(random()%250000),budget:[0,1,2,16,64,256][random()%6]};
  });
  await Promise.all(cases.map(async(c,j)=>{
   const expected=advanceChaosEvents(c.s,c.target,c.budget);
   const actual=await chain.publicClient.readContract({address,abi:a.abi,functionName:'advance',args:[c.s,c.target,c.budget]});
   try{assert.deepEqual(actual,expected,`Chaos case ${batch+j}`);}catch(e){await mkdir('artifacts/drand',{recursive:true});await writeFile('artifacts/drand/physics-mismatch.json',JSON.stringify({index:batch+j,...c,expected,actual},(_,v)=>typeof v==='bigint'?v.toString():v,2));throw e;}
  }));
  if(batch%1000===0)console.log(`Chaos event physics: ${batch+cases.length}/${count}`);
 }
 const report={scope:'Candidate rules 6 full Chaos kernel against its TypeScript mirror',cases:count,mismatches:0,ms:Date.now()-started,at:new Date().toISOString()};
 await mkdir('artifacts/drand',{recursive:true});await writeFile('artifacts/drand/physics-differential.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{chain.close();}
