import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionResult,decodeFunctionResult,zeroAddress,zeroHash} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {independentFinance} from '../relayer/src/independent-finance';
import {abi} from '../shared/abi-independent-IndependentArena';
import {initial} from '../shared/physics-v2';
test('Chaos recognizes the ABI uint256 phase and still rejects an older published pause',async()=>{
 const app='0x0000000000000000000000000000000000000011',key=generatePrivateKey();
 const state={...initial(zeroHash,1),scoreA:1,awaitingServe:true,resumeAt:3000000n};
 let phase=2n,older=false;
 const snapshot=()=>decodeFunctionResult({abi,functionName:'getSnapshot',data:encodeFunctionResult({abi,functionName:'getSnapshot',result:[1n,5n,phase,app,app,app,zeroAddress,99n,3000000n,1n,1n,1000n,{...state,scoreA:older?0:1}]})});
 assert.equal(typeof snapshot()[2],'bigint');
 const calls:string[]=[],base:any={readContract:async({functionName}:any)=>{
  if(functionName==='boundMatch')return {id:1n,epoch:2n};
  if(functionName==='getSnapshot')return snapshot();
  if(functionName==='books')return [0n,0n,0n];
  throw Error('Unexpected read: '+functionName);
 }};
 const manifest:any={lobby:app,market:app,pressureSigner:privateKeyToAccount(key).address,arenas:[{app}]};
 const db:any={query:async()=>({rows:[]})};
 const finance=await independentFinance(db,base,manifest,key,async(_at,_abi,name)=>{calls.push(name);});
 const engine:any={app,read:async()=>({id:1n,phase:2,state})};
 await finance.checkpoint(engine);assert.deepEqual(calls,['open']);
 calls.length=0;older=true;await finance.checkpoint(engine);assert.deepEqual(calls,[]);
 assert.equal((await finance.rallyStatus(app,await engine.read()))?.label,'Waiting for point publication');
 older=false;phase=3n;await finance.checkpoint(engine);assert.deepEqual(calls,[]);
});
