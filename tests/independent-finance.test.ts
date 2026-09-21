import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,decodeFunctionResult,parseAbi,toHex,zeroAddress,zeroHash} from 'viem';
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

test('sponsored betting receipts recover payouts while historical RPC indexing is unavailable',async()=>{
 const app='0x0000000000000000000000000000000000000011',player='0x0000000000000000000000000000000000000022',key=generatePrivateKey();
 const hash=toHex(1,{size:32}),blockHash=toHex(2,{size:32}),calls:string[]=[],bettors=new Set<string>();let indexed=false,bad=false,readFails=false;
 const log={address:app,transactionHash:hash,removed:false,topics:encodeEventTopics({abi:parseAbi(['event BetPlaced(uint256 indexed matchId,address indexed player,uint8 side,uint256 shares,uint256 cost)']),eventName:'BetPlaced',args:{matchId:7n,player}}),data:encodeAbiParameters([{type:'uint8'},{type:'uint256'},{type:'uint256'}],[0,6n,5n])};
 const db:any={connect:async()=>({...db,release:()=>{}}),query:async(sql:string,args:any[])=>{
  if(sql.startsWith('SELECT o.id'))return{rows:indexed?[]:[{id:'operation',hash}]};
  if(sql.startsWith('INSERT INTO independent_bettors'))bettors.add(args[1]+':'+args[2]);
  if(sql.startsWith('INSERT INTO independent_finance_receipts'))indexed=true;
  if(sql.startsWith('SELECT id,player'))return{rows:[...bettors].map(()=>({id:'7',player}))};
  if(sql.startsWith('UPDATE independent_bettors'))calls.push('settled');
  return {rows:[]};
 }};
 const base:any={getBlockNumber:async()=>10000n,getBlock:async()=>({hash:bad?zeroHash:blockHash}),
  getContractEvents:async()=>{throw Error('Historical RPC unavailable');},
  getTransactionReceipt:async()=>({status:'success',transactionHash:hash,to:app,blockNumber:9000n,blockHash,logs:[log]}),
  readContract:async({functionName}:any)=>{if(readFails)throw Error('Payment read unavailable');if(functionName==='result')return[player,app,player,3];if(functionName==='positions')return[6n,0n,5n,false];throw Error(functionName);}};
 const manifest:any={lobby:app,market:app,settlement:app,pressureSigner:privateKeyToAccount(key).address,arenas:[{app}]};
 const f=await independentFinance(db,base,manifest,key,async(_at,_abi,name)=>{calls.push(name);});
 await assert.rejects(f.indexPayments(),/Historical RPC/);await assert.rejects(f.discoverPayments(),/Historical RPC/);
 bad=true;await assert.rejects(f.recoverSponsoredPayments(),/reorganized/);assert.equal(bettors.size,0);assert.equal(indexed,false);
 bad=false;await f.recoverSponsoredPayments();await f.payments();assert.deepEqual(calls,['claim']);assert.equal(indexed,true);
 await f.recoverSponsoredPayments();assert.equal(bettors.size,1);
 readFails=true;await assert.rejects(f.payments(),/Payment read/);assert(!calls.includes('settled'));
});
